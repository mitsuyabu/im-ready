/**
 * Plan 選択後トップの「いまの現在地」ステップ表示（presentation のみ）。
 * 共有デザインに寄せて、方眼紙の帯・低い高さ・両端が少し破れた形。大きな角丸カード感は出さない。
 *
 * 4 フェーズを横一列の点で示し、**1 つだけ**を sage の輪＋点で「いまここ」とする。
 * 進捗バーの塗り・チェックマーク・「N/4 完了」・段階の説明文（キャプション）は出さない
 * （読み上げ用に sr-only の「（いまここ）」だけ残す）。
 *
 * currentIndex は呼び出し側が既存の stated 情報だけから素朴に決める（0 か 1 のみ・後述）。
 * hooks を持たない純粋表示コンポーネント。
 */

const STEPS = ["気持ちを整理", "学校を比べる", "出発準備", "現地で暮らす"];

export default function PlanJourneyRibbon({ currentIndex }: { currentIndex: number }) {
  const idx = Math.min(Math.max(Math.trunc(currentIndex), 0), STEPS.length - 1);

  return (
    <section
      aria-label="いまの現在地"
      className="relative border-y border-[#d9d2c0] bg-[#fcfbf6] px-5 py-4 sm:px-7"
      style={{
        backgroundImage:
          "repeating-linear-gradient(0deg, transparent, transparent 15px, rgba(0,0,0,0.035) 16px), repeating-linear-gradient(90deg, transparent, transparent 15px, rgba(0,0,0,0.035) 16px)",
        clipPath: "polygon(0 3px, 100% 0, calc(100% - 3px) 100%, 3px calc(100% - 4px))",
      }}
    >
      <h2 className="text-xs font-bold tracking-wide text-[#3f3d38]">いまの現在地</h2>

      <div className="relative mt-3">
        <span
          aria-hidden
          className="absolute left-[12.5%] right-[12.5%] top-[7px] border-t border-[#9a9384]"
        />
        <ol className="relative grid grid-cols-4 gap-2">
          {STEPS.map((label, i) => {
            const current = i === idx;
            return (
              <li key={label} className="flex flex-col items-center text-center">
                <span
                  aria-hidden
                  className={
                    current
                      ? "flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-[#8a9a86] ring-offset-1 ring-offset-[#fcfbf6]"
                      : "h-3.5 w-3.5 rounded-full border border-[#8b857a] bg-white"
                  }
                >
                  {current && <span className="h-2 w-2 rounded-full bg-[#8a9a86]" />}
                </span>
                <span
                  className={`mt-2 text-[11px] leading-tight sm:text-xs ${
                    current ? "font-semibold text-[#2b3a55]" : "text-[#8b857a]"
                  }`}
                >
                  {label}
                  {current && <span className="sr-only">（いまここ）</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
