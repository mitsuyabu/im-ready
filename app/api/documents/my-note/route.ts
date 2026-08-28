import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODEL } from "@/lib/anthropic";
import { stripMarkdownBold } from "@/lib/markdown";
import { createClient } from "@/lib/supabase/server";
import { loadPlanKarte } from "@/lib/planChat";
import { buildMyNoteView } from "@/lib/myNoteView";
import {
  buildMyNoteSystemPrompt,
  canGenerateMyNote,
  MY_NOTE_DEFAULT_TITLE,
  MY_NOTE_USER_MESSAGE,
} from "@/lib/myNotePrompt";

/**
 * 本人向けの内省ノート（Document type: my_note）の生成 + 保存/更新エンドポイント（Step 17）。
 *
 * parent_explanation（/api/documents/parent-explanation）との最大の違いは保存方式:
 * - parent_explanation: 既存 row があれば 409 document_already_exists（上書きしない）
 * - my_note: 既存 row があれば同じ行を UPDATE する（upsert, onConflict: "plan_id,type"）。
 *   my_note は「いまの自分の考え」で更新需要が高く、plan_documents の
 *   1 Plan × 1 type × 1 current というスキーマのまま「作り直し = 現在の 1 件を置き換え」とする
 *   （version 履歴は持たない）。API 側で確認ダイアログは持てないため、POST されれば更新する
 *   （409 にはしない）。将来 UI Step で「前の内容は残りません」の確認を入れる。
 *
 * Client 由来のデータは planId のみ。MyNoteView・stated/inferred・title・body・type・
 * documentId・userId はいずれも Client から受け取らず、Server が Canonical な Plan Karte から
 * 決定する（parent_explanation と同じ一方向構造）。
 *
 * 処理順: 認証 → request body validation → Plan ownership 確認 → Karte 取得 →
 * MyNoteView 構築 → canGenerateMyNote（false なら 422、Anthropic を呼ばない） →
 * Anthropic 生成 → stripMarkdownBold → 空なら 502（保存しない） →
 * plan_documents upsert（onConflict: "plan_id,type"） → 保存済み document を response。
 *
 * 同時リクエスト競合: upsert（INSERT ... ON CONFLICT (plan_id, type) DO UPDATE）自体が
 * race-safe なため、parent_explanation のような unique_violation → 409 変換は不要。
 *
 * privacy: 生成本文は console / error log / analytics に一切出さない。error log に出すのは
 * error.message のような内部情報のみ。response は認証済み owner への通常 response だけ。
 */

const DOCUMENT_TYPE = "my_note";

/** request body の planId（unknown）を検証する。parent_explanation route の parsePlanId と
 *  同じ方針（UUID 厳格検証はせず、該当行が無ければ 404）。export しているのは
 *  scripts/test-my-note-api.ts からのテスト用（既存 API test と同じ手法）。 */
export function parsePlanId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

export type MyNoteDocumentContent = { format: "text"; body: string };

/**
 * plan_documents へ upsert する値を組み立てる pure helper（onConflict: "plan_id,type"）。
 * id / created_at は payload に含めない:
 * - INSERT 時（my_note row が無い）: id は gen_random_uuid()、created_at は now() の DB default
 * - CONFLICT 時（既存 row の更新）: ON CONFLICT DO UPDATE の SET 句には payload の列だけが
 *   入るため、id と created_at は既存値がそのまま維持される
 * title / type は Server 固定（Client からも AI からも受け取らない）。
 */
export function buildMyNoteUpsertValues(planId: string, body: string, nowIso: string) {
  const content: MyNoteDocumentContent = { format: "text", body };
  return {
    plan_id: planId,
    type: DOCUMENT_TYPE,
    title: MY_NOTE_DEFAULT_TITLE,
    content,
    updated_at: nowIso,
  };
}

type MyNoteDocumentResponse = {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
};

type MyNoteGenerateResponse = { document: MyNoteDocumentResponse };

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
  // （parent_explanation route と同じ方針）。
  const { data: plan } = await supabase
    .from("plans")
    .select("id")
    .eq("id", planId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!plan) {
    return Response.json({ error: "対象のPlanが見つかりません" }, { status: 404 });
  }

  // Client 由来のデータは使わず、Server 側で Plan Karte から MyNoteView を作る。
  const karte = await loadPlanKarte(supabase, planId);
  const view = buildMyNoteView(karte);

  if (!canGenerateMyNote(view)) {
    return Response.json({ error: "not_enough_context" }, { status: 422 });
  }

  let generatedBody: string;
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: buildMyNoteSystemPrompt(view),
      messages: [{ role: "user", content: MY_NOTE_USER_MESSAGE }],
    });

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );
    // my_note prompt 側でも Markdown は禁止済みだが、防御として既存 sanitize を通す。
    generatedBody = textBlock ? stripMarkdownBold(textBlock.text.trim()) : "";
  } catch (err) {
    const isApiError = err instanceof Anthropic.APIError;
    // 内部 error.message はログにのみ。生成本文はログしない。Client へ内部文言を返さない。
    console.error("my-note generation error:", isApiError ? err.message : err);
    return Response.json(
      { error: "ai_service_error" },
      { status: isApiError && err.status ? err.status : 500 },
    );
  }

  if (!generatedBody) {
    // 空・空白のみ・text block 無し。AI 生成成功が保存成功を意味しないため、保存へ進まない。
    return Response.json({ error: "generation_failed" }, { status: 502 });
  }

  // 既存 my_note row があれば同じ行を UPDATE、無ければ INSERT（authenticated owner 用 RLS 経由、
  // service role 不使用）。id / created_at は payload に含めないため維持される。
  const { data: saved, error: saveError } = await supabase
    .from("plan_documents")
    .upsert(buildMyNoteUpsertValues(planId, generatedBody, new Date().toISOString()), {
      onConflict: "plan_id,type",
    })
    .select("id, title, updated_at")
    .single();

  if (saveError || !saved) {
    // DB 内部 message は response に出さない。生成本文全文もログしない。
    console.error("my-note save error:", saveError?.message);
    return Response.json({ error: "document_save_failed" }, { status: 500 });
  }

  const result: MyNoteGenerateResponse = {
    document: {
      id: saved.id,
      title: saved.title,
      body: generatedBody,
      updatedAt: saved.updated_at,
    },
  };
  return Response.json(result);
}
