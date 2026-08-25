/**
 * LP専用の軽量mock。実際のMy Plan（components/MyPlan.tsx・lib/karte.ts）のロジック・型には
 * 依存せず、Plan Summaryの見た目だけをサンプルとして静的に再現する。
 * certainty表現（確定/検討中）も、実データではなく見せ方のサンプルとして固定文言で表示する。
 */
const SAMPLE_FACTS: { label: string; value: string; certainty: "確定" | "検討中" }[] = [
  { label: "希望都市", value: "シドニー", certainty: "検討中" },
  { label: "渡航時期", value: "来年の春ごろ", certainty: "検討中" },
  { label: "期間", value: "1年間", certainty: "確定" },
];

export default function MyPlanMockVisual() {
  return (
    <div className="w-full rounded-2xl border border-worksheet-border bg-worksheet-surface p-5 sm:p-6">
      <p className="text-sm font-semibold text-worksheet-primary">あなたのPlan（サンプル）</p>
      <div className="mt-4 divide-y divide-worksheet-border">
        {SAMPLE_FACTS.map((fact) => (
          <div key={fact.label} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="text-xs text-worksheet-secondary">{fact.label}</p>
              <p className="truncate text-sm text-worksheet-primary">{fact.value}</p>
            </div>
            <span className="shrink-0 rounded-full bg-worksheet-sage px-2.5 py-0.5 text-[10px] text-worksheet-primary">
              {fact.certainty}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
