import Link from "next/link";

/**
 * Documents トップの Document カード（presentation のみ）。共有デザインに寄せた紙・文具風。
 *
 * - My Note（variant "note"）は左の縦カード：notebook paper・左のパンチ穴・中央寄せの
 *   icon/title/underline/description・下寄り中央の coral CTA・落書き（pink scribble /
 *   green starburst / "まずはここから！" 矢印 / title 下の緑下線）。
 * - Study Plan / School Comparison / 親向け（"plan" / "compare" / "parent"）は横長の
 *   3 ブロック（左: illustration ／ 中央: role・title・description（親向けは "共有できる" バッジと
 *   metadata も）／ 右: outline CTA）。
 *
 * カード全体が 1 つの Link（detail route へ）。内部に別の Link / button は置かない（CTA は <span>）。
 * document がある場合だけ「最終更新」と open CTA、無ければ create CTA（判定は呼び出し側）。
 * fake データは扱わない。装飾（罫線・パンチ穴・クリップ・落書き・"School A/B" の紙・テープ）は
 * すべて aria-hidden で、role / title / description / CTA には重ねない。
 * hooks を持たない純粋表示コンポーネント。
 */

export type DocumentWorkspaceVariant = "note" | "plan" | "compare" | "parent";

export type DocumentWorkspaceCardProps = {
  href: string;
  role: string;
  title: string;
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
  note: "bg-[#fefdf9] border border-[#e9e0c8]",
  plan: "bg-[#eef2f6] border border-[#dae1ea]",
  compare: "bg-[#eef2ee] border border-[#dae4da]",
  parent: "bg-[#fdfcf7] border border-[#e9e0c8]",
};

const CARD_BASE =
  "group relative block overflow-hidden rounded-[18px] shadow-[0_2px_6px_rgba(0,0,0,0.05)] transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-worksheet-accent";

const ROLE_TONE: Record<DocumentWorkspaceVariant, string> = {
  note: "text-[#7a8a76]",
  plan: "text-[#6b7d92]",
  compare: "text-[#6f8a6f]",
  parent: "text-[#7a8a76]",
};

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 20l1-4L16 5l3 3L8 19l-4 1Z" />
      <path d="M14 7l3 3" />
    </svg>
  );
}

function Cta({ text, kind }: { text: string; kind: "coral" | "pill" | "rect" }) {
  if (kind === "coral") {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg bg-[#e07a5f] px-4 py-2 text-sm font-semibold text-white transition-transform duration-150 group-hover:translate-x-0.5">
        {text}
      </span>
    );
  }
  if (kind === "rect") {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg border border-worksheet-primary/30 px-5 py-2.5 text-sm font-medium text-worksheet-primary transition-transform duration-150 group-hover:translate-x-0.5">
        {text}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-worksheet-primary/25 px-4 py-1.5 text-xs font-medium text-worksheet-primary transition-transform duration-150 group-hover:translate-x-0.5">
      {text}
    </span>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M4 9h16M9 3v4M15 3v4" />
    </svg>
  );
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.3 10.8l7.4-3.6M8.3 13.2l7.4 3.6" />
    </svg>
  );
}

/** plan / compare / parent の左に置く illustration。 */
function Illustration({ variant }: { variant: DocumentWorkspaceVariant }) {
  if (variant === "plan") {
    return (
      <svg
        aria-hidden
        viewBox="0 0 56 64"
        className="h-16 w-14 text-[#a9b8c9]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="8" y="5" width="40" height="54" rx="3" />
        <path d="M15 18l3 3 5-6M15 33l3 3 5-6M15 48l3 3 5-6M28 17h13M28 32h13M28 47h13" />
      </svg>
    );
  }
  if (variant === "compare") {
    return (
      <span aria-hidden className="relative block h-16 w-20">
        <span className="absolute left-1 top-1 flex h-14 w-12 -rotate-6 items-start justify-center rounded-[3px] border border-[#c6d5c6] bg-white/80 pt-1.5 text-[9px] font-medium text-[#7f957f]">
          School A
        </span>
        <span className="absolute right-0 top-2 flex h-14 w-12 rotate-6 items-start justify-center rounded-[3px] border border-[#c6d5c6] bg-white/95 pt-1.5 text-[9px] font-medium text-[#7f957f]">
          School B
        </span>
      </span>
    );
  }
  // parent: 紙飛行機 ＋ ブルーのテープ
  return (
    <span aria-hidden className="relative block h-16 w-16">
      <span className="absolute -left-1 top-3 h-4 w-9 -rotate-12 rounded-[2px] bg-[#a9c3d6]/60" />
      <svg
        viewBox="0 0 24 24"
        className="relative h-16 w-16 text-[#c9bfa6]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 11l18-7-7 18-3-8-8-3Z" />
        <path d="M11 13l4-4" />
      </svg>
    </span>
  );
}

function HorizontalCard(props: DocumentWorkspaceCardProps) {
  const { href, role, title, lines, variant, updatedText, cta, shareBadge, className = "" } = props;
  return (
    <Link
      href={href}
      className={`${CARD_BASE} ${SURFACE[variant]} ${className} h-full ${
        variant === "parent" ? "min-h-[132px]" : "min-h-[150px] sm:min-h-[164px]"
      }`}
    >
      {variant === "plan" && (
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="pointer-events-none absolute right-3 top-2 h-9 w-9 text-[#8ea3ba]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 6v9a3 3 0 0 0 6 0V6a4.5 4.5 0 0 0-9 0v10a6.5 6.5 0 0 0 13 0V7" />
        </svg>
      )}

      <div className="relative flex h-full flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
        <span className="flex shrink-0 items-center justify-center">
          <Illustration variant={variant} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`text-xs font-medium tracking-wide ${ROLE_TONE[variant]}`}>{role}</span>
            {shareBadge && (
              <span className="rounded-full bg-worksheet-sage/60 px-2 py-0.5 text-[11px] font-medium text-[#4b5a48]">
                共有できる
              </span>
            )}
          </div>

          <p className="mt-1 text-2xl font-bold leading-tight text-worksheet-primary sm:text-3xl">
            {title}
          </p>

          {lines.map((line, i) => (
            <p
              key={i}
              className={
                i === 0
                  ? "mt-1.5 text-sm leading-relaxed text-worksheet-primary/85"
                  : "mt-1 text-xs leading-relaxed text-worksheet-secondary"
              }
            >
              {line}
            </p>
          ))}

          {variant === "parent" && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-worksheet-secondary">
              {updatedText && (
                <>
                  <span className="inline-flex items-center gap-1">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    最終更新: {updatedText}
                  </span>
                  <span aria-hidden>·</span>
                </>
              )}
              <span className="inline-flex items-center gap-1">
                <ShareIcon className="h-3.5 w-3.5" />
                家族と共有できます
              </span>
            </div>
          )}
        </div>

        <div className="shrink-0 sm:self-center sm:text-right">
          <Cta text={cta} kind={variant === "parent" ? "rect" : "pill"} />
          {updatedText && variant !== "parent" && (
            <span className="mt-1.5 block text-[11px] text-worksheet-secondary">最終更新: {updatedText}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

function NoteCard(props: DocumentWorkspaceCardProps) {
  const { href, role, title, lines, updatedText, cta, className = "" } = props;
  return (
    <Link
      href={href}
      className={`${CARD_BASE} ${SURFACE.note} ${className} flex h-full min-h-[300px] flex-col lg:min-h-[360px]`}
    >
      {/* パンチ穴（左端・少しはみ出す） */}
      <span aria-hidden className="pointer-events-none absolute -left-1.5 top-12 flex flex-col gap-7">
        <span className="h-3.5 w-3.5 rounded-full bg-[#fbfaf6] ring-1 ring-[#e5dcc4]" />
        <span className="h-3.5 w-3.5 rounded-full bg-[#fbfaf6] ring-1 ring-[#e5dcc4]" />
        <span className="h-3.5 w-3.5 rounded-full bg-[#fbfaf6] ring-1 ring-[#e5dcc4]" />
        <span className="h-3.5 w-3.5 rounded-full bg-[#fbfaf6] ring-1 ring-[#e5dcc4]" />
      </span>

      {/* 罫線 */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 top-28 opacity-60"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(43,42,39,0.06) 28px)",
        }}
      />

      {/* pink scribble（左上） */}
      <svg
        aria-hidden
        viewBox="0 0 60 26"
        className="pointer-events-none absolute left-8 top-4 h-5 w-12 text-[#e39aa4]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <path d="M2 18c5-13 9 5 14-4s8 9 13-2 9 5 13-4" />
      </svg>

      {/* green starburst（右上） */}
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="pointer-events-none absolute right-4 top-4 h-5 w-5 text-[#8a9a86]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      >
        <path d="M12 3v18M3 12h18M6.5 6.5l11 11M17.5 6.5l-11 11" />
      </svg>

      {/* handwritten arrow ＋ まずはここから！（右下） */}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-4 right-3 flex items-end gap-1 text-[#8a9a86]"
      >
        <span className="font-serif text-[13px] italic leading-none">まずはここから！</span>
        <svg
          viewBox="0 0 28 28"
          className="h-7 w-7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 8c7 9 14 11 20 5" />
          <path d="M18 15l6-2 1 5" />
        </svg>
      </span>

      <div className="relative z-[1] flex flex-1 flex-col items-center px-6 py-2 text-center">
        <div className="mt-2 flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-worksheet-sage/60 text-[#5f6b5a]"
          >
            <PencilIcon className="h-5 w-5" />
          </span>
          <span className="text-left">
            <span className={`block text-xs font-medium tracking-wide ${ROLE_TONE.note}`}>{role}</span>
            <span className="block text-2xl font-bold leading-tight text-worksheet-primary sm:text-3xl lg:text-4xl">
              {title}
            </span>
          </span>
        </div>

        {/* title 下の緑の手描き下線 */}
        <svg
          aria-hidden
          viewBox="0 0 120 8"
          className="mt-1.5 h-2 w-28 text-[#7a9a76]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M2 5c18-5 36 4 54 0s36-5 62-1" />
        </svg>

        <p className="mt-4 max-w-[17rem] text-sm font-medium leading-7 text-worksheet-primary/90">
          {lines[0]}
        </p>
        {lines[1] && (
          <p className="mt-2 max-w-[19rem] text-xs leading-6 text-worksheet-secondary">{lines[1]}</p>
        )}

        <div className="mt-auto flex flex-col items-center pt-6">
          <Cta text={cta} kind="coral" />
          {updatedText && (
            <span className="mt-2 text-[11px] text-worksheet-secondary">最終更新: {updatedText}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function DocumentWorkspaceCard(props: DocumentWorkspaceCardProps) {
  return props.variant === "note" ? <NoteCard {...props} /> : <HorizontalCard {...props} />;
}
