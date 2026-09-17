/**
 * Consultation Sheet の「相談したいこと」「確認したいこと」の候補を、Karte と Worksheet から作る。
 * pure / deterministic（LLM は呼ばない）。候補は保存せず、ページを開くたびに最新の Karte / Worksheet から作り直す。
 * ユーザーが「追加する」を押したときだけ通常の項目として保存される（勝手に確定しない）。
 *
 * 候補にしてよい根拠（これ以外からは作らない）:
 *   - conflict（2つの値で揺れている項目）… どちらかを選ばず「どちらが合うか相談する」
 *   - 本人が述べた不安（decision.topConcern / Worksheet Worries）
 *   - 本人が「まだ決めていない」と答えた条件
 *   - 本人がまだ答えを出していないと確認された論点（handoff.openQuestions）
 *   - Next Step で「知りたい・相談したい」と選んだこと
 *   - 本人が述べた具体的な条件のうち、相談時に確認が必要になるもの（予算の範囲・滞在費・就労ビザ・学費）
 * 使わないもの: inferred / motivation.trueGoalHypothesis / 値が無いだけの項目 / 本人が問題にしていないテーマ
 * （例: 家族について何も述べていないのに「家族を説得する方法」を作らない）。
 */

import type { BlockName, Karte } from "@/lib/karte";
import { getFieldLabel } from "@/lib/karte";
import type { WorksheetPersistedData } from "@/lib/worksheetStorage";
import { isUndecidedValue } from "@/lib/myNoteBuckets";
import { ACCOMMODATION_OPTIONS, STUDY_FORMAT_OPTIONS } from "@/lib/worksheetConditions";
import type { ConsultationCategory, ConsultationSheetState } from "@/lib/consultationSheet";

export type ConsultationCandidate = {
  /** 同じ根拠からは常に同じ key（扱い済みの判定に使う）。 */
  key: string;
  list: "topics" | "todos";
  text: string;
  category: ConsultationCategory;
  /** なぜこの候補が出ているか（小さく表示する。本人の回答を言い換えない短い説明）。 */
  basis: string;
};

type Field = { value?: unknown; certainty?: string; source?: string };

function fieldOf(karte: Karte, block: BlockName, key: string): Field | undefined {
  return (karte[block] as unknown as Record<string, Field> | undefined)?.[key];
}

function formatValue(v: unknown): string {
  if (Array.isArray(v)) return v.map(String).join("、");
  if (typeof v === "boolean") return v ? "あり" : "なし";
  if (typeof v === "number") return v.toLocaleString("ja-JP");
  return String(v ?? "");
}

function short(text: string, max = 40): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** conflict の field → カテゴリ。motivation など相談先に聞く内容でない block は候補にしない。 */
function conflictCategory(block: BlockName, key: string): ConsultationCategory | null {
  if (block === "schoolPrefs" && (key === "preferredCity" || key === "preferredCountries")) return "国・都市";
  if (block === "schoolPrefs" && key === "accommodation") return "滞在";
  if (block === "schoolPrefs") return "学校";
  if (block === "budget") return "予算";
  if (block === "timing" && (key === "durationLabel" || key === "durationWeeks")) return "留学期間";
  if (block === "timing") return "出発時期";
  if (block === "work") return "仕事";
  if (block === "language") return "英語";
  return null;
}

/** 本人が述べた不安の文面から、相談テーマを決める（キーワードの完全に機械的な判定）。 */
function concernCandidates(text: string): ConsultationCandidate[] {
  const out: ConsultationCandidate[] = [];
  const basis = `不安として「${short(text, 24)}」と答えています`;
  if (/英語|英会話|話せ|スピーキング|リスニング/.test(text)) {
    out.push({ key: "concern:english", list: "topics", text: "今の英語力に合う学校や準備の進め方を相談する", category: "英語", basis });
  }
  if (/お金|費用|予算|学費|足り|生活費/.test(text)) {
    out.push({ key: "concern:cost", list: "topics", text: "予算の範囲で無理なく進める方法を相談する", category: "予算", basis });
  }
  if (/仕事|働|バイト|アルバイト/.test(text)) {
    out.push({ key: "concern:work", list: "topics", text: "現地での仕事探しについて相談する", category: "仕事", basis });
  }
  if (/ビザ/.test(text)) {
    out.push({ key: "concern:visa", list: "todos", text: "必要なビザと条件を確認する", category: "ビザ", basis });
  }
  if (/家族|親|両親/.test(text)) {
    out.push({ key: "concern:family", list: "topics", text: "家族への説明の仕方を相談する", category: "家族", basis });
  }
  if (/治安|安全|危な/.test(text)) {
    out.push({ key: "concern:safety", list: "topics", text: "都市や滞在先の治安について相談する", category: "滞在", basis });
  }
  if (out.length === 0) {
    out.push({
      key: `concern:free:${short(text, 60)}`,
      list: "topics",
      text: `「${short(text)}」という不安について相談する`,
      category: "その他",
      basis: "不安として答えています",
    });
  }
  return out;
}

/** Next Step「次に確認・整理したいこと」→ 候補（本人が選んだものだけ）。 */
const NEXT_TOPIC_CANDIDATES: Record<string, Omit<ConsultationCandidate, "key" | "basis">> = {
  countryCity: { list: "topics", text: "自分に合う国・都市を相談する", category: "国・都市" },
  school: { list: "topics", text: "自分に合う学校の選び方を相談する", category: "学校" },
  cost: { list: "todos", text: "留学にかかる費用の目安を確認する", category: "予算" },
  timing: { list: "topics", text: "留学できる時期や期間を相談する", category: "出発時期" },
  visa: { list: "todos", text: "必要なビザと条件を確認する", category: "ビザ" },
  localWork: { list: "topics", text: "現地での仕事について相談する", category: "仕事" },
  accommodation: { list: "topics", text: "滞在方法の選び方を相談する", category: "滞在" },
  englishLevel: { list: "topics", text: "今の英語力に合う学校や準備の進め方を相談する", category: "英語" },
  explainToFamily: { list: "topics", text: "家族への説明の仕方を相談する", category: "家族" },
};

export function buildConsultationCandidates(
  karte: Karte,
  worksheet: WorksheetPersistedData | null,
): ConsultationCandidate[] {
  const all: ConsultationCandidate[] = [];
  const conflicts = karte.handoff?.conflicts ?? [];
  const conflictKeys = new Set(conflicts.map((c) => `${c.block}.${c.key}`));
  const statedValue = (block: BlockName, key: string): unknown => {
    if (conflictKeys.has(`${block}.${key}`)) return undefined;
    const f = fieldOf(karte, block, key);
    return f && f.certainty === "stated" && f.value != null ? f.value : undefined;
  };
  const ws = worksheet;
  const single = (id: string) => ws?.singleSelections[id];
  const multi = (id: string) => ws?.multiSelections[id] ?? [];

  /* 1. conflict: どちらかを選ばない */
  for (const c of conflicts) {
    const category = conflictCategory(c.block, c.key);
    if (!category) continue;
    const a = formatValue(c.existingValue);
    const b = formatValue(c.incomingValue);
    const label = getFieldLabel(c.block, c.key);
    const text =
      category === "国・都市"
        ? `「${a}」と「${b}」のどちらが自分に合うか相談する`
        : `${label}を「${a}」と「${b}」のどちらで考えるか相談する`;
    all.push({ key: `conflict:${c.block}.${c.key}`, list: "topics", text, category, basis: `${label}が2つの候補で揺れています` });
  }

  /* 2. 本人が述べた不安 */
  const concerns: string[] = [];
  const topConcern = statedValue("decision", "topConcern");
  if (typeof topConcern === "string" && topConcern.trim()) concerns.push(topConcern);
  for (const id of ["anxiety-biggest", "anxiety-blocker"]) {
    const t = ws?.answers[id]?.trim();
    if (t && !concerns.includes(t)) concerns.push(t);
  }
  for (const text of concerns) all.push(...concernCandidates(text));

  /* 3. 本人が「まだ決めていない」と答えた条件 */
  const karteUndecided = (block: BlockName, key: string) => {
    const v = statedValue(block, key);
    return typeof v === "string" && isUndecidedValue(v);
  };
  if (multi("destination-city").includes("city-undecided") || multi("destination-country").includes("country-undecided")) {
    all.push({ key: "undecided:destination", list: "topics", text: "希望条件に合う国・都市を相談する", category: "国・都市", basis: "行き先は「まだ決まっていない」と答えています" });
  }
  if (single("stay-duration") === "dur-undecided" || karteUndecided("timing", "durationLabel")) {
    all.push({ key: "undecided:duration", list: "topics", text: "自分に合う留学期間を相談する", category: "留学期間", basis: "留学期間は「まだ決めていない」と答えています" });
  }
  if (single("timing") === "depart-undecided" || karteUndecided("timing", "departureTiming")) {
    all.push({ key: "undecided:departure", list: "topics", text: "出発時期をいつ頃にするか相談する", category: "出発時期", basis: "出発時期は「まだ決めていない」と答えています" });
  }
  if (single("budget") === "budget-unknown" || karteUndecided("budget", "rangeLabel")) {
    all.push({ key: "undecided:budget", list: "todos", text: "留学に必要な費用の目安を確認する", category: "予算", basis: "予算は「まだ分からない」と答えています" });
  }
  if (
    multi("study-format").includes("study-undecided") ||
    single("study-duration") === "sdur-undecided" ||
    karteUndecided("schoolPrefs", "studyDurationLabel")
  ) {
    all.push({ key: "undecided:study", list: "topics", text: "自分に合う学び方（学校の種類や通う期間）を相談する", category: "学校", basis: "学び方は「まだ決めていない」と答えています" });
  }
  if (multi("accommodation").includes("stay-undecided")) {
    all.push({ key: "undecided:accommodation", list: "topics", text: "滞在方法の選び方を相談する", category: "滞在", basis: "滞在方法は「まだ決めていない」と答えています" });
  }
  if (single("local-work") === "work-unknown" || single("local-work") === "work-conditional") {
    all.push({ key: "undecided:work", list: "topics", text: "現地で働くことについて相談する", category: "仕事", basis: "現地で働くかはまだ決めきれていないと答えています" });
  }

  /* 4. 本人がまだ答えを出していないと確認された論点 */
  for (const label of karte.handoff?.openQuestions ?? []) {
    const l = typeof label === "string" ? label.trim() : "";
    if (!l) continue;
    all.push({ key: `open:${l}`, list: "topics", text: `「${short(l)}」について相談する`, category: "その他", basis: "まだ答えを出していない論点です" });
  }

  /* 5. Next Step で選んだ「知りたい・整理したい」こと */
  for (const id of multi("nextstep-topics")) {
    const c = NEXT_TOPIC_CANDIDATES[id];
    if (c) all.push({ key: `next:${id}`, ...c, basis: "次に確認・整理したいこととして選んでいます" });
  }

  /* 6. 本人が述べた具体的な条件のうち、相談時に確認が必要になるもの */
  const range = statedValue("budget", "rangeLabel");
  const totalCap = statedValue("budget", "totalCap");
  const budgetText =
    typeof range === "string" && range.trim() && !isUndecidedValue(range)
      ? range
      : typeof totalCap === "number"
        ? `${totalCap.toLocaleString("ja-JP")}円`
        : null;
  if (budgetText) {
    all.push({ key: "plan:budget", list: "topics", text: `予算（${budgetText}）の範囲でできる留学プランを相談する`, category: "予算", basis: "予算の目安を答えています" });
  }

  const stayLabels = new Set<string>();
  for (const id of multi("accommodation")) {
    const label = ACCOMMODATION_OPTIONS.find((o) => o.id === id)?.label;
    if (label && !isUndecidedValue(label) && label !== "その他") stayLabels.add(label);
  }
  const karteStay = statedValue("schoolPrefs", "accommodation");
  if (stayLabels.size === 0 && typeof karteStay === "string" && karteStay.trim() && !isUndecidedValue(karteStay)) {
    for (const part of karteStay.split("／")) if (part.trim()) stayLabels.add(part.trim());
  }
  for (const label of [...stayLabels].slice(0, 2)) {
    all.push({ key: `plan:stay-cost:${label}`, list: "todos", text: `${label}の費用を確認する`, category: "滞在", basis: "希望する滞在方法です" });
  }

  const wantsToWork = statedValue("work", "wantsToWork") === true || ["work-strong", "work-prefer"].includes(single("local-work") ?? "");
  if (wantsToWork) {
    all.push({ key: "plan:work-visa", list: "todos", text: "現地で働けるビザの条件を確認する", category: "ビザ", basis: "現地で働きたいと答えています" });
  }

  const studyingAtSchool =
    multi("study-format").some((id) => ["study-language", "study-university", "study-grad", "study-vet", "study-short"].includes(id)) ||
    (() => {
      const v = statedValue("schoolPrefs", "courseType");
      if (typeof v !== "string" || !v.trim() || isUndecidedValue(v)) return false;
      // Worksheet の学び方ラベル（語学学校 / 大学 / 専門学校 など）を含むときだけ。それ以外の自由記述からは判断しない。
      return STUDY_FORMAT_OPTIONS.some(
        (o) => ["study-language", "study-university", "study-grad", "study-vet", "study-short"].includes(o.id) && v.includes(o.label),
      );
    })();
  if (studyingAtSchool) {
    all.push({ key: "plan:tuition", list: "todos", text: "候補の学校の学費を確認する", category: "学校", basis: "学校に通うことを考えています" });
  }

  // key と文面で重複をまとめる（先に出た根拠を残す）
  const seenKeys = new Set<string>();
  const seenTexts = new Set<string>();
  return all.filter((c) => {
    if (seenKeys.has(c.key) || seenTexts.has(`${c.list}:${c.text}`)) return false;
    seenKeys.add(c.key);
    seenTexts.add(`${c.list}:${c.text}`);
    return true;
  });
}

/** 画面に出す候補: 扱い済み（追加済み・非表示）と、同じ文面の項目が既にあるものを除く。 */
export function visibleConsultationCandidates(
  candidates: ConsultationCandidate[],
  sheet: ConsultationSheetState,
): ConsultationCandidate[] {
  const handled = new Set(sheet.handledCandidateKeys);
  return candidates.filter((c) => {
    if (handled.has(c.key)) return false;
    return !sheet[c.list].some((item) => item.text.trim() === c.text);
  });
}
