/**
 * AppNav（PC Sidebar / Mobile bottom nav）が表示に使う、ログインユーザー本人の最小情報。
 *
 * PlanNavData（Plan navigation 専用）とは責務を分ける小さな別データ。今回必要なのは
 * プロフィール画像だけなので avatarUrl のみを持つ。birth_date / gender / residence /
 * occupation / english_level / study_abroad_experience などは AppNav へ渡さない（privacy）。
 *
 * React cache() でリクエスト単位に1回。引数は userId のみ（loadPlanNavData と同じ方針で、
 * supabase client を引数に取らない）。profiles 行が無い / 取得失敗でも avatarUrl: null を
 * 返すだけで AppNav 全体は落とさない。
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAvatarSignedUrl } from "@/lib/avatarUrl";

export type AppNavViewer = {
  avatarUrl: string | null;
};

export const loadAppNavViewer = cache(async (userId: string): Promise<AppNavViewer> => {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("avatar_path")
      .eq("user_id", userId)
      .maybeSingle();
    const avatarPath = (data as { avatar_path?: string | null } | null)?.avatar_path ?? null;
    const avatarUrl = await createAvatarSignedUrl(supabase, avatarPath);
    return { avatarUrl };
  } catch {
    return { avatarUrl: null };
  }
});
