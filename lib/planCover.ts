/**
 * Planカードのcover画像を、karte.schoolPrefs.preferredCity（stated限定）から
 * 決定的に選ぶための純粋関数群。AI・曖昧検索・外部画像APIは使わない。固定lookupのみ。
 *
 * 対象都市は lib/data/cities.ts（AUSTRALIA_CITIES）に実在する6都市に限定している
 * （このサービスが現時点で実際に扱っている都市のみを対象にし、架空の都市を追加しない）。
 *
 * 実画像は public/plan-covers/<key>.png として6都市分すべて配置済み（元ファイルは拡張子.jpgだったが
 * 中身は実際にはPNGだったため、配置時に.pngへ揃えている）。AVAILABLE_COVER_KEYSに無いkeyは
 * 今後同じ命名規則で画像を追加すれば、このSetへ1行足すだけで自動的に使われるようになる。
 * 対応するファイルが無いkeyは常にgradient fallbackへ倒れる（画像が無くてカードが壊れることはない）。
 */

export type PlanCoverKey = "sydney" | "melbourne" | "brisbane" | "goldcoast" | "cairns" | "perth";

/** lib/data/cities.ts の AUSTRALIA_CITIES と対応する英語表記・日本語表記のエイリアス */
const CITY_ALIASES: Record<PlanCoverKey, string[]> = {
  sydney: ["sydney", "シドニー"],
  melbourne: ["melbourne", "メルボルン"],
  brisbane: ["brisbane", "ブリスベン"],
  goldcoast: ["gold coast", "goldcoast", "ゴールドコースト"],
  cairns: ["cairns", "ケアンズ"],
  perth: ["perth", "パース"],
};

/** 空白の連続・前後空白・英字の大文字小文字だけを揃える。表記そのものの意味解釈はしない */
function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * preferredCityの文字列から対応するcover keyを決定的に返す。
 * 一致しない場合はnull（呼び出し側でfallback表示にする）。
 */
export function resolvePlanCoverKey(preferredCity: string | null | undefined): PlanCoverKey | null {
  if (!preferredCity) return null;
  const normalized = normalize(preferredCity);
  if (!normalized) return null;

  for (const [key, aliases] of Object.entries(CITY_ALIASES) as [PlanCoverKey, string[]][]) {
    for (const alias of aliases) {
      const normalizedAlias = normalize(alias);
      if (normalized === normalizedAlias || normalized.includes(normalizedAlias) || normalizedAlias.includes(normalized)) {
        return key;
      }
    }
  }
  return null;
}

const COVER_BASE_PATH = "/plan-covers";

/**
 * 実画像ファイルが public/plan-covers/ に用意されているcover keyの一覧。
 * 6都市すべての画像を配置済みのため全件有効化している。今後対応都市を増やす場合は、
 * 画像ファイルを追加した上で対応するkeyをここへ足すだけでよい。
 */
const AVAILABLE_COVER_KEYS = new Set<PlanCoverKey>([
  "sydney",
  "melbourne",
  "brisbane",
  "goldcoast",
  "cairns",
  "perth",
]);

export type PlanCoverImage = {
  key: PlanCoverKey | null;
  /** 実画像が用意されているときだけ非null。無ければ呼び出し側はgradient等のfallbackを使う */
  imageSrc: string | null;
};

/**
 * certainty==="stated"の都市文字列を渡すこと（呼び出し側で判定済みの値を想定）。
 * inferred/unknownの都市はこの関数に渡さないこと。
 */
export function getPlanCoverImage(preferredCity: string | null | undefined): PlanCoverImage {
  const key = resolvePlanCoverKey(preferredCity);
  if (!key || !AVAILABLE_COVER_KEYS.has(key)) {
    return { key, imageSrc: null };
  }
  return { key, imageSrc: `${COVER_BASE_PATH}/${key}.png` };
}
