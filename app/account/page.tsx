import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rowToAccountProfile, type ProfileRow } from "@/lib/accountProfile";
import AccountProfileForm from "@/components/AccountProfileForm";

export const metadata: Metadata = {
  title: "プロフィール",
};

/**
 * Account（プロフィール設定）ページ。ユーザー本人の、Plan をまたいで共通する情報を管理する。
 *
 * Server Component で初期データ（profiles 行 ＋ avatar の署名付き URL）を読み、
 * 編集フォーム部分だけを client component（AccountProfileForm / AvatarUploader）に分ける。
 *
 * 表示するのは Supabase Auth / profiles に実在する値のみ:
 *   - user.email（表示のみ・編集不可）
 *   - user.app_metadata.provider（ログイン方法・表示のみ）
 *   - profiles.*（表示名・生年月日・性別・居住地・職業/学年・英語レベル・留学経験・avatar）
 * fake の人物画像・プロフィールは生成しない。希望都市/時期/期間/予算/学校条件/留学目的/不安/
 * 判断軸などの Plan・Karte 側の情報はここに置かない。
 *
 * profiles テーブル未整備（migration 未適用）でも落ちないよう、select 失敗は「未作成」と同じ扱いにする。
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

  const { data: profileData } = await supabase
    .from("profiles")
    .select(
      "display_name, birth_date, gender, residence, occupation, english_level, study_abroad_experience, avatar_path, updated_at",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const profileRow = (profileData ?? null) as ProfileRow | null;
  const initialProfile = rowToAccountProfile(profileRow);
  const avatarPath = profileRow?.avatar_path ?? null;

  let avatarUrl: string | null = null;
  if (avatarPath) {
    const { data: signed } = await supabase.storage
      .from("avatars")
      .createSignedUrl(avatarPath, 60 * 60);
    if (signed?.signedUrl) {
      // 署名付き URL 自体が毎リクエスト新しく発行されるが、同一 path 上書きに備えて
      // updated_at があれば cache-bust の param も付ける（§31）。
      const stamp = profileRow?.updated_at ? Date.parse(profileRow.updated_at) : NaN;
      const sep = signed.signedUrl.includes("?") ? "&" : "?";
      avatarUrl = Number.isNaN(stamp)
        ? signed.signedUrl
        : `${signed.signedUrl}${sep}t=${stamp}`;
    }
  }

  return (
    <div className="min-h-dvh bg-[#fcfbf8]">
      <div className="mx-auto max-w-3xl px-4 pt-10 pb-24 sm:px-6 sm:py-14">
        <p className="text-xs font-medium tracking-wide text-[#5f7050]">Account</p>
        <h1 className="mt-1 text-[27px] font-bold tracking-tight text-[#172033] sm:text-[34px]">
          プロフィール
        </h1>
        <p className="mt-2 text-sm text-[#625f59]">あなたの基本情報とアカウント設定</p>

        <AccountProfileForm
          userId={user.id}
          email={email}
          providerLabel={providerLabel}
          initialProfile={initialProfile}
          initialAvatarPath={avatarPath}
          initialAvatarUrl={avatarUrl}
        />
      </div>
    </div>
  );
}
