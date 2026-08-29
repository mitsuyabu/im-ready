/**
 * Plan Karte → study_plan（本人向けの留学計画書 Document）生成の入力データへの変換レイヤー。
 * DB・Supabase・Anthropic へは一切アクセスしない pure function のみ（Step 19）。
 *
 * lib/myNoteView.ts（my_note 用）/ lib/documentsKarteView.ts（parent_explanation 用）は
 * import も拡張もしない。study_plan は「本人が明示した実行条件・現在の候補・検討段階」だけを
 * 計画として扱いたく、必要データと安全基準が両者と違う（inferred は一切入れない、motivation は
 * statedGoal 1 件だけ、trueGoalHypothesis は渡さない、conflict 中の条件は確定計画にしない）。
 * 共通の下位ロジックは lib/karte.ts の getKarteSummaryItems / getFieldLabel を直接再利用し、
 * コピペはしない（兄弟レイヤーを疎結合に保つ既存方針）。
 *
 * このファイルが担う変換の骨子:
 *   Karte → getKarteSummaryItems（unknown・値なしは既に除外済み）
 *         → stated のみ採用（inferred は全除外）
 *         → motivation.trueGoalHypothesis は stated でも一切採用しない
 *         → 計画条件 block（timing/budget/schoolPrefs/language/work/lifestyle/constraints）に限定
 *           （profile / personality / support / proposals / motivation / decision は stated[] へ入れない）
 *         → 未解決 conflict 中の field は stated[] から除外（トピック名だけ conflictTopics へ）
 *         → motivation.statedGoal（stated・非 conflict・非空）だけを purpose へ
 *         → decision.stage / leaning / decisionOwner・timing.deadline を stated かつ非 conflict の
 *           ときだけ top-level へ（値は生のまま。日本語変換・年月具体化・逆算はしない）
 *         → hasEnoughContext 判定（conflict 除外後の stated item を持つ「計画条件カテゴリ」が 2 種類以上）
 *
 * 文章化・section 分け・「まだ確認したいこと」の意味づけ・単位変換・formatは prompt / UI 側の責務。
 * 外部知識（国推測・都市知識・ビザ・学校・費用相場・スケジュール）は一切付加しない。
 */

import type { BlockName, Field, FieldSource, Karte } from "@/lib/karte";
import { getFieldLabel, getKarteSummaryItems } from "@/lib/karte";

export type StudyPlanItem = {
  block: BlockName;
  key: string;
  label: string;
  /** Karte の値そのまま（言い換え・単位変換・具体化はしない）。 */
  value: string;
  /** 将来の prompt safety 用の内部情報。本文へ出す目的では持たない。旧データで未設定なら undefined。 */
  source?: FieldSource;
};

export type StudyPlanView = {
  /** 計画条件 block の stated だけ（inferred・unknown・conflict 中・trueGoalHypothesis は含まない）。 */
  stated: StudyPlanItem[];
  /** motivation.statedGoal（stated・非 conflict・非空）だけ。冒頭「目的」1〜2 文の材料。 */
  purpose?: string;
  /** handoff.openQuestions（既にユーザー向けラベル）。trim・重複除去済み、元の順序を維持。 */
  openQuestionLabels: string[];
  /** handoff.conflicts のトピックのラベルだけ。値・source・どちらが正しいかは持たない。
   *  重複除去済み、元の順序を維持。 */
  conflictTopics: string[];
  /** decision.stage が stated かつ非 conflict のときの生の値。inferred / unknown は undefined。 */
  decisionStage?: string;
  /** decision.leaning が stated かつ非 conflict のときの生の enum 値（"going" | "not_going" | "undecided"）。
   *  view 段階で日本語変換しない。inferred / unknown は undefined。 */
  decisionLeaning?: string;
  /** decision.decisionOwner が stated かつ非 conflict のときの生の enum 値
   *  （"self" | "parent" | "partner_consent_needed"）。inferred / unknown は undefined。 */
  decisionOwner?: string;
  /** timing.deadline が stated かつ非 conflict のときの生の値そのまま。
   *  departureTiming 等からの逆算はしない。inferred deadline は undefined。 */
  statedDeadline?: string;
  /** conflict 除外後の stated item を持つ「計画条件カテゴリ」が 2 種類以上あるか。
   *  motivation / decision / profile / personality / support / proposals はカウントに含めない。 */
  hasEnoughContext: boolean;
};

/**
 * study_plan の stated[] 本体へ入れてよい block、かつ hasEnoughContext のカウント対象。
 * profile（本人の計画条件そのものではない）/ personality（性格推論を計画に混ぜない）/
 * support（将来 agent_summary 側）/ proposals（school_comparison 側）は含めない。
 * motivation は purpose、decision は専用 top-level で別扱いのため、ここにも含めない。
 */
const PLAN_CONDITION_BLOCKS: ReadonlySet<BlockName> = new Set<BlockName>([
  "timing",
  "budget",
  "schoolPrefs",
  "language",
  "work",
  "lifestyle",
  "constraints",
]);

function isTrueGoalHypothesis(block: BlockName, key: string): boolean {
  return block === "motivation" && key === "trueGoalHypothesis";
}

/** trim して空文字を捨て、最初に出た順を保ったまま重複を除去する。 */
function dedupePreserveOrder(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = typeof raw === "string" ? raw.trim() : "";
    if (v.length === 0 || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/**
 * Field が stated かつ conflict 中でなく、値が非空の文字列なら、その生の値を返す。
 * それ以外（inferred / unknown / conflict 中 / 空 / 非文字列）は undefined。
 * decision.stage / leaning / decisionOwner・timing.deadline はすべて文字列 or enum（文字列）値。
 */
function pickStatedNonConflict(
  field: Field<unknown>,
  conflictKey: string,
  conflictKeys: ReadonlySet<string>,
): string | undefined {
  if (conflictKeys.has(conflictKey)) return undefined;
  if (field.certainty !== "stated") return undefined;
  if (typeof field.value !== "string" || field.value.trim().length === 0) return undefined;
  return field.value;
}

/**
 * Karte から study_plan 生成用の pure view を作る。入力 Karte は一切 mutate しない。
 */
export function buildStudyPlanView(karte: Karte): StudyPlanView {
  const conflictKeys = new Set(karte.handoff.conflicts.map((c) => `${c.block}.${c.key}`));

  const stated: StudyPlanItem[] = [];

  for (const item of getKarteSummaryItems(karte)) {
    // inferred は全除外（unknown は getKarteSummaryItems の時点で既に除外済み）。
    if (item.certainty !== "stated") continue;
    // trueGoalHypothesis は stated でも一切採用しない（block filter でも落ちるが二重防御）。
    if (isTrueGoalHypothesis(item.block, item.key)) continue;
    // 計画条件 block 以外（profile / personality / support / motivation / decision）は stated[] へ入れない。
    if (!PLAN_CONDITION_BLOCKS.has(item.block)) continue;
    // 未解決 conflict 中の field は確定計画にしない（stated であっても除外。トピック名は conflictTopics へ）。
    if (conflictKeys.has(`${item.block}.${item.key}`)) continue;

    const rawField = (karte[item.block] as Record<string, Field<unknown>>)[item.key];
    stated.push({
      block: item.block,
      key: item.key,
      label: item.label,
      value: item.value,
      source: rawField?.source,
    });
  }

  // purpose: motivation.statedGoal のみ。stated かつ非 conflict かつ非空の場合だけ。
  // trueGoalHypothesis / desiredOutcome / regretIfNotGo / inferred は一切見ない。
  const purpose = pickStatedNonConflict(
    karte.motivation.statedGoal,
    "motivation.statedGoal",
    conflictKeys,
  );

  // handoff.openQuestions は flagOpenQuestions によって既にユーザー向けラベル文字列の配列。
  // 追加の key→label 変換はできず・不要。trim と重複除去のみ（unknown を勝手に open question にしない）。
  const openQuestionLabels = dedupePreserveOrder(karte.handoff.openQuestions);

  // conflicts はトピックのラベルだけ。existingValue / incomingValue / source / その他 metadata は持たない。
  // getFieldLabel は解決できないとき key をそのまま返す（既存 project の fallback 方針）。
  const conflictTopics = dedupePreserveOrder(
    karte.handoff.conflicts.map((c) => getFieldLabel(c.block, c.key)),
  );

  // decision 系 / timing.deadline: stated かつ非 conflict のときだけ生の値を top-level へ。
  const decisionStage = pickStatedNonConflict(karte.decision.stage, "decision.stage", conflictKeys);
  const decisionLeaning = pickStatedNonConflict(
    karte.decision.leaning,
    "decision.leaning",
    conflictKeys,
  );
  const decisionOwner = pickStatedNonConflict(
    karte.decision.decisionOwner,
    "decision.decisionOwner",
    conflictKeys,
  );
  const statedDeadline = pickStatedNonConflict(karte.timing.deadline, "timing.deadline", conflictKeys);

  // hasEnoughContext: stated[] は既に「計画条件 block のみ・conflict 除外済み・inferred 除外済み」なので、
  // そこに現れる block の種類数がそのまま「有効な計画条件カテゴリ数」になる。2 種類以上で true。
  // motivation / decision / profile / personality / support / proposals は stated[] に入らないため
  // 自動的にカウント対象外。purpose・decision 系 top-level・openQuestions・conflictTopics は数えない。
  const categoriesWithStated = new Set(stated.map((i) => i.block));
  const hasEnoughContext = categoriesWithStated.size >= 2;

  return {
    stated,
    purpose,
    openQuestionLabels,
    conflictTopics,
    decisionStage,
    decisionLeaning,
    decisionOwner,
    statedDeadline,
    hasEnoughContext,
  };
}
