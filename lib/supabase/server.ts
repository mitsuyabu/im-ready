import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * サーバー側（Server Component / Route Handler）で使うSupabaseクライアント。
 * anon keyのみ使用し、RLSに則ってログインユーザー自身のデータだけを読み書きする。
 * service role keyはこのプロジェクトでは使わない（.env.localにも設定していない）。
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Componentから呼ばれた場合はcookieの書き込みができないため無視する。
            // セッションのリフレッシュはmiddleware側で行うため実害は無い。
          }
        },
      },
    },
  );
}
