/**
 * Plan トップ（/plans/[planId]）の「行き先／時期／テーマ」の表示文言と、ヒーロー背景に使う
 * 「都市画像」の小さな固定 registry（すべて pure・Anthropic 不使用）。
 * Hero chip と「このPlanについて」カードの両方から同じ helper を使い、都市抽出・月数抽出を重複実装しない。
 *
 * Hero 画像の判定キーは表示用の自由記述 city ではなく、Karte の正式な行き先 field
 * （schoolPrefs.preferredCity、certainty="stated" かつ conflict 中でない値）から page.tsx が渡す
 * `destinationCity`。free text なので `ゴールドコースト。都会すぎず海が近く…` のように理由が続く
 * ことがあるため、説明文が始まる区切りで切った **先頭の都市名トークン** だけを見て、
 * trim + lowercase の完全一致で画像を決める（説明文への部分一致はしない）。
 *
 * DB 化しない。今回対応するのは以下 6 都市のみ（それ以外は null → 呼び出し側は既存 CollageHero）:
 *   Gold Coast / Sydney / Melbourne / Brisbane / Cairns / Perth
 */

/** 説明文が始まる区切り（強）。半角スペースは含めない（"Gold Coast" の語内スペースを割らないため）。 */
const DESCRIPTION_DELIMITERS = /[。、，,.．（(／/・\n]/;
/** 文末の区切り（弱）。中黒・読点は残す（例:「学校情報収集・決定段階。…」→「学校情報収集・決定段階」）。 */
const SENTENCE_DELIMITERS = /[。！？\n]/;

/** free text の先頭トークンだけ（都市名・時期など、1 語相当を取り出す用）。取れなければ trim 全体。 */
export function firstPhrase(text: string): string {
  const head = text.trim().split(DESCRIPTION_DELIMITERS)[0].trim();
  return head.length > 0 ? head : text.trim();
}

/** free text の先頭 1 文だけ（テーマなど、意味を変えずに短くする用）。取れなければ trim 全体。 */
export function firstSentence(text: string): string {
  const head = text.trim().split(SENTENCE_DELIMITERS)[0].trim();
  return head.length > 0 ? head : text.trim();
}

/** 行き先 chip / Plan info の「行き先」表示文言：都市名だけ。 */
export function toCityChipText(city: string): string {
  return firstPhrase(city);
}

/** 時期 free text から月数を機械的に抽出。取れなければ null（具体値は捏造しない）。 */
export function departureMonths(departureTiming: string): number | null {
  const t = departureTiming.trim();
  const m = t.match(/(\d+)\s*(?:ヶ|ケ|か|カ|箇)?月/);
  if (m) return Number(m[1]);
  if (/半年/.test(t) && !/\d/.test(t)) return 6;
  return null;
}

/** Hero chip の出発表示：`出発まであと◯ヶ月`。月数不明なら先頭フレーズをそのまま。 */
export function toDepartureHeroText(departureTiming: string): string {
  const n = departureMonths(departureTiming);
  return n !== null ? `出発まであと${n}ヶ月` : firstPhrase(departureTiming);
}

/** 「このPlanについて」の出発表示：`◯ヶ月後`。月数不明なら先頭フレーズをそのまま。 */
export function toDeparturePlanInfoText(departureTiming: string): string {
  const n = departureMonths(departureTiming);
  return n !== null ? `${n}ヶ月後` : firstPhrase(departureTiming);
}

/** 「いまのテーマ」表示：decision.stage の先頭 1 文だけ（AI 要約しない）。 */
export function toThemeText(stage: string): string {
  return firstSentence(stage);
}

/** 行き先 free text から先頭の都市名トークンだけを取り出し、比較用に正規化する。 */
export function normalizeDestinationCity(destinationCity: string | null | undefined): string | null {
  if (!destinationCity) return null;
  const head = destinationCity.trim().split(DESCRIPTION_DELIMITERS)[0].trim().toLowerCase();
  return head.length > 0 ? head : null;
}

/** 正規化済みの都市名 → 画像パス（/public 相対の URL）。 */
const PLAN_HERO_CITY_IMAGES: Record<string, string> = {
  "gold coast": "/plan-hero/gold-coast.webp",
  ゴールドコースト: "/plan-hero/gold-coast.webp",
  sydney: "/plan-hero/sydney.webp",
  シドニー: "/plan-hero/sydney.webp",
  melbourne: "/plan-hero/melbourne.webp",
  メルボルン: "/plan-hero/melbourne.webp",
  brisbane: "/plan-hero/brisbane.webp",
  ブリスベン: "/plan-hero/brisbane.webp",
  cairns: "/plan-hero/cairns.webp",
  ケアンズ: "/plan-hero/cairns.webp",
  perth: "/plan-hero/perth.webp",
  パース: "/plan-hero/perth.webp",
};

/**
 * 行き先として選択されている都市に対応する Hero 画像パス。対応が無ければ null。
 * fake data は返さない（画像はあくまで visual で、国・ビザ・期間等は一切推測しない）。
 */
export function getPlanHeroImage(destinationCity: string | null | undefined): string | null {
  const key = normalizeDestinationCity(destinationCity);
  if (key === null) return null;
  return PLAN_HERO_CITY_IMAGES[key] ?? null;
}
