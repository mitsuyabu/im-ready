/**
 * Plan Karte → my_note（本人向けの内省ノート Document）生成の入力データへの変換レイヤー。
 * DB・Supabase・Anthropic へは一切アクセスしない pure function のみ（Step 15）。
 *
 * lib/documentsKarteView.ts（parent_explanation 用）は import も拡張もしない。
 * あちらは「家族に見せてよいか」基準の設計で、conflict を完全に落とし
 * handoff.openQuestions を持たない。my_note は「まだ決めきれていないこと」「次に考えたい
 * こと」を安全な形で扱いたいため責務が違う。共通の下位ロジックは lib/karte.ts の
 * getKarteSummaryItems / getFieldLabel を直接再利用し、コピペはしない
 * （lib/documentsKarteView.ts が lib/myPlanSections.ts を import しないのと同じ、
 * 兄弟レイヤーを疎結合に保つ方針）。
 *
 * このファイルが担う変換の骨子:
 *   Karte → getKarteSummaryItems（unknown・値なしは既に除外済み）
 *         → 未解決 conflict 中の field は stated/inferred から除外（トピック名だけ conflictTopics へ）
 *         → motivation.trueGoalHypothesis の certainty は必ず inferred へ強制
 *         → handoff.openQuestions（既にユーザー向けラベル文字列）を trim・重複除去
 *         → decision.leaning / decision.stage を安全な範囲だけ top-level へ
 *         → hasEnoughContext 判定（stated のみ・主要カテゴリ 1 件以上。
 *           profile / personality / support だけでは true にならない）
 *
 * 文章化・hedge 処理・「次に考えたいこと」の意味づけ等は一切しない。それは prompt 側の責務。
 */

import type { BlockName, Certainty, Field, FieldSource, Karte } from "@/lib/karte";
import { getFieldLabel, getKarteSummaryItems } from "@/lib/karte";

export type MyNoteItem = {
  block: BlockName;
  key: string;
  label: string;
  value: string;
  /** unknown は getKarteSummaryItems の時点で除外済みのため、ここでは stated / inferred のみ */
  certainty: Certainty;
  /** 将来の prompt safety 用の内部情報。本文へ出す目的では持たない。
   *  旧データで未設定の場合は undefined のまま渡す（lib/karte.ts 側の「source 未設定は
   *  chat 起源とみなす」後方互換ルールは DB 書き込み側の解釈であり、ここでは推測・代入しない）。 */
  source?: FieldSource;
};

export type MyNoteView = {
  /** 本人が明言した情報 */
  stated: MyNoteItem[];
  /** 会話・回答から読み取れる仮説（本人の確定意思ではない） */
  inferred: MyNoteItem[];
  /** handoff.openQuestions（既にユーザー向けラベル）。trim・重複除去済み、元の順序を維持。 */
  openQuestionLabels: string[];
  /** handoff.conflicts のトピックのラベルだけ。値・source・どちらが正しいかは持たない。
   *  重複除去済み、元の順序を維持。 */
  conflictTopics: string[];
  /** decision.leaning の生の enum 値（"going" | "not_going" | "undecided"）。
   *  unknown / 未設定 / conflict 中 なら undefined。 */
  decisionLeaning?: string;
  /** 上の decisionLeaning が stated か inferred か。decisionLeaning と対で設定 / 未設定。 */
  decisionLeaningCertainty?: Certainty;
  /** decision.stage が stated かつ conflict 中でない場合のみ。inferred / unknown は入れない。 */
  decisionStage?: string;
  /** 主要カテゴリに stated が 1 件以上あるか。
   *  inferred のみ / openQuestions のみ / conflicts のみ / profile のみ / personality のみ では false。 */
  hasEnoughContext: boolean;
};

/**
 * hasEnoughContext の根拠にしてよい block（§14）。
 * profile / personality / support は含めない（§16。プロフィールや性格傾向だけで
 * my_note が生成可能にならないようにする）。
 */
const CONTEXT_BLOCKS: ReadonlySet<BlockName> = new Set<BlockName>([
  "motivation",
  "decision",
  "constraints",
  "timing",
  "budget",
  "language",
  "lifestyle",
  "work",
  "schoolPrefs",
]);

/**
 * motivation.trueGoalHypothesis は仕様上つねに inferred として扱う（§6）。
 * lib/karte.ts の confirmKarte が通常は昇格対象から除外するが、旧データ等で stated に
 * なっていた場合に備え、ここでも独立して強制する（documentsKarteView と同じ二重防御）。
 */
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
 * Karte から my_note 生成用の pure view を作る。入力 Karte は一切 mutate しない。
 */
export function buildMyNoteView(karte: Karte): MyNoteView {
  const conflictKeys = new Set(karte.handoff.conflicts.map((c) => `${c.block}.${c.key}`));

  const stated: MyNoteItem[] = [];
  const inferred: MyNoteItem[] = [];

  for (const item of getKarteSummaryItems(karte)) {
    // 未解決 conflict 中の field は stated/inferred に入れない（その値を本文の材料にしない）。
    // トピック名だけを conflictTopics 側で扱う（§9）。
    if (conflictKeys.has(`${item.block}.${item.key}`)) continue;

    // trueGoalHypothesis は入力の certainty に関係なく必ず inferred（§6）。
    const certainty: Certainty = isTrueGoalHypothesis(item.block, item.key)
      ? "inferred"
      : item.certainty;

    const rawField = (karte[item.block] as Record<string, Field<unknown>>)[item.key];
    const myNoteItem: MyNoteItem = {
      block: item.block,
      key: item.key,
      label: item.label,
      value: item.value,
      certainty,
      source: rawField?.source,
    };

    (certainty === "stated" ? stated : inferred).push(myNoteItem);
  }

  // handoff.openQuestions は flagOpenQuestions によって既にユーザー向けラベル文字列の配列に
  // なっている（内部 key ではない）。ここでは追加の key→label 変換はできず・不要で、
  // trim と重複除去だけ行う（§7・§8。unknown な field を勝手に open question へ変換しない）。
  const openQuestionLabels = dedupePreserveOrder(karte.handoff.openQuestions);

  // conflicts からはトピックのラベルだけを取り出す。existingValue / incomingValue / source /
  // その他 metadata は一切持たない。どちらが正しいかも判断しない（§9・§10）。
  // getFieldLabel は解決できないとき key をそのまま返す（既存 project の fallback 方針）。
  const conflictTopics = dedupePreserveOrder(
    karte.handoff.conflicts.map((c) => getFieldLabel(c.block, c.key)),
  );

  // decision.leaning: unknown / 未設定 / conflict 中 は top-level に入れない。
  // 値は書き換えず生の enum のまま。certainty も対で持たせ、prompt 側で
  // stated / inferred を区別できるようにする（§11。安全性優先）。
  const leaningField = karte.decision.leaning;
  let decisionLeaning: string | undefined;
  let decisionLeaningCertainty: Certainty | undefined;
  if (
    !conflictKeys.has("decision.leaning") &&
    leaningField.value != null &&
    leaningField.certainty !== "unknown"
  ) {
    decisionLeaning = leaningField.value;
    decisionLeaningCertainty = leaningField.certainty;
  }

  // decision.stage: stated かつ conflict 中でない場合のみ top-level へ（§12）。
  const stageField = karte.decision.stage;
  const decisionStage =
    !conflictKeys.has("decision.stage") &&
    stageField.certainty === "stated" &&
    stageField.value != null
      ? stageField.value
      : undefined;

  const hasEnoughContext = stated.some((i) => CONTEXT_BLOCKS.has(i.block));

  return {
    stated,
    inferred,
    openQuestionLabels,
    conflictTopics,
    decisionLeaning,
    decisionLeaningCertainty,
    decisionStage,
    hasEnoughContext,
  };
}
