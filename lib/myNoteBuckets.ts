/**
 * My Note（Document type: my_note）専用の「6 カードへの振り分け」層。pure / deterministic。
 *
 * My Note は「留学について考えてきた内容を、自分で振り返るための整理ノート」で、次の 6 カード固定:
 *   1. 留学したい理由      … なぜ行きたいのか
 *   2. こんな留学にしたい  … どうなりたいか・どんな経験にしたいか
 *   3. 今考えているプラン  … 現時点で具体的に考えている条件
 *   4. 大切にしたいこと    … 判断軸・優先順位
 *   5. 今感じている不安    … 本人が不安として述べたこと
 *   6. まだ決めていないこと … 未定・揺れている・次に決めること
 *
 * 旧実装は AI に「見出しの選択」と「どのデータをどの見出しに書くか」を任せていたため、
 * 見出しと本文がズレることがあった。ここでは **入力の段階で** field / 設問ごとに行き先を決め、
 * AI には各カードの材料だけを渡して文章化だけを担当させる（lib/myNotePrompt.ts）。
 *
 * 材料にするもの:
 *   - Karte: buildMyNoteView の stated（conflict 中の field・inferred・trueGoalHypothesis は既に除外済み）
 *   - Karte の conflict: 「まだ決めていないこと」へ、両方の値を並べた形でだけ
 *   - Worksheet（plan_worksheet の回答）: Karte に同じ内容が無い設問だけ（重複させない）
 * 使わないもの: inferred / profile（年齢・職業など）/ personality / support。
 *
 * 他 Document（Study Plan / School Comparison / Parent Explanation）の変換層は import も変更もしない。
 */

import type { BlockName, Karte } from "@/lib/karte";
import { getFieldLabel } from "@/lib/karte";
import { buildMyNoteView } from "@/lib/myNoteView";
import type { WorksheetPersistedData } from "@/lib/worksheetStorage";
import { ALL_QUESTIONS, type Question } from "@/lib/worksheetQuestions";
import { COMPROMISE_NONE_ID, PRIORITY_ITEMS } from "@/lib/worksheetPriorities";
import { NEXT_TOPICS, READINESS_OPTIONS } from "@/lib/worksheetNextStep";

export const MY_NOTE_CARDS = [
  { key: "reasons", title: "留学したい理由" },
  { key: "future", title: "こんな留学にしたい" },
  { key: "plan", title: "今考えているプラン" },
  { key: "priorities", title: "大切にしたいこと" },
  { key: "worries", title: "今感じている不安" },
  { key: "undecided", title: "まだ決めていないこと" },
] as const;

export type MyNoteCardKey = (typeof MY_NOTE_CARDS)[number]["key"];

/** 材料が無いカードに出す文言（AI には書かせない）。 */
export const MY_NOTE_EMPTY_CARD_TEXT = "まだ整理されていません";

/** prompt に渡す 1 件。出どころや certainty などの metadata は持たせない（本文に出させないため）。 */
export type MyNoteBucketItem = { label: string; value: string };

export type MyNoteBuckets = Record<MyNoteCardKey, MyNoteBucketItem[]>;

function emptyBuckets(): MyNoteBuckets {
  return { reasons: [], future: [], plan: [], priorities: [], worries: [], undecided: [] };
}

/**
 * 「まだ決めていない」系の回答か（先頭一致）。Worksheet の選択肢ラベルや、本人が書いた言い回しのうち
 * 明確に未定を表すものだけ。これらは内容を捨てず「まだ決めていないこと」へ回す。
 */
const UNDECIDED_VALUE =
  /^(まだ(決めていない|決めてない|決まっていない|分からない|わからない|何も決めていない|話していない)|時期は決めていない|これから(相談する|決める))/;

export function isUndecidedValue(value: string): boolean {
  return UNDECIDED_VALUE.test(value.trim());
}

/* ------------------------------------------------------------------ */
/* Karte field → カード                                                */
/* ------------------------------------------------------------------ */

/**
 * stated の Karte field の行き先。ここに無い field（profile / personality / support など）は My Note に使わない。
 * "plan" の field でも、値が「まだ決めていない」系なら undecided へ回す（下の classifyKarteItem）。
 */
const KARTE_FIELD_CARD: Partial<Record<string, MyNoteCardKey>> = {
  // なぜ行きたいのか
  "motivation.statedGoal": "reasons",
  "motivation.regretIfNotGo": "reasons",
  // どうなりたいか
  "motivation.desiredOutcome": "future",
  "work.postReturnCareer": "future",
  // 具体的な条件
  "schoolPrefs.preferredCountries": "plan",
  "schoolPrefs.preferredCity": "plan",
  "timing.departureTiming": "plan",
  "timing.durationLabel": "plan",
  "timing.durationWeeks": "plan",
  "timing.flexibility": "plan",
  "budget.rangeLabel": "plan",
  "budget.totalCap": "plan",
  "budget.monthlyCap": "plan",
  "budget.fundingSource": "plan",
  "budget.flexibility": "plan",
  "schoolPrefs.courseType": "plan",
  "schoolPrefs.studyDurationLabel": "plan",
  "schoolPrefs.accommodation": "plan",
  "schoolPrefs.startFlexibility": "plan",
  "work.wantsToWork": "plan",
  "work.workingHolidayInterest": "plan",
  "language.selfLevel": "plan",
  "language.testScores": "plan",
  "language.weakSkills": "plan",
  "language.pathwayIntent": "plan",
  "constraints.currentCommitmentPlan": "plan",
  "constraints.visaConstraints": "plan",
  "constraints.health": "plan",
  "decision.familySharingStatus": "plan",
  "decision.decisionOwner": "plan",
  // 判断軸
  "constraints.nonNegotiables": "priorities",
  "constraints.avoidCountries": "priorities",
  "lifestyle.cityVsNature": "priorities",
  "lifestyle.climate": "priorities",
  "lifestyle.safetyImportance": "priorities",
  "lifestyle.priceSensitivity": "priorities",
  "lifestyle.japaneseRatioPref": "priorities",
  "schoolPrefs.sizeNationality": "priorities",
  // 本人が述べた不安
  "decision.topConcern": "worries",
  // 次に決めること
  "timing.deadline": "undecided",
  "decision.stage": "undecided",
};

/** Karte の数値・真偽値を、意味を足さずに読める値へ（金額は円、週は週間）。 */
function formatKarteValue(block: BlockName, key: string, raw: unknown, fallback: string): string {
  if (typeof raw === "number" && (key === "totalCap" || key === "monthlyCap")) {
    return `${raw.toLocaleString("ja-JP")}円`;
  }
  if (typeof raw === "number" && block === "timing" && key === "durationWeeks") return `${raw}週間`;
  if (typeof raw === "boolean") {
    if (key === "wantsToWork") return raw ? "現地で働きたい" : "現地で働く予定はない";
    if (key === "workingHolidayInterest") return raw ? "関心がある" : "関心はない";
    if (key === "pathwayIntent") return raw ? "大学・専門学校などへの進学も考えている" : "進学は考えていない";
  }
  return fallback;
}

function formatConflictValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join("、");
  if (typeof value === "boolean") return value ? "あり" : "なし";
  return String(value);
}

/* ------------------------------------------------------------------ */
/* Worksheet 設問 → カード                                              */
/* ------------------------------------------------------------------ */

type WorksheetRule = { card: MyNoteCardKey; label: string };

/**
 * 設問ごとの行き先と、prompt に渡す短いラベル。カテゴリの 1:1 対応を基本に、意味で調整している
 * （例: Why? の「行ってよかったと思えそうなこと」は将来像なので future）。
 * 年齢・職業は profile 情報なので My Note には使わない（ここに載せない）。
 */
const WORKSHEET_RULES: Record<string, WorksheetRule> = {
  // Why?
  trigger: { card: "reasons", label: "海外に興味を持ったきっかけ" },
  "current-life": { card: "reasons", label: "今の生活で変えたいこと" },
  "goal-or-means": { card: "reasons", label: "留学は目的か、何かのための手段か" },
  regret: { card: "reasons", label: "行かなかった場合にどう感じそうか" },
  success: { card: "future", label: "「行ってよかった」と思えそうなこと" },
  // My Future
  "future-self": { card: "future", label: "留学を終えたときになっていたい自分" },
  "future-use": { card: "future", label: "帰国後にどう活かしたいか" },
  "future-priority": { card: "future", label: "留学で一番伸ばしたいこと" },
  "future-location": { card: "future", label: "帰国後の未来と海外に残る未来への気持ち" },
  // Conditions（「まだ決めていない」系は undecided へ回す）
  "destination-country": { card: "plan", label: "希望する国" },
  "destination-city": { card: "plan", label: "希望する都市" },
  timing: { card: "plan", label: "出発時期" },
  "stay-duration": { card: "plan", label: "留学期間の目安" },
  "english-level": { card: "plan", label: "今の英語力" },
  budget: { card: "plan", label: "予算の目安" },
  "study-format": { card: "plan", label: "現地での学び方" },
  "study-duration": { card: "plan", label: "学校に通う期間の目安" },
  accommodation: { card: "plan", label: "滞在方法の希望" },
  "local-work": { card: "plan", label: "現地で働くこと" },
  "school-work-adjustment": { card: "plan", label: "今の学校・仕事の予定" },
  "family-sharing": { card: "plan", label: "家族への共有状況" },
  // Worries
  "anxiety-biggest": { card: "worries", label: "いちばん引っかかっている不安" },
  "anxiety-blocker": { card: "worries", label: "今すぐ決められない理由" },
  "anxiety-resolved": { card: "worries", label: "不安が解消されたら前に進めそうか" },
};

/**
 * Worksheet 設問 → 同じ意味を持つ Karte field（lib/worksheetKarte.ts が同期する先）。
 * Karte 側にその field の stated 値がある（または conflict 中）なら、Worksheet 側の同じ回答は使わない
 * （同じ事実を 2 回渡さない。conflict は undecided で両方の値として扱う）。
 */
const WORKSHEET_TO_KARTE_KEY: Record<string, string> = {
  regret: "motivation.regretIfNotGo",
  "anxiety-biggest": "decision.topConcern",
  "english-level": "language.selfLevel",
  timing: "timing.departureTiming",
  "destination-city": "schoolPrefs.preferredCity",
  "study-format": "schoolPrefs.courseType",
  accommodation: "schoolPrefs.accommodation",
  "local-work": "work.wantsToWork",
  "destination-country": "schoolPrefs.preferredCountries",
  "stay-duration": "timing.durationLabel",
  budget: "budget.rangeLabel",
  "study-duration": "schoolPrefs.studyDurationLabel",
  "school-work-adjustment": "constraints.currentCommitmentPlan",
  "family-sharing": "decision.familySharingStatus",
};

/** Karte の lifestyle のうち、Worksheet の優先順位（評価）から機械的に作られたもの。Worksheet 側と重複する。 */
const KARTE_KEYS_DERIVED_FROM_PRIORITY_RATINGS = new Set(["lifestyle.safetyImportance", "lifestyle.japaneseRatioPref"]);

const QUESTION_BY_ID = new Map<string, Question>(ALL_QUESTIONS.map((e) => [e.question.id, e.question]));
const PRIORITY_LABEL = new Map(PRIORITY_ITEMS.map((i) => [i.id, i.label]));
/** 「次の一歩」の気持ちのうち、まだ決めきれていないことを表すもの。 */
const UNDECIDED_READINESS_IDS = new Set(["researching", "needsConsult", "undecided"]);

/** 選択式の回答を「具体的な選択」と「未定の選択」に分け、自由記入を添えた文字列にする。 */
function selectAnswerTexts(question: Question, data: WorksheetPersistedData): { concrete: string | null; undecided: string | null } {
  if (question.kind !== "singleSelect" && question.kind !== "multiSelect") return { concrete: null, undecided: null };
  const ids =
    question.kind === "singleSelect"
      ? data.singleSelections[question.id]
        ? [data.singleSelections[question.id]]
        : []
      : (data.multiSelections[question.id] ?? []);
  const note = (data.answers[question.id] ?? "").trim();
  const labels = question.options.filter((o) => ids.includes(o.id)).map((o) => o.label);
  // 「その他」はラベル自体に意味が無いので、自由記入があるときだけ自由記入で表す。
  const meaningful = labels.filter((l) => l !== "その他");
  const concreteLabels = meaningful.filter((l) => !isUndecidedValue(l));
  const undecidedLabels = meaningful.filter((l) => isUndecidedValue(l));
  const concreteParts = [concreteLabels.join("、"), note].filter((s) => s.length > 0);
  return {
    concrete: concreteParts.length > 0 ? concreteParts.join(" / ") : null,
    undecided: undecidedLabels.length > 0 ? undecidedLabels.join("、") : null,
  };
}

function addWorksheetItems(buckets: MyNoteBuckets, data: WorksheetPersistedData, karteCovered: Set<string>) {
  for (const [questionId, rule] of Object.entries(WORKSHEET_RULES)) {
    const karteKey = WORKSHEET_TO_KARTE_KEY[questionId];
    if (karteKey && karteCovered.has(karteKey)) continue;
    const question = QUESTION_BY_ID.get(questionId);
    if (!question) continue;

    if (question.kind === "freeText") {
      const text = (data.answers[questionId] ?? "").trim();
      if (text) buckets[rule.card].push({ label: rule.label, value: text });
      continue;
    }
    const { concrete, undecided } = selectAnswerTexts(question, data);
    if (concrete) buckets[isUndecidedValue(concrete) ? "undecided" : rule.card].push({ label: rule.label, value: concrete });
    if (undecided) buckets.undecided.push({ label: rule.label, value: undecided });
  }

  // My Priorities（評価・順位・妥協）→ 大切にしたいこと。数字は渡さず、分類だけ渡す。
  const ratings = data.ratings["priority-rating"] ?? {};
  const high = PRIORITY_ITEMS.filter((i) => (ratings[i.id] ?? 0) >= 4).map((i) => i.label);
  const low = PRIORITY_ITEMS.filter((i) => ratings[i.id] != null && ratings[i.id] <= 2).map((i) => i.label);
  const ranking = (data.rankings["priority-ranking"] ?? []).map((id) => PRIORITY_LABEL.get(id)).filter((l): l is string => !!l);
  const compromises = data.compromises["priority-compromise"] ?? [];
  if (ranking.length > 0) {
    buckets.priorities.push({
      label: "特に大事にしたいもの（大事な順）",
      value: ranking.map((l, i) => `${i + 1}番目: ${l}`).join(" / "),
    });
  }
  if (high.length > 0) buckets.priorities.push({ label: "大切だと感じているもの", value: high.join("、") });
  if (low.length > 0) buckets.priorities.push({ label: "それほど重視していないもの", value: low.join("、") });
  if (compromises.includes(COMPROMISE_NONE_ID)) {
    buckets.priorities.push({ label: "少し条件が合わなくても受け入れられそうなもの", value: "特にない" });
  } else {
    const labels = compromises.map((id) => PRIORITY_LABEL.get(id)).filter((l): l is string => !!l);
    if (labels.length > 0) {
      buckets.priorities.push({ label: "少し条件が合わなくても受け入れられそうなもの", value: labels.join("、") });
    }
  }

  // Next Step → まだ決めていないこと（補助）。
  const readiness = data.singleSelections["nextstep-readiness"];
  if (readiness && UNDECIDED_READINESS_IDS.has(readiness)) {
    const label = READINESS_OPTIONS.find((o) => o.id === readiness)?.label;
    if (label) buckets.undecided.push({ label: "今の気持ち", value: label });
  }
  const topics = (data.multiSelections["nextstep-topics"] ?? [])
    .map((id) => NEXT_TOPICS.find((o) => o.id === id)?.label)
    .filter((l): l is string => !!l);
  if (topics.length > 0) buckets.undecided.push({ label: "次に確認・整理したいこと", value: topics.join("、") });
}

/* ------------------------------------------------------------------ */
/* 本体                                                                */
/* ------------------------------------------------------------------ */

export function buildMyNoteBuckets(karte: Karte, worksheet: WorksheetPersistedData | null): MyNoteBuckets {
  const buckets = emptyBuckets();
  const view = buildMyNoteView(karte);

  // Karte に stated 値がある field / conflict 中の field（Worksheet 側の同じ回答は使わない）。
  const karteCovered = new Set<string>(view.stated.map((i) => `${i.block}.${i.key}`));
  for (const c of karte.handoff.conflicts) karteCovered.add(`${c.block}.${c.key}`);

  for (const item of view.stated) {
    const id = `${item.block}.${item.key}`;
    const card = KARTE_FIELD_CARD[id];
    if (!card) continue;
    if (worksheet && item.source === "worksheet" && KARTE_KEYS_DERIVED_FROM_PRIORITY_RATINGS.has(id)) continue;
    const raw = (karte[item.block] as Record<string, { value?: unknown }>)[item.key]?.value;
    const value = formatKarteValue(item.block, item.key, raw, item.value);
    const label = item.block === "decision" && item.key === "stage" ? "今の検討段階" : item.label;
    const target: MyNoteCardKey = card === "plan" && isUndecidedValue(value) ? "undecided" : card;
    buckets[target].push({ label, value });
  }

  // 現時点の意向（stated のみ）。「まだ決めていない」は undecided、それ以外は今のプランの前提として。
  if (view.decisionLeaning && view.decisionLeaningCertainty === "stated") {
    if (view.decisionLeaning === "undecided") {
      buckets.undecided.push({ label: "行くかどうか", value: "まだ決めていない" });
    } else if (view.decisionLeaning === "going") {
      buckets.plan.push({ label: "現時点の意向", value: "行く方向に気持ちが傾いている" });
    } else if (view.decisionLeaning === "not_going") {
      buckets.plan.push({ label: "現時点の意向", value: "行かない方向に気持ちが傾いている" });
    }
  }

  // conflict: どちらかを選ばず、両方の値を並べて「まだ決めていないこと」へ。
  for (const c of karte.handoff.conflicts) {
    const a = formatConflictValue(c.existingValue);
    const b = formatConflictValue(c.incomingValue);
    buckets.undecided.push({
      label: getFieldLabel(c.block, c.key),
      value: `「${a}」と「${b}」のあいだで考えが揺れている（まだどちらとも決めていない）`,
    });
  }

  // 本人がまだ答えを出していないと確認された論点（ラベルのみ）。
  for (const label of view.openQuestionLabels) {
    buckets.undecided.push({ label: "まだ確かめていないこと", value: label });
  }

  if (worksheet) addWorksheetItems(buckets, worksheet, karteCovered);

  return buckets;
}

/** 1 枚でも材料があれば生成できる（全カードが空なら AI を呼ばない）。 */
export function hasMyNoteContent(buckets: MyNoteBuckets): boolean {
  return MY_NOTE_CARDS.some((card) => buckets[card.key].length > 0);
}
