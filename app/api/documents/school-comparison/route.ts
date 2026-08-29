import { NextRequest } from "next/server";
import { stripMarkdownBold } from "@/lib/markdown";
import { createClient } from "@/lib/supabase/server";
import { loadPlanKarte } from "@/lib/planChat";
import { AUSTRALIA_SCHOOLS } from "@/lib/data/schools";
import { buildSchoolComparisonView } from "@/lib/schoolComparisonView";
import {
  canGenerateSchoolComparison,
  formatSchoolComparison,
  SCHOOL_COMPARISON_DEFAULT_TITLE,
} from "@/lib/schoolComparisonFormatter";

/**
 * 学校候補比較（Document type: school_comparison）の生成 + 保存/更新エンドポイント（Step 25）。
 *
 * 他の Document API との最大の違い: **Anthropic を一切使わない**。School Comparison は
 * 完全 deterministic で、SchoolComparisonView（Karte + 既提示候補 + 学校マスタ）を
 * formatSchoolComparison() でプレーンテキストへ整形するだけ。LLM 由来の不確実性が無い。
 *
 * 保存方式は my_note / study_plan と同じ upsert（onConflict: "plan_id,type"）。
 * 1 Plan × 1 type × 1 current。version 履歴は持たない。
 *
 * Client 由来のデータは planId のみ。SchoolComparisonView・schools・criteria・candidates・
 * title・body・type・documentId・userId・proposal data はいずれも Client から受け取らず、
 * Server が Canonical な Plan Karte ＋ AUSTRALIA_SCHOOLS から決定する。
 *
 * 処理順: 認証 → request body validation → Plan ownership 確認 → Karte 取得 →
 * buildSchoolComparisonView(karte, AUSTRALIA_SCHOOLS) → canGenerateSchoolComparison
 * （false なら 422、formatter を呼ばない・保存しない） → formatSchoolComparison →
 * stripMarkdownBold → 空なら 502（保存しない） → plan_documents upsert → 保存済み document を response。
 *
 * 同時リクエスト競合: upsert（INSERT ... ON CONFLICT (plan_id, type) DO UPDATE）自体が
 * race-safe なため、parent_explanation のような unique_violation → 409 変換は不要。
 *
 * このルートは selectProposals / hardFilter / fitHints / proposal API を呼ばない
 * （karte.proposals.presented を view がそのまま使う）。Web / Places / 学校サイト fetch /
 * 為替換算 / tuition×duration 等の費用計算 / budget と学校授業料の fit 判定 も一切しない。
 *
 * privacy: Karte 全文・SchoolComparisonView 全文・user criteria・candidate schools・
 * 生成本文・fee data を console / error log / analytics に一切出さない。log は err.message /
 * saveError?.message のような内部情報のみ。response は認証済み owner への通常 response だけ。
 */

const DOCUMENT_TYPE = "school_comparison";

/** request body の planId（unknown）を検証する。my_note / study_plan route の parsePlanId と
 *  同じ方針（UUID 厳格検証はせず、該当行が無ければ 404）。export しているのは
 *  scripts/test-school-comparison-api.ts からのテスト用。 */
export function parsePlanId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

export type SchoolComparisonDocumentContent = { format: "text"; body: string };

/**
 * plan_documents へ upsert する値を組み立てる pure helper（onConflict: "plan_id,type"）。
 * id / created_at / user_id は payload に含めない:
 * - INSERT 時: id は gen_random_uuid()、created_at は now() の DB default
 * - CONFLICT 時（既存 row の更新）: ON CONFLICT DO UPDATE の SET 句には payload の列だけが
 *   入るため、id と created_at は既存値がそのまま維持される
 * title / type は Server 固定（Client からも受け取らない）。
 */
export function buildSchoolComparisonUpsertValues(planId: string, body: string, updatedAt: string) {
  const content: SchoolComparisonDocumentContent = { format: "text", body };
  return {
    plan_id: planId,
    type: DOCUMENT_TYPE,
    title: SCHOOL_COMPARISON_DEFAULT_TITLE,
    content,
    updated_at: updatedAt,
  };
}

type SchoolComparisonDocumentResponse = {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
};

type SchoolComparisonGenerateResponse = { document: SchoolComparisonDocumentResponse };

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

  // Plan ownership 確認。存在しない Plan と他人の Plan を区別せず 404（他 Document API と同じ）。
  const { data: plan } = await supabase
    .from("plans")
    .select("id")
    .eq("id", planId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!plan) {
    return Response.json({ error: "対象のPlanが見つかりません" }, { status: 404 });
  }

  // Client 由来のデータは使わず、Server 側で Plan Karte ＋ 学校マスタから view を作る。
  const karte = await loadPlanKarte(supabase, planId);

  let generatedBody: string;
  try {
    const view = buildSchoolComparisonView(karte, AUSTRALIA_SCHOOLS);

    if (!canGenerateSchoolComparison(view)) {
      return Response.json({ error: "not_enough_context" }, { status: 422 });
    }

    // deterministic 生成。Anthropic は呼ばない。formatter は Markdown を出さない設計だが、
    // 既存 Document API に揃えて防御的に stripMarkdownBold を通す。
    generatedBody = stripMarkdownBold(formatSchoolComparison(view).trim());
  } catch (err) {
    // pure 関数なので通常 throw しないが、想定外は内部情報を出さず 500 に落とす。
    console.error("school-comparison generation error:", err instanceof Error ? err.message : err);
    return Response.json({ error: "generation_failed" }, { status: 500 });
  }

  if (!generatedBody) {
    // 空・空白のみ（理論上ほぼ起きない）。保存へ進まない。
    return Response.json({ error: "generation_failed" }, { status: 502 });
  }

  // 既存 school_comparison row があれば同じ行を UPDATE、無ければ INSERT（authenticated owner 用
  // RLS 経由、service role 不使用）。id / created_at は payload に含めないため維持される。
  const { data: saved, error: saveError } = await supabase
    .from("plan_documents")
    .upsert(buildSchoolComparisonUpsertValues(planId, generatedBody, new Date().toISOString()), {
      onConflict: "plan_id,type",
    })
    .select("id, title, updated_at")
    .single();

  if (saveError || !saved) {
    // DB 内部 message は response に出さない。生成本文全文もログしない。
    console.error("school-comparison save error:", saveError?.message);
    return Response.json({ error: "document_save_failed" }, { status: 500 });
  }

  const result: SchoolComparisonGenerateResponse = {
    document: {
      id: saved.id,
      title: saved.title,
      body: generatedBody,
      updatedAt: saved.updated_at,
    },
  };
  return Response.json(result);
}
