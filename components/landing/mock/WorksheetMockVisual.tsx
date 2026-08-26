/**
 * LP専用の軽量mock。実際のWorksheet（components/Worksheet.tsx等）のロジック・componentには
 * 依存しない。淡いamber系のトーンで、テーマカードを少し重ねて（overlap + わずかな回転・shadow）
 * 「自分のペースで整理していく」感じを視覚的に伝える。
 */
const SAMPLE_THEMES: { label: string; status: string; rotate: string }[] = [
  { label: "Why?", status: "3 / 4 問", rotate: "-rotate-2" },
  { label: "Conditions", status: "2 / 5 問", rotate: "rotate-1" },
  { label: "Worries", status: "未着手", rotate: "-rotate-1" },
  { label: "Priority", status: "1 / 3 問", rotate: "rotate-2" },
];

export default function WorksheetMockVisual() {
  return (
    <div className="w-full rounded-3xl bg-amber-50 p-6 sm:p-8">
      <div className="grid grid-cols-2 gap-4 sm:gap-5">
        {SAMPLE_THEMES.map((theme) => (
          <div
            key={theme.label}
            className={`rounded-2xl border border-amber-100 bg-white p-4 shadow-sm transition-transform duration-150 hover:-translate-y-0.5 hover:rotate-0 sm:p-5 ${theme.rotate}`}
          >
            <p className="text-sm font-semibold text-worksheet-primary sm:text-base">{theme.label}</p>
            <p className="mt-1.5 text-xs font-medium text-amber-700 sm:text-sm">{theme.status}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
