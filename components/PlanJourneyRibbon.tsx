/**
 * Plan 選択後トップの「いまの現在地」ステップ表示（presentation のみ）。
 *
 * 4 つのフェーズを横一列の点で示し、**1 つだけ**を「いまここ」として強調する。
 * 進捗バーの塗り・チェックマーク・「N/4 完了」は出さない（全部埋まっているように見せない）。
 *
 * currentIndex は呼び出し側が既存の stated 情報だけから素朴に決める:
 *   学校候補が提示されている → 2（学校を比べる）
 *   行き先/時期/検討段階のいずれかが stated → 1（条件を整理）
 *   それ以外 → 0（気持ちを整理）
 * データ上の根拠が無い 3（出発の準備）が current になることはない。
 *
 * hooks を持たない純粋表示コンポーネント。
 */

const STEPS = ["気持ちを整理", "条件を整理", "学校を比べる", "出発の準備"];

const CAPTIONS = [
  "いまは、気持ちを整理している段階です。",
  "いまは、行き先や時期などの条件を整理している段階です。",
  "いまは、気になる学校を比べている段階です。",
  "いまは、出発の準備を進めている段階です。",
];

export default function PlanJourneyRibbon({ currentIndex }: { currentIndex: number }) {
  const idx = Math.min(Math.max(Math.trunc(currentIndex), 0), STEPS.length - 1);

  return (
    <section aria-label="いまの現在地">
      <h2 className="text-sm font-semibold tracking-wide text-[#5b5750]">いまの現在地</h2>

      <div className="relative mt-4">
        <span
          aria-hidden
          className="absolute left-[12.5%] right-[12.5%] top-[7px] border-t border-dashed border-[#c7c0b2]"
        />
        <ol className="relative grid grid-cols-4 gap-2">
          {STEPS.map((label, i) => {
            const current = i === idx;
            return (
              <li key={label} className="flex flex-col items-center text-center">
                <span
                  aria-hidden
                  className={`h-4 w-4 rounded-full border-2 ${
                    current ? "border-[#e0806a] bg-[#e0806a]" : "border-[#c7c0b2] bg-[#fdfbf4]"
                  }`}
                />
                <span
                  className={`mt-2 text-xs leading-tight ${
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

      <p className="mt-3 text-xs leading-relaxed text-[#8b857a]">{CAPTIONS[idx]}</p>
    </section>
  );
}
