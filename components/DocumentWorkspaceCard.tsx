import Link from "next/link";

/**
 * My Karte トップの Document カード（presentation のみ）。
 *
 * 4 種（My Note / Study Plan / School Comparison / 親向け）を **1 つの共通カードシステム**で出す。
 * 紙もの・文具モチーフ（ノート罫線・パンチ穴・クリップ・落書き・"School A/B" の紙片・テープ・
 * 紙飛行機・手描き下線）は持たない。カードごとの "遊び" は **line icon 1 つと淡い背景 tone だけ**。
 *
 * 構造（4 種共通）:
 *   上: role label（小・muted）／ title ／ 右上に small line icon
 *   中: description（1〜2 行）／ 親向けのみ capability バッジ「共有できる」
 *   下: outlined CTA ／ 最終更新（document がある場合だけ）
 *
 * カード全体が 1 つの Link（detail route へ）。内部に別の Link / button は置かない（CTA は <span>）。
 * document がある場合だけ「最終更新」と open CTA、無ければ create CTA（判定は呼び出し側）。
 * border / radius / shadow / typography は variant で変えない。variant は淡い背景とアイコンの
 * tone（accent 1 色）だけを切り替える。fake データは扱わない。装飾は aria-hidden。
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
  /** grid の col-span 等、配置クラスを呼び出し側から付ける。 */
  className?: string;
};

/** カードごとの accent は「ごく淡い背景」＋「アイコン色」の 1 色だけ（border は共通）。 */
const ACCENT: Record<DocumentWorkspaceVariant, { surface: string; icon: string }> = {
  note: { surface: "#fdfbf5", icon: "#8d968a" }, // warm ivory
  plan: { surface: "#f4f7fa", icon: "#7d8ea1" }, // pale dusty blue
  compare: { surface: "#f2f5f1", icon: "#7b917b" }, // very light sage
  parent: { surface: "#faf6ee", icon: "#a1907a" }, // very light sand
};

const CARD_BASE =
  "group flex h-full flex-col rounded-[18px] border border-[#e6e1d8] p-5 shadow-[0_1px_2px_rgba(30,28,24,0.03)] transition-colors duration-150 hover:border-[#cfc8bb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-worksheet-accent sm:p-6";

function CardIcon({
  variant,
  className,
  style,
}: {
  variant: DocumentWorkspaceVariant;
  className?: string;
  style?: React.CSSProperties;
}) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    style,
    "aria-hidden": true,
  };
  if (variant === "note") {
    // pencil
    return (
      <svg {...common}>
        <path d="M4 20l1-4L16 5l3 3L8 19l-4 1Z" />
        <path d="M14 7l3 3" />
      </svg>
    );
  }
  if (variant === "plan") {
    // checklist
    return (
      <svg {...common}>
        <rect x="6" y="4" width="12" height="16" rx="2" />
        <path d="M9 4V3h6v1" />
        <path d="M8.5 10l1.5 1.5L13 9M8.5 15l1.5 1.5L13 14" />
      </svg>
    );
  }
  if (variant === "compare") {
    // balance scale
    return (
      <svg {...common}>
        <path d="M12 4v16M5 8h14" />
        <path d="M5 8l-2.5 5h5zM19 8l-2.5 5h5z" />
      </svg>
    );
  }
  // parent: message
  return (
    <svg {...common}>
      <path d="M4 5h16v10H9l-4 4V5Z" />
      <path d="M8 9h8M8 12h5" />
    </svg>
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
  shareBadge,
  className = "",
}: DocumentWorkspaceCardProps) {
  const accent = ACCENT[variant];
  return (
    <Link
      href={href}
      className={`${CARD_BASE} ${className}`}
      style={{ backgroundColor: accent.surface }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-[0.08em] text-[#8e887e] sm:text-[12px]">
            {role}
          </p>
          <h3 className="mt-1 text-[20px] font-semibold leading-snug tracking-tight text-worksheet-primary sm:text-[22px]">
            {title}
          </h3>
        </div>
        {/* accent はアイコンにだけ乗せる（淡い背景 tone と合わせて 1 色） */}
        <CardIcon
          variant={variant}
          className="mt-0.5 h-6 w-6 shrink-0"
          style={{ color: accent.icon }}
        />
      </div>

      <div className="mt-2.5 min-w-0">
        {lines.map((line, i) => (
          <p
            key={i}
            className={
              i === 0
                ? "text-[15px] leading-[1.7] text-[#57534c] sm:text-[15px]"
                : "mt-1.5 text-[13px] leading-[1.7] text-[#8a857b]"
            }
          >
            {line}
          </p>
        ))}
        {shareBadge && (
          <p className="mt-2.5 inline-flex rounded-full border border-[#e0dbd0] bg-white/70 px-2 py-0.5 text-[11px] font-medium text-[#6f6a61]">
            家族と共有できます
          </p>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 pt-5">
        <span className="inline-flex items-center gap-1 rounded-lg border border-[#d8d2c6] bg-white px-3.5 py-1.5 text-[13px] font-medium text-[#3f3a34] transition-colors duration-150 group-hover:border-[#b6ae9f]">
          {cta}
        </span>
        {updatedText && (
          <span className="text-[11px] text-[#8e887e]">最終更新: {updatedText}</span>
        )}
      </div>
    </Link>
  );
}
