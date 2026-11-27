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
 *
 * variant:
 *   "default" … /widget など既存の表示。**見た目を一切変えていない**。
 *   "plan"    … Plan Chat 用。My Karte と同じトークン（--mk-*）に色だけ差し替える。
 *               出す件数・並び・リンク先・文言・開閉の初期状態（閉じている）は共通で、
 *               どちらの variant でも変えていない。
 */
export default function SourceDisclosure({
  sources,
  className,
  variant = "default",
}: {
  sources: ChatSource[];
  className?: string;
  variant?: "default" | "plan";
}) {
  const plan = variant === "plan";
  /* 色だけを variant で切り替える。文字サイズは出典が読めなくならないよう両者とも 13px のまま。 */
  const c = plan
    ? {
        summary:
          "text-[var(--mk-label)] hover:bg-[var(--mk-block)] hover:text-[var(--mk-ink)] focus-visible:outline-[#b7d94a]",
        /* 出典の一覧は「情報」の領域。左端の線だけシアンにして、本文の視線と区別する。 */
        list: "border-l-2 border-[var(--neon-blue)]",
        name: "font-semibold text-[var(--mk-label)]",
        meta: "text-[var(--mk-sub)]",
        link: "text-[var(--mk-ink)] decoration-[#c9ccc6] hover:decoration-[var(--mk-ink)]",
        caveat: "text-[var(--mk-sub)]",
      }
    : {
        summary:
          "text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-slate-400",
        list: "border-slate-200",
        name: "font-medium text-slate-700",
        meta: "text-slate-500",
        link: "text-slate-600 decoration-slate-300 hover:text-slate-900 hover:decoration-slate-500",
        caveat: "text-slate-400",
      };
  // 出典が無いターン（一般的な会話・確認済みデータが無い場合）はパネル自体を出さない。
  if (sources.length === 0) return null;

  return (
    <details className={`group mt-3 text-[13px] leading-relaxed ${className ?? ""}`}>
      <summary className={`inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full px-2 py-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden ${c.summary}`}>
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

      <ul className={`mt-2 space-y-2.5 border-l pl-3 ${c.list}`}>
        {sources.map((source) => (
          <li key={source.url} className="min-w-0">
            <p className={c.name}>{source.name}</p>
            <p className={`mt-0.5 ${c.meta}`}>
              {source.label}
              {source.reviewedAt ? <span className="ml-2">確認日 {source.reviewedAt}</span> : null}
              {!source.reviewedAt && source.updatedAt ? (
                <span className="ml-2">更新日 {source.updatedAt}</span>
              ) : null}
            </p>
            {source.note ? <p className={`mt-0.5 ${c.meta}`}>補足: {source.note}</p> : null}
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`mt-1 inline-flex min-h-[32px] items-center gap-1 underline underline-offset-2 transition-colors ${c.link}`}
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

      <p className={`mt-2.5 text-[12px] ${c.caveat}`}>
        内容は変わることがあります。申請や契約の前に各公式ページで確認してください。
      </p>
    </details>
  );
}
