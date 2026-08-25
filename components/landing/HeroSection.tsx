import Link from "next/link";
import Image from "next/image";

/** 共有画像の実寸(px)。CLS防止のため、コンテナのaspect-ratioにそのまま使う。 */
const HERO_IMAGE_WIDTH = 1672;
const HERO_IMAGE_HEIGHT = 941;
const HERO_IMAGE_ASPECT = `${HERO_IMAGE_WIDTH} / ${HERO_IMAGE_HEIGHT}`;

/**
 * 公開ページ（/）のHero。ロゴはLandingHeader側に既にあるため、ここでは重複表示しない。
 *
 * Desktop: 共有画像（左に大きなオレンジの余白、右に人物・アーチ・シドニー景観）を背景として
 * 敷き、画像自体の余白部分にcopyを重ねる（「2カラムに分割」ではなく「画像をそのまま活かす」方式）。
 * containerのaspect-ratioを画像の実寸(1672:941)に厳密に一致させているため、object-fit: cover
 * でも実際には一切cropが発生しない（縦横どちらの向きでも画像全体がそのまま表示される）。
 * そのため主要被写体（人物・アーチ・オペラハウス・ハーバーブリッジ・飛行機）は常に完全に表示される。
 *
 * Mobile: 背景オーバーレイにはせず、text→imageの1カラム構成にする（背景化すると被写体が
 * 切れる可能性があるため、指示通りimageは独立したブロックとしてw-fullで下に表示する）。
 */
export default function HeroSection() {
  return (
    <section className="px-4 pt-10 pb-16 sm:px-6 sm:pt-14 sm:pb-24 lg:pb-28">
      <div className="mx-auto max-w-6xl">
        {/* Desktop: 画像オーバーレイ */}
        <div
          className="relative hidden w-full overflow-hidden rounded-3xl sm:block"
          style={{ aspectRatio: HERO_IMAGE_ASPECT }}
        >
          <Image
            src="/landing/hero-study-abroad.png"
            alt=""
            fill
            priority
            sizes="(min-width: 1152px) 1152px, 100vw"
            className="object-cover object-right"
          />
          <div className="absolute inset-0 flex items-center">
            <div className="w-full px-8 lg:px-14">
              <HeroCopy align="left" variant="onImage" />
            </div>
          </div>
        </div>

        {/* Mobile: text → image の1カラム */}
        <div className="sm:hidden">
          <HeroCopy align="center" variant="plain" />

          <div
            className="relative mt-8 w-full overflow-hidden rounded-2xl"
            style={{ aspectRatio: HERO_IMAGE_ASPECT }}
          >
            <Image
              src="/landing/hero-study-abroad.png"
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          </div>
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
