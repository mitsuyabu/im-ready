import Link from "next/link";

/**
 * Documents トップの Document カード（presentation のみ）。My Note / Study Plan /
 * School Comparison / 親向け説明資料 を、参考デザインに寄せた紙・文具風の見た目で表示する。
 *
 * - カード全体が 1 つの Link（detail route へ）。内部に別の Link / button は置かない。
 *   CTA は <span> のバッジ表示で、クリック要素ではない。
 * - document が存在する場合だけ「更新日」と open CTA を、無ければ create CTA を出す（§53）。
 *   その判定は呼び出し側（page）が既存の plan_documents 取得結果から行い、ここは受け取るだけ。
 * - fake データは扱わない。装飾（罫線・パンチ穴・クリップ・落書き・"School A/B" の紙）は
 *   すべて aria-hidden で、role / title / description / CTA には重ねない（§49）。
 * - hooks を持たない純粋表示コンポーネント。
 */

export type DocumentWorkspaceVariant = "note" | "plan" | "compare" | "parent";

export type DocumentWorkspaceCardProps = {
  href: string;
  /** 「考える」等（lib/documentRoles の role をそのまま） */
  role: string;
  /** 「My Note」等 */
  title: string;
  /** トップ用の説明コピー（1〜2 行）。1 行目はやや強く、以降は補足として表示。 */
  lines: string[];
  variant: DocumentWorkspaceVariant;
  /** document がある場合の formatLastUpdated 済みテキスト。無ければ null。 */
  updatedText: string | null;
  /** 「ひらく →」/「内容をみる →」/ createLabel など、呼び出し側で決めた表示文言。 */
  cta: string;
  /** 親向けのみ true（capability バッジ「共有できる」）。 */
  shareBadge?: boolean;
  /** grid の col-span / row-span 等、配置クラスを呼び出し側から付ける。 */
  className?: string;
};

const SURFACE: Record<DocumentWorkspaceVariant, string> = {
  note: "bg-[#fefdf9] border border-[#ece3cd]",
  plan: "bg-[#eef2f7] border border-[#dbe3ec]",
  compare: "bg-[#eef3ee] border border-[#dbe6db]",
  parent: "bg-[#fdfcf8] border border-[#ece3cd]",
};

function CardIcon({ variant, className }: { variant: DocumentWorkspaceVariant; className?: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
  if (variant === "note") {
    return (
      <svg {...common}>
        <path d="M4 20l1-4L16 5l3 3L8 19l-4 1Z" />
        <path d="M14 7l3 3" />
      </svg>
    );
  }
  if (variant === "plan") {
    return (
      <svg {...common}>
        <rect x="6" y="4" width="12" height="16" rx="2" />
        <path d="M9 4V3h6v1" />
        <path d="M8.5 10l1.4 1.4L13 9M8.5 15l1.4 1.4L13 14" />
      </svg>
    );
  }
  if (variant === "compare") {
    return (
      <svg {...common}>
        <path d="M12 4v16M5 8h14" />
        <path d="M5 8l-2.5 5h5zM19 8l-2.5 5h5z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M4 5h16v10H9l-4 4V5Z" />
      <path d="M8 9h8M8 12h5" />
    </svg>
  );
}

function Decoration({ variant }: { variant: DocumentWorkspaceVariant }) {
  if (variant === "note") {
    return (
      <>
        {/* 罫線 */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 top-24 opacity-70"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(43,42,39,0.06) 28px)",
          }}
        />
        {/* パンチ穴 */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-10 flex flex-col gap-6"
        >
          <span className="h-3 w-3 rounded-full bg-[#fbfaf6] ring-1 ring-[#e5dcc4]" />
          <span className="h-3 w-3 rounded-full bg-[#fbfaf6] ring-1 ring-[#e5dcc4]" />
          <span className="h-3 w-3 rounded-full bg-[#fbfaf6] ring-1 ring-[#e5dcc4]" />
        </span>
        {/* coral の落書き（右上・テキストから離す） */}
        <svg
          aria-hidden
          viewBox="0 0 60 30"
          className="pointer-events-none absolute right-4 top-4 h-6 w-12 text-[#e07a5f]/70"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M2 22c6-14 10 6 15-4s8 10 13-2 9 6 13-4" />
        </svg>
        {/* green の星（右下） */}
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="pointer-events-none absolute bottom-4 right-4 h-4 w-4 text-[#8a9a86]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        >
          <path d="M12 4v16M4 12h16M6.5 6.5l11 11M17.5 6.5l-11 11" />
        </svg>
      </>
    );
  }
  if (variant === "plan") {
    return (
      <>
        {/* ペーパークリップ（右上） */}
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="pointer-events-none absolute right-4 top-3 h-8 w-8 text-[#9aa8b6]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 6v9a3 3 0 0 0 6 0V6a4.5 4.5 0 0 0-9 0v9a6 6 0 0 0 12 0V7" />
        </svg>
        {/* チェックリストのメモ（右下） */}
        <svg
          aria-hidden
          viewBox="0 0 48 56"
          className="pointer-events-none absolute -bottom-2 right-3 h-20 w-16 text-[#c4cfdb]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="6" y="4" width="36" height="46" rx="3" />
          <path d="M12 16l3 3 5-6M12 30l3 3 5-6M26 15h10M26 31h10M12 43h24" />
        </svg>
      </>
    );
  }
  if (variant === "compare") {
    return (
      <span aria-hidden className="pointer-events-none absolute bottom-3 right-3">
        <span className="relative block h-20 w-24">
          <span className="absolute right-6 top-1 h-16 w-14 -rotate-6 rounded-[3px] border border-[#c7d6c7] bg-white/70" />
          <span className="absolute right-0 top-3 flex h-16 w-14 rotate-3 items-start justify-center rounded-[3px] border border-[#c7d6c7] bg-white/80 pt-2 text-[9px] font-medium text-[#8fa38f]">
            School B
          </span>
          <span className="absolute right-10 top-6 text-[9px] font-medium text-[#8fa38f]">School A</span>
        </span>
      </span>
    );
  }
  // parent
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="pointer-events-none absolute right-4 top-4 h-10 w-10 text-[#d9d0bb] sm:hidden"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 11l18-7-7 18-3-8-8-3Z" />
    </svg>
  );
}

function Cta({ text, accent }: { text: string; accent: "coral" | "outline" | "outline-lg" }) {
  if (accent === "coral") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#e07a5f] px-4 py-2 text-xs font-semibold text-white transition-transform duration-150 group-hover:translate-x-0.5">
        {text}
      </span>
    );
  }
  const size = accent === "outline-lg" ? "px-5 py-2.5 text-sm" : "px-4 py-2 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-worksheet-primary/25 font-medium text-worksheet-primary transition-transform duration-150 group-hover:translate-x-0.5 ${size}`}
    >
      {text}
    </span>
  );
}

export default function DocumentWorkspaceCard({
  href,
  role,
  title,
  lines,
  variant,
  updatedText,
  cta,
  shareBadge = false,
  className = "",
}: DocumentWorkspaceCardProps) {
  const ctaAccent = variant === "note" ? "coral" : variant === "parent" ? "outline-lg" : "outline";
  const contentPad = variant === "note" ? "pl-8" : "";

  const Meta = (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      {shareBadge && (
        <span className="rounded-full bg-worksheet-sage/60 px-2 py-0.5 text-[11px] font-medium text-[#4b5a48]">
          共有できる
        </span>
      )}
      {updatedText && <span className="text-xs text-worksheet-secondary">最終更新: {updatedText}</span>}
      <span className={variant === "parent" ? "sm:ml-auto" : "ml-auto"}>
        <Cta text={cta} accent={ctaAccent} />
      </span>
    </div>
  );

  if (variant === "parent") {
    return (
      <Link
        href={href}
        className={`group relative flex h-full flex-col overflow-hidden rounded-[22px] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-worksheet-accent sm:flex-row sm:items-center sm:gap-6 sm:p-7 ${SURFACE.parent} ${className}`}
      >
        <Decoration variant="parent" />
        <span
          aria-hidden
          className="hidden shrink-0 items-center justify-center rounded-2xl bg-worksheet-sage/50 p-4 text-[#5f6b5a] sm:flex"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-8 w-8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 11l18-7-7 18-3-8-8-3Z" />
          </svg>
        </span>
        <div className="relative min-w-0 flex-1">
          <p className="text-xs font-medium tracking-wide text-[#7a8a76]">{role}</p>
          <p className="mt-0.5 text-lg font-bold text-worksheet-primary">{title}</p>
          {lines.map((line, i) => (
            <p
              key={i}
              className={
                i === 0
                  ? "mt-1.5 text-sm leading-relaxed text-worksheet-primary/90"
                  : "mt-1 text-xs leading-relaxed text-worksheet-secondary"
              }
            >
              {line}
            </p>
          ))}
          {Meta}
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={`group relative flex h-full flex-col overflow-hidden rounded-[22px] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-worksheet-accent ${
        variant === "note" ? "min-h-[240px] lg:min-h-[420px]" : "min-h-[180px]"
      } ${SURFACE[variant]} ${className}`}
    >
      <Decoration variant={variant} />

      <div className={`relative flex h-full flex-col ${contentPad}`}>
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-worksheet-sage/60 text-[#5f6b5a]"
          >
            <CardIcon variant={variant} className="h-4 w-4" />
          </span>
          <span className="text-xs font-medium tracking-wide text-[#7a8a76]">{role}</span>
        </div>

        <p className="mt-3 text-lg font-bold text-worksheet-primary">{title}</p>
        {lines.map((line, i) => (
          <p
            key={i}
            className={
              i === 0
                ? "mt-1.5 text-sm leading-relaxed text-worksheet-primary/90"
                : "mt-1 text-xs leading-relaxed text-worksheet-secondary"
            }
          >
            {line}
          </p>
        ))}

        <div className="mt-auto">{Meta}</div>
      </div>
    </Link>
  );
}
