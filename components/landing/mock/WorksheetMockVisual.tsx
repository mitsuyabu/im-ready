/**
 * LP専用の軽量mock。実際のWorksheet（components/Worksheet.tsx等）のロジック・componentには
 * 依存せず、テーマカード一覧の見た目だけをサンプルとして静的に再現する。
 */
const SAMPLE_THEMES: { label: string; status: string }[] = [
  { label: "Motivation", status: "3 / 4 問" },
  { label: "Conditions", status: "2 / 5 問" },
  { label: "Timing", status: "未着手" },
  { label: "Concerns", status: "1 / 3 問" },
];

export default function WorksheetMockVisual() {
  return (
    <div className="w-full rounded-2xl border border-worksheet-border bg-worksheet-surface p-5 sm:p-6">
      <div className="grid grid-cols-2 gap-3">
        {SAMPLE_THEMES.map((theme) => (
          <div
            key={theme.label}
            className="rounded-xl border border-worksheet-border bg-worksheet-surface-2 p-3"
          >
            <p className="text-sm font-medium text-worksheet-primary">{theme.label}</p>
            <p className="mt-1 text-xs text-worksheet-secondary">{theme.status}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
