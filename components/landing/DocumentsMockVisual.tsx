/**
 * LP専用の仮visual。05「資料にして伝える」の完成画像がまだ支給されていないための暫定表示。
 * 実在する学校名・価格・エージェント名・ratingは一切含めない（サンプル値はダミーと
 * 自然に分かる内容のみ使用）。淡いrose系のトーンで、01〜04（削除済みのmock、または
 * 完成画像）とは異なるaccentにして05だけの印象を作っている。
 *
 * 「AIが資料を作る」ことではなく「整理した内容が、人に伝わるかたちになる」ことを
 * 主役にするため、大きなdocument preview（My Study Abroad Plan）＋相手別の資料カード
 * （For Family / For Counselor / School Comparison）という構成にしている。
 *
 * 将来完成画像が支給されたら、01〜04と同じ「aspect-ratio厳密一致のImageコンポーネント」
 * に置き換える想定。HowItWorksSection.tsx側は該当stepのvisualプロパティを書き換えるだけで
 * 済むよう、このcomponent自体はpropsを持たない単純な構造にしている。
 */
const SAMPLE_FIELDS: { label: string; value: string }[] = [
  { label: "Why", value: "英語を使って海外で生活してみたい" },
  { label: "Plan", value: "Australia / Sydney / 6 months" },
  { label: "Budget", value: "¥1,500,000" },
  { label: "School", value: "3校を比較中" },
];

const SAMPLE_DOCUMENTS = ["For Family", "For Counselor", "School Comparison"];

export default function DocumentsMockVisual() {
  return (
    <div className="w-full rounded-3xl bg-rose-50 p-6 sm:p-8">
      <div className="rounded-2xl border border-rose-100 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-worksheet-primary sm:text-base">My Study Abroad Plan</p>
          <span className="shrink-0 rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-medium text-rose-700 sm:text-xs">
            伝えるための資料に
          </span>
        </div>

        <div className="mt-4 divide-y divide-worksheet-border">
          {SAMPLE_FIELDS.map((field) => (
            <div key={field.label} className="flex items-center justify-between gap-3 py-2.5">
              <p className="text-xs text-worksheet-secondary">{field.label}</p>
              <p className="truncate text-sm text-worksheet-primary sm:text-base">{field.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {SAMPLE_DOCUMENTS.map((label) => (
          <div key={label} className="rounded-xl border border-rose-100 bg-white px-3 py-3 text-center shadow-sm">
            <p className="text-xs font-medium text-worksheet-primary sm:text-sm">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
