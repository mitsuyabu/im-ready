/**
 * My Karte トップの「考える → 整理する → 比べる → 伝える」4 ステップの帯（presentation のみ）。
 *
 * これは My Karte の役割説明であり、進捗ではない。番号 1〜4 は順序を示すだけで、
 * completed / progress % / チェックマークは付けない。ステップはリンクではなくクリック要素を持たない。
 *
 * 見た目は落ち着いたワークスペースに合わせ、カードは 4 枚とも同じ warm white / 共通 border /
 * shadow なし。色は「どの資料に対応するステップか」を示す補助としてアイコンの淡い tone だけに使う
 * （カード背景や番号には色を付けない）。connector は残すが、ごく薄い線にする。
 * 装飾（番号・アイコン・connector）はすべて aria-hidden。hooks を持たない純粋表示コンポーネント。
 *
 * responsive: Desktop は横 4 列＋connector、Tablet / Mobile は 2×2。
 */

type StepKey = "think" | "organize" | "compare" | "tell";

/** tone は対応する Document カードの accent と揃える（機能差の補助のみ・§8 / §21）。 */
const STEPS: { n: number; title: string; desc: string; icon: StepKey; tone: string }[] = [
  { n: 1, title: "考える", desc: "気持ちやアイデアを書き出してみよう", icon: "think", tone: "#8d968a" },
  { n: 2, title: "整理する", desc: "条件ややることをひとつずつ整理しよう", icon: "organize", tone: "#7d8ea1" },
  { n: 3, title: "比べる", desc: "学校やエリアを比べてみよう", icon: "compare", tone: "#7b917b" },
  { n: 4, title: "伝える", desc: "自分の想いを家族にも伝えよう", icon: "tell", tone: "#a1907a" },
];

function StepIcon({
  name,
  className,
  style,
}: {
  name: StepKey;
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

function Step({
  n,
  title,
  desc,
  icon,
  tone,
}: {
  n: number;
  title: string;
  desc: string;
  icon: StepKey;
  tone: string;
}) {
  return (
    <div className="relative rounded-[14px] border border-[#e7e3dc] bg-white px-4 py-3.5 lg:flex-1">
      <div className="flex items-start gap-3">
        <StepIcon name={icon} className="mt-0.5 h-5 w-5 shrink-0" style={{ color: tone }} />
        <div className="min-w-0">
          <p className="flex items-baseline gap-1.5 text-[13px] font-semibold text-worksheet-primary">
            <span aria-hidden className="text-[11px] font-medium text-[#a8a297]">
              {n}
            </span>
            {title}
          </p>
          <p className="mt-1 line-clamp-2 text-[12px] leading-[1.6] text-[#7c766d]">{desc}</p>
        </div>
      </div>
    </div>
  );
}

function Connector() {
  return (
    <span
      aria-hidden
      className="hidden self-center lg:mx-1.5 lg:block lg:w-6 lg:border-t lg:border-[#e7e3dc]"
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
