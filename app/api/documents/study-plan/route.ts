import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODEL } from "@/lib/anthropic";
import { stripMarkdownBold } from "@/lib/markdown";
import { createClient } from "@/lib/supabase/server";
import { loadPlanKarte } from "@/lib/planChat";
import { buildStudyPlanView } from "@/lib/studyPlanView";
import {
  buildStudyPlanSystemPrompt,
  canGenerateStudyPlan,
  STUDY_PLAN_DEFAULT_TITLE,
  STUDY_PLAN_USER_MESSAGE,
} from "@/lib/studyPlanPrompt";

/**
 * 本人向けの留学計画書（Document type: study_plan）の生成 + 保存/更新エンドポイント（Step 21）。
 *
 * 保存方式は my_note と同じ upsert（onConflict: "plan_id,type"）:
 * - parent_explanation: 既存 row があれば 409（上書きしない）
 * - study_plan / my_note: 既存 row があれば同じ行を UPDATE。study_plan は Karte が固まって
 *   いくにつれ更新需要が高く、plan_documents の 1 Plan × 1 type × 1 current というスキーマの
 *   まま「作り直し = 現在の 1 件を置き換え」とする（version 履歴は持たない）。API 側で確認
 *   ダイアログは持てないため、POST されれば更新する（409 にはしない）。将来 UI Step で
 *   「前の内容は残りません」の確認を入れる。
 *
 * Client 由来のデータは planId のみ。StudyPlanView・stated・purpose・decision・deadline・
 * title・body・type・documentId・userId はいずれも Client から受け取らず、Server が
 * Canonical な Plan Karte から決定する（parent_explanation / my_note と同じ一方向構造）。
 *
 * 処理順: 認証 → request body validation → Plan ownership 確認 → Karte 取得 →
 * StudyPlanView 構築 → canGenerateStudyPlan（false なら 422、Anthropic を呼ばない） →
 * Anthropic 生成 → stripMarkdownBold → 空なら 502（保存しない） →
 * plan_documents upsert（onConflict: "plan_id,type"） → 保存済み document を response。
 *
 * 同時リクエスト競合: upsert（INSERT ... ON CONFLICT (plan_id, type) DO UPDATE）自体が
 * race-safe なため、parent_explanation のような unique_violation → 409 変換は不要。
 *
 * proposal / school data / proposal pipeline は読まない。国推測・予算計算・deadline 逆算・
 * 学校提案などの追加ロジックも一切持たず、すべて prompt 側の安全ルールに委ねる。
 *
 * privacy: 生成本文・prompt 全文・StudyPlanView 全文・Karte 全文は console / error log /
 * analytics に一切出さない。log に出すのは err.message / saveError?.message のような内部情報のみ。
 */

const DOCUMENT_TYPE = "study_plan";

/** request body の planId（unknown）を検証する。my-note / parent_explanation route の
 *  parsePlanId と同じ方針（UUID 厳格検証はせず、該当行が無ければ 404）。export しているのは
 *  scripts/test-study-plan-api.ts からのテスト用（既存 API test と同じ手法）。 */
export function parsePlanId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

export type StudyPlanDocumentContent = { format: "text"; body: string };

/**
 * plan_documents へ upsert する値を組み立てる pure helper（onConflict: "plan_id,type"）。
 * id / created_at は payload に含めない:
 * - INSERT 時（study_plan row が無い）: id は gen_random_uuid()、created_at は now() の DB default
 * - CONFLICT 時（既存 row の更新）: ON CONFLICT DO UPDATE の SET 句には payload の列だけが
 *   入るため、id と created_at は既存値がそのまま維持される
 * title / type は Server 固定（Client からも AI からも受け取らない）。
 */
export function buildStudyPlanUpsertValues(planId: string, body: string, nowIso: string) {
  const content: StudyPlanDocumentContent = { format: "text", body };
  return {
    plan_id: planId,
    type: DOCUMENT_TYPE,
    title: STUDY_PLAN_DEFAULT_TITLE,
    content,
    updated_at: nowIso,
  };
}

type StudyPlanDocumentResponse = {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
};

type StudyPlanGenerateResponse = { document: StudyPlanDocumentResponse };

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
  // （parent_explanation / my-note route と同じ方針）。
  const { data: plan } = await supabase
    .from("plans")
    .select("id")
    .eq("id", planId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!plan) {
    return Response.json({ error: "対象のPlanが見つかりません" }, { status: 404 });
  }

  // Client 由来のデータは使わず、Server 側で Plan Karte から StudyPlanView を作る。
  const karte = await loadPlanKarte(supabase, planId);
  const view = buildStudyPlanView(karte);

  if (!canGenerateStudyPlan(view)) {
    return Response.json({ error: "not_enough_context" }, { status: 422 });
  }

  let generatedBody: string;
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: buildStudyPlanSystemPrompt(view),
      messages: [{ role: "user", content: STUDY_PLAN_USER_MESSAGE }],
    });

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );
    // study_plan prompt 側でも Markdown は禁止済みだが、防御として既存 sanitize を通す。
    generatedBody = textBlock ? stripMarkdownBold(textBlock.text.trim()) : "";
  } catch (err) {
    const isApiError = err instanceof Anthropic.APIError;
    // 内部 error.message はログにのみ。生成本文はログしない。Client へ内部文言を返さない。
    console.error("study-plan generation error:", isApiError ? err.message : err);
    return Response.json(
      { error: "ai_service_error" },
      { status: isApiError && err.status ? err.status : 500 },
    );
  }

  if (!generatedBody) {
    // 空・空白のみ・text block 無し。AI 生成成功が保存成功を意味しないため、保存へ進まない。
    return Response.json({ error: "generation_failed" }, { status: 502 });
  }

  // 既存 study_plan row があれば同じ行を UPDATE、無ければ INSERT（authenticated owner 用 RLS
  // 経由、service role 不使用）。id / created_at は payload に含めないため維持される。
  const { data: saved, error: saveError } = await supabase
    .from("plan_documents")
    .upsert(buildStudyPlanUpsertValues(planId, generatedBody, new Date().toISOString()), {
      onConflict: "plan_id,type",
    })
    .select("id, title, updated_at")
    .single();

  if (saveError || !saved) {
    // DB 内部 message は response に出さない。生成本文全文もログしない。
    console.error("study-plan save error:", saveError?.message);
    return Response.json({ error: "document_save_failed" }, { status: 500 });
  }

  const result: StudyPlanGenerateResponse = {
    document: {
      id: saved.id,
      title: saved.title,
      body: generatedBody,
      updatedAt: saved.updated_at,
    },
  };
  return Response.json(result);
}
