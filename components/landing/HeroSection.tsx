import Link from "next/link";
import Image from "next/image";
import LandingHeader from "@/components/landing/LandingHeader";

/**
 * 公開ページ（/）のHero。HeaderとHero画像を同じ背景の上で一体化して見せるため、
 * LandingHeaderをこのsection自身の最初の子として描画する（app/page.tsx側では
 * 単独で<LandingHeader />を呼ばない。HeaderとHeroを別の白いブロックに分けないため）。
 *
 * Desktop: 画像をsection全体（Header込み）の背景として敷く。containerの高さは画像の
 * aspect ratioに厳密固定せず、min-heightで確保する（実際に画像を検証した結果、被写体
 * （人物・アーチ・雲）の周囲に安全な余白がほとんど無く、厳密なaspect-ratio追従はfirst view
 * のバランスと両立しないため）。object-positionは人物・アーチ・ランドマークが集まる右下寄りに
 * 設定し、トリミングが発生する場合は装飾的な雲・アーチ上部のカーブ側から優先的に削れるようにする。
 *
 * Mobile: 背景化せず、Header（transparent、白いpage背景の上にそのまま乗る）→copy→CTA→
 * imageの縦積み（画像は独立したブロックとしてw-fullでaspect ratioを維持したまま表示する）。
 */
export default function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      {/* Desktop: 背景image（Header〜Hero copyの後ろ全体に敷く） */}
      <div className="absolute inset-0 z-0 hidden sm:block">
        <Image
          src="/landing/hero-study-abroad.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
          style={{ objectPosition: "80% 65%" }}
        />
      </div>

      <div className="relative z-10 flex flex-col sm:min-h-[540px] lg:min-h-[640px] xl:min-h-[720px]">
        <LandingHeader />

        {/* Desktop copy: Header分を除いた残りの高さの中で縦中央寄せ */}
        <div className="hidden flex-1 items-center px-4 py-10 sm:flex md:px-8 lg:px-[60px]">
          <div className="w-full max-w-md">
            <HeroCopy align="left" variant="onImage" />
          </div>
        </div>
      </div>

      {/* Mobile: copy → image の縦積み */}
      <div className="px-4 py-10 sm:hidden">
        <HeroCopy align="center" variant="plain" />

        <div className="relative mt-8 w-full" style={{ aspectRatio: "1672 / 941" }}>
          <Image src="/landing/hero-study-abroad.png" alt="" fill priority sizes="100vw" className="object-cover" />
        </div>
      </div>
    </section>
  );
}

function HeroCopy({ align, variant }: { align: "left" | "center"; variant: "onImage" | "plain" }) {
  const isOnImage = variant === "onImage";
  // 画像に重ねるDesktop版は、背景のオレンジに対して実測コントラスト比を確認した上で
  // 濃い色（黒ベース）に寄せている（既存のtext-worksheet-secondaryはオレンジ背景上で
  // 約1.75:1しかなくWCAG AA基準4.5:1を大きく下回るため、そのままでは使えなかった）。
  const subCopyClass = isOnImage ? "text-worksheet-primary" : "text-worksheet-secondary";
  const bodyCopyClass = isOnImage ? "text-worksheet-primary/85" : "text-worksheet-secondary";
  const loginLinkClass = isOnImage
    ? "text-worksheet-primary decoration-worksheet-primary/40"
    : "text-worksheet-secondary decoration-worksheet-secondary/40 hover:text-worksheet-primary";
  const alignClass = align === "left" ? "text-left" : "text-center";
  const itemsClass = align === "left" ? "items-start" : "items-center";
  const ctaJustifyClass = align === "left" ? "" : "sm:justify-center";
  const bodyMaxWidthClass = align === "left" ? "max-w-md" : "mx-auto max-w-md";

  return (
    <div className={alignClass}>
      <h1 className="text-3xl font-semibold leading-tight text-worksheet-primary sm:text-4xl lg:text-5xl">
        あなたの「行きたい」を、
        <br />
        かたちにする。
      </h1>

      <p className={`mt-3 text-lg sm:text-xl ${subCopyClass}`}>留学・ワーホリの準備ワークスペース</p>

      <p className={`mt-6 text-sm leading-relaxed sm:text-base ${bodyCopyClass} ${bodyMaxWidthClass}`}>
        まだ迷っている段階から、
        <br />
        話したり、書いたりしながら、
        <br />
        自分だけの留学Planを少しずつつくっていけます。
      </p>

      <div className={`mt-8 flex flex-col ${itemsClass} gap-3 sm:flex-row sm:items-center ${ctaJustifyClass}`}>
        <Link
          href="/login"
          className="inline-flex items-center rounded-full bg-worksheet-accent px-6 py-3 text-sm font-medium text-worksheet-accent-contrast transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
        >
          はじめる
        </Link>
        <Link
          href="/login"
          className={`text-sm underline underline-offset-4 transition-opacity duration-150 hover:opacity-70 ${loginLinkClass}`}
        >
          ログイン
        </Link>
      </div>
    </div>
  );
}
