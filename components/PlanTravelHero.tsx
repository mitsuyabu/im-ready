/**
 * Plan 選択後トップのヒーロー（presentation のみ）。共有デザインのコラージュ構図に寄せる：
 *   deep navy の地 ／ 中央に破れた縁のアイボリー紙 ／ 上部中央に salmon の破れ帯 ／
 *   下部に dusty blue の破れ帯（波にも見える）／ 右側に夕日・波・ヤシの木 ／
 *   右上に passport スタンプ ／ 左に手描きの星 ／ 右下に方眼紙テープ ／ 左上に破れた小紙ラベル。
 *
 * 破れた縁は外部画像を使わず CSS の clip-path で近似する。装飾はすべて aria-hidden・
 * pointer-events-none で、テキストの可読性を最優先（本文はアイボリー紙の上に置く）。
 *
 * 表示する実データは plan.title と stated の city / departureTiming だけ。
 * どちらも無ければ穏やかな UI fallback pill を 1 つ出す（具体値は創作しない）。
 * "MY PLAN" は固定の decorative ラベルでデータではない。サブコピーも一般的な UI 文言。
 * hooks を持たない純粋表示コンポーネント。
 */

const PAPER_TORN =
  "polygon(0% 5px, 22% 0px, 46% 6px, 68% 1px, 88% 5px, 100% 2px, calc(100% - 4px) 26%, 100% 52%, calc(100% - 5px) 80%, 100% 100%, 80% calc(100% - 5px), 56% 100%, 32% calc(100% - 6px), 12% 100%, 0% calc(100% - 4px), 5px 74%, 0% 44%, 4px 18%)";

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
    "inline-flex items-center gap-1 rounded-full border border-[#2b2a27]/25 bg-white/75 px-3 py-1 text-xs font-medium text-[#1f2430]";

  return (
    <div className="relative overflow-hidden rounded-[24px] bg-[#243852]">
      <div className="relative min-h-[240px] sm:min-h-[264px]">
        {/* 左の星（navy 側） */}
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-3 top-6 h-6 w-6 text-[#c9d2e0] sm:left-4 sm:top-9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        >
          <path d="M12 3v18M3 12h18M6 6l12 12M18 6L6 18" />
        </svg>

        {/* 右上の passport スタンプ */}
        <svg
          aria-hidden
          viewBox="0 0 84 60"
          className="pointer-events-none absolute right-3 top-3 hidden h-16 w-24 text-[#8ea0b8] sm:block"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
        >
          <rect x="3" y="4" width="78" height="52" rx="2" strokeDasharray="3 3" />
          <path d="M12 44c8-6 16 6 24 0s16-6 24 0" opacity="0.8" />
          <path d="M12 50c8-6 16 6 24 0s16-6 24 0" opacity="0.8" />
          <path d="M30 16l24-8-8 24-4-10-12-6Z" strokeLinejoin="round" />
        </svg>

        {/* 夕日・波・ヤシ（右側） */}
        <svg
          aria-hidden
          viewBox="0 0 220 240"
          preserveAspectRatio="xMidYMid slice"
          className="pointer-events-none absolute right-0 top-0 h-full w-[42%] opacity-70 sm:w-[34%] sm:opacity-95"
        >
          <g stroke="#e8a486" strokeWidth="2.4" fill="none" strokeLinecap="round">
            <circle cx="120" cy="150" r="26" fill="#e8a486" opacity="0.55" stroke="none" />
            <path d="M120 108v-14M120 206v14M62 150H48M192 150h14M79 109l-10-10M161 191l10 10M161 109l10-10M79 191l-10 10" opacity="0.7" />
          </g>
          <g stroke="#7d94b5" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.75">
            <path d="M-10 186c28-14 52 14 80 0s52-14 80 0 52 14 80 0" />
            <path d="M-10 204c28-12 52 12 80 0s52-12 80 0 52 12 80 0" />
            <path d="M-10 222c28-10 52 10 80 0s52-10 80 0 52 10 80 0" />
          </g>
          <g stroke="#8a9a86" strokeWidth="2.2" fill="none" strokeLinecap="round">
            <path d="M40 210V150" />
            <path d="M40 150c-16-6-26-2-34 8M40 150c16-8 28-6 36 4M40 150c-8-16-6-28 2-38M40 150c10-12 22-14 34-10M40 150c-12 10-16 22-12 34" opacity="0.85" />
          </g>
        </svg>

        {/* 文字を読みやすくする横グラデーション（navy 側から paper へ） */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#243852] via-[#243852]/10 to-transparent"
        />

        {/* 中央の破れたアイボリー紙 */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-3 left-[4%] right-[6%] bg-[#fdfbf2] sm:left-[6%] sm:right-[30%]"
          style={{ clipPath: PAPER_TORN }}
        />

        {/* 上部中央の salmon 破れ帯 */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-[9%] top-1 h-6 w-[42%] bg-[#e8a486]/75 sm:w-[30%]"
          style={{
            clipPath:
              "polygon(0 0,100% 0,100% 55%, 86% 100%, 62% 52%, 40% 100%, 18% 58%, 0 100%)",
          }}
        />

        {/* 下部の dusty blue 破れ帯（波にも見える） */}
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-2 left-[5%] h-8 w-[62%] bg-[#7d94b5]/55 sm:w-[44%]"
          style={{
            clipPath: "polygon(0 42%, 16% 0, 40% 46%, 62% 6%, 84% 42%, 100% 2%, 100% 100%, 0 100%)",
          }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-2 left-[18%] h-6 w-[46%] bg-[#9db2cd]/45 sm:w-[32%]"
          style={{
            clipPath: "polygon(0 52%, 20% 12%, 46% 52%, 70% 14%, 100% 46%, 100% 100%, 0 100%)",
          }}
        />

        {/* 右下の方眼紙テープ */}
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-5 right-4 hidden h-10 w-24 -rotate-6 border border-[#d8cfb8] bg-[#fbf7ea] sm:block"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 6px, rgba(0,0,0,0.06) 7px), repeating-linear-gradient(90deg, transparent, transparent 6px, rgba(0,0,0,0.06) 7px)",
          }}
        />

        {/* 左上の破れた小紙ラベル（固定 decorative） */}
        <span
          aria-hidden
          className="absolute left-4 top-3 z-10 -rotate-3 bg-[#fdfbf2] px-2.5 py-1 text-[10px] font-bold tracking-[0.2em] text-[#243852] sm:left-[5%]"
          style={{ clipPath: "polygon(0 22%, 8% 0, 96% 6%, 100% 82%, 92% 100%, 4% 92%)" }}
        >
          MY PLAN
        </span>

        {/* 本文（アイボリー紙の上） */}
        <div className="relative z-10 flex min-h-[240px] flex-col justify-center px-5 py-9 sm:min-h-[264px] sm:py-10 sm:pl-[8%] sm:pr-[36%]">
          <h1 className="text-3xl font-bold leading-tight text-[#1f2430] sm:text-4xl lg:text-5xl">
            {title}
          </h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-[#4a4740] sm:text-[15px]">
            このPlanの条件や考えを整理していこう。
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {!hasChips && (
              <span className="rounded-full border border-[#2b2a27]/25 bg-white/75 px-3 py-1 text-xs text-[#3f3d38]">
                行き先・時期はこれから整理
              </span>
            )}
            {city && (
              <span className={chipClass}>
                <span aria-hidden>📍</span>
                {city}
              </span>
            )}
            {departureTiming && (
              <span className={chipClass}>
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
    </div>
  );
}
