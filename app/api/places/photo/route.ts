import { NextRequest } from "next/server";
import { PLACES_API_BASE, getPlacesServerApiKey } from "@/lib/googlePlaces";

// "places/PLACE_ID/photos/PHOTO_RESOURCE" 形式のみ許可（他ホストへのSSRFを防ぐ）
const PHOTO_NAME_RE = /^places\/[^/]+\/photos\/[^/]+$/;

const MIN_WIDTH = 100;
const MAX_WIDTH = 1600;
const DEFAULT_WIDTH = 800;

function clampWidth(raw: string | null): number {
  const n = raw ? Number.parseInt(raw, 10) : DEFAULT_WIDTH;
  if (!Number.isFinite(n)) return DEFAULT_WIDTH;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, n));
}

export const dynamic = "force-dynamic";

/**
 * Place Photo (New) のサーバー側プロキシ。
 * 画像は保存せず、都度 Google から取得する。skipHttpRedirect=true で一時URL(photoUri)を
 * 取得し、そのURLへクライアントをリダイレクトする（サーバー用APIキーはクライアントに渡らない）。
 * 提案フェーズでのみ呼ぶ想定。
 */
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  if (!name || !PHOTO_NAME_RE.test(name)) {
    return Response.json({ error: "name が不正です" }, { status: 400 });
  }

  const maxWidthPx = clampWidth(req.nextUrl.searchParams.get("maxWidthPx"));

  let apiKey: string;
  try {
    apiKey = getPlacesServerApiKey();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    return Response.json({ error: "サーバー設定エラー" }, { status: 500 });
  }

  try {
    const upstream = await fetch(
      `${PLACES_API_BASE}/${name}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true&key=${apiKey}`,
      { cache: "no-store" },
    );

    if (!upstream.ok) {
      return Response.json({ error: "写真の取得に失敗しました" }, { status: upstream.status });
    }

    const data = (await upstream.json()) as { photoUri?: string };
    if (!data.photoUri) {
      return Response.json({ error: "写真が見つかりません" }, { status: 404 });
    }

    return Response.redirect(data.photoUri, 302);
  } catch (err) {
    console.error("places/photo error:", err instanceof Error ? err.message : err);
    return Response.json({ error: "写真の取得に失敗しました" }, { status: 502 });
  }
}
