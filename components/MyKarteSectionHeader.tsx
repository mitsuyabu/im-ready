import Link from "next/link";

/**
 * My Karte ダッシュボードの各セクションの見出し（presentation のみ）。
 *
 * カードは白、ページの地は淡いグレーなので、見出しは **地の上に直接置く**（枠で囲わない）。
 * 文字のスタイルは globals.css の共通クラスに集約していて、ここでは px を決めない:
 *   eyebrow（.mk-eyebrow） → title（.mk-section-title） → description（.mk-sub-text）
 * 右側には meta（実データの件数だけ）と詳細への導線（.mk-link）を置く。
 *
 * hooks を持たない純粋表示コンポーネント。
 */
export default function MyKarteSectionHeader({
  eyebrow,
  title,
  description,
  href,
  linkLabel = "詳しく見る →",
  meta,
}: {
  /** 小さな英字ラベル（例: NOTE）。セクションの役割を一目で区別させる。 */
  eyebrow?: string;
  title: string;
  /** 1 行の説明。無ければ出さない。 */
  description?: string;
  /** 詳細画面への遷移先。無ければ導線を出さない（Comparison Board のように遷移しないセクション用）。 */
  href?: string;
  linkLabel?: string;
  /** 右側に出す小さな補助情報（「2校」「4 / 10」など、**実データの件数だけ**）。 */
  meta?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-5 gap-y-2 sm:mb-5">
      <div className="min-w-0">
        {eyebrow && <p className="mk-eyebrow">{eyebrow}</p>}
        <h2 className="mk-section-title mt-1.5">{title}</h2>
        {description && <p className="mk-sub-text mt-1">{description}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-3 pb-1">
        {/* 件数は蛍光の pill で強調する（数字そのものは near-black のまま） */}
        {meta && (
          <span className="rounded-full bg-[var(--neon-lime)] px-3 py-1 text-[12px] font-bold tabular-nums text-[var(--neon-ink)]">
            {meta}
          </span>
        )}
        {href && (
          <Link
            href={href}
            className="mk-link underline decoration-[#c9ccc6] underline-offset-[4px] transition-colors duration-150 hover:decoration-[var(--mk-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-worksheet-accent"
          >
            {linkLabel}
          </Link>
        )}
      </div>
    </div>
  );
}
