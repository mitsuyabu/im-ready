/** 既存の利用規約・プライバシーポリシーへのリンクを/から移設しただけ。リンクは増やさない。
 *  加えて、LP下部の落ち着いた位置に対応地域の案内を1行だけ置いている（FAQ sectionは
 *  もともと無いため、このためだけに新設せず、ここに集約した）。対応時期が確定していない
 *  国名は挙げず、「順次拡大していく予定」までに留める。 */
export default function LandingFooter() {
  return (
    <footer className="border-t border-worksheet-border px-4 py-8 text-center md:px-8 lg:px-[60px]">
      <p className="mx-auto mb-4 max-w-md text-xs leading-relaxed text-worksheet-secondary">
        現在はオーストラリア留学・ワーホリに対応しています。今後、対応国は順次拡大していく予定です。
      </p>
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
