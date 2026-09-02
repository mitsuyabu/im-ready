import Image from "next/image";
import Link from "next/link";

/**
 * サービスブランド「I'm ready!」のロゴ。
 * public/brand/im-ready-logo-new.png（1774×887, 透過背景, 純黒のみ）を使用する。
 * 実測すると、キャンバス全体のうち実際のロゴ本体は縦方向で約43%（378/887px）で、
 * 上下に非対称の透明余白（上24.0%・下33.4%）を含む。画像ファイル自体はcrop・加工せず、
 * next/imageでキャンバス全体をaspect ratio維持のまま表示している（呼び出し側のheight指定に対し、
 * 見えるロゴ本体はその約43%程度の高さになる）。
 * I'm ready! は light トーン固定の UI（globals.css で color-scheme: light）。以前は
 * dark:invert で白反転していたが、light 固定の cream 背景では白ロゴが見えなくなるため外した。
 */
export default function BrandLogo({ href, className }: { href?: string; className?: string }) {
  // heightを指定するclassNameを渡された場合はデフォルトサイズを完全に置き換える
  // （h-*クラスが両方残るとTailwindのCSS出力順に挙動が左右されるため、混在させない）。
  const sizeClasses = className ?? "h-10 w-auto sm:h-12";
  const image = (
    <Image
      src="/brand/im-ready-logo-new.png"
      alt="I'm ready!"
      width={1774}
      height={887}
      priority
      className={`${sizeClasses} object-contain`}
    />
  );

  if (!href) return image;

  return (
    <Link href={href} aria-label="I'm ready!">
      {image}
    </Link>
  );
}
