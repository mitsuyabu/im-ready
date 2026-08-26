/**
 * LP専用の軽量mock。実際のMy Plan（components/MyPlan.tsx・lib/karte.ts）のロジック・型には
 * 依存しない。淡いsage系のトーン（既存ブランドのsageをそのまま利用）で、Plan Summaryの
 * 見た目をサンプルとして再現する。certainty表現（確定/検討中）も、実データではなく
 * 見せ方のサンプルとして固定文言で表示する。
 */
const SAMPLE_FACTS: { label: string; value: string; certainty: "確定" | "検討中" }[] = [
  { label: "Why?", value: "新しい環境で挑戦したい", certainty: "検討中" },
  { label: "Budget", value: "1年で約250万円", certainty: "検討中" },
  { label: "City", value: "シドニー", certainty: "検討中" },
  { label: "Decision", value: "来年の春ごろに渡航", certainty: "確定" },
];

export default function MyPlanMockVisual() {
  return (
    <div className="relative w-full rounded-3xl bg-worksheet-sage/40 p-6 pb-10 sm:p-8 sm:pb-12">
      <div className="rounded-2xl border border-worksheet-sage bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm font-semibold text-worksheet-primary sm:text-base">あなたのPlan（サンプル）</p>
        <div className="mt-3 divide-y divide-worksheet-border">
          {SAMPLE_FACTS.map((fact) => (
            <div key={fact.label} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs text-worksheet-secondary">{fact.label}</p>
                <p className="truncate text-sm text-worksheet-primary sm:text-base">{fact.value}</p>
              </div>
              <span className="shrink-0 rounded-full bg-worksheet-sage px-2.5 py-0.5 text-[10px] font-medium text-worksheet-primary">
                {fact.certainty}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 少しずつ育っていく、というニュアンスの小さな浮きchip */}
      <div className="absolute -bottom-3 right-6 flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-worksheet-primary shadow-md sm:right-8">
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
        Planが少しずつ育っていく
      </div>
    </div>
  );
}
