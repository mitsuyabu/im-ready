import { parseStudyPlanBodyView } from "@/lib/studyPlanBodyView";
import DocumentPlainText from "@/components/DocumentPlainText";

/**
 * 親向け説明資料 本文の表示（Step 28）。「伝える」＝家族に見せる資料なので、
 * 本人向け 3 種のダッシュボード的な見た目とは変え、単一カラム・広めの余白・
 * 読み物としての体裁にする。
 *
 * 親向け body は Study Plan と同じ表記規約（題名 → 「■ 概要見出し ＋ 項目：値」→
 * 「■ 説明セクション ＋ 文章」）なので、Step 27 の parseStudyPlanBodyView を再利用する
 * （§45。専用 parser は今回追加しない）。解析できなければ元 body 全文へ完全 fallback。
 * 要約・言い換え・補完はしない。
 *
 * hideLeadingTitle に detail header のタイトル（保存済み row.title）を渡すと、
 * preamble がそれと完全一致する場合のみ重複表示を避ける（意味推測はしない。§17）。
 *
 * hooks 無しの純粋表示コンポーネント。
 */
export default function ParentExplanationBody({
  body,
  hideLeadingTitle,
}: {
  body: string;
  hideLeadingTitle?: string;
}) {
  const view = parseStudyPlanBodyView(body);
  if (view === null) return <DocumentPlainText body={body} />;

  const preambleText = view.preamble.join("\n").trim();
  const showPreamble =
    preambleText.length > 0 &&
    (hideLeadingTitle === undefined || preambleText !== hideLeadingTitle.trim());

  return (
    <div className="mt-8 max-w-2xl space-y-8">
      {showPreamble && (
        <div className="space-y-3 text-[15px] leading-8 text-worksheet-primary">
          {view.preamble
            .filter((line) => line.trim().length > 0)
            .map((line, i) => (
              <p key={i} className="whitespace-pre-wrap">
                {line}
              </p>
            ))}
        </div>
      )}

      {view.sections.map((section, i) => (
        <section key={i}>
          <h2 className="text-base font-medium text-worksheet-primary">{section.heading}</h2>

          {section.items.length > 0 && (
            <dl className="mt-3 space-y-2 rounded-xl border border-worksheet-border bg-worksheet-surface-2 p-4 sm:p-5">
              {section.items.map((item, j) => (
                <div key={j} className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-3 gap-y-0.5">
                  <dt className="text-xs leading-relaxed text-worksheet-secondary">{item.label}</dt>
                  <dd className="text-sm leading-relaxed text-worksheet-primary">{item.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {section.freeText.length > 0 && (
            <div className="mt-3 space-y-3 text-[15px] leading-8 text-worksheet-primary">
              {section.freeText.map((text, j) => (
                <p key={j} className="whitespace-pre-wrap">
                  {text}
                </p>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
