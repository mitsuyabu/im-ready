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
 * クリーム/セージ系の落ち着いたトーンの画像）をパネル全体の背景として敷く。
 * 画面全体を覆う白overlayは使わず、可読性の確保はテキストブロックごとの半透明白背景+
 * backdrop-blur（glass chip）だけで行い、背景画像自体はそのまま見せる方針にしている。
 * ロゴ直下の「留学・ワーホリの準備ワークスペース」は小さめのpill chip（サブタイトル扱い）、
 * 中央よりやや上の「さあ、準備を始めよう！」が主役コピー（濃さ・サイズともに強いchip）で、
 * 両者の視覚的な強弱をはっきり分けている。旧コピー「あなたの『行きたい』を、かたちにする。」
 * はこのパネルから削除した（他画面のコピーには影響しない、Login左パネル限定の変更）。
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
      {/* Desktop専用: ブランドパネル（背景画像＋テキストを重ねる）
          背景imageはz-0（負のz-indexは使わない）、foreground contentをz-10のwrapperに
          まとめて重ねる。このwrapper（relative overflow-hidden、z-indexを指定していない）は
          それ自体では新しいstacking contextを作らないため、子に負のz-indexを与えると
          このwrapperの外（＝outer wrapperのbg-worksheet-surface白背景）より下に
          抜けてしまい画像が完全に見えなくなる（実際に発生していた不具合）。
          z-0/z-10という非負の値同士にすることで、このwrapper内で意図通りの重なりになる。 */}
      <div className="relative hidden overflow-hidden lg:flex lg:w-1/2 lg:flex-col lg:p-10 xl:p-14">
        <div className="absolute inset-0 z-0">
          <Image
            src="/login/login-visual.png"
            alt=""
            fill
            priority
            sizes="50vw"
            className="object-cover"
            style={{ objectPosition: "80% 45%" }}
          />
        </div>

        {/* 画面全体を覆う白overlayは廃止。可読性の確保は各テキストブロック自身の
            半透明白背景+backdrop-blur（glass chip）だけで行い、背景画像はそのまま見せる。 */}
        <div className="relative z-10 flex flex-1 flex-col">
          <div className="flex flex-col items-start gap-3">
            <BrandLogo href="/" className="h-9 w-auto" />
            {/* ロゴの補足説明として小さく。mainコピーとは形（pill）・濃さ・サイズで強弱を分ける */}
            <span className="rounded-full bg-white/55 px-3.5 py-1.5 text-sm font-medium text-worksheet-primary backdrop-blur-sm xl:text-base">
              留学・ワーホリの準備ワークスペース
            </span>
          </div>

          {/* 中央よりやや上に主役コピーを配置するため、上下のスペーサーの比率をずらしている
              （厳密な50%centeringではなく、上:下 = 0.85:1.15であえて上寄りにする） */}
          <div className="flex flex-1 flex-col">
            <div className="flex-[0.85]" />
            <div className="self-start rounded-2xl bg-white/60 px-7 py-5 backdrop-blur-md xl:px-8 xl:py-6">
              <p className="text-3xl font-bold leading-tight tracking-tight text-worksheet-primary xl:text-4xl">
                さあ、準備を始めよう！
              </p>
            </div>
            <div className="flex-[1.15]" />
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
