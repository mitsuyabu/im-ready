/**
 * Plan トップ（/plans/[planId]）のヒーロー背景に使う「都市画像」の小さな固定 registry（pure）。
 *
 * 判定キーは表示用の自由記述 city ではなく、Karte の正式な行き先 field
 * （schoolPrefs.preferredCity、certainty="stated" かつ conflict 中でない値）から page.tsx が渡す
 * `destinationCity`。free text なので `ゴールドコースト。都会すぎず海が近く…` のように理由が続く
 * ことがあるため、説明文が始まる区切りで切った **先頭の都市名トークン** だけを見て、
 * trim + lowercase の完全一致で画像を決める（説明文への部分一致はしない）。
 *
 * DB 化しない。今回対応するのは以下 6 都市のみ（それ以外は null → 呼び出し側は既存 CollageHero）:
 *   Gold Coast / Sydney / Melbourne / Brisbane / Cairns / Perth
 */

/** 説明文が始まる区切り。半角スペースは含めない（"Gold Coast" の語内スペースを割らないため）。 */
const DESCRIPTION_DELIMITERS = /[。、，,.．（(／/・\n]/;

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
