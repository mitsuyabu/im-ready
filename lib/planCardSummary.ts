/**
 * マイページのPlanカードに表示する、Karte由来の要約情報。
 * certainty==="stated"かつ値がある場合だけを使う（inferred/unknownは一切使わない。
 * AIによる補完・要約は行わない）。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Field, Karte } from "@/lib/karte";

export type PlanCardSummary = {
  city: string | null;
  departureTiming: string | null;
  /** decision.stage（自由記述の原文）。decision.leaningは意味が異なるため使わない */
  stage: string | null;
};

function statedString(field: Field<string> | undefined): string | null {
  if (!field) return null;
  if (field.certainty !== "stated") return null;
  if (!field.value) return null;
  return field.value;
}

export function summarizeKarteForCard(karte: Karte | null | undefined): PlanCardSummary {
  if (!karte) return { city: null, departureTiming: null, stage: null };
  return {
    city: statedString(karte.schoolPrefs?.preferredCity),
    departureTiming: statedString(karte.timing?.departureTiming),
    stage: statedString(karte.decision?.stage),
  };
}

/**
 * plan_id一覧からplan_karteを1回のクエリでまとめて取得し、Plan単位のサマリへ変換する。
 * Plan1件ずつ問い合わせるN+1は行わない。plan_karte行が無いPlanはundefined相当になり、
 * 呼び出し側でsummarizeKarteForCard(null)相当（全て未定表示）として扱われる。
 */
export async function loadPlanCardSummaries(
  supabase: SupabaseClient,
  planIds: string[],
): Promise<Record<string, PlanCardSummary>> {
  if (planIds.length === 0) return {};

  const { data } = await supabase
    .from("plan_karte")
    .select("plan_id, karte")
    .in("plan_id", planIds);

  const result: Record<string, PlanCardSummary> = {};
  for (const row of (data ?? []) as { plan_id: string; karte: Karte }[]) {
    result[row.plan_id] = summarizeKarteForCard(row.karte);
  }
  return result;
}
