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
          } catch (err) {
            // Server Componentから呼ばれた場合はcookieの書き込みができないため無視する。
            // セッションのリフレッシュはmiddleware側で行うため実害は無い。
            // ただし Route Handler（/auth/callback 等）では書き込めるはずなので、
            // development のときだけ原因切り分け用に警告を出す（cookie の値は出さない）。
            if (process.env.NODE_ENV !== "production") {
              console.warn(
                "[supabase/server] cookie の書き込みに失敗しました（Server Component からの呼び出しなら想定どおり）:",
                err instanceof Error ? err.message : err,
                "書き込もうとした cookie 名:",
                cookiesToSet.map((c) => c.name),
              );
            }
          }
        },
      },
    },
  );
}
