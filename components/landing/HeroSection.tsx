import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";

/**
 * 公開ページ（/）のHero。ログイン後workspace（/mypage）よりも明確にブランド表現を強くするが、
 * 巨大なLP headlineにはしない。白・黒・sageのみで構成し、gradientは使わない。
 */
export default function HeroSection() {
  return (
    <section className="px-4 py-16 text-center sm:px-6 sm:py-24 lg:py-28">
      <div className="mx-auto max-w-2xl">
        <BrandLogo href="/" className="mx-auto h-16 w-auto sm:h-20" />

        <h1 className="mt-6 text-3xl font-semibold leading-tight text-worksheet-primary sm:text-4xl lg:text-5xl">
          あなたの「行きたい」を、
          <br />
          かたちにする。
        </h1>

        <p className="mt-3 text-base text-worksheet-secondary sm:text-lg">留学・ワーホリの準備ワークスペース</p>

        <p className="mx-auto mt-6 max-w-md text-sm leading-relaxed text-worksheet-secondary sm:text-base">
          まだ迷っている段階から、
          <br />
          話したり、書いたりしながら、
          <br />
          自分だけの留学Planを少しずつつくっていけます。
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/login"
            className="inline-flex items-center rounded-full bg-worksheet-accent px-6 py-3 text-sm font-medium text-worksheet-accent-contrast transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
          >
            はじめる
          </Link>
          <Link
            href="/login"
            className="text-sm text-worksheet-secondary underline decoration-worksheet-secondary/40 underline-offset-4 transition-colors duration-150 hover:text-worksheet-primary"
          >
            ログイン
          </Link>
        </div>
      </div>
    </section>
  );
}
