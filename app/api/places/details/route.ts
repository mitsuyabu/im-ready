import { NextRequest } from "next/server";
import { PLACES_API_BASE, getPlacesServerApiKey } from "@/lib/googlePlaces";

// 提案フェーズで学校を提示する瞬間にだけ呼ぶ想定（毎メッセージでは呼ばない）。
// reviews は意図的に含めない。口コミ本文は扱わず、rating・userRatingCount・googleMapsUri のみで表現する。
const FIELD_MASK = [
  "id",
  "displayName",
  "rating",
  "userRatingCount",
  "googleMapsUri",
  "location",
  "regularOpeningHours",
  "photos",
].join(",");

export const dynamic = "force-dynamic";

/**
 * Place Details (New) のサーバー側プロキシ。
 * 取得結果はここでも呼び出し元でも保存・キャッシュしない（都度取得して表示するだけ）。
 */
export async function GET(req: NextRequest) {
  const placeId = req.nextUrl.searchParams.get("placeId");
  if (!placeId) {
    return Response.json({ error: "placeId は必須です" }, { status: 400 });
  }

  let apiKey: string;
  try {
    apiKey = getPlacesServerApiKey();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    return Response.json({ error: "サーバー設定エラー" }, { status: 500 });
  }

  try {
    const upstream = await fetch(
      `${PLACES_API_BASE}/places/${encodeURIComponent(placeId)}`,
      {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": FIELD_MASK,
        },
        cache: "no-store",
      },
    );

    if (!upstream.ok) {
      return Response.json(
        { error: "Place Details の取得に失敗しました" },
        { status: upstream.status },
      );
    }

    const data = await upstream.json();
    return Response.json(data);
  } catch (err) {
    console.error("places/details error:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Place Details の取得に失敗しました" }, { status: 502 });
  }
}
