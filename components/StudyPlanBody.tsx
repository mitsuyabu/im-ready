import { parseStudyPlanBodyView } from "@/lib/studyPlanBodyView";
import { STUDY_PLAN_DEFAULT_TITLE } from "@/lib/studyPlanPrompt";
import DocumentPlainText from "@/components/DocumentPlainText";

/**
 * Study Plan 本文の表示（Step 28）。「整理する」＝計画書 / 軽いダッシュボード:
 * 各「■ セクション」をカード化し、中身は「ラベル：値」の定義リスト、
 * 補足文は段落。PC は 2 カラム grid（DOM 順＝表示順を維持。並べ替えない）、Mobile は 1 カラム。
 *
 * lib/studyPlanBodyView.ts（Step 27）で解析し、null なら元 body 全文へ完全 fallback。
 * 新しいサマリー・完成率・評価は生成しない（body にある内容だけ）。
 *
 * hooks 無しの純粋表示コンポーネント。
 */
export default function StudyPlanBody({ body }: { body: string }) {
  const view = parseStudyPlanBodyView(body);
  if (view === null) return <DocumentPlainText body={body} />;

  const preambleLines = view.preamble.filter(
    (line) => line.trim().length > 0 && line.trim() !== STUDY_PLAN_DEFAULT_TITLE,
  );

  return (
    <div className="mt-8">
      {preambleLines.length > 0 && (
        <div className="mb-6 space-y-2 text-sm leading-relaxed text-worksheet-secondary">
          {preambleLines.map((line, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {line}
            </p>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        {view.sections.map((section, i) => (
          <section
            key={i}
            className={`rounded-xl border border-worksheet-border p-4 sm:p-5 ${
              i === 0 && section.heading === "現在のプラン" ? "sm:col-span-2" : ""
            }`}
          >
            <h2 className="text-sm font-medium text-worksheet-primary">{section.heading}</h2>

            {section.items.length > 0 && (
              <dl className="mt-3 space-y-2">
                {section.items.map((item, j) => (
                  <div key={j} className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-3 gap-y-0.5">
                    <dt className="text-xs leading-relaxed text-worksheet-secondary">{item.label}</dt>
                    <dd className="text-sm leading-relaxed text-worksheet-primary">{item.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {section.freeText.length > 0 && (
              <div className="mt-3 space-y-2 text-sm leading-relaxed text-worksheet-primary">
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
    </div>
  );
}
