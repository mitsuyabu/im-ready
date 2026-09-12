/**
 * My Karte トップの上部（presentation のみ）。
 *
 * 落ち着いた editorial workspace に寄せ、装飾は持たない:
 *   - 大きな "My Karte"（左揃え）＋ subcopy
 *   - その下に静かな Plan context（`CURRENT PLAN` ラベル ＋ plan.title のテキストのみ）
 *   - 右上は余白。資料が 1 つでもあるときだけ、機能的情報として最終更新を小さく置く
 *
 * 手描き装飾・吹き出し・星・波線・マスキングテープ・方眼紙ラベル・decorative copy は置かない。
 * Plan ラベルに出すのは **実際の plan.title だけ**（国旗・国名・留学タイプは作らない）。
 * hooks を持たない純粋表示コンポーネント。
 */
export default function DocumentsWorkspaceHeader({
  planTitle,
  lastUpdatedText = null,
}: {
  planTitle: string;
  /** 資料がある場合のみ、formatLastUpdated 済みテキスト。無ければ null（右上は余白のまま）。 */
  lastUpdatedText?: string | null;
}) {
  const title = planTitle.trim();
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-[30px] font-bold leading-[1.1] tracking-tight text-worksheet-primary sm:text-[38px] lg:text-[44px]">
          My Karte
        </h1>
        <p className="mt-2 max-w-[42rem] text-[15px] leading-[1.7] text-[#57534c] sm:text-base">
          留学について考えたことや計画を、少しずつ整理していきます。
        </p>

        {title.length > 0 && (
          <div className="mt-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#9a948a]">
              Current Plan
            </p>
            <p className="mt-0.5 text-[15px] font-medium leading-snug text-[#3f3a34] sm:text-base">
              {title}
            </p>
          </div>
        )}
      </div>

      {lastUpdatedText && (
        <p className="shrink-0 pt-1 text-[12px] text-[#8e887e]">最終更新: {lastUpdatedText}</p>
      )}
    </div>
  );
}
