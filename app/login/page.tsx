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
 * 画面全体を覆う白overlayも、テキストごとの「白い板」的なchip背景も使わない。
 * ロゴ直下の「留学・ワーホリの準備ワークスペース」は背景なしのプレーンテキスト（ロゴと
 * 左端を揃える）。中央よりやや上の「さあ、準備を始めよう！」だけ、文字より一回り大きい
 * 範囲に極薄・強いblur（bg-white/12 blur-3xl）のglowを敷いて、境界の見えない霧のような
 * ぼかしで可読性を支えている（backdrop-blurによる矩形の縁が見えるカード状にはしていない）。
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

        {/* 画面全体を覆う白overlayは使わない。サブタイトルは背景なしのプレーンテキストにし、
            主役コピーだけ「白い板」ではなく境界の見えない霧のようなぼかしglowで支える。 */}
        <div className="relative z-10 flex flex-1 flex-col">
          <div className="flex flex-col items-start gap-2">
            <BrandLogo href="/" className="h-9 w-auto" />
            {/* ロゴの真下、左端も揃えたプレーンテキスト（背景・pillは無し） */}
            <p className="text-base font-medium text-worksheet-primary xl:text-lg">
              留学・ワーホリの準備ワークスペース
            </p>
          </div>

          {/* 中央よりやや上に主役コピーを配置するため、上下のスペーサーの比率をずらしている
              （厳密な50%centeringではなく、上:下 = 0.65:1.35で以前よりさらに上寄りにする） */}
          <div className="flex flex-1 flex-col">
            <div className="flex-[0.65]" />
            <div className="relative -ml-2 inline-block self-start">
              {/* 「白い板」ではなく霧: 文字より一回り大きい範囲に、極薄・強いblurのglowだけを敷く。
                  z-indexは使わず、DOM順（このdivが先＝下、pが後＝上）だけで重なりを作っている
                  （relative単体では新しいstacking contextを作らないため、負のz-indexは使わない）。 */}
              <div className="absolute -inset-6 rounded-full bg-white/12 blur-3xl xl:-inset-8" aria-hidden />
              <p className="relative text-2xl font-bold leading-tight tracking-tight text-worksheet-primary xl:text-3xl">
                さあ、準備を始めよう！
              </p>
            </div>
            <div className="flex-[1.35]" />
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
