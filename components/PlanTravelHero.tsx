/**
 * Plan 選択後トップページのヒーロー（presentation のみ）。共有デザインに寄せた
 * 紙・コラージュ・旅のしおり感：アイボリーの紙面、マスキングテープ風の小ラベル、
 * 大きな Plan タイトル、短いサブコピー、行き先／時期の pill、右側に夕日・波・スタンプ風の
 * 抽象イラスト（SVG のみ・写真なし）。
 *
 * 表示するのは実データだけ：plan.title と、stated の city / departureTiming。
 * どちらも無ければ穏やかな UI fallback pill を出す（具体値は創作しない）。
 * "TRAVEL PLAN" は固定の decorative ラベルで、データではない。
 * 装飾（テープ・イラスト）はすべて aria-hidden、テキストの可読性を最優先。
 * hooks を持たない純粋表示コンポーネント。
 */
export default function PlanTravelHero({
  title,
  city,
  departureTiming,
}: {
  title: string;
  city: string | null;
  departureTiming: string | null;
}) {
  const hasChips = Boolean(city || departureTiming);

  return (
    <div className="relative overflow-hidden rounded-[24px] border border-[#e7ddc9] bg-[#fdfbf4] shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
      {/* 右側の夕日・波・スタンプ（装飾） */}
      <svg
        aria-hidden
        viewBox="0 0 320 260"
        preserveAspectRatio="xMaxYMid slice"
        className="pointer-events-none absolute right-0 top-0 h-full w-[58%]"
      >
        <g fill="none" stroke="#e0806a" strokeWidth="2" opacity="0.55">
          <path d="M60 175a70 70 0 0 1 140 0" />
          <path d="M85 175a45 45 0 0 1 90 0" />
          <circle cx="130" cy="175" r="22" fill="#e8a08b" stroke="none" opacity="0.6" />
        </g>
        <g fill="none" stroke="#7d94b5" strokeWidth="2" opacity="0.5" strokeLinecap="round">
          <path d="M-10 196c30-14 55 14 85 0s55-14 85 0 55 14 85 0 55-14 85 0" />
          <path d="M-10 214c30-12 55 12 85 0s55-12 85 0 55 12 85 0 55-12 85 0" />
          <path d="M-10 232c30-10 55 10 85 0s55-10 85 0 55 10 85 0 55-10 85 0" />
        </g>
        <g transform="translate(232 40) rotate(9)">
          <rect x="0" y="0" width="46" height="46" rx="3" fill="none" stroke="#8a9a86" strokeWidth="1.5" strokeDasharray="3 3" />
          <path d="M8 30l30-11-11 30-5-13-14-6Z" fill="none" stroke="#8a9a86" strokeWidth="1.5" strokeLinejoin="round" />
        </g>
      </svg>
      {/* 文字を読みやすくする横グラデーション */}
      <span
        aria-hidden
        className="absolute inset-0 bg-gradient-to-r from-[#fdfbf4] via-[#fdfbf4]/90 to-[#fdfbf4]/10"
      />

      {/* マスキングテープ風ラベル（固定 decorative） */}
      <span
        aria-hidden
        className="absolute left-6 top-0 -translate-y-1/2 -rotate-3 rounded-[2px] bg-[#9db2cd]/60 px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-[#2b3a55]"
      >
        TRAVEL PLAN
      </span>

      <div className="relative p-6 sm:max-w-[64%] sm:p-8 lg:p-10">
        <h1 className="text-2xl font-bold leading-tight text-[#2b3a55] sm:text-3xl lg:text-[2.4rem]">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[#6b6357] sm:text-[15px]">
          このページから、AI相談・Worksheet・Documents を続けていけます。
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {!hasChips && (
            <span className="rounded-full bg-white/80 px-3 py-1 text-xs text-[#8b857a] ring-1 ring-[#e7ddc9]">
              行き先・時期はこれから整理
            </span>
          )}
          {city && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-[#2b3a55] ring-1 ring-[#e7ddc9]">
              <span aria-hidden>📍</span>
              {city}
            </span>
          )}
          {departureTiming && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-[#2b3a55] ring-1 ring-[#e7ddc9]">
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="12" cy="12" r="8" />
                <path d="M12 8v4l2.5 2.5" />
              </svg>
              出発の目安：{departureTiming}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
