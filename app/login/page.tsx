import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import LoginButton from "@/components/LoginButton";
import BrandLogo from "@/components/BrandLogo";

export const metadata: Metadata = {
  title: "ログイン",
};

/**
 * ログイン画面。Landing Page（/）のような長い説明はせず、シンプルな認証画面のまま
 * だが、ブランド感を持たせるため2カラム構成にしている（Desktopのみ）。
 * 左側はブランドパネル（sage背景＋Hero copyの一部＋Hero画像の小さめcrop、Landing
 * PageのHeroをそのまま複製しない）。右側がLogin panel（headline→description→
 * Google login→補足→利用規約/プライバシー、という情報階層）。
 * Mobileは2カラムにせず、BrandLogo→Headline→Description→Google login→補足/legal
 * の1カラム構成にし、Hero画像は使わず縦に長くなりすぎないようにしている。
 *
 * Auth周り（LoginButtonのOAuth処理・redirectTo・/auth/callback・middleware・
 * session処理・ログイン済みユーザーの/mypage redirect）は一切変更していない。
 */
export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/mypage");
  }

  return (
    <div className="flex min-h-dvh flex-col bg-worksheet-surface lg:flex-row">
      {/* Desktop専用: ブランドパネル */}
      <div className="relative hidden flex-col justify-between bg-worksheet-sage/20 p-10 lg:flex lg:w-1/2 xl:p-14">
        <BrandLogo href="/" className="h-9 w-auto" />

        <div className="max-w-sm">
          <p className="text-3xl font-semibold leading-[1.2] tracking-tight text-worksheet-primary xl:text-4xl">
            あなたの「行きたい」を、
            <br />
            かたちにする。
          </p>
          <p className="mt-3 text-base font-medium text-worksheet-primary">留学・ワーホリの準備ワークスペース</p>
        </div>

        {/* Landing Page Heroの全面背景とは違う見せ方として、小さめのvisual panelに留める */}
        <div className="relative h-56 w-full max-w-sm overflow-hidden rounded-2xl xl:h-64">
          <Image
            src="/landing/hero-study-abroad.png"
            alt=""
            fill
            sizes="400px"
            className="object-cover"
            style={{ objectPosition: "85% 55%" }}
          />
        </div>
      </div>

      {/* Mobile専用header */}
      <header className="px-4 py-5 sm:px-6 lg:hidden">
        <BrandLogo href="/" className="h-9 w-auto" />
      </header>

      {/* Login panel（Desktop右側 / Mobile全体） */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-12 sm:px-6">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold leading-snug tracking-tight text-worksheet-primary sm:text-3xl">
            留学・ワーホリの準備を、
            <br />
            ここからはじめる。
          </h1>
          <p className="mt-3 text-sm text-worksheet-primary/85 sm:text-base">
            Googleアカウントですぐに始められます。
          </p>

          <div className="mt-8">
            <LoginButton />
          </div>

          <p className="mt-4 text-xs text-worksheet-primary/70 sm:text-sm">初めての方も、そのまま利用できます。</p>

          <div className="mt-10 flex justify-center gap-4 text-xs text-worksheet-primary/60">
            <Link href="/terms" className="underline underline-offset-2 transition-colors hover:text-worksheet-primary">
              利用規約
            </Link>
            <Link
              href="/privacy"
              className="underline underline-offset-2 transition-colors hover:text-worksheet-primary"
            >
              プライバシーポリシー
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
