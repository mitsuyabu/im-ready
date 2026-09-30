/**
 * 「今のユーザー発言は都市の治安・生活費の話か？」「どの都市の話か？」を **LLM を使わずに**
 * 判定する層。Chat の毎ターンすべてに都市データを入れないための入口。
 *
 * ここで false になれば外部データは一切読まない（DB アクセスも発生しない）。
 * 判定は最新のユーザー発言だけを見る（会話全体を対象にすると、一度治安の話をしたあと
 * ずっと都市データが入り続けてしまう）。
 */

import { CITY_KEYS, CITY_LABELS, toCityKey, type CityKey } from "@/lib/cityLiving";

/** 何について聞かれているか。両方該当することもある（「治安も物価もどう？」）。 */
export type CityLivingTopic = "safety" | "cost";

const SAFETY_KEYWORDS = [
  "治安",
  "安全",
  "危険",
  "犯罪",
  "夜道",
  "夜間",
  "一人歩き",
  "ひとり歩き",
  "強盗",
  "ひったくり",
  "スリ",
  "空き巣",
  "巻き込まれ",
];

const COST_KEYWORDS = [
  "生活費",
  "物価",
  "家賃",
  "食費",
  "外食",
  "交通費",
  "光熱費",
  "滞在費",
  "高い",
  "安い",
  "いくらかかる",
  "予算",
  "費用",
];

/** 「AとBどっち」型の比較質問。都市が2つ以上取れたときだけ意味を持つ。 */
const COMPARISON_KEYWORDS = ["どっち", "どちら", "比べ", "比較", "より", "vs", "ＶＳ"];

export type CityLivingIntent = {
  topics: CityLivingTopic[];
  /** 発言そのものに現れた都市（順番は発言内の出現順）。 */
  citiesInMessage: CityKey[];
  comparison: boolean;
};

/**
 * 発言中の都市名を出現順に拾う。判定は既存の都市キー解決（resolvePlanCoverKey）を
 * 1都市ずつ試すだけで、新しい辞書は作らない。
 */
export function extractCitiesFromText(text: string): CityKey[] {
  const found: { key: CityKey; at: number }[] = [];
  for (const key of CITY_KEYS) {
    // 日本語表記・英語表記の両方を既存 resolver に確認させるため、候補語を作って試す。
    const candidates = [CITY_LABELS[key], key, key === "goldcoast" ? "gold coast" : key];
    let at = -1;
    for (const candidate of candidates) {
      const index = text.toLowerCase().indexOf(candidate.toLowerCase());
      if (index >= 0 && (at < 0 || index < at)) {
        // resolvePlanCoverKey を通して、その語が本当にこの都市キーになることを確認する。
        if (toCityKey(candidate) === key) at = index;
      }
    }
    if (at >= 0) found.push({ key, at });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.key);
}

/** 都市の治安・生活費の質問かどうかを判定する。該当しなければ null。 */
export function detectCityLivingIntent(latestUserMessage: string): CityLivingIntent | null {
  const text = latestUserMessage.trim();
  if (!text) return null;

  const topics: CityLivingTopic[] = [];
  if (SAFETY_KEYWORDS.some((k) => text.includes(k))) topics.push("safety");
  if (COST_KEYWORDS.some((k) => text.includes(k))) topics.push("cost");
  if (topics.length === 0) return null;

  const citiesInMessage = extractCitiesFromText(text);
  const comparison = citiesInMessage.length >= 2 && COMPARISON_KEYWORDS.some((k) => text.includes(k));

  return { topics, citiesInMessage, comparison };
}

/* ------------------------------------------------------------------ */
/* どの都市のデータを使うか                                             */
/* ------------------------------------------------------------------ */

export type CityResolutionSource = "message" | "myPlan" | "karteStated";

export type CityResolution =
  | { kind: "resolved"; cityKeys: CityKey[]; from: CityResolutionSource }
  /** 都市が特定できない。Chat は勝手に都市を決めず、本人に確認する。 */
  | { kind: "needsCity"; reason: "unknown" | "conflict" };

/**
 * 優先順位（仕様どおり）:
 *   1. 今の発言で明示された都市（複数なら比較としてそのまま全部使う）
 *   2. My Plan に保存されている確定都市
 *   3. Karte の preferredCity（**stated かつ conflict でないときだけ**）
 *   4. どれも無ければ確認質問
 *
 * inferred（AI の推測）は使わない。conflict 中はどちらかを勝手に選ばない
 * （既存 /api/chat の extractStatedPreferredCity と同じ判断基準を、ここでも守る）。
 */
export function resolveCityKeysForChat(input: {
  citiesInMessage: CityKey[];
  myPlanCity?: string | null;
  karteStatedCity?: string | null;
  /** Karte の preferredCity が conflict 中か（stated でも採用しない）。 */
  karteCityInConflict?: boolean;
}): CityResolution {
  if (input.citiesInMessage.length > 0) {
    // 同じ都市を2回言っても1件にまとめる。上限3都市（それ以上は比較として成立しない）。
    const unique = Array.from(new Set(input.citiesInMessage)).slice(0, 3);
    return { kind: "resolved", cityKeys: unique, from: "message" };
  }

  const planKey = toCityKey(input.myPlanCity);
  if (planKey) return { kind: "resolved", cityKeys: [planKey], from: "myPlan" };

  if (input.karteCityInConflict) return { kind: "needsCity", reason: "conflict" };

  const karteKey = toCityKey(input.karteStatedCity);
  if (karteKey) return { kind: "resolved", cityKeys: [karteKey], from: "karteStated" };

  return { kind: "needsCity", reason: "unknown" };
}
