/**
 * Plan Karte → Documents生成の入力データへの変換レイヤー。
 * DB・Supabase・Anthropicへは一切アクセスしない、pure functionのみ。
 *
 * lib/myPlanView.ts（My Plan表示専用の view builder）は意図的にimportしない。
 * My Plan = ユーザー採用値＋Karte候補の閲覧用UI、DocumentsKarteView = AI生成への安全な
 * 入力データ、という責務の違いを保つため。依存してよいのは lib/karte.tsのschema・
 * getKarteSummaryItemsのような下位の共通helperまでとする。
 *
 * このファイルが担う変換の骨子:
 *   Karte → unknown除外・値の整形（getKarteSummaryItemsを再利用）
 *         → stated/inferredへ振り分け（trueGoalHypothesisは常にinferredへ強制）
 *         → 未解決conflict中のfieldを除外（excludedConflictsに記録）
 *         → hasEnoughContext判定（statedのみで判定。inferredだけでは真にならない）
 */

import type { BlockName, Decision, Field, FieldSource, Karte } from "@/lib/karte";
import { getKarteSummaryItems } from "@/lib/karte";

export type DocumentCertainty = "stated" | "inferred";

export type DocumentKarteItem = {
  block: BlockName;
  key: string;
  label: string;
  value: string;
  certainty: DocumentCertainty;
  /** provenance用（デバッグ・将来の生成ルール調整向け）。旧データで未設定の場合はundefinedのまま渡す
   *  （lib/karte.ts側にある「source未設定はchat起源とみなす」という後方互換ルールは、
   *  DB書き込み側の解釈であり、Documents変換側では推測・代入しない）。 */
  source?: FieldSource;
};

export type ExcludedConflictItem = { block: BlockName; key: string };

/** karte.decision.leaningの値そのもの（Decision型から導出。手打ちのunion複製を避ける） */
export type DecisionLeaning = NonNullable<Decision["leaning"]["value"]>;

export type DocumentsKarteView = {
  /** 本人が明言した情報。Documents生成の基本的な情報源 */
  stated: DocumentKarteItem[];
  /** 会話・回答から読み取れる仮説。「本人の確定意思」ではなく「会話から見えてきた可能性」として扱うこと */
  inferred: DocumentKarteItem[];
  /** Chat/Worksheet間で未解決のconflictがあるため、生成入力から除外したfield */
  excludedConflicts: ExcludedConflictItem[];
  /** decision.leaningがstated・かつconflict対象でない場合のみ設定。値は書き換えない（原文のenumのまま） */
  decisionLeaning?: DecisionLeaning;
  /** Why(動機)系のstated情報と、現実条件系のstated情報の両方が最低限そろっているか。inferredのみでは真にならない */
  hasEnoughContext: boolean;
};

/** hasEnoughContext判定A。trueGoalHypothesisは常にinferred扱いのため、ここに残るのは
 *  statedGoal/regretIfNotGo/desiredOutcomeのいずれか（=本人が明言した動機）のみ */
const WHY_BLOCK: BlockName = "motivation";

/** hasEnoughContext判定B。「条件/期間・時期/予算/英語/生活/不安/decision」の指定に対応するblock */
const REALITY_BLOCKS: readonly BlockName[] = [
  "constraints",
  "timing",
  "budget",
  "language",
  "lifestyle",
  "decision",
];

function conflictKeySet(karte: Karte): Set<string> {
  return new Set(karte.handoff.conflicts.map((c) => `${c.block}.${c.key}`));
}

/**
 * motivation.trueGoalHypothesisは仕様上常にinferredとして扱う（lib/karte.ts側の
 * sanitizeKartePatch/confirmKarteが通常保証するが、旧データ等でstatedになっていた場合に
 * 備え、Documents変換側でも独立して強制する二重の防御）。
 */
function isTrueGoalHypothesis(block: BlockName, key: string): boolean {
  return block === "motivation" && key === "trueGoalHypothesis";
}

export function buildDocumentsKarteView(karte: Karte): DocumentsKarteView {
  const conflicts = conflictKeySet(karte);
  // getKarteSummaryItemsの時点でunknown・値なしFieldは既に除外済み。ここでの絞り込みは
  // 「conflict除外」と「trueGoalHypothesisのinferred強制」の2点のみで、値の整形・
  // placeholder除外ロジックは再実装しない。
  const summaryItems = getKarteSummaryItems(karte);

  const stated: DocumentKarteItem[] = [];
  const inferred: DocumentKarteItem[] = [];
  const excludedConflicts: ExcludedConflictItem[] = [];

  for (const item of summaryItems) {
    const conflictKey = `${item.block}.${item.key}`;
    if (conflicts.has(conflictKey)) {
      excludedConflicts.push({ block: item.block, key: item.key });
      continue;
    }

    const blockData = karte[item.block] as Record<string, Field<unknown>>;
    const rawField = blockData[item.key];

    const documentItem: DocumentKarteItem = {
      block: item.block,
      key: item.key,
      label: item.label,
      value: item.value,
      certainty: isTrueGoalHypothesis(item.block, item.key) ? "inferred" : item.certainty,
      source: rawField?.source,
    };

    if (documentItem.certainty === "stated") {
      stated.push(documentItem);
    } else {
      inferred.push(documentItem);
    }
  }

  const leaningField = karte.decision.leaning;
  const decisionLeaning: DecisionLeaning | undefined =
    !conflicts.has("decision.leaning") && leaningField.certainty === "stated" && leaningField.value != null
      ? leaningField.value
      : undefined;

  const hasWhy = stated.some((i) => i.block === WHY_BLOCK);
  const hasReality = stated.some((i) => REALITY_BLOCKS.includes(i.block));
  const hasEnoughContext = hasWhy && hasReality;

  return { stated, inferred, excludedConflicts, decisionLeaning, hasEnoughContext };
}
