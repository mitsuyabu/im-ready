/**
 * Document 本文の plain text 表示（Step 28）。presentation parser（Step 27）が
 * null を返した場合の **必須 fallback**。元 body を一切加工せず、そのまま
 * whitespace-pre-wrap で表示する。
 *
 * hooks・ブラウザ API を持たない純粋な表示コンポーネントなので、Server Component
 * （detail page）からも Client Component（各 Generator）からも import できる。
 * dangerouslySetInnerHTML は使わない（{body} は JSX 内の文字列展開のみ。React が
 * 自動エスケープする）。
 */
export default function DocumentPlainText({ body }: { body: string }) {
  return (
    <div className="mt-6 whitespace-pre-wrap rounded-2xl border border-worksheet-border bg-worksheet-surface-2 p-5 text-sm leading-relaxed text-worksheet-primary sm:p-6">
      {body}
    </div>
  );
}
