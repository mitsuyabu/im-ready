import Image from "next/image";
import Link from "next/link";

/**
 * サービスブランド「I'm ready!」のロゴ（画像）。
 * public/brand/im-ready-logo.png は元のワードマーク画像から余白部分だけをトリミングしたもの
 * （透過部分が大きく、CSSで縮小するより先に画像自体の余白を削るべきと判断したため）。
 * 黒文字ロゴのため、ダークモードでは dark:invert で白反転させて可読性を保つ。
 * hrefを渡さない場合はクリック不可（/widget埋め込みのように遷移先が意味を持たない文脈向け）。
 */
export default function BrandLogo({ href, className }: { href?: string; className?: string }) {
  // heightを指定するclassNameを渡された場合はデフォルトサイズを完全に置き換える
  // （h-*クラスが両方残るとTailwindのCSS出力順に挙動が左右されるため、混在させない）。
  const sizeClasses = className ?? "h-7 w-auto sm:h-8";
  const image = (
    <Image
      src="/brand/im-ready-logo.png"
      alt="I'm ready!"
      width={1810}
      height={384}
      priority
      className={`${sizeClasses} object-contain dark:invert`}
    />
  );

  if (!href) return image;

  return (
    <Link href={href} aria-label="I'm ready!">
      {image}
    </Link>
  );
}
