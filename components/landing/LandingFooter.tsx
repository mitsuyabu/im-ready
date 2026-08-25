/** 既存の利用規約・プライバシーポリシーへのリンクを/から移設しただけ。リンクは増やさない。 */
export default function LandingFooter() {
  return (
    <footer className="border-t border-worksheet-border px-4 py-8 text-center sm:px-6">
      <div className="flex justify-center gap-4 text-xs text-worksheet-secondary">
        <a href="/terms" className="underline underline-offset-2 transition-colors duration-150 hover:text-worksheet-primary">
          利用規約
        </a>
        <a
          href="/privacy"
          className="underline underline-offset-2 transition-colors duration-150 hover:text-worksheet-primary"
        >
          プライバシーポリシー
        </a>
      </div>
    </footer>
  );
}
