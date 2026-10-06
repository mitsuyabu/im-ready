import type { ChatSource } from "@/lib/referenceSources";

/**
 * 回答の下に出す出典パネル。
 *
 * 方針:
 *   - 既定は**閉じた状態**。回答本文より目立たせない（小さい文字・控えめな色）。
 *   - 本文に [1][2] のような脚注番号は付けない（将来 inline citation へ発展できる形は保つ）。
 *   - 出す値は lib/referenceSources.ts が選んだ公開情報だけ。内部メモは渡ってこない。
 *   - light only（dark: クラスは使わない）。
 *   - JS を使わない <details>/<summary> なので、Server Component のままで動く。
 */
export default function SourceDisclosure({
  sources,
  className,
}: {
  sources: ChatSource[];
  className?: string;
}) {
  // 出典が無いターン（一般的な会話・確認済みデータが無い場合）はパネル自体を出さない。
  if (sources.length === 0) return null;

  return (
    <details className={`group mt-3 text-[13px] leading-relaxed ${className ?? ""}`}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full px-2 py-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 [&::-webkit-details-marker]:hidden">
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          className="h-3 w-3 shrink-0 transition-transform group-open:rotate-90"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
        <span>参考情報 {sources.length}件</span>
      </summary>

      <ul className="mt-2 space-y-2.5 border-l border-slate-200 pl-3">
        {sources.map((source) => (
          <li key={source.url} className="min-w-0">
            <p className="font-medium text-slate-700">{source.name}</p>
            <p className="mt-0.5 text-slate-500">
              {source.label}
              {source.reviewedAt ? <span className="ml-2">確認日 {source.reviewedAt}</span> : null}
              {!source.reviewedAt && source.updatedAt ? (
                <span className="ml-2">更新日 {source.updatedAt}</span>
              ) : null}
            </p>
            {source.note ? <p className="mt-0.5 text-slate-500">補足: {source.note}</p> : null}
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex min-h-[32px] items-center gap-1 text-slate-600 underline decoration-slate-300 underline-offset-2 transition-colors hover:text-slate-900 hover:decoration-slate-500"
            >
              公式ページ
              <svg
                viewBox="0 0 16 16"
                aria-hidden="true"
                className="h-3 w-3 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 3h7v7M13 3L5.5 10.5M11 13H3V5" />
              </svg>
            </a>
          </li>
        ))}
      </ul>

      <p className="mt-2.5 text-[12px] text-slate-400">
        内容は変わることがあります。申請や契約の前に各公式ページで確認してください。
      </p>
    </details>
  );
}
