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
 * 左側はブランドパネル。public/login/login-visual.png（Landing Page Heroの画像とは別の、
 * クリーム/セージ系の落ち着いたトーンの画像）をパネル全体の背景として敷き、その上に
 * BrandLogo・メインコピー・サブコピーを重ねる。実測コントラスト比は黒文字で14.72:1と
 * 非常に高いため、overlayは追加していない（写真がそのまま見える状態を優先）。
 * 右側がLogin panel（headline→description→Google login→補足→利用規約/プライバシー、
 * という情報階層）。
 * Mobileは2カラムにせず、BrandLogo→Headline→Description→Google login→補足/legal
 * の1カラム構成にし、Hero/Login用の画像は使わず縦に長くなりすぎないようにしている。
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
      {/* Desktop専用: ブランドパネル（背景画像＋テキストを重ねる） */}
      <div className="relative hidden overflow-hidden lg:flex lg:w-1/2 lg:flex-col lg:p-10 xl:p-14">
        <div className="absolute inset-0 -z-10">
          <Image
            src="/login/login-visual.png"
            alt=""
            fill
            priority
            sizes="50vw"
            className="object-cover"
            style={{ objectPosition: "70% 45%" }}
          />
        </div>

        <BrandLogo href="/" className="h-9 w-auto" />

        <div className="flex flex-1 flex-col justify-center">
          <div className="max-w-lg">
            <p className="text-3xl font-semibold leading-[1.2] tracking-tight text-worksheet-primary xl:text-4xl">
              あなたの「行きたい」を、
              <br />
              かたちにする。
            </p>
            <p className="mt-4 text-xl font-semibold text-worksheet-primary xl:text-2xl">
              留学・ワーホリの準備ワークスペース
            </p>
          </div>
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
