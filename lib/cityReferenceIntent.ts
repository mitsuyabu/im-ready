/**
 * 「今のユーザー発言は都市の治安・生活費の話か？」「どの都市・どの category か？」を
 * **LLM を使わずに**判定する層。Chat の毎ターンに都市情報を入れないための入口。
 *
 * 判定ロジック（都市の抽出・優先順位の考え方）は以前の実装から変更していない。
 * 変わったのは、取得対象が「外部の指数」から「確認済みの category ごとの要約」になった点だけ。
 * 判定は最新のユーザー発言だけを見る（一度都市の話をしたあと、ずっと都市情報が入り続けるのを避ける）。
 */

import {
  CITY_KEYS,
  CITY_LABELS,
  toCityKey,
  type CityKey,
  type CityReferenceCategory,
} from "@/lib/cityReference";

const SAFETY_KEYWORDS = [
  "治安",
  "安全",
  "危険",
  "犯罪",
  "夜道",
  "夜間",
  "一人歩き",
  "ひとり歩き",
  // 「夜一人で歩いても大丈夫？」のような聞き方（「一人歩き」という語にならない）も治安の質問として扱う。
  "夜一人",
  "夜ひとり",
  "一人で歩",
  "ひとりで歩",
  "強盗",
  "ひったくり",
  "スリ",
  "盗難",
  "空き巣",
  "巻き込まれ",
];

/** category を特定できるキーワード。生活費全般の語は下の GENERAL_COST_KEYWORDS で扱う。 */
const CATEGORY_KEYWORDS: { category: CityReferenceCategory; keywords: string[] }[] = [
  { category: "housing", keywords: ["家賃", "住居", "住居費", "シェアハウス", "ホームステイ", "滞在費", "部屋代", "寮"] },
  { category: "food", keywords: ["食費", "外食", "食料品", "スーパー", "自炊"] },
  { category: "transport", keywords: ["交通費", "交通", "電車", "バス", "定期", "運賃", "通学"] },
  { category: "utilities", keywords: ["光熱費", "電気代", "ガス代", "水道", "通信費", "インターネット", "携帯"] },
];

/**
 * 交通を示す語のうち、上の日本語キーワードでは拾えないもの。
 *   - 「Opal」は NSW の交通カードの固有名（大文字小文字が混在する）
 *   - 英単語は**語境界**で見る（"business" の中の "bus"、"welfare" の中の "fare" を
 *     交通の質問と誤判定しないため）
 * 「cap」は交通以外の上限でも使うため、ここではなく下の CAP_KEYWORDS 側（gated）で扱う。
 */
const TRANSPORT_HINT_WORDS = ["オパール"];
const TRANSPORT_HINT_PATTERN = /\b(opal|fares?|train|bus)\b/i;

function hasTransportHint(text: string): boolean {
  return TRANSPORT_HINT_WORDS.some((k) => text.includes(k)) || TRANSPORT_HINT_PATTERN.test(text);
}

/**
 * 「生活費」「物価」のように、**生活費の話だと明示されている**聞き方。
 * これがあれば、学費・ビザ代などの語が混ざっていても都市の生活費として扱う
 * （例: 「語学学校に通うとして、シドニーの生活費はいくら？」）。
 */
const EXPLICIT_LIVING_COST_KEYWORDS = [
  "生活費",
  "物価",
  "生活しやすい",
  "暮らしやすい",
  "生活するのに",
  "暮らすのに",
  "住むのに",
  "生活する費用",
];

/**
 * 「高い」「費用」のように、**生活費以外でも日常的に出る**聞き方。
 * これだけで都市の生活費データを入れると、学費・ビザ代・航空券・保険の質問に対して
 * 家賃や食費の相場を持ち出してしまう（Phase 6 の実機確認で「語学学校の費用はいくらですか？」が
 * housing / food / transport を起動していた）。下の除外ドメインが無い場合にだけ使う。
 */
const GENERIC_COST_KEYWORDS = ["高い", "安い", "いくらかかる", "予算", "費用"];

/**
 * 生活費ではない「お金の話」のドメイン。
 * 上の GENERIC_COST_KEYWORDS だけで判定しようとしている場合は、都市の生活費として扱わない。
 * **明示的な生活費の語があるときは除外しない**（優先順位: 明示 > 除外）。
 */
const NON_LIVING_COST_DOMAIN_WORDS = [
  // 学校の費用
  "学校",
  "学費",
  "授業料",
  "入学金",
  "教材費",
  "コース料金",
  // ビザ・手続き
  "ビザ",
  "visa",
  // 渡航
  "航空券",
  "飛行機",
  "渡航費",
  "チケット",
  // その他
  "保険",
  "奨学金",
  "エージェント",
];

/**
 * 「上限」「キャップ」「cap」。交通の運賃上限（Opal の1日・1週間キャップ）でも、
 * ビザの就労時間・滞在期間、年齢、予算の上限でも同じ語が使われる。
 * **単独では transport キーワードにしない**（gated。下の detectCityReferenceIntent で条件を付ける）。
 */
const CAP_KEYWORDS = ["上限", "キャップ"];
const CAP_PATTERN = /\bcaps?\b/i;

/**
 * 「上限」を交通の運賃上限として扱わないドメイン。
 * 「ワーホリの働ける時間の上限」「学生ビザの就労時間の上限」「ビザの滞在期間の上限」
 * 「年齢の上限」「予算の上限」を、Opal の daily / weekly cap と取り違えないため。
 * NON_LIVING_COST_DOMAIN_WORDS（学費・ビザ・航空券・保険など）に、
 * 「上限」と結びつきやすい就労・滞在・年齢・予算の語を足す。
 */
const CAP_NON_TRANSPORT_DOMAIN_WORDS = [
  ...NON_LIVING_COST_DOMAIN_WORDS,
  // 就労条件の上限
  "ワーホリ",
  "ワーキングホリデー",
  "働け",
  "働く",
  "就労",
  "労働",
  "勤務",
  "バイト",
  "アルバイト",
  "時給",
  "給料",
  // 滞在・年齢の上限
  "滞在期間",
  "滞在可能",
  "在留",
  "延長",
  "年齢",
  "何歳",
  "歳まで",
  // 本人のお金の上限（都市の運賃の話ではない）
  "予算",
  "貯金",
  "資金",
  "所持金",
];

const GENERAL_COST_CATEGORIES: CityReferenceCategory[] = ["housing", "food", "transport"];

/** 「AとBどっち」型の比較質問。都市が2つ以上取れたときだけ意味を持つ。 */
const COMPARISON_KEYWORDS = ["どっち", "どちら", "比べ", "比較", "より", "vs", "ＶＳ"];

export type CityReferenceIntent = {
  /** 取得する category（必要な分だけ。最大4件程度に収める）。 */
  categories: CityReferenceCategory[];
  /** 発言そのものに現れた都市（発言内の出現順）。 */
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

/** 都市情報の質問かどうかを判定する。該当しなければ null（DB へも触らない）。 */
export function detectCityReferenceIntent(latestUserMessage: string): CityReferenceIntent | null {
  const text = latestUserMessage.trim();
  if (!text) return null;

  // 都市の抽出を先に行う。「上限」のような曖昧語は、**都市が発言に出ているときだけ**
  // 都市の質問として扱うため、category の判定より前に必要になる。
  const citiesInMessage = extractCitiesFromText(text);

  const categories: CityReferenceCategory[] = [];
  if (SAFETY_KEYWORDS.some((k) => text.includes(k))) categories.push("safety");

  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => text.includes(k))) categories.push(category);
  }
  // 日本語キーワードでは拾えない交通の語（Opal / fare / train / bus）。
  if (!categories.includes("transport") && hasTransportHint(text)) categories.push("transport");

  // 「生活費は高い？」のように category が絞れない聞き方は、住居・食費・交通で概観を答える。
  // ただし「費用」「高い」だけの場合は、学費・ビザ代・航空券などの話でないことを確認する。
  const hasSpecificCost = categories.some((c) => c !== "safety");
  if (!hasSpecificCost) {
    const lower = text.toLowerCase();
    const hasExplicitLivingCost = EXPLICIT_LIVING_COST_KEYWORDS.some((k) => text.includes(k));
    const hasGenericCost = GENERIC_COST_KEYWORDS.some((k) => text.includes(k));
    const inOtherCostDomain = NON_LIVING_COST_DOMAIN_WORDS.some((k) => lower.includes(k.toLowerCase()));

    // 「シドニーの1日の上限はいくら？」のように、交通の語が省略された運賃上限の質問。
    // 「上限」は曖昧語なので、次の3条件がそろったときだけ交通として扱う（gated）:
    //   1. 発言の中に都市名がある（My Plan / Karte からの補完では起動しない。
    //      都市が無い「ワーホリの働ける時間の上限は？」が都市層へ流れないようにするため）
    //   2. ビザ・就労・滞在・年齢・予算など、別ドメインの上限を示す語が無い
    //   3. より具体的な費目（家賃・食費など）が判定されていない
    //      （この if ブロックの中なので満たされている。「家賃の上限」は住居費のまま）
    const asksCap = CAP_KEYWORDS.some((k) => text.includes(k)) || CAP_PATTERN.test(text);
    const capInOtherDomain = CAP_NON_TRANSPORT_DOMAIN_WORDS.some((k) => lower.includes(k.toLowerCase()));
    const capIsCityTransport = asksCap && citiesInMessage.length > 0 && !capInOtherDomain;

    // 優先順位: 明示的な生活費 > 交通の運賃上限 > 一般的な「費用」の語。
    if (hasExplicitLivingCost) {
      // 明示的な生活費の語がある場合は、他ドメインの語が混ざっていても生活費として扱う。
      categories.push(...GENERAL_COST_CATEGORIES);
    } else if (capIsCityTransport) {
      categories.push("transport");
    } else if (hasGenericCost && !inOtherCostDomain && !asksCap) {
      // 「予算の上限は？」のように、上限の質問でありながら上の gate を通らなかった場合は、
      // 「予算」だけを根拠に都市の生活費データを入れない（本人の予算の話であって都市の相場ではない）。
      categories.push(...GENERAL_COST_CATEGORIES);
    }
  }

  const unique = Array.from(new Set(categories));
  if (unique.length === 0) return null;

  const comparison = citiesInMessage.length >= 2 && COMPARISON_KEYWORDS.some((k) => text.includes(k));

  return { categories: unique, citiesInMessage, comparison };
}

/* ------------------------------------------------------------------ */
/* どの都市の情報を使うか（従来と同じ優先順位を維持）                   */
/* ------------------------------------------------------------------ */

export type CityResolutionSource = "message" | "myPlan" | "karteStated";

export type CityResolution =
  | { kind: "resolved"; cityKeys: CityKey[]; from: CityResolutionSource }
  /** 都市が特定できない。Chat は勝手に都市を決めず、本人に確認する。 */
  | { kind: "needsCity"; reason: "unknown" | "conflict" };

/**
 * 優先順位:
 *   1. 今の発言で明示された都市（複数なら比較としてそのまま全部使う）
 *   2. My Plan に保存されている確定都市
 *   3. Karte の preferredCity（**stated かつ conflict でないときだけ**）
 *   4. どれも無ければ確認質問
 *
 * inferred（AI の推測）は使わない。conflict 中はどちらかを勝手に選ばない
 * （既存 /api/chat の extractStatedPreferredCity と同じ判断基準）。
 */
export function resolveCityKeysForChat(input: {
  citiesInMessage: CityKey[];
  myPlanCity?: string | null;
  karteStatedCity?: string | null;
  karteCityInConflict?: boolean;
}): CityResolution {
  if (input.citiesInMessage.length > 0) {
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
