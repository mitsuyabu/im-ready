import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { PlanDocumentType } from "@/lib/planDocuments";

/**
 * 親向け説明資料の共有リンク停止（revoke）エンドポイント（Step 13）。
 *
 * 責務: 認証確認 → request body validation（planId のみ）→ Plan ownership 確認 →
 * parent_explanation document 特定 → その document の enabled=true な document_shares 行を
 * enabled=false / revoked_at=now() へ UPDATE（authenticated owner 用 RLS 経由、
 * service role 不使用、DELETE しない＝snapshot を history として残す）→ { revoked: true }。
 *
 * 再発行は専用 API を作らず、revoke 後に既存の Step 10 作成 API
 * （POST /api/documents/parent-explanation/share）をそのまま呼ぶ。revoke 済み行は
 * enabled=false なので partial unique index（where enabled）を専有せず、新しい active
 * share を INSERT できる。
 *
 * Client 由来のデータは planId のみ。shareId / documentId / tokenHash / rawToken /
 * userId はいずれも受け取らず、対象 share は Server 側で Canonical に特定する
 * （既存 /api/documents/parent-explanation/share と同じ「Client→planId のみ」方針）。
 *
 * raw token・token_hash はこの route では読み書きしない（停止は enabled/revoked_at の
 * UPDATE だけで表現でき、token 列に触れる理由が無い）。既存 snapshot（title/body/
 * document_updated_at）も変更しない。
 */

const DOCUMENT_TYPE: PlanDocumentType = "parent_explanation";

/** request body の planId（unknown）を検証する。既存 share 作成 route の parsePlanId と
 *  同じ方針（UUID 厳格チェックはせず、該当行が無ければ 404）。既存 route 群の
 *  「小さな重複を許容し route ごとに独立させる」方針を踏襲し、あちらからは import しない。 */
export function parsePlanId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

export async function POST(req: NextRequest) {
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

  const { planId: rawPlanId } = (requestBody ?? {}) as { planId?: unknown };
  const planId = parsePlanId(rawPlanId);
  if (!planId) {
    return Response.json({ error: "planId が不正です" }, { status: 400 });
  }

  // Plan ownership 確認。存在しない Plan と他人の Plan を区別せず 404
  // （既存 share 作成 route と同じ）。
  const { data: plan } = await supabase
    .from("plans")
    .select("id")
    .eq("id", planId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!plan) {
    return Response.json({ error: "対象のPlanが見つかりません" }, { status: 404 });
  }

  const { data: doc, error: docError } = await supabase
    .from("plan_documents")
    .select("id")
    .eq("plan_id", planId)
    .eq("type", DOCUMENT_TYPE)
    .maybeSingle();

  if (docError) {
    console.error("parent explanation share revoke: document fetch error:", docError.message);
    return Response.json({ error: "revoke_failed" }, { status: 500 });
  }

  if (!doc) {
    return Response.json({ error: "document_not_found" }, { status: 404 });
  }

  const documentId = (doc as { id: string }).id;

  // enabled=true の share を停止する。1 document につき enabled=true は高々1件
  // （Step 9 の partial unique index）。expires_at が過去でも enabled=true なら対象に含める
  // （§25/§26: 期限切れで残った行も、この明示的 revoke で片付けられるようにする）。
  // expires_at・token_hash・snapshot は変更しない。
  const nowIso = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from("document_shares")
    .update({ enabled: false, revoked_at: nowIso })
    .eq("plan_document_id", documentId)
    .eq("enabled", true)
    .select("id");

  if (updateError) {
    console.error("parent explanation share revoke: update error:", updateError.message);
    return Response.json({ error: "revoke_failed" }, { status: 500 });
  }

  // 0件 = 停止対象の有効 share が無い（未発行 / 別タブで停止済み / race）。
  // Plan・document 自体は存在するため 404 ではなく 409 とする。
  if (!updated || updated.length === 0) {
    return Response.json({ error: "no_active_share" }, { status: 409 });
  }

  return Response.json({ revoked: true });
}
