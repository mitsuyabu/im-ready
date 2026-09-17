import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateShareToken, hashShareToken } from "@/lib/documentShareToken";
import {
  consultationShareUrl,
  sanitizeConsultationShareConfig,
  type ConsultationShareConfig,
} from "@/lib/consultationShare";

/**
 * Consultation Sheet の共有リンク操作（所有者のみ）。
 *
 *   POST   … 共有を開始する。既に有効な共有があれば **同じ URL を返す**（作り直さない / §30）。
 *            body の config は sanitize して保存し、既存共有があれば config だけ更新する。
 *   PATCH  … 有効な共有の公開範囲（share_config）だけを更新する。URL は変わらない。
 *   DELETE … 共有を停止する（revoked_at を設定。行は履歴として残す）。
 *
 * Client から受け取るのは planId と config（boolean 5つ）だけ。token・token_hash・plan の
 * 所有者判定・シートの中身は、いずれも Server 側で本物の DB から取得・生成する。
 *
 * service role は使わない。書き込みは通常の Server Supabase client ＋ 所有者 RLS
 * （consultation_sheet_shares_*_own policy）経由で行う。公開側の SECURITY DEFINER 関数
 * （get_public_consultation_sheet）は匿名閲覧専用で、この route からは呼ばない。
 *
 * エラー文言は、存在しない planId と他人の planId を区別しない（存在推測を防ぐ）。
 */

/** Postgres unique_violation の SQLSTATE */
const POSTGRES_UNIQUE_VIOLATION = "23505";

/** planId の検証。既存の parent-explanation share route と同じ方針（該当行が無ければ 404）。 */
export function parsePlanId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

type ShareResponse = { shareUrl: string; config: ConsultationShareConfig };

type Context = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  planId: string;
  config: ConsultationShareConfig;
};

/** 認証 → body 検証 → Plan ownership 確認までの共通部分。失敗時は Response を返す。 */
async function resolveContext(req: NextRequest): Promise<Context | Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "認証が必要です" }, { status: 401 });
  }

  let requestBody: unknown;
  try {
    requestBody = await req.json();
  } catch {
    return Response.json({ error: "リクエストの形式が不正です" }, { status: 400 });
  }

  const { planId: rawPlanId, config: rawConfig } = (requestBody ?? {}) as {
    planId?: unknown;
    config?: unknown;
  };
  const planId = parsePlanId(rawPlanId);
  if (!planId) {
    return Response.json({ error: "planId が不正です" }, { status: 400 });
  }

  const { data: plan } = await supabase
    .from("plans")
    .select("id")
    .eq("id", planId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!plan) {
    return Response.json({ error: "対象のPlanが見つかりません" }, { status: 404 });
  }

  return { supabase, planId, config: sanitizeConsultationShareConfig(rawConfig) };
}

function isResponse(value: Context | Response): value is Response {
  return value instanceof Response;
}

/** 共有を開始する。既に有効な共有があれば、同じ token（＝同じ URL）を返し、config だけ更新する。 */
export async function POST(req: NextRequest) {
  const ctx = await resolveContext(req);
  if (isResponse(ctx)) return ctx;
  const { supabase, planId, config } = ctx;

  const { data: existing, error: existingError } = await supabase
    .from("consultation_sheet_shares")
    .select("id, token")
    .eq("plan_id", planId)
    .is("revoked_at", null)
    .maybeSingle();

  if (existingError) {
    console.error("consultation share: existing share check error:", existingError.message);
    return Response.json({ error: "share_create_failed" }, { status: 500 });
  }

  if (existing) {
    const row = existing as { id: string; token: string };
    const { error: updateError } = await supabase
      .from("consultation_sheet_shares")
      .update({ share_config: config, updated_at: new Date().toISOString() })
      .eq("id", row.id);

    if (updateError) {
      console.error("consultation share: config update error:", updateError.message);
      return Response.json({ error: "share_create_failed" }, { status: 500 });
    }

    const result: ShareResponse = {
      shareUrl: consultationShareUrl(req.nextUrl.origin, row.token),
      config,
    };
    return Response.json(result);
  }

  const rawToken = generateShareToken();
  const { error: insertError } = await supabase.from("consultation_sheet_shares").insert({
    plan_id: planId,
    token: rawToken,
    token_hash: hashShareToken(rawToken),
    share_config: config,
  });

  if (insertError) {
    // 複数タブからほぼ同時に共有を開始した場合、partial unique index（1 Plan につき有効な共有は
    // 1件）で後発が 23505 になる。ユーザーにとっては「既に共有中」なので、既存の共有を読み直して
    // 同じ URL を返す（§30）。token の unique 衝突も同じ 23505 だが 256bit 空間では起こり得ない。
    if (insertError.code === POSTGRES_UNIQUE_VIOLATION) {
      const { data: raced } = await supabase
        .from("consultation_sheet_shares")
        .select("token, share_config")
        .eq("plan_id", planId)
        .is("revoked_at", null)
        .maybeSingle();
      if (raced) {
        const row = raced as { token: string; share_config: unknown };
        const result: ShareResponse = {
          shareUrl: consultationShareUrl(req.nextUrl.origin, row.token),
          config: sanitizeConsultationShareConfig(row.share_config),
        };
        return Response.json(result);
      }
    }
    console.error("consultation share: insert error:", insertError.message);
    return Response.json({ error: "share_create_failed" }, { status: 500 });
  }

  const result: ShareResponse = {
    shareUrl: consultationShareUrl(req.nextUrl.origin, rawToken),
    config,
  };
  return Response.json(result);
}

/** 公開範囲だけを変更する。URL は変わらない（共有先のリンクはそのまま使える）。 */
export async function PATCH(req: NextRequest) {
  const ctx = await resolveContext(req);
  if (isResponse(ctx)) return ctx;
  const { supabase, planId, config } = ctx;

  const { data, error } = await supabase
    .from("consultation_sheet_shares")
    .update({ share_config: config, updated_at: new Date().toISOString() })
    .eq("plan_id", planId)
    .is("revoked_at", null)
    .select("token")
    .maybeSingle();

  if (error) {
    console.error("consultation share: config patch error:", error.message);
    return Response.json({ error: "share_update_failed" }, { status: 500 });
  }
  if (!data) {
    // 別端末で停止済み。Client は「共有していない状態」へ戻す。
    return Response.json({ error: "share_not_found" }, { status: 404 });
  }

  const result: ShareResponse = {
    shareUrl: consultationShareUrl(req.nextUrl.origin, (data as { token: string }).token),
    config,
  };
  return Response.json(result);
}

/** 共有を停止する。行は消さず revoked_at を立てる（同じ URL は二度と有効にならない）。 */
export async function DELETE(req: NextRequest) {
  const ctx = await resolveContext(req);
  if (isResponse(ctx)) return ctx;
  const { supabase, planId } = ctx;

  const { error } = await supabase
    .from("consultation_sheet_shares")
    .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("plan_id", planId)
    .is("revoked_at", null);

  if (error) {
    console.error("consultation share: revoke error:", error.message);
    return Response.json({ error: "share_revoke_failed" }, { status: 500 });
  }

  // 既に停止済み（0 行更新）でも、結果は「共有していない」で同じなので成功として返す。
  return Response.json({ revoked: true });
}
