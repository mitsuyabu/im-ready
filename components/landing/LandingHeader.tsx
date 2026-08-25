import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";

/**
 * 公開ページ（/）専用のシンプルなHeader。AppNavのSidebar/mobile bottom navとは無関係
 * （ログイン前ページはAppNavでラップされていないため独立して用意する）。
 * ナビゲーション項目は増やさず、ブランドロゴとログイン導線だけに絞る。
 * 「ログイン」（既存ユーザー向け）と「はじめる」（初見ユーザー向け）はどちらも/loginへ遷移する
 * （Googleログインが実質的な唯一の入口のため）。mobileでは「はじめる」ボタンを隠し、
 * ロゴ＋「ログイン」のみのシンプルな表示にする。
 */
export default function LandingHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-worksheet-border bg-worksheet-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <BrandLogo href="/" />

        <nav className="flex items-center gap-4">
          <Link
            href="/login"
            className="text-sm text-worksheet-secondary transition-colors duration-150 hover:text-worksheet-primary"
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
