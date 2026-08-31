/**
 * Documents トップの「考える → 整理する → 比べる → 伝える」4 ステップの帯（presentation のみ）。
 *
 * これは Documents の役割説明であり、進捗ではない。番号 1〜4 は journey の順序を示すだけで、
 * completed / 1-4 complete / progress % / チェックマークは一切付けない（§52）。
 * どのステップもリンクではなく、クリック要素を持たない。装飾（番号・アイコン・connector）は
 * すべて aria-hidden。hooks を持たない純粋表示コンポーネント。
 *
 * responsive: Desktop は横 4 列＋破線 connector、Tablet / Mobile は 2×2。
 */

type StepKey = "think" | "organize" | "compare" | "tell";

const STEPS: { n: number; title: string; desc: string; icon: StepKey }[] = [
  { n: 1, title: "考える", desc: "気持ちやアイデアを書き出してみよう", icon: "think" },
  { n: 2, title: "整理する", desc: "条件ややることをひとつずつ整理しよう", icon: "organize" },
  { n: 3, title: "比べる", desc: "学校やエリアを比べてみよう", icon: "compare" },
  { n: 4, title: "伝える", desc: "自分の想いを家族にも伝えよう", icon: "tell" },
];

function StepIcon({ name, className }: { name: StepKey; className?: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
  if (name === "think") {
    // 芽（アイデア・育てる）
    return (
      <svg {...common}>
        <path d="M12 21v-8" />
        <path d="M12 13c0-3 2-5 5.5-5C17.5 11 15.5 13 12 13Z" />
        <path d="M12 13c0-3-2-5-5.5-5C6.5 11 8.5 13 12 13Z" />
      </svg>
    );
  }
  if (name === "organize") {
    // クリップボード
    return (
      <svg {...common}>
        <rect x="6" y="4" width="12" height="16" rx="2" />
        <path d="M9 4V3h6v1" />
        <path d="M8.5 10l1.5 1.5L13 9M8.5 15l1.5 1.5L13 13" />
      </svg>
    );
  }
  if (name === "compare") {
    // 天秤
    return (
      <svg {...common}>
        <path d="M12 4v16M5 8h14" />
        <path d="M5 8l-2.5 5h5zM19 8l-2.5 5h5z" />
      </svg>
    );
  }
  // 吹き出し（伝える）
  return (
    <svg {...common}>
      <path d="M4 5h16v10H9l-4 4V5Z" />
      <path d="M8 9h8M8 12h5" />
    </svg>
  );
}

function Step({ n, title, desc, icon }: { n: number; title: string; desc: string; icon: StepKey }) {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white/60 p-4 lg:flex-1">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="flex h-7 w-7 items-center justify-center rounded-full bg-worksheet-sage text-xs font-semibold text-worksheet-primary"
        >
          {n}
        </span>
        <StepIcon name={icon} className="h-4 w-4 text-[#7a8a76]" />
      </div>
      <p className="mt-2.5 text-sm font-semibold text-worksheet-primary">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-worksheet-secondary">{desc}</p>
    </div>
  );
}

function Connector() {
  return (
    <span
      aria-hidden
      className="hidden self-center lg:mx-1 lg:block lg:w-7 lg:border-t lg:border-dashed lg:border-black/20"
    />
  );
}

export default function DocumentsJourney() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-0">
      <Step {...STEPS[0]} />
      <Connector />
      <Step {...STEPS[1]} />
      <Connector />
      <Step {...STEPS[2]} />
      <Connector />
      <Step {...STEPS[3]} />
    </div>
  );
}
