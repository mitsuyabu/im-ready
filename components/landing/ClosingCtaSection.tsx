import Image from "next/image";
import Link from "next/link";

/**
 * 「行きたい気持ちが、まだ曖昧でも大丈夫。」セクション。以前の単色背景＋中央寄せテキストから、
 * 共有された参考モックアップ（海沿いの遊歩道・爽やかなトーン）を目指し、背景画像＋左寄せ
 * テキストという構成に変更している。
 *
 * 背景画像 public/landing/uncertain-hero-section.png は、文字が一切焼き込まれていない
 * クリーンな海沿いの写真（1859×846px、アスペクト比約2.2:1）。旧バージョンは見出し等が
 * 画像に焼き込まれた完成デザイン参考のモックアップだったため、実装時にHTML側の本物の
 * テキストと二重表示になる問題があり、右側だけを切り出した暫定画像
 * （closing-cta-coastal-path.png）で代替していたが、クリーンな写真に差し替えられたため
 * その暫定ファイルは削除し、この画像をそのまま使用している。
 *
 * HeroSectionとは異なり、このsectionにはLandingHeaderのような「Desktopだけ別の要素」が
 * 無く、左テキスト＋右へ抜ける画像という同じ構図がMobile/Desktop共通で成立するため、
 * breakpoint別に別JSXブロックへ分けず、同じ構造をユーティリティクラスの出し分けだけで
 * 表現している。object-positionは単一の値（68% 55%）。画像のアスペクト比（2.2:1）が
 * Desktopのcontainer（横長、例: 1280×520で比率2.46）より縦長寄りのため、Desktopでは
 * containerの横幅に画像の横幅が一致し、ほぼ全幅（＝海岸線から遊歩道まで）がそのまま
 * 見える（上下がわずかにcropされるだけ）。逆にMobileのcontainer（縦長）では画像の縦が
 * containerの高さに一致するため上下方向のcropは発生せず、横方向だけが大きくcropされる。
 * そのためxは「Mobileでどの横位置を見せるか」、yは「Desktopでどの縦位置を見せるか」を
 * それぞれ独立に制御しており、x=68%はMobileで遊歩道・ビーチのカーブが見える位置、
 * y=55%はDesktopで空の余白を取りすぎず遊歩道・ビーチが収まる位置として選んでいる。
 * 文字が乗る左側の可読性は、bg-gradient-to-rの白グラデーション1枚（from-white/90
 * via-white/60 to-transparent）で確保し、白ベタで画像全体を覆うことはしていない。
 *
 * Mobileでのテキスト列幅は当初max-w-[260px]にしていたが、見出し2行目「まだ曖昧でも
 * 大丈夫。」（全角10文字）はtext-3xl(30px)で実測約300px必要なため、260pxでは見出し
 * 自体が自動折り返しでさらに2行に割れ、結果的に4行以上に崩れて見える不具合があった。
 * 見出しの実測幅に対して十分な余白（約30px）を確保できるmax-w-[330px]に広げることで、
 * 明示した2行（<br />区切り）どおりに収まるようにしている（sm以上のmax-w-sm/md/xlは
 * 元々十分な幅があるため変更していない）。
 *
 * Mobileでの可読性については、まずテキスト色から対応している。見出しは元々
 * text-worksheet-primary（不透明度100%）だったが、サブコピー（旧: /85）と補足文
 * （旧: /70）は不透明度を落としていたため、明るい写真の上では実効コントラストが
 * 下がっていた（実測: 見出し右端付近の最も薄いグラデーション領域で、不透明度70%の
 * 黒文字はWCAGコントラスト比 約3.9:1 とAA基準4.5:1を下回っていたのに対し、不透明度
 * 100%に上げると同じ位置でも約6.8:1まで改善する計算になる）。そのためMobile（sm未満）
 * のみサブコピー・補足文を不透明度100%（text-worksheet-primary）にし、sm以上は
 * 既存の/85・/70のままDesktopの見た目を変えていない。この文字色の対応だけで
 * 最も厳しい位置でもAA基準を超える計算になったため、グラデーション自体は
 * （Mobile/Desktopとも）変更していない。「はじめる」ボタンはbg-worksheet-accent
 * （完全不透明の塗り）のため、そもそも背景写真の影響を受けず変更不要と判断した。
 */
export default function ClosingCtaSection() {
  return (
    <section className="relative overflow-hidden border-t border-worksheet-border bg-worksheet-sage/25">
      <div className="absolute inset-0 z-0">
        <Image
          src="/landing/uncertain-hero-section.png"
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
          style={{ objectPosition: "68% 55%" }}
        />
      </div>

      <div
        className="absolute inset-0 z-[1] bg-gradient-to-r from-white/90 via-white/60 to-transparent"
        aria-hidden
      />

      <div className="relative z-10 flex min-h-[400px] flex-col justify-center px-4 py-16 sm:min-h-[460px] sm:px-6 md:px-8 lg:min-h-[520px] lg:px-[60px] xl:min-h-[580px]">
        <div className="max-w-[330px] text-left sm:max-w-sm md:max-w-md lg:max-w-xl">
          <h2 className="text-3xl font-bold leading-tight tracking-tight text-worksheet-primary sm:text-4xl lg:text-5xl">
            行きたい気持ちが、
            <br />
            まだ曖昧でも大丈夫。
          </h2>
          <p className="mt-4 text-base text-worksheet-primary sm:text-lg sm:text-worksheet-primary/85">
            まずは、話すことから。
          </p>

          <div className="mt-8">
            <Link
              href="/login"
              className="inline-flex items-center rounded-full bg-worksheet-accent px-6 py-3 text-sm font-medium text-worksheet-accent-contrast transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
            >
              はじめる
            </Link>
          </div>

          <p className="mt-3 text-xs text-worksheet-primary sm:text-worksheet-primary/70">
            Googleアカウントで利用できます
          </p>
        </div>
      </div>
    </section>
  );
}
