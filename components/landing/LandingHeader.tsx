import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";

/**
 * 公開ページ（/）専用のHeader。HeroSection内で描画され、Hero画像と同じ背景の上に
 * 一体化して見えるようtransparentにしている（sticky/fixedにはしない。通常のdocument flowで
 * Hero以下と一緒にスクロールする）。
 * 「ログイン」はtext-worksheet-primary（黒）に統一している。desktopではHero画像（オレンジ、
 * 実測コントラスト比6.42:1）、mobileでは白いpage背景の上に乗るが、黒文字ならどちらでも
 * 十分な可読性を確保できるため、背景に応じた色の出し分けは不要と判断した。
 */
export default function LandingHeader() {
  return (
    <header className="bg-transparent">
      <div className="flex items-center justify-between px-4 py-4 md:px-8 lg:px-[60px]">
        <BrandLogo href="/" className="h-9 w-auto sm:h-10" />

        <nav className="flex items-center gap-4">
          <Link
            href="/login"
            className="text-sm text-worksheet-primary transition-opacity duration-150 hover:opacity-70"
          >
            ログイン
          </Link>
          <Link
            href="/login"
            className="hidden items-center rounded-full bg-worksheet-accent px-4 py-2 text-sm font-medium text-worksheet-accent-contrast transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] sm:inline-flex"
          >
            はじめる
          </Link>
        </nav>
      </div>
    </header>
  );
}
