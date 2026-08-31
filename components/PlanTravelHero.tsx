/**
 * Plan 選択後トップのヒーロー（presentation のみ）。共有デザインの「紙を重ねたコラージュ／旅の
 * しおり」感にできる限り寄せる：
 *   deep navy の地 → 大きく手でちぎったような生成り紙 → 上辺にサーモンのちぎり紙 →
 *   下部右寄りに水色のちぎり紙／波 → 右に夕日・短い放射線・波線・ヤシ → 右上に消印スタンプ →
 *   左に手描きの星 → 右下に方眼テープ → 左上に少し傾いたテープ風ラベル → 全体に薄い紙ノイズ。
 *
 * ちぎれた縁は clip-path ＋ SVG feDisplacementMap（#pth-torn）で有機的に荒らす。紙ノイズは
 * data-URI の feTurbulence を低 opacity で重ねる（外部画像なし）。装飾はすべて aria-hidden・
 * pointer-events-none で、本文は生成り紙の上に置いて可読性を最優先する。
 *
 * 表示する実データは plan.title と stated の city / departureTiming だけ。どちらも無ければ
 * 穏やかな UI fallback pill を 1 つ。"MY PLAN" は固定 decorative ラベル（国名・WH 等は創作しない）。
 * hooks を持たない純粋表示コンポーネント。
 */

const PAPER_TORN =
  "polygon(0 8px, 6% 2px, 13% 11px, 21% 3px, 29% 12px, 37% 4px, 46% 11px, 55% 2px, 64% 13px, 73% 4px, 82% 10px, 91% 2px, 100% 9px, calc(100% - 6px) 22%, 100% 40%, calc(100% - 7px) 58%, 100% 76%, calc(100% - 5px) 92%, 100% 100%, 88% calc(100% - 6px), 72% 100%, 58% calc(100% - 7px), 42% 100%, 28% calc(100% - 6px), 12% 100%, 0 calc(100% - 5px), 6px 80%, 0 62%, 7px 44%, 0 26%, 5px 12%)";

const SALMON_TORN =
  "polygon(0 0, 100% 0, 100% 46%, 92% 74%, 84% 100%, 74% 62%, 66% 92%, 55% 55%, 46% 96%, 37% 58%, 28% 100%, 19% 66%, 10% 100%, 0 70%)";

const WAVE_TORN =
  "polygon(0 44%, 9% 20%, 18% 48%, 28% 14%, 38% 46%, 48% 12%, 58% 44%, 68% 16%, 78% 46%, 88% 18%, 100% 40%, 100% 100%, 0 100%)";

/** 薄い紙ノイズ（feTurbulence を data-URI 化）。overlay で低 opacity 合成する。 */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

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
  const chipClass =
    "inline-flex items-center gap-1 rounded-full border border-[#2b2a27]/20 bg-white/85 px-2.5 py-1 text-[11px] font-medium text-[#1f2430]";

  return (
    <div className="relative overflow-hidden rounded-[24px] bg-[#223650]">
      {/* ちぎれ縁を荒らす SVG フィルタ定義 */}
      <svg aria-hidden width="0" height="0" className="absolute">
        <defs>
          <filter id="pth-torn" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.018 0.05" numOctaves="3" seed="7" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      <div className="relative min-h-[248px] sm:min-h-[280px]">
        {/* 夕日・短い放射線・波線・ヤシ（右側） */}
        <svg
          aria-hidden
          viewBox="0 0 240 240"
          preserveAspectRatio="xMidYMid slice"
          className="pointer-events-none absolute right-0 top-0 h-full w-[46%] opacity-60 sm:w-[36%] sm:opacity-95"
        >
          {/* 夕日 */}
          <circle cx="112" cy="128" r="30" fill="#e8a486" opacity="0.5" />
          <g stroke="#e8a486" strokeWidth="2.6" strokeLinecap="round" opacity="0.75">
            <path d="M112 84v-11M132 92l7-8M92 92l-7-8M148 108l10-6M76 108l-10-6" />
          </g>
          {/* 波線（手描き風・水平） */}
          <g stroke="#7d94b5" strokeWidth="2.6" fill="none" strokeLinecap="round" opacity="0.8">
            <path d="M-6 184c26-12 48 10 74 2s50-10 76 0 44 8 70-2" />
            <path d="M-6 202c26-10 48 8 74 0s50-8 76 2 44 6 70-2" />
            <path d="M-6 220c26-8 48 8 74 2s50-8 76 0 44 6 70-2" />
          </g>
          {/* ヤシ（夕日の右） */}
          <g stroke="#8a9a86" strokeWidth="2.4" fill="none" strokeLinecap="round">
            <path d="M182 210c-2-22-3-40-2-56" />
            <path d="M180 154c-14-8-24-6-32 2M180 154c14-9 26-8 34 1M180 154c-7-15-6-27 2-37M180 154c9-13 21-16 33-12" opacity="0.9" />
          </g>
        </svg>

        {/* 右上の消印スタンプ（少し存在感を出す） */}
        <svg
          aria-hidden
          viewBox="0 0 96 68"
          className="pointer-events-none absolute right-2 top-2 hidden h-[70px] w-28 -rotate-3 text-[#a9b6c8] sm:block"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <rect x="4" y="4" width="88" height="60" rx="3" strokeDasharray="4 3" />
          <path d="M12 24c8-6 16 6 24 0s16-6 24 0 16 6 24 0" />
          <path d="M12 34c8-6 16 6 24 0s16-6 24 0 16 6 24 0" />
          <path d="M12 44c8-6 16 6 24 0s16-6 24 0 16 6 24 0" />
          <path d="M34 12l24-4-6 22-4-9-14-9Z" strokeLinejoin="round" opacity="0.9" />
        </svg>

        {/* 左の手描き星 */}
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-3 top-6 h-7 w-7 -rotate-6 text-[#cdd6e2] sm:left-4 sm:top-8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        >
          <path d="M12 3l2.4 5.6 6 .6-4.5 4 1.3 5.9L12 21l-5.2 3.1 1.3-5.9-4.5-4 6-.6L12 3z" />
        </svg>

        {/* 読みやすさ用の横グラデーション（navy → 透明） */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#223650] via-[#223650]/8 to-transparent"
        />

        {/* 下部右寄りの水色ちぎり紙／波（大きな面） */}
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-1 left-[8%] h-12 w-[70%] bg-[#7d94b5]/45 sm:left-auto sm:right-[8%] sm:w-[52%]"
          style={{ clipPath: WAVE_TORN, filter: "url(#pth-torn)" }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-1 left-[22%] h-9 w-[52%] bg-[#dce9f5]/55 sm:left-auto sm:right-[12%] sm:w-[40%]"
          style={{ clipPath: WAVE_TORN, filter: "url(#pth-torn)" }}
        />

        {/* 大きく手でちぎった生成り紙（わずかに傾け・落ち影） */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-3 left-[3%] right-[6%] -rotate-[0.6deg] bg-gradient-to-br from-[#fefdf6] to-[#f6efdf] sm:left-[5%] sm:right-[30%]"
          style={{
            clipPath: PAPER_TORN,
            filter: "url(#pth-torn) drop-shadow(0 8px 16px rgba(0,0,0,0.34))",
          }}
        />

        {/* 上辺のサーモンちぎり紙 */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-[8%] top-0 h-7 w-[46%] rotate-1 bg-[#e9987b]/70 sm:w-[30%]"
          style={{ clipPath: SALMON_TORN, filter: "url(#pth-torn)" }}
        />

        {/* 全体の薄い紙ノイズ */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06] mix-blend-overlay"
          style={{ backgroundImage: GRAIN }}
        />

        {/* 右下の方眼テープ（斜め） */}
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-4 right-4 hidden h-9 w-24 -rotate-[7deg] border border-[#d8cfb8] bg-[#fbf7ea] shadow-[0_1px_3px_rgba(0,0,0,0.18)] sm:block"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 6px, rgba(0,0,0,0.06) 7px), repeating-linear-gradient(90deg, transparent, transparent 6px, rgba(0,0,0,0.06) 7px)",
          }}
        />

        {/* 左上のテープ風ラベル（小さめ・少し黄み・傾き・淡い影） */}
        <span
          aria-hidden
          className="absolute left-4 top-4 z-10 -rotate-2 bg-[#f4e7c4] px-2 py-0.5 text-[9px] font-semibold tracking-[0.18em] text-[#4a3f22] shadow-[0_1px_2px_rgba(0,0,0,0.2)] sm:left-[5%]"
          style={{ clipPath: "polygon(0 26%, 6% 0, 92% 8%, 100% 76%, 94% 100%, 4% 90%)" }}
        >
          MY PLAN
        </span>

        {/* 本文（生成り紙の上・左寄せ・余白たっぷり） */}
        <div className="relative z-10 flex min-h-[248px] flex-col justify-center px-5 py-12 sm:min-h-[280px] sm:py-14 sm:pl-[8%] sm:pr-[38%]">
          <h1 className="text-[1.9rem] font-bold leading-[1.08] tracking-tight text-[#182233] sm:text-4xl lg:text-[3.2rem]">
            {title}
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-[#4a4740] sm:text-[15px]">
            このPlanの条件や考えを整理していこう。
          </p>

          <div className="mt-5 flex flex-wrap gap-2.5">
            {!hasChips && (
              <span className="rounded-full border border-[#2b2a27]/20 bg-white/85 px-2.5 py-1 text-[11px] text-[#3f3d38]">
                行き先・時期はこれから整理
              </span>
            )}
            {city && (
              <span className={chipClass}>
                <svg
                  viewBox="0 0 24 24"
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" />
                  <circle cx="12" cy="9" r="2.5" />
                </svg>
                {city}
              </span>
            )}
            {departureTiming && (
              <span className={chipClass}>
                <svg
                  viewBox="0 0 24 24"
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
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
    </div>
  );
}
