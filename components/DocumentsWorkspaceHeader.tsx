/**
 * Documents トップの上部（presentation のみ）。共有デザインに寄せる:
 *   右上に oval + メッセージ + 星（headline と同じ上段の右端、Desktop のみ）
 *   大きな bold sans の "My Study Abroad"（左揃え・上余白少なめ）
 *   subcopy（黒に近いグレー、headline のすぐ下）
 *   headline のすぐ下・左寄りに、存在感のある方眼紙ラベル（現在の plan.title）＋
 *     左上にかぶるマスキングテープ、右に "your next chapter" ＋ 2 本の手描き下線
 *
 * Plan ラベルに出すのは **実際の plan.title だけ**。国旗・国名・留学タイプは作らない。
 * "your next chapter" と右上メッセージは UI 固定の decorative copy。装飾はすべて aria-hidden、
 * テキストの可読性を邪魔しない。hooks を持たない純粋表示コンポーネント。
 */
export default function DocumentsWorkspaceHeader({ planTitle }: { planTitle: string }) {
  return (
    <div className="relative">
      {/* 右上 decorative message（Desktop のみ・装飾） */}
      <div aria-hidden className="pointer-events-none absolute -top-1 right-0 hidden lg:block">
        <div className="relative rotate-2">
          <svg viewBox="0 0 220 78" className="w-60 text-[#8a9a86]">
            <ellipse
              cx="110"
              cy="39"
              rx="104"
              ry="34"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray="2 3"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center px-7 text-center text-[13px] font-medium text-[#5f6b5a]">
            小さな一歩が、未来の自分をつくる！
          </span>
          <svg
            viewBox="0 0 24 24"
            className="absolute -right-1.5 -top-1.5 h-5 w-5 text-[#e07a5f]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            <path d="M12 3v18M3 12h18M6.5 6.5l11 11M17.5 6.5l-11 11" />
          </svg>
        </div>
      </div>

      <h1 className="text-3xl font-bold leading-[1.05] tracking-tight text-worksheet-primary sm:text-4xl lg:text-[3.4rem]">
        My Study Abroad
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-[#3f3d38] sm:text-base">
        留学について考えたことを、少しずつ形にしていきます。
      </p>

      <div className="mt-4 flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="relative">
          {/* マスキングテープ（ラベル左上にかぶせる） */}
          <span
            aria-hidden
            className="absolute -left-3 -top-3 h-7 w-16 -rotate-[16deg] rounded-[2px] bg-worksheet-sage/70"
          />
          <span
            className="relative inline-block -rotate-2 rounded-[6px] border border-black/10 bg-[#fdfbf4] px-5 py-3 text-xl font-medium text-worksheet-primary shadow-[0_2px_5px_rgba(0,0,0,0.07)] sm:text-2xl"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, transparent, transparent 13px, rgba(0,0,0,0.06) 14px), repeating-linear-gradient(90deg, transparent, transparent 13px, rgba(0,0,0,0.06) 14px)",
            }}
          >
            {planTitle}
          </span>
        </div>

        <span aria-hidden className="hidden -translate-y-1 flex-col text-[#8a9a86] sm:flex">
          <span className="font-serif text-sm italic leading-none">your next chapter</span>
          <svg
            viewBox="0 0 90 12"
            className="mt-1 h-3 w-24 text-[#8a9a86]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          >
            <path d="M1 5c12-4 24 3 36 0s22-4 33 0 15 2 19 1" />
            <path d="M3 9c12-3 24 3 36 1s22-3 33 0 14 2 17 1" />
          </svg>
        </span>
      </div>
    </div>
  );
}
