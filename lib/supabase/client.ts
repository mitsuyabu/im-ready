"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * ブラウザ側で使うSupabaseクライアント。anon keyのみ使用（service role keyはここでは絶対に使わない）。
 * マイページ機能専用。既存のチャット・ワークシート・提案パイプラインは参照しない。
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
