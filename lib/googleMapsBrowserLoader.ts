"use client";

import { setOptions, importLibrary, type LibraryMap } from "@googlemaps/js-api-loader";

/**
 * ブラウザ側でGoogle Maps JavaScript APIを読み込む共有ローダー。
 * ここで使うのは NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY（リファラ制限つき）のみ。
 * サーバー専用キー（GOOGLE_MAPS_SERVER_KEY）はここでは絶対に使わない。
 */

let configured = false;

function ensureConfigured() {
  if (configured) return;

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
  if (!apiKey) {
    throw new Error(
      "NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY が設定されていません（.env.local を確認してください）",
    );
  }

  setOptions({ key: apiKey, v: "weekly" });
  configured = true;
}

export function loadGoogleMapsLibrary<T extends keyof LibraryMap>(
  name: T,
): Promise<LibraryMap[T]> {
  ensureConfigured();
  return importLibrary(name);
}
