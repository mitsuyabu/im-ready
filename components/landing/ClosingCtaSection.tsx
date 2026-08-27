import Image from "next/image";
import Link from "next/link";

/**
 * 「行きたい気持ちが、まだ曖昧でも大丈夫。」セクション。以前の単色背景＋中央寄せテキストから、
 * 共有された参考モックアップ（海沿いの遊歩道・爽やかなトーン）を目指し、背景画像＋左寄せ
 * テキストという構成に変更している。
 *
 * 背景画像 public/landing/closing-cta-coastal-path.png は、共有された参考モックアップ画像
 * （public/landing/uncertain-hero-section.png）そのものではない。共有されたモックアップは
 * 見出し・サブコピー・CTA・補足文がすでに画像に焼き込まれた完成デザイン参考のため、その
 * まま背景に使うとHTML側の本物のテキストと二重に表示されてしまう。そのため、モックアップの
 * うち文字が一切含まれない右側46%以降（元画像1867pxの859px以降、1009×842px）だけを
 * 切り出し、実際に背景として使えるクリーンな写真として保存した（海岸線と木製フェンスの
 * 遊歩道はどちらもこの範囲に収まっている）。
 *
 * HeroSectionとは異なり、このsectionにはLandingHeaderのような「Desktopだけ別の要素」が
 * 無く、左テキスト＋右へ抜ける画像という同じ構図がMobile/Desktop共通で成立するため、
 * breakpoint別に別JSXブロックへ分けず、同じ構造をユーティリティクラスの出し分けだけで
 * 表現している。object-positionは単一の値（65% 55%）で妥協しており、Mobileの縦長
 * container・Desktopの横長containerのどちらでも海岸線と遊歩道がある程度見えることを
 * 優先している。
 * 文字が乗る左側の可読性は、bg-gradient-to-rの白グラデーション1枚（from-white/90
 * via-white/60 to-transparent）で確保し、白ベタで画像全体を覆うことはしていない。
 * テキスト列の幅をmax-w-[260px]（Mobile）〜max-w-xl（lg）に絞っているのは、
 * グラデーションの不透明度が右へ行くほど下がるため、見出し右端がグラデーションの
 * 低不透明度ゾーンまで届いてコントラストが落ちるのを避けるため（濃い緑の茂みなど
 * 画像側の暗い領域に文字がかかった場合の最悪ケースを想定した安全マージン）。
 */
export default function ClosingCtaSection() {
  return (
    <section className="relative overflow-hidden border-t border-worksheet-border bg-worksheet-sage/25">
      <div className="absolute inset-0 z-0">
        <Image
          src="/landing/closing-cta-coastal-path.png"
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
          style={{ objectPosition: "65% 55%" }}
        />
      </div>

      <div
        className="absolute inset-0 z-[1] bg-gradient-to-r from-white/90 via-white/60 to-transparent"
        aria-hidden
      />

      <div className="relative z-10 flex min-h-[400px] flex-col justify-center px-4 py-16 sm:min-h-[460px] sm:px-6 md:px-8 lg:min-h-[520px] lg:px-[60px] xl:min-h-[580px]">
        <div className="max-w-[260px] text-left sm:max-w-sm md:max-w-md lg:max-w-xl">
          <h2 className="text-3xl font-bold leading-tight tracking-tight text-worksheet-primary sm:text-4xl lg:text-5xl">
            行きたい気持ちが、
            <br />
            まだ曖昧でも大丈夫。
          </h2>
          <p className="mt-4 text-base text-worksheet-primary/85 sm:text-lg">まずは、話すことから。</p>

          <div className="mt-8">
            <Link
              href="/login"
              className="inline-flex items-center rounded-full bg-worksheet-accent px-6 py-3 text-sm font-medium text-worksheet-accent-contrast transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
            >
              はじめる
            </Link>
          </div>

          <p className="mt-3 text-xs text-worksheet-primary/70">Googleアカウントで利用できます</p>
        </div>
      </div>
    </section>
  );
}
