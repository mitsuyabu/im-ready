import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/SignOutButton";

export const metadata: Metadata = {
  title: "アカウント",
};

/**
 * Account ページ。当面は「ログイン中のアカウント情報 ＋ ログアウト」だけ。
 *
 * 表示するのは Supabase Auth に実在する値のみ（§14）:
 *   - user.email
 *   - user.app_metadata.provider（Google 等。安全に取れるときだけ）
 * 名前・年齢・留学先・avatar 等は生成しない。アカウント削除機能は未実装のため置かない（§30）。
 *
 * auth は既存パターン（getUser → 無ければ /login）。新しい auth 実装・新テーブル・migration は無し。
 * 独自 logout は作らず、既存の SignOutButton（signOut ロジック共通）を button variant で再利用。
 */
export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const email = user.email ?? null;

  const providerRaw =
    typeof user.app_metadata?.provider === "string" ? user.app_metadata.provider : null;
  const providerLabel =
    providerRaw === "google"
      ? "Google"
      : providerRaw === "email"
        ? "メールアドレス"
        : providerRaw
          ? providerRaw
          : null;

  return (
    <div className="min-h-dvh bg-[#fcfbf8]">
      <div className="mx-auto max-w-2xl px-4 pt-10 pb-20 sm:px-6 sm:py-14">
        <p className="text-xs font-medium tracking-wide text-[#5f7050]">Account</p>
        <h1 className="mt-1 text-[27px] font-bold tracking-tight text-[#172033] sm:text-[34px]">
          アカウント
        </h1>
        <p className="mt-2 text-sm text-[#625f59]">登録情報とアカウント設定</p>

        <div className="mt-8 rounded-2xl border border-[#e5dfd6] bg-white p-6 sm:p-8">
          <h2 className="text-sm font-semibold text-[#172033]">アカウント情報</h2>

          {email || providerLabel ? (
            <dl className="mt-4 space-y-4">
              {email && (
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
                  <dt className="w-28 shrink-0 text-xs text-[#817b71]">メールアドレス</dt>
                  <dd className="break-all text-sm text-[#3f3a34]">{email}</dd>
                </div>
              )}
              {providerLabel && (
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
                  <dt className="w-28 shrink-0 text-xs text-[#817b71]">ログイン方法</dt>
                  <dd className="text-sm text-[#3f3a34]">{providerLabel}</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="mt-4 text-sm text-[#625f59]">表示できるアカウント情報がありません。</p>
          )}

          <div className="mt-8 border-t border-[#ece7dd] pt-6">
            <SignOutButton variant="button" />
          </div>
        </div>
      </div>
    </div>
  );
}
