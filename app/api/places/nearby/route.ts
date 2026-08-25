import { NextRequest } from "next/server";
import { PLACES_API_BASE, getPlacesServerApiKey } from "@/lib/googlePlaces";

// 学校の周辺情報として出し分けるカテゴリ。Google の includedTypes 語彙にマッピングする。
const CATEGORY_TYPES = {
  shop: ["supermarket", "convenience_store", "shopping_mall"],
  transit: ["train_station", "subway_station", "bus_station", "transit_station"],
  activity: ["tourist_attraction", "park", "cafe", "gym"],
} as const;

type Category = keyof typeof CATEGORY_TYPES;

function isCategory(value: unknown): value is Category {
  return typeof value === "string" && value in CATEGORY_TYPES;
}

// reviews は含めない。一覧表示に必要な最小限のみ。
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  "places.location",
].join(",");

const DEFAULT_RADIUS_METERS = 1500;

export const dynamic = "force-dynamic";

/**
 * Nearby Search (New) のサーバー側プロキシ。
 * 学校の lat/lng を中心に、周辺の店舗/交通/アクティビティを検索する。
 * 提案フェーズでのみ呼ぶ想定（毎メッセージでは呼ばない）。結果は保存・キャッシュしない。
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "リクエストの形式が不正です" }, { status: 400 });
  }

  const { lat, lng, category, radiusMeters } = (body ?? {}) as {
    lat?: unknown;
    lng?: unknown;
    category?: unknown;
    radiusMeters?: unknown;
  };

  if (typeof lat !== "number" || typeof lng !== "number") {
    return Response.json({ error: "lat, lng（number）は必須です" }, { status: 400 });
  }

  const includedTypes = isCategory(category)
    ? CATEGORY_TYPES[category]
    : CATEGORY_TYPES.shop;

  const radius =
    typeof radiusMeters === "number" && radiusMeters > 0 && radiusMeters <= 5000
      ? radiusMeters
      : DEFAULT_RADIUS_METERS;

  let apiKey: string;
  try {
    apiKey = getPlacesServerApiKey();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    return Response.json({ error: "サーバー設定エラー" }, { status: 500 });
  }

  try {
    const upstream = await fetch(`${PLACES_API_BASE}/places:searchNearby`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        includedTypes,
        maxResultCount: 10,
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius,
          },
        },
      }),
    });

    if (!upstream.ok) {
      return Response.json(
        { error: "Nearby Search の取得に失敗しました" },
        { status: upstream.status },
      );
    }

    const data = await upstream.json();
    return Response.json(data);
  } catch (err) {
    console.error("places/nearby error:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Nearby Search の取得に失敗しました" }, { status: 502 });
  }
}
