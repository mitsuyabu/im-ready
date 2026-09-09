/**
 * Plan Home Hero 直下の「都市ガイド / Plan サマリー」カード（presentation のみ）。
 *
 * - 上段: 都市の魅力（lib/cityGuide.ts の固定文。対応都市が無ければ null）
 * - 下段: My Plan の plan_blueprint 実データから deterministic に生成した 1 行サマリー
 *         （lib/planSummaryLine.ts。空なら null → 下段は出さない）
 * - description も summary も無ければ、カード自体を描画しない（呼び出し側で null を返す）
 * hooks を持たない純粋表示コンポーネント。fake データは作らない。
 */

function GlobeIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="12" r="9" />
      <path d="M3.5 9h17M3.5 15h17" />
      <path d="M12 3c2.5 2.6 3.8 5.8 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.8-3.8-9S9.5 5.6 12 3Z" />
    </svg>
  );
}

export default function PlanGuideCard({
  description,
  summary,
}: {
  description: string | null;
  summary: string | null;
}) {
  if (!description && !summary) return null;

  return (
    <section className="rounded-[22px] border border-[#e7ddc9] bg-white p-5 shadow-[0_1px_3px_rgba(30,28,24,0.05)] sm:p-7">
      <div className="flex items-start gap-3 sm:gap-4">
        <span
          aria-hidden
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eef2ee] text-[#5b6b7e]"
        >
          <GlobeIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          {description && (
            <p className="text-[16px] font-medium leading-[1.75] text-[#2b3145] sm:text-[17px]">
              {description}
            </p>
          )}
          {summary && (
            <p
              className={`text-[14px] font-medium text-[#7c766b] sm:text-[15px] ${
                description ? "mt-3 border-t border-[#efe9db] pt-3" : ""
              }`}
            >
              {summary}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
