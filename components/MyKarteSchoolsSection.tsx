import MyKarteSectionHeader from "@/components/MyKarteSectionHeader";

/**
 * My Karte ダッシュボードの School Comparison セクション（presentation のみ）。
 *
 * 大きな資料作成カードの代わりに、**いま検討中の学校の概要だけ**をコンパクトに出す。
 * ページ下部の静かなセクションなので、My Note / Study Plan より面積も強さも抑える。
 * 文字は共通クラスに揃える（学校名 = .mk-card-title、都市・ほか○件 = .mk-sub-text）。
 *
 * データは lib/schoolComparisonView.ts の buildSchoolComparisonView が返す候補校
 * （= karte.proposals.presented の type="school" を学校マスタで解決できたものだけ）。
 * この画面で学校を検索・追加・推薦・評価しない。順位・適合率・おすすめ度も出さない
 * （fit 判定は School Comparison の資料生成側の責務）。
 *
 * 学校名・都市は保存済みデータそのまま。架空の学校名は出さない。
 *
 * hooks を持たない純粋表示コンポーネント。
 */

export type MyKarteSchoolRow = {
  slug: string;
  /** 学校マスタの表示名（日本語名があればそちら）。 */
  name: string;
  /** 都市。マスタに無ければ undefined（「—」として出す。推測で埋めない）。 */
  city?: string;
};

/** 一覧に出す最大件数。これ以上は詳細画面で見てもらう。 */
const MAX_ROWS = 5;

export default function MyKarteSchoolsSection({
  planId,
  schools,
}: {
  planId: string;
  schools: MyKarteSchoolRow[];
}) {
  const shown = schools.slice(0, MAX_ROWS);
  const rest = schools.length - shown.length;

  return (
    <section>
      <MyKarteSectionHeader
        eyebrow="Schools"
        title="School Comparison"
        description="候補にあがっている学校"
        href={`/plans/${planId}/documents/school-comparison`}
        linkLabel="学校を比較する →"
        meta={schools.length > 0 ? `${schools.length}校` : undefined}
      />

      {schools.length === 0 ? (
        <div className="mk-card-empty mk-pad-lg">
          <p className="mk-sub-text">AI相談で学校を提案してもらうと、候補がここに並びます。</p>
        </div>
      ) : (
        <div className="mk-card overflow-hidden">
          {/* 学校名 / 都市 の 2 列。罫線は行間の 1 本だけに留める。 */}
          <ul className="divide-y divide-[#f0f1ee]">
            {shown.map((school, index) => (
              <li
                key={school.slug}
                className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6"
              >
                <div className="flex min-w-0 items-center gap-3.5">
                  {/* 連番は「順位」ではなく並びの目印。評価を含意しないよう静かな灰色にする */}
                  <span
                    aria-hidden
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--mk-block)] text-[12px] font-semibold text-[var(--mk-sub)]"
                  >
                    {index + 1}
                  </span>
                  <p className="mk-card-title min-w-0 break-words">{school.name}</p>
                </div>
                <p className="mk-sub-text shrink-0 rounded-full bg-[var(--mk-block)] px-3 py-1">
                  {school.city ?? "—"}
                </p>
              </li>
            ))}
          </ul>

          {rest > 0 && (
            <p className="mk-sub-text border-t border-[#f0f1ee] px-5 py-3 sm:px-6">ほか{rest}校</p>
          )}
        </div>
      )}
    </section>
  );
}
