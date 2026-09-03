import type { createClient } from "@/lib/supabase/server";

/**
 * プロフィール画像（Account）の Storage 設定と、署名付き URL 生成の共有ヘルパー。
 * Account ページと AppNav の両方から使い、同じ createSignedUrl 処理を重複させない。
 *
 * bucket は private のため getPublicUrl は使わない。avatar_path が無い / 署名 URL の
 * 取得に失敗した場合は null を返し、呼び出し側は generic な user icon へ fallback する。
 */

export const AVATAR_BUCKET = "avatars";

/** 署名付き URL の有効期限（秒）。ページレンダリング時に毎回取り直す前提の短めの値。 */
export const AVATAR_SIGNED_URL_TTL_SECONDS = 60 * 60;

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

export async function createAvatarSignedUrl(
  supabase: ServerSupabase,
  avatarPath: string | null | undefined,
): Promise<string | null> {
  if (!avatarPath) return null;
  try {
    const { data, error } = await supabase.storage
      .from(AVATAR_BUCKET)
      .createSignedUrl(avatarPath, AVATAR_SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}
