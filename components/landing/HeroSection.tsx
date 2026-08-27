import Link from "next/link";
import Image from "next/image";
import LandingHeader from "@/components/landing/LandingHeader";

/**
 * 公開ページ（/）のHero。Desktop/Mobileとも、Hero画像を「section全体の背景」として
 * 敷き、その上にHeader・copy・CTAを重ねる一体型banner構成にしている（app/page.tsx側では
 * 単独で<LandingHeader />を呼ばない）。DesktopとMobileでcrop・高さ・overlayの必要性が
 * 大きく異なるため、LandingHeader・背景Image・copyのセットをbreakpointごとに完全に
 * 独立したJSXブロックとして持つ（HowItWorksSectionのMobile/Desktop分岐と同じ考え方）。
 *
 * Desktop（sm以上）: 画像をsection全体（Header込み）の背景として敷く。containerの高さは
 * 画像のaspect ratioに厳密固定せず、min-heightで確保する（実際に画像を検証した結果、
 * 被写体（女性・スーツケース）の周囲に安全な余白がほとんど無く、厳密なaspect-ratio追従は
 * first viewのバランスと両立しないため）。object-positionは被写体が集まる右下寄りに設定。
 * 背景のオレンジ〜クリーム系の色に対し黒文字で実測コントラスト比6.42:1あるため、overlay
 * なしでも十分読める。
 *
 * Mobile（sm未満）: Desktopとは別に、Mobile専用の背景image＋readability用の白グラデーション
 * scrim＋Header＋copyのセットを用意している。containerをmin-h-[85svh]という縦長の比率に
 * すると、object-coverは画像の高さを基準に合わせるため横方向を大きくcropする
 * （実際の可視幅は画像全体の約26%程度）。そのため、被写体（女性・スーツケース）が
 * ある程度収まるようobject-positionを画像右寄りへ設定した上で、文字が乗る上部〜中央に
 * ごく薄い白グラデーション（bg-gradient-to-b from-white/95 via-white/60 to-transparent）
 * を重ね、画像を濃いベタ塗りで潰さずに可読性だけを確保している。copyはHeader直下の
 * 上寄りに配置し、Hero下部は画像がそのまま見える「クリアな余白」として残す。
 *
 * 見出しは必ずDesktopで2行に収める。copy containerをbreakpointごとに拡張し
 * （max-w-lg/2xl/[820px]）、見出し1行目「あなたの「行きたい」を、」がその幅に収まる
 * ことを文字数×フォントサイズで検算した上でサイズを決めている。
 * Hero全体の左下だけにrounded-bl-[56px]を付け、他の3隅は直角のまま維持する
 * （Desktop/Mobileとも同じ1つのsection全体に対する角丸で、Mobile側に画像専用の
 * 個別角丸は持たせない＝画像だけが独立カードに見える状態を避けている）。
 */
export default function HeroSection() {
  return (
    <section className="relative overflow-hidden rounded-bl-[56px]">
      {/* Desktop（sm以上）: 背景image + Header + copy を1つのbannerとして重ねる */}
      <div className="relative hidden sm:block">
        <div className="absolute inset-0 z-0">
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

          {/* Header分を除いた残りの高さの中で縦中央寄せ */}
          <div className="flex flex-1 items-center px-4 py-10 md:px-8 lg:px-[60px]">
            {/* 見出しを必ず2行に収めるため、containerをmax-w-mdから拡張している
                （旧max-w-mdでは「あなたの「行きたい」を、」1行だけで幅を超え、3行に折り返していた）。 */}
            <div className="w-full max-w-lg lg:max-w-2xl xl:max-w-[820px]">
              <HeroCopy align="left" />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile（sm未満）: 背景image + 白グラデーションscrim + Header + copy を
          1画面目として成立する一体型bannerにする（画像を独立ブロックとして下に置かない）。 */}
      <div className="relative sm:hidden">
        <div className="absolute inset-0 z-0">
          <Image
            src="/landing/hero-study-abroad.png"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
            style={{ objectPosition: "70% 50%" }}
          />
        </div>

        {/* 濃いベタ塗りではなく、文字が乗る上部〜中央だけを白く持ち上げるグラデーション。
            下へ行くほど透明になり、Hero下部では画像そのものの印象が残るようにしている。 */}
        <div
          className="absolute inset-0 z-[1] bg-gradient-to-b from-white/95 via-white/60 to-transparent"
          aria-hidden
        />

        <div className="relative z-10 flex min-h-[85svh] flex-col">
          <LandingHeader />
          <div className="px-4 pb-16 pt-6">
            <HeroCopy align="center" />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * align以外の見た目はDesktop（画像の上）とMobile（画像＋白グラデーションの上）で共通に
 * している。黒文字はDesktop側で実測コントラスト比6.42:1、Mobile側は白グラデーション
 * scrimにより背景がほぼ白に近づくため、どちらもvariantによる色の出し分けは不要
 * （以前はtext-worksheet-secondaryを画像上でも使っていたためvariantで分岐していたが、
 * グレーを廃止した今は分岐する理由がない）。
 */
function HeroCopy({ align }: { align: "left" | "center" }) {
  const alignClass = align === "left" ? "text-left" : "text-center";
  const itemsClass = align === "left" ? "items-start" : "items-center";
  const ctaJustifyClass = align === "left" ? "" : "sm:justify-center";
  const bodyMaxWidthClass = align === "left" ? "max-w-md" : "mx-auto max-w-md";

  return (
    <div className={alignClass}>
      <h1 className="text-3xl leading-[1.15] font-semibold tracking-tight text-worksheet-primary sm:text-4xl lg:text-5xl xl:text-6xl">
        あなたの「行きたい」を、
        <br />
        かたちにする。
      </h1>

      <p className="mt-4 text-lg font-semibold text-worksheet-primary sm:text-xl lg:text-2xl">
        留学・ワーホリの準備ワークスペース
      </p>

      <p className={`mt-6 text-sm leading-relaxed text-worksheet-primary/85 sm:text-base ${bodyMaxWidthClass}`}>
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
          className="text-sm text-worksheet-primary underline decoration-worksheet-primary/40 underline-offset-4 transition-opacity duration-150 hover:opacity-70"
        >
          ログイン
        </Link>
      </div>
    </div>
  );
}
