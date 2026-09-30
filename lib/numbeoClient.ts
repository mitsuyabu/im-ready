/**
 * Numbeo 公式 API のクライアント（**サーバー / スクリプト専用**）。
 *
 * 重要な前提:
 *   - Web ページのスクレイピングは一切しない。公式 API（api_key 必須）だけを使う。
 *   - Numbeo のデータは商用利用が Data License 契約者に限定されるため、**契約して得た
 *     API key が環境変数にある場合だけ**動く。key が無ければ何も取得しない（README の
 *     「データソースに関する制約」に従う。契約前に numbeo 由来の値を保存してはいけない）。
 *   - API key はコードに書かず、`NUMBEO_API_KEY` からのみ読む。クライアントへは絶対に出さない
 *     （このファイルは Client Component から import しない。呼び出し元は同期スクリプトのみ）。
 *
 * 使うエンドポイント（API ドキュメントで確認したもの。key は X-Api-Key ヘッダで渡す）:
 *   GET /api/city_crime  … index_safety, index_crime, safe_alone_daylight, safe_alone_night,
 *                          worried_mugged_robbed, worried_home_broken, contributors, …
 *   GET /api/indices     … cpi_index, cpi_and_rent_index, rent_index, groceries_index,
 *                          restaurant_price_index, contributors_cost_of_living, …
 *   GET /api/city_prices … prices[{ item_id, item_name, average_price, lowest_price,
 *                          highest_price, data_points }], currency, …
 * いずれも yearLastUpdate / monthLastUpdate を返す。レスポンスの解釈は lib/cityLiving.ts の
 * normalizeNumbeoCity() が行う（このファイルは取得だけに責務を限定する）。
 */

const BASE_URL = "https://www.numbeo.com/api";

export type NumbeoFetchResult = {
  crime: unknown;
  indices: unknown;
  prices: unknown;
};

export class NumbeoNotConfiguredError extends Error {
  constructor() {
    super("NUMBEO_API_KEY が設定されていません（Data License 契約後に設定してください）");
    this.name = "NumbeoNotConfiguredError";
  }
}

export function isNumbeoConfigured(): boolean {
  return typeof process.env.NUMBEO_API_KEY === "string" && process.env.NUMBEO_API_KEY.length > 0;
}

async function get(path: string, query: string, apiKey: string): Promise<unknown> {
  const url = `${BASE_URL}/${path}?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { "X-Api-Key": apiKey, Accept: "application/json" },
    // 同期スクリプトから呼ぶ想定。キャッシュはしない（取得日時を正確に記録するため）。
    cache: "no-store",
  });
  if (!res.ok) {
    // レスポンス本文はそのままログへ出さない（API key がエコーされる可能性を避ける）。
    throw new Error(`Numbeo API ${path} が失敗しました (status ${res.status})`);
  }
  return (await res.json()) as unknown;
}

/**
 * 1都市ぶんの3エンドポイントを取得する。1つでも失敗したら例外を投げ、呼び出し側が
 * その都市をスキップする（部分的な値で既存データを上書きしないため）。
 */
export async function fetchNumbeoCity(query: string): Promise<NumbeoFetchResult> {
  const apiKey = process.env.NUMBEO_API_KEY;
  if (!apiKey) throw new NumbeoNotConfiguredError();

  const [crime, indices, prices] = await Promise.all([
    get("city_crime", query, apiKey),
    get("indices", query, apiKey),
    get("city_prices", query, apiKey),
  ]);
  return { crime, indices, prices };
}
