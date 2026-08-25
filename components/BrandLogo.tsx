import Link from "next/link";
import { Barlow } from "next/font/google";

/**
 * BrandLogo専用の書体。DIN系（工業的・直線的）の印象に近い、SIL Open Font License 1.1の
 * 商用利用可能フォント（Google Fonts、next/font/googleでビルド時にセルフホスト）。
 * サイト全体のbody font（globals.cssのArial/Helvetica）は今回変更しない。ここでしか使わない。
 * weightは700(Bold)/800(ExtraBold)を比較検討し、太すぎて重く見えない700を採用した。
 */
const barlow = Barlow({
  subsets: ["latin"],
  weight: "700",
  display: "swap",
});

/**
 * サービスブランド「I'm ready!」のロゴ。以前は public/brand/im-ready-logo.png の画像だったが、
 * DIN系の印象へ変更するため text + Barlow ベースに変更した。
 * responsive対応・dark modeともにCSSだけで完結し、画像特有のdark:invertは不要になった
 * （文字色をworksheet-primaryトークンに委ねるだけで、ダークモード時のCSS変数切り替えで自動対応する）。
 * hrefを渡さない場合はクリック不可（/widget埋め込みのように遷移先が意味を持たない文脈向け）。
 */
export default function BrandLogo({ href, className }: { href?: string; className?: string }) {
  // font-sizeを指定するclassNameを渡された場合はデフォルトサイズを完全に置き換える
  // （画像時代と同じ方針。text-*クラスが両方残るとTailwindのCSS出力順に挙動が左右されるため）。
  const sizeClasses = className ?? "text-xl sm:text-2xl";
  const text = (
    <span className={`${barlow.className} ${sizeClasses} font-bold leading-none tracking-tight text-worksheet-primary`}>
      I&apos;m ready!
    </span>
  );

  if (!href) return text;

  return (
    <Link href={href} aria-label="I'm ready!">
      {text}
    </Link>
  );
}
