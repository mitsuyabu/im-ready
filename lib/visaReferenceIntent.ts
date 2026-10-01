/**
 * 「今のユーザー発言はビザ・手続きの話か？」「どのビザ・どの category か？」を
 * **LLM を使わずに**判定する層。Chat の毎ターンにビザ情報を入れないための入口。
 *
 * ここで null になればビザ情報は一切読まない（DB アクセスも発生しない）。
 * 判定は最新のユーザー発言だけを見る。
 *
 * 区別するもの:
 *   - ビザ制度の質問（この層が扱う）
 *   - 税務の質問（TFN / 確定申告 / superannuation）→ ビザ DB へ回さない。別フェーズ
 *   - ファームの「仕事探し」→ specified work（ビザ条件）とは別物として扱う
 */

import { VISA_CATEGORIES, type VisaCategory, type VisaKey } from "@/lib/visaReference";

/* ------------------------------------------------------------------ */
/* ビザ種別の判定                                                      */
/* ------------------------------------------------------------------ */

const WORKING_HOLIDAY_WORDS = ["ワーホリ", "ワーキングホリデー", "working holiday", "417", "セカンド", "サード", "88日"];
const STUDENT_VISA_WORDS = ["学生ビザ", "student visa", "500", "coe", "oshc", "genuine student", "留学ビザ"];
/** 462 は 417 と混同しやすいので、明示されたときだけ扱う。 */
const WORK_AND_HOLIDAY_462_WORDS = ["462", "work and holiday"];

/* ------------------------------------------------------------------ */
/* category の判定                                                     */
/* ------------------------------------------------------------------ */

const CATEGORY_KEYWORDS: { category: VisaCategory; keywords: string[] }[] = [
  { category: "work_rights", keywords: ["何時間働", "働ける時間", "就労時間", "労働時間", "週何時間", "何時間まで", "就労制限", "work rights"] },
  { category: "same_employer", keywords: ["同一雇用主", "同じ雇用主", "同じ職場", "同じ会社", "same employer"] },
  { category: "study_rights", keywords: ["学校に通え", "就学", "勉強できる", "語学学校に通"] },
  { category: "specified_work", keywords: ["specified work", "88日", "指定された仕事", "指定地域", "特定業種"] },
  { category: "second_third", keywords: ["セカンド", "サード", "2年目", "3年目", "二年目", "延長"] },
  { category: "documents", keywords: ["必要書類", "何が必要", "書類", "用意するもの", "document"] },
  { category: "costs", keywords: ["ビザ代", "申請費", "申請料", "いくらかかる", "費用", "fee"] },
  { category: "processing", keywords: ["何日で", "どのくらいかかる", "審査期間", "発給", "processing"] },
  { category: "health_insurance", keywords: ["保険", "oshc", "健康保険"] },
  { category: "financial_capacity", keywords: ["資金", "残高", "貯金", "financial"] },
  { category: "genuine_student", keywords: ["genuine student", "gs", "gte", "本当に勉強"] },
  { category: "application", keywords: ["申請方法", "どうやって申請", "申請の流れ", "apply", "immiaccount"] },
  { category: "eligibility", keywords: ["何歳まで", "年齢", "申請できる", "条件", "資格", "eligibility"] },
  { category: "stay", keywords: ["どのくらい滞在", "滞在期間", "何年いられる", "何ヶ月いられる"] },
  { category: "arrival_preparation", keywords: ["何から始め", "渡航まで", "渡航準備", "行くまでに", "準備すること"] },
];

/** ビザという語だけで category が絞れない場合に渡す基本セット。 */
const DEFAULT_CATEGORIES: VisaCategory[] = ["eligibility", "work_rights", "stay"];

/** ビザの話だと判定するための語（category が取れなくてもこれがあれば対象）。 */
const VISA_TOPIC_WORDS = ["ビザ", "visa", ...WORKING_HOLIDAY_WORDS, ...STUDENT_VISA_WORDS, ...WORK_AND_HOLIDAY_462_WORDS];

/* ------------------------------------------------------------------ */
/* ビザ以外に回すべき話題                                               */
/* ------------------------------------------------------------------ */

/** 税務。ビザ DB へ回さない（別フェーズ）。 */
const TAX_WORDS = ["tfn", "tax file", "確定申告", "税金", "納税", "superannuation", "スーパーアニュエーション", "tax return", "還付"];

/** ファームの「仕事探し」。specified work（ビザ条件）とは別物。 */
const FARM_JOB_WORDS = [
  "仕事を探",
  "仕事探し",
  "仕事はどう探",
  "どう探",
  "どうやって探",
  "探し方",
  "探せば",
  "見つけ方",
  "見つけられ",
  "求人",
  "募集",
  "雇ってもらえる",
  "時給",
  "給料いくら",
  "バイト探",
];
const FARM_WORDS = ["ファーム", "農場", "farm"];

export type VisaIntent = {
  /** 明示されたビザ（複数挙がったらそのまま返し、呼び出し側が確認する）。 */
  visaKeysInMessage: VisaKey[];
  categories: VisaCategory[];
  /** 税務の話が混ざっているか（ビザ DB では答えない旨を Chat へ伝えるため）。 */
  mentionsTax: boolean;
  /** ファームの仕事探しの話か（specified work と区別する）。 */
  mentionsFarmJobSearch: boolean;
};

function includesAny(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w));
}

/** 発言中で明示されたビザを拾う。 */
export function extractVisaKeysFromText(text: string): VisaKey[] {
  const lower = text.toLowerCase();
  const found: VisaKey[] = [];
  // 462 は明示されたときだけ（417 と混同しないよう先に判定する）。
  if (includesAny(lower, WORK_AND_HOLIDAY_462_WORDS)) found.push("australia_work_and_holiday_462");
  if (includesAny(lower, WORKING_HOLIDAY_WORDS.map((w) => w.toLowerCase()))) {
    found.push("australia_working_holiday_417");
  }
  if (includesAny(lower, STUDENT_VISA_WORDS)) found.push("australia_student_500");
  return Array.from(new Set(found));
}

/**
 * ビザ・手続きの質問かどうかを判定する。該当しなければ null（DB へも触らない）。
 *
 * 税務だけの質問（「TFNって何？」）ではビザ情報を読まない。
 * ファームの仕事探しだけの質問（「ファームの仕事どう探す？」）でもビザ情報は読まない。
 */
export function detectVisaIntent(latestUserMessage: string): VisaIntent | null {
  const text = latestUserMessage.trim();
  if (!text) return null;
  const lower = text.toLowerCase();

  const mentionsTax = includesAny(lower, TAX_WORDS);
  const mentionsFarm = includesAny(lower, FARM_WORDS.map((w) => w.toLowerCase()));
  const mentionsFarmJobSearch = mentionsFarm && includesAny(text, FARM_JOB_WORDS);

  const visaKeysInMessage = extractVisaKeysFromText(text);

  const categories: VisaCategory[] = [];
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    if (includesAny(lower, keywords.map((k) => k.toLowerCase()))) categories.push(category);
  }

  const mentionsVisaTopic = includesAny(lower, VISA_TOPIC_WORDS.map((w) => w.toLowerCase()));

  // ファームの仕事探しだけ（セカンド・ビザの話が無い）ならビザ情報は読まない。
  if (mentionsFarmJobSearch && !mentionsVisaTopic && categories.length === 0) return null;

  // 税務だけ（ビザの話が無い）ならビザ情報は読まない。
  if (mentionsTax && !mentionsVisaTopic && categories.length === 0) return null;

  if (!mentionsVisaTopic && categories.length === 0) return null;

  // 「ビザについて」だけで category が絞れない場合は基本セットを使う。
  const resolved = categories.length > 0 ? Array.from(new Set(categories)) : [...DEFAULT_CATEGORIES];

  // セカンド・サードの話は specified work の条件と一緒に説明しないと誤解を生むため、必ず両方渡す。
  if (resolved.includes("second_third") && !resolved.includes("specified_work")) {
    resolved.push("specified_work");
  }
  if (resolved.includes("specified_work") && !resolved.includes("second_third")) {
    resolved.push("second_third");
  }

  return {
    visaKeysInMessage,
    categories: resolved.filter((c) => (VISA_CATEGORIES as readonly string[]).includes(c)),
    mentionsTax,
    mentionsFarmJobSearch,
  };
}

/* ------------------------------------------------------------------ */
/* どのビザの情報を使うか                                               */
/* ------------------------------------------------------------------ */

export type VisaResolutionSource = "message" | "karteStated";

export type VisaResolution =
  | { kind: "resolved"; visaKeys: VisaKey[]; from: VisaResolutionSource }
  /** どのビザの話か決まらない。Chat は勝手に決めず本人に確認する。 */
  | { kind: "needsVisa"; reason: "unknown" | "ambiguous" };

/**
 * 優先順位:
 *   1. 今の発言で明示されたビザ
 *   2. My Plan の確定ビザ（**現在 My Plan にビザの項目は無い**ため、将来の拡張用に引数だけ用意）
 *   3. Karte の stated な情報（ワーキングホリデーへの関心が stated で true 等）
 *   4. どれも無ければ確認
 *
 * inferred だけでビザ種別を確定しない。発言で複数のビザが挙がった場合はそのまま両方返し、
 * Chat 側が混同しないように扱う（417 と 462 を勝手に1つへまとめない）。
 */
export function resolveVisaKeysForChat(input: {
  visaKeysInMessage: VisaKey[];
  /** 将来 My Plan にビザ項目ができたとき用。現在は常に null が渡る。 */
  myPlanVisaKey?: VisaKey | null;
  /** Karte で stated に確認できている情報だけを渡すこと（inferred は渡さない）。 */
  karteStated?: {
    workingHolidayInterest?: boolean | null;
    /** 就学の意思が stated で分かっている場合（コース種類が決まっている等）。 */
    studyIntent?: boolean | null;
  };
}): VisaResolution {
  if (input.visaKeysInMessage.length > 0) {
    return { kind: "resolved", visaKeys: Array.from(new Set(input.visaKeysInMessage)), from: "message" };
  }

  if (input.myPlanVisaKey) {
    return { kind: "resolved", visaKeys: [input.myPlanVisaKey], from: "message" };
  }

  const whv = input.karteStated?.workingHolidayInterest === true;
  const study = input.karteStated?.studyIntent === true;

  // 両方の可能性が stated で立っている場合は勝手に片方へ寄せない。
  if (whv && study) return { kind: "needsVisa", reason: "ambiguous" };
  if (whv) return { kind: "resolved", visaKeys: ["australia_working_holiday_417"], from: "karteStated" };
  if (study) return { kind: "resolved", visaKeys: ["australia_student_500"], from: "karteStated" };

  return { kind: "needsVisa", reason: "unknown" };
}
