import { getKarteSummaryItems, type Karte } from "@/lib/karte";

/**
 * ここまでの内容の確認カード。
 *
 * variant:
 *   "default" … /widget など既存の表示（青いカード）。**見た目を一切変えていない**。
 *   "plan"    … Plan Chat 用。My Karte と同じ白いカード＋共通タイポグラフィにし、
 *               「間違いありません」だけを蛍光ライムの主ボタンにする。
 *
 * どちらの variant でも、出す項目（getKarteSummaryItems）・inferred の但し書き・
 * 3 つの操作（確認 / 修正 / あとで）とその挙動は同一で、ロジックは変更していない。
 */
type KarteSummaryProps = {
  karte: Karte;
  onConfirm: () => void;
  onRequestCorrection: () => void;
  onSkip: () => void;
  variant?: "default" | "plan";
};

export default function KarteSummary({
  karte,
  onConfirm,
  onRequestCorrection,
  onSkip,
  variant = "default",
}: KarteSummaryProps) {
  const items = getKarteSummaryItems(karte);

  if (variant === "plan") {
    return (
      <div className="mk-card relative mb-3 overflow-hidden p-4 sm:p-5">
        {/* 上端の細いライン。いま答えてほしいカードであることを、面ではなく線で示す。 */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 top-0 h-[2px]"
          style={{
            background:
              "linear-gradient(90deg, var(--neon-lime) 0%, rgba(216,251,87,0.4) 38%, rgba(216,251,87,0) 70%)",
          }}
        />
        <p className="mk-card-title">ここまでの内容を確認させてください</p>

        {items.length === 0 ? (
          <p className="mk-text mt-3">まだ十分な情報が集まっていません。会話を続けてください。</p>
        ) : (
          <dl className="mt-3 space-y-2.5">
            {items.map((item) => (
              <div key={`${item.block}.${item.key}`} className="flex flex-col sm:flex-row sm:gap-4">
                <dt className="mk-item-label-sm shrink-0 sm:w-36">{item.label}</dt>
                <dd className="min-w-0 text-[15px] leading-[1.7] text-[var(--mk-body)]">
                  <span className={item.certainty === "inferred" ? "italic" : undefined}>
                    {item.value}
                  </span>
                  {item.certainty === "inferred" && (
                    <span className="ml-1.5 text-[13px] text-[var(--mk-sub)]">
                      （こういう理解で合っていますか？）
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}

        <p className="mk-sub-text mt-4">
          認識のズレがあれば教えてください。問題なければ「間違いありません」を押してください。
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* いま押してほしい操作だけ、蛍光ライムの「縁」と小さな点で示す（面では塗らない）。 */}
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-[var(--neon-lime)] bg-[var(--mk-card)] px-4 py-2 text-[14px] font-medium text-[var(--mk-ink)] shadow-[0_0_0_3px_rgba(216,251,87,0.18)] transition-colors duration-150 hover:bg-[var(--neon-lime-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neon-lime)]"
          >
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--neon-lime)]" />
            間違いありません
          </button>
          <button
            type="button"
            onClick={onRequestCorrection}
            className="rounded-full border border-[var(--mk-border)] bg-[var(--mk-card)] px-4 py-2 text-[14px] font-medium text-[var(--mk-ink)] transition-colors duration-150 hover:border-[var(--neon-lime)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neon-lime)]"
          >
            修正したい点がある
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="mk-link px-1.5 py-2 underline decoration-[#c9ccc6] underline-offset-[4px] transition-colors hover:decoration-[var(--mk-ink)]"
          >
            まだ話したいことがある
          </button>
        </div>
      </div>
    );
  }

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
