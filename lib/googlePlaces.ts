/**
 * Places API (New) 用の最小限の共有ヘルパー。
 *
 * 【大原則】ここを経由して取得した内容（名前・評価・写真等）はサーバー側でも
 * 保存・キャッシュしない。呼び出し元の route handler がそのままクライアントへ
 * 中継するだけにすること。保存してよいのは lib/data/schools.ts が持つ placeId
 * （と lat/lng）のみ。
 *
 * サーバー専用キー（GOOGLE_MAPS_SERVER_KEY）はこのファイル経由でのみ使う。
 * ブラウザ側には絶対に渡さない（ブラウザ用は NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY を別途使用）。
 */

export const PLACES_API_BASE = "https://places.googleapis.com/v1";

export function getPlacesServerApiKey(): string {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) {
    throw new Error(
      "GOOGLE_MAPS_SERVER_KEY が設定されていません（.env.local を確認してください）",
    );
  }
  return key;
}
