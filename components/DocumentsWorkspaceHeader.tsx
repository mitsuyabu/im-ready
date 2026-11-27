import type { ReactNode } from "react";

/**
 * My Karte トップの上部（presentation のみ）。
 *
 * ダッシュボードの入口。淡いグレーの canvas の上に置く **白いカード**で、
 *   左  … 大きな "My Karte" ＋ subcopy ＋ 静かな Plan context（CURRENT PLAN ラベル ＋ plan.title）
 *   右  … サマリータイル（実データの件数だけ。呼び出し側から children で渡す）
 * という 2 段構えにする。文字は My Karte 共通クラス（.mk-page-title / .mk-sub-text /
 * .mk-eyebrow / .mk-card-title）だけで組み、このファイルで px を決めない。
 *
 * 手描き装飾・吹き出し・星・波線・マスキングテープ・方眼紙ラベル・decorative copy は置かない。
 * Plan ラベルに出すのは **実際の plan.title だけ**（国旗・国名・留学タイプは作らない）。
 * グラフ・達成率・スコアは置かない。
 *
 * hooks を持たない純粋表示コンポーネント。
 */
export default function DocumentsWorkspaceHeader({
  planTitle,
  lastUpdatedText = null,
  summary = null,
}: {
  planTitle: string;
  /** 資料がある場合のみ、formatLastUpdated 済みテキスト。無ければ null。 */
  lastUpdatedText?: string | null;
  /** 右側に置くサマリータイル。無ければ右は余白のまま。 */
  summary?: ReactNode;
}) {
  const title = planTitle.trim();
  return (
    <div className="mk-card mk-pad-lg relative overflow-hidden">
      {/*
        左下に差す淡いグラデーション。**右上は置かない**（右上にはサマリータイルが載るため、
        重ねるとタイルの地が濁る）。カード本体は白のまま。
      */}
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-16 hidden h-64 w-64 rounded-full lg:block"
        style={{
          /* My Karte の機能別カラー（ラベンダー）。Plan Home の My Karte カードと同じ色で、
             「いまどの機能にいるか」を淡いにじみだけで示す（面としては塗らない）。 */
          background:
            "radial-gradient(circle, rgba(233,224,250,0.85) 0%, rgba(255,255,255,0) 70%)",
        }}
      />

      <div className="relative flex flex-col gap-7 lg:flex-row lg:items-start lg:justify-between lg:gap-12">
        <div className="min-w-0 lg:max-w-[32rem]">
          <h1 className="mk-page-title">My Karte</h1>
          <p className="mk-text mt-3 text-[var(--mk-sub)]">
            AI相談やワークシートで考えてきたことを、ここで確認・整理・比較できます。
          </p>

          {title.length > 0 && (
            <div className="mt-6 inline-flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-[14px] bg-[var(--mk-block)] px-4 py-2.5">
              <p className="mk-eyebrow">Current Plan</p>
              <p className="mk-card-title min-w-0 break-words">{title}</p>
            </div>
          )}
        </div>

        {summary && (
          <div className="w-full shrink-0 lg:w-[380px]">
            {summary}
            {lastUpdatedText && (
              <p className="mk-sub-text mt-3 text-right">最終更新: {lastUpdatedText}</p>
            )}
          </div>
        )}

        {/* サマリーを出さない場合でも、更新日だけは従来どおり右上に置く */}
        {!summary && lastUpdatedText && (
          <p className="mk-sub-text shrink-0">最終更新: {lastUpdatedText}</p>
        )}
      </div>
    </div>
  );
}
