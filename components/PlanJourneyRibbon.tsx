/**
 * Plan 選択後トップの「いまの現在地」ステップ表示（presentation のみ）。
 *
 * 新しいデザイン方針に合わせて、方眼紙の地紋・破れた縁をやめ、白いカードの上に
 * 「細いライン ＋ 4 つの点」だけを置く静かな帯にしている。
 *
 * 状態の示し方（**色だけで区別させない**）:
 *   - 済んだ段階   … 黒い丸 ＋ 白いチェック
 *   - いまの段階   … 蛍光ライムの丸 ＋ 中央の黒い点 ＋ 外側のリング、ラベルは太字 + 「（いまここ）」
 *   - これからの段階 … 白い丸 ＋ 細いグレーの枠、ラベルはグレー
 * 進捗ラインも「いまここ」までだけ蛍光ライムにし、その先はグレーのまま。
 *
 * currentIndex は呼び出し側が既存の stated 情報だけから素朴に決める（0 か 1 のみ）。
 * 判定ロジック・ステージ構造・ラベルは変更していない。hooks を持たない純粋表示コンポーネント。
 */

const STEPS = ["気持ちを整理", "学校を比べる", "出発準備", "現地で暮らす"];

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-[11px] w-[11px]" fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
    </svg>
  );
}

export default function PlanJourneyRibbon({ currentIndex }: { currentIndex: number }) {
  const idx = Math.min(Math.max(Math.trunc(currentIndex), 0), STEPS.length - 1);
  /** 進捗ラインを伸ばす先（点の中心は各列の中央 = (i + 0.5) / 4）。 */
  const progressRight = 100 - ((idx + 0.5) / STEPS.length) * 100;

  return (
    <section aria-label="現在地" className="mk-card mk-card-sm px-5 py-4 sm:px-6">
      <h2 className="mk-eyebrow">現在地</h2>

      <div className="relative mt-3.5">
        {/* 全体のライン（これから）と、いまここまでのライン（蛍光ライム）を重ねる。 */}
        <span
          aria-hidden
          className="absolute left-[12.5%] right-[12.5%] top-[9px] border-t border-[var(--mk-border)]"
        />
        <span
          aria-hidden
          className="absolute left-[12.5%] top-[8px] h-[2px] rounded-full bg-[var(--neon-lime)]"
          style={{ right: `${progressRight}%` }}
        />
        <ol className="relative grid grid-cols-4 gap-2">
          {STEPS.map((label, i) => {
            const done = i < idx;
            const current = i === idx;
            return (
              <li key={label} className="flex flex-col items-center text-center">
                <span
                  aria-hidden
                  className={
                    current
                      ? "flex h-5 w-5 items-center justify-center rounded-full bg-[var(--neon-lime)] ring-2 ring-[var(--neon-lime-soft)]"
                      : done
                        ? "flex h-5 w-5 items-center justify-center rounded-full bg-[var(--mk-ink)]"
                        : "flex h-5 w-5 items-center justify-center rounded-full border border-[var(--mk-border)] bg-white"
                  }
                >
                  {current && <span className="h-[7px] w-[7px] rounded-full bg-[var(--neon-ink)]" />}
                  {done && <CheckIcon />}
                </span>
                <span
                  className={`mt-2 text-[11px] leading-tight sm:text-xs ${
                    current
                      ? "font-semibold text-[var(--mk-ink)]"
                      : done
                        ? "font-medium text-[var(--mk-label)]"
                        : "text-[var(--mk-sub)]"
                  }`}
                >
                  {label}
                  {current && <span className="sr-only">（いまここ）</span>}
                  {done && <span className="sr-only">（完了）</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
