/**
 * Documents トップの「考える → 整理する → 比べる → 伝える」4 ステップの帯（presentation のみ）。
 * 共有デザインに寄せ、横長・低め（Desktop で概ね 80〜100px 相当）・4 枚均等、間を破線 connector で繋ぐ。
 *
 * これは Documents の役割説明であり、進捗ではない。番号 1〜4 は順序を示すだけで、
 * completed / progress % / チェックマークは付けない。ステップはリンクではなくクリック要素を持たない。
 * 装飾（番号・アイコン・connector）はすべて aria-hidden。hooks を持たない純粋表示コンポーネント。
 *
 * responsive: Desktop は横 4 列＋connector、Tablet / Mobile は 2×2。
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
    return (
      <svg {...common}>
        <path d="M12 21v-8" />
        <path d="M12 13c0-3 2-5 5.5-5C17.5 11 15.5 13 12 13Z" />
        <path d="M12 13c0-3-2-5-5.5-5C6.5 11 8.5 13 12 13Z" />
      </svg>
    );
  }
  if (name === "organize") {
    return (
      <svg {...common}>
        <rect x="6" y="4" width="12" height="16" rx="2" />
        <path d="M9 4V3h6v1" />
        <path d="M8.5 10l1.5 1.5L13 9M8.5 15l1.5 1.5L13 14" />
      </svg>
    );
  }
  if (name === "compare") {
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

function Step({ n, title, desc, icon }: { n: number; title: string; desc: string; icon: StepKey }) {
  return (
    <div className="relative rounded-[16px] border border-black/[0.07] bg-white/80 px-4 py-3 lg:flex-1">
      <span
        aria-hidden
        className="absolute left-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-worksheet-sage text-[11px] font-semibold text-worksheet-primary"
      >
        {n}
      </span>
      <div className="flex items-center gap-3 pl-7">
        <StepIcon name={icon} className="h-6 w-6 shrink-0 text-[#7a8a76]" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-worksheet-primary">{title}</p>
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-worksheet-secondary">{desc}</p>
        </div>
      </div>
    </div>
  );
}

function Connector() {
  return (
    <span
      aria-hidden
      className="hidden self-center lg:mx-1.5 lg:block lg:w-8 lg:border-t lg:border-dashed lg:border-[#aebfae]"
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
