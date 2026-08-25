import { getKarteSummaryItems, type Karte } from "@/lib/karte";

type KarteSummaryProps = {
  karte: Karte;
  onConfirm: () => void;
  onRequestCorrection: () => void;
  onSkip: () => void;
};

export default function KarteSummary({
  karte,
  onConfirm,
  onRequestCorrection,
  onSkip,
}: KarteSummaryProps) {
  const items = getKarteSummaryItems(karte);

  return (
    <div className="mx-4 mb-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm dark:border-blue-900 dark:bg-blue-950">
      <p className="mb-2 font-semibold text-blue-900 dark:text-blue-200">
        ここまでの内容を確認させてください
      </p>

      {items.length === 0 ? (
        <p className="text-blue-800 dark:text-blue-300">
          まだ十分な情報が集まっていません。会話を続けてください。
        </p>
      ) : (
        <dl className="space-y-1.5">
          {items.map((item) => (
            <div key={`${item.block}.${item.key}`} className="flex flex-col sm:flex-row sm:gap-2">
              <dt className="shrink-0 text-xs font-medium text-blue-700 dark:text-blue-400 sm:w-36">
                {item.label}
              </dt>
              <dd className="text-blue-950 dark:text-blue-100">
                <span className={item.certainty === "inferred" ? "italic" : undefined}>
                  {item.value}
                </span>
                {item.certainty === "inferred" && (
                  <span className="ml-1.5 text-xs text-blue-600 dark:text-blue-400">
                    （こういう理解で合っていますか？）
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <p className="mt-3 text-xs text-blue-700 dark:text-blue-400">
        認識のズレがあれば教えてください。問題なければ「間違いありません」を押してください。
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          間違いありません
        </button>
        <button
          type="button"
          onClick={onRequestCorrection}
          className="rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:bg-transparent dark:text-blue-300 dark:hover:bg-blue-900"
        >
          修正したい点がある
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="ml-1 px-1.5 py-1.5 text-xs text-blue-700/70 underline decoration-blue-300 decoration-dotted underline-offset-2 hover:text-blue-900 dark:text-blue-400/70 dark:decoration-blue-700 dark:hover:text-blue-200"
        >
          まだ話したいことがある
        </button>
      </div>
    </div>
  );
}
