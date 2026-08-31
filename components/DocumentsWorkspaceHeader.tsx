/**
 * Documents トップの上部（presentation のみ）:
 *   右上に手描き風の decorative message（Desktop のみ）
 *   大きな bold sans の "My Study Abroad"
 *   日本語 subcopy（固定）
 *   現在の Plan title を graph-paper 風の紙ラベルで表示（＋ マスキングテープ ＋ "your next chapter"）
 *
 * Plan ラベルに出すのは **実際の plan.title だけ**。国旗・国名・留学タイプは作らない（§11）。
 * "your next chapter" と右上メッセージは UI 固定の decorative copy で、ユーザーデータではない。
 * 装飾（テープ・下線・楕円・星）はすべて aria-hidden、テキストの可読性を邪魔しない位置に置く。
 * hooks を持たない純粋表示コンポーネント。
 */
export default function DocumentsWorkspaceHeader({ planTitle }: { planTitle: string }) {
  return (
    <div className="relative">
      {/* 右上 decorative message（Desktop のみ・装飾） */}
      <div aria-hidden className="pointer-events-none absolute -top-3 right-0 hidden lg:block">
        <div className="relative rotate-2">
          <svg viewBox="0 0 210 74" className="w-56 text-[#8a9a86]">
            <ellipse
              cx="105"
              cy="37"
              rx="100"
              ry="32"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray="2 3"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center px-7 text-center text-xs font-medium text-[#5f6b5a]">
            小さな一歩が、未来の自分をつくる！
          </span>
          <svg
            viewBox="0 0 24 24"
            className="absolute -right-1 -top-1 h-4 w-4 text-[#e07a5f]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            <path d="M12 4v16M4 12h16M6.5 6.5l11 11M17.5 6.5l-11 11" />
          </svg>
        </div>
      </div>

      <h1 className="text-3xl font-bold tracking-tight text-worksheet-primary sm:text-4xl lg:text-5xl">
        My Study Abroad
      </h1>
      <p className="mt-2 text-sm text-worksheet-secondary">
        留学について考えたことを、少しずつ形にしていきます。
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-x-3 gap-y-2">
        <div className="relative">
          {/* マスキングテープ */}
          <span
            aria-hidden
            className="absolute -left-3 -top-2 h-5 w-12 -rotate-12 rounded-[2px] bg-worksheet-sage/60"
          />
          <span
            className="relative inline-block -rotate-1 rounded-[6px] border border-black/10 bg-[#fdfcf6] px-3 py-1.5 text-sm font-medium text-worksheet-primary shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, transparent, transparent 11px, rgba(0,0,0,0.045) 12px), repeating-linear-gradient(90deg, transparent, transparent 11px, rgba(0,0,0,0.045) 12px)",
            }}
          >
            {planTitle}
          </span>
        </div>

        <span aria-hidden className="hidden flex-col text-[#8a9a86] sm:flex">
          <span className="font-serif text-sm italic leading-none">your next chapter</span>
          <svg
            viewBox="0 0 84 8"
            className="mt-1 h-2 w-20 text-[#8a9a86]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M1 5c11-4 22 4 33 0s21-4 32 0 14 2 17 1" />
          </svg>
        </span>
      </div>
    </div>
  );
}
