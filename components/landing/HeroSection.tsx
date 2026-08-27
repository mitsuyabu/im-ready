import Link from "next/link";
import Image from "next/image";
import LandingHeader from "@/components/landing/LandingHeader";

/**
 * 公開ページ（/）のHero。Desktop/Mobileとも、Hero画像を「section全体の背景」として
 * 敷き、その上にHeader・copy・CTAを重ねる一体型banner構成にしている（app/page.tsx側では
 * 単独で<LandingHeader />を呼ばない）。DesktopとMobileでcrop・高さ・overlay・copyの
 * サイズ感の必要性が大きく異なるため、LandingHeader・背景Image・copyのセットを
 * breakpointごとに完全に独立したJSXブロックとして持つ（HowItWorksSectionの
 * Mobile/Desktop分岐と同じ考え方）。copy自体もDesktop用（HeroCopy）とMobile用
 * （MobileHeroCopy）で別componentにしている。単純なalign違いだけでなく、Mobileは
 * 見出しの改行位置・フォントサイズ・spacing・CTAの並びをMindtripのスマホHeroを参考に
 * ゼロから作り直しているため、共有すると条件分岐が複雑になりすぎると判断した。
 *
 * Desktop（sm以上）: 画像をsection全体（Header込み）の背景として敷く。containerの高さは
 * 画像のaspect ratioに厳密固定せず、min-heightで確保する（実際に画像を検証した結果、
 * 被写体（女性・スーツケース）の周囲に安全な余白がほとんど無く、厳密なaspect-ratio追従は
 * first viewのバランスと両立しないため）。object-positionは被写体が集まる右下寄りに設定。
 * 背景のオレンジ〜クリーム系の色に対し黒文字で実測コントラスト比6.42:1あるため、overlay
 * なしでも十分読める。
 *
 * Mobile（sm未満）: Desktopとは別に、Mobile専用の背景image＋readability用の白グラデーション
 * scrim（縦＋横の2枚）＋Header＋copyのセットを用意している。containerをmin-h-[85svh]と
 * いう縦長の比率にすると、object-coverは画像の高さを基準に合わせるため横方向を大きく
 * cropする（実際の可視幅は画像全体の約26%程度）。copyを左寄せにしたことで「左＝文字
 * エリア、右〜下＝人物・スーツケース」という役割分担にしたいため、object-positionを
 * さらに右寄り（76%）へ調整し、白グラデーションも縦方向（上→下）と横方向（左→右）の
 * 2枚を重ねることで、左上〜左中央がしっかり読める濃さになり、右下ほど画像がそのまま
 * 見える構成にしている（濃いベタ塗り1枚ではなく、薄い2枚の重ねで自然な階調にする）。
 * copyはHeaderの下に十分な余白（pt-28、Header高さと合わせておおよそHero上部30%前後）
 * を空けてから配置し、Mindtripのような「Header→大きな空間→Hero見出し」というリズムに
 * している。
 *
 * 見出しは必ずDesktopで2行に収める。copy containerをbreakpointごとに拡張し
 * （max-w-lg/2xl/[820px]）、見出し1行目「あなたの「行きたい」を、」がその幅に収まる
 * ことを文字数×フォントサイズで検算した上でサイズを決めている。Mobileの見出しは
 * 「あなたの「行きたい」／を、かたちにする。」の2行に明示的に分割している
 * （文言・意味は変えていない。手動で改行位置を固定するのは、日本語には空白がないため
 * 自動折り返しに任せた場合に予測できない位置で行が割れるリスクがあるため）。フォント
 * サイズ（35px）は、Hiragino角ゴシックでの実測グリフ幅から「あなたの「行きたい」」
 * （全角10文字）が390px幅の画面（px-4を引いた実効幅358px）に収まる上限として選んで
 * いる（36px=text-4xlだと360pxとなり2pxオーバーフローするため、1段階小さいこの値に
 * している）。
 * Hero全体の左下だけにrounded-bl-[56px]を付け、他の3隅は直角のまま維持する
 * （Desktop/Mobileとも同じ1つのsection全体に対する角丸で、Mobile側に画像専用の
 * 個別角丸は持たせない＝画像だけが独立カードに見える状態を避けている）。
 */
export default function HeroSection() {
  return (
    <section className="relative overflow-hidden rounded-bl-[56px]">
      {/* Desktop（sm以上）: 背景image + Header + copy を1つのbannerとして重ねる（無変更） */}
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
              <HeroCopy />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile（sm未満）: 背景image + 白グラデーションscrim(縦+横) + Header + copy を
          1画面目として成立する一体型bannerにする。copyは左寄せ、Header直下に大きめの
          余白を取ってからメインコピーを配置する（Mindtripのスマホ Heroのリズムを参考）。 */}
      <div className="relative sm:hidden">
        <div className="absolute inset-0 z-0">
          <Image
            src="/landing/hero-study-abroad.png"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
            style={{ objectPosition: "76% 50%" }}
          />
        </div>

        {/* 縦方向（上→下）のscrim: 文字が乗る上部を持ち上げ、下へ行くほど透明にする */}
        <div
          className="absolute inset-0 z-[1] bg-gradient-to-b from-white/80 via-white/45 to-transparent"
          aria-hidden
        />
        {/* 横方向（左→右）のscrim: 文字エリアである左側だけをさらに持ち上げ、
            右側（人物・スーツケース側）はできるだけ画像の印象を残す */}
        <div
          className="absolute inset-0 z-[1] bg-gradient-to-r from-white/70 via-white/25 to-transparent"
          aria-hidden
        />

        <div className="relative z-10 flex min-h-[85svh] flex-col">
          <LandingHeader />
          <div className="px-4 pb-16 pt-28">
            <MobileHeroCopy />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Desktop専用。左寄せcopy（従来のalign="left"相当をそのまま維持）。 */
function HeroCopy() {
  return (
    <div className="text-left">
      <h1 className="text-3xl leading-[1.15] font-semibold tracking-tight text-worksheet-primary sm:text-4xl lg:text-5xl xl:text-6xl">
        あなたの「行きたい」を、
        <br />
        かたちにする。
      </h1>

      <p className="mt-4 text-lg font-semibold text-worksheet-primary sm:text-xl lg:text-2xl">
        留学・ワーホリの準備ワークスペース
      </p>

      <p className="mt-6 max-w-md text-sm leading-relaxed text-worksheet-primary/85 sm:text-base">
        まだ迷っている段階から、
        <br />
        話したり、書いたりしながら、
        <br />
        自分だけの留学Planを少しずつつくっていけます。
      </p>

      <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
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

/**
 * Mobile専用。Mindtripのスマホ Heroを参考に、左寄せ・大きめ見出し・CTAも左基準で
 * ゼロから組んでいる（Desktopと共有すると条件分岐が複雑になるため独立componentにした）。
 * 文言・CTAリンク先はDesktopと完全に同一。見出しの改行だけ、自動折り返しの予測不能な
 * 位置での行割れを避けるため2行に明示的に分割している。CTAは横並び（はじめる→ログイン）
 * で左揃え、buttonはfull-widthにしない。
 */
function MobileHeroCopy() {
  return (
    <div className="text-left">
      <h1 className="text-[35px] leading-[1.3] font-bold tracking-tight text-worksheet-primary">
        あなたの「行きたい」
        <br />
        を、かたちにする。
      </h1>

      <p className="mt-4 text-lg font-semibold text-worksheet-primary">留学・ワーホリの準備ワークスペース</p>

      <p className="mt-5 text-sm leading-relaxed text-worksheet-primary/85">
        まだ迷っている段階から、
        <br />
        話したり、書いたりしながら、
        <br />
        自分だけの留学Planを少しずつつくっていけます。
      </p>

      <div className="mt-8 flex flex-row items-center gap-6">
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
