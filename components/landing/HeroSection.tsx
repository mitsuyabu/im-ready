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
 * Mobile: 背景化はしないが、「テキストの下に独立した画像ブロックが置かれている」印象を
 * 避けるため、copyだけpx-4で余白を取り、画像はページ左右のpaddingから解放してfull-bleed
 * （画面幅いっぱい）で表示する。画像の後に余白を追加せず、Hero section自体を画像で
 * 締めくくることで、Desktop（画像がHeader〜copyの背後を覆う一体型banner）と同じ
 * 「画像が主役」の方向性をMobileでも再現している（Header→copy→CTA→画像という
 * 読み進め順自体は維持）。
 *
 * 見出しは必ずDesktopで2行に収める。copy containerをbreakpointごとに拡張し
 * （max-w-lg/2xl/[820px]）、見出し1行目「あなたの「行きたい」を、」がその幅に収まる
 * ことを文字数×フォントサイズで検算した上でサイズを決めている。
 * Hero全体（Header込み）の左下だけにrounded-bl-[56px]を付け、他の3隅は直角のまま維持する
 * （Mobileの単体image blockには控えめなrounded-bl-[32px]のみ）。
 */
export default function HeroSection() {
  return (
    <section className="relative overflow-hidden rounded-bl-[56px]">
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
          {/* 見出しを必ず2行に収めるため、containerをmax-w-mdから拡張している
              （旧max-w-mdでは「あなたの「行きたい」を、」1行だけで幅を超え、3行に折り返していた）。 */}
          <div className="w-full max-w-lg lg:max-w-2xl xl:max-w-[820px]">
            <HeroCopy align="left" />
          </div>
        </div>
      </div>

      {/* Mobile: copy → image。画像を「下に置かれた独立ブロック」に見せないため、
          copyだけpx-4で余白を取り、画像はページの左右paddingから解放してfull-bleed
          （画面幅いっぱい）で表示する。Hero sectionの最後の要素として画像自身が
          締めくくる形にし（画像の後に余白を追加しない）、Desktop Hero（画像が
          Header〜copyの背後全体を覆う一体型banner）と同じ「画像が主役」という
          方向性をMobileでも再現している。
          aspect-[4/3]・object-position: 76% 50%・scale-[1.08]は、女性・青い
          スーツケース・サーフボードの見え方を検証した上で以前確定させた値のため、
          今回は変更していない（Desktop側の画像設定にも一切影響しない）。 */}
      <div className="sm:hidden">
        <div className="px-4 pt-10">
          <HeroCopy align="center" />
        </div>

        <div
          className="relative mt-8 w-full overflow-hidden rounded-bl-[32px]"
          style={{ aspectRatio: "4 / 3" }}
        >
          <Image
            src="/landing/hero-study-abroad.png"
            alt=""
            fill
            priority
            sizes="100vw"
            className="scale-[1.08] object-cover"
            style={{ objectPosition: "76% 50%" }}
          />
        </div>
      </div>
    </section>
  );
}

/**
 * align以外の見た目はDesktop（画像の上）とMobile（白背景の上）で共通にしている。
 * 黒文字は画像側で実測コントラスト比6.42:1、白背景側は言うまでもなく十分なため、
 * variantによる色の出し分けはもう不要（以前はtext-worksheet-secondaryを画像上でも
 * 使っていたためvariantで分岐していたが、グレーを廃止した今は分岐する理由がない）。
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
