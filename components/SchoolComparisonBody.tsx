import {
  parseSchoolComparisonBodyView,
  type SchoolComparisonBodySchool,
} from "@/lib/schoolComparisonBodyView";
import { SCHOOL_COMPARISON_DEFAULT_TITLE } from "@/lib/schoolComparisonFormatter";
import DocumentPlainText from "@/components/DocumentPlainText";

/**
 * School Comparison 本文の表示（Step 28）。「比べる」＝候補校の比較（推薦ではない）:
 * 上部に比較中の学校、その下に条件、学校データ比較（PC は表 / Mobile は学校カード）、
 * 条件との合い方、まだ比較できないこと、候補提示理由メモ、補足。
 *
 * lib/schoolComparisonBodyView.ts（Step 27）で解析し、**null なら元 body 全文へ
 * 完全 fallback**（部分的な表化はしない。§42）。schools master は読まない。
 * ranking / 順位 / score / % / stars / おすすめ / best / green・red 採点 / ○△× は
 * 一切追加しない（§38）。予算の適合判定は表示しない（criteria としてのみ表示。§39）。
 * 値は body のまま（要約・補完しない）。
 *
 * hooks 無しの純粋表示コンポーネント。
 */

function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? value.trim() : null;
  } catch {
    return null;
  }
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/** fit の 3 種を、色に頼らず（強い緑・赤や採点記号を使わず）落ち着いた差だけで表す。 */
function VerdictChip({ verdict }: { verdict: string }) {
  if (verdict === "条件に合っている") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-worksheet-sage/40 px-2.5 py-0.5 text-xs text-worksheet-primary">
        <CheckIcon className="h-3 w-3" />
        {verdict}
      </span>
    );
  }
  if (verdict === "確認が必要") {
    return (
      <span className="inline-flex items-center rounded-full border border-worksheet-border bg-worksheet-surface-2 px-2.5 py-0.5 text-xs text-worksheet-primary">
        {verdict}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-worksheet-surface-2 px-2.5 py-0.5 text-xs text-worksheet-secondary">
      {verdict}
    </span>
  );
}

/** URL らしければ最低限の検証（http/https のみ）をしてリンク化。fetch はしない。 */
function FactValue({ value }: { value: string }) {
  const url = safeHttpUrl(value);
  if (url !== null) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="break-all text-worksheet-primary underline decoration-worksheet-secondary/40 underline-offset-2 transition-colors hover:decoration-worksheet-primary/60"
      >
        {value}
      </a>
    );
  }
  return <span className="whitespace-pre-wrap">{value}</span>;
}

function SectionHeading({ children }: { children: string }) {
  return <h2 className="text-sm font-medium text-worksheet-primary">{children}</h2>;
}

/** facts に出現するラベルを「最初に body に現れた順」で集める（sort しない）。 */
function orderedFactLabels(facts: SchoolComparisonBodySchool[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const school of facts) {
    for (const item of school.items) {
      if (!seen.has(item.label)) {
        seen.add(item.label);
        labels.push(item.label);
      }
    }
  }
  return labels;
}

function factValue(school: SchoolComparisonBodySchool, label: string): string | null {
  const item = school.items.find((i) => i.label === label);
  return item ? item.value : null;
}

export default function SchoolComparisonBody({ body }: { body: string }) {
  const view = parseSchoolComparisonBodyView(body);
  if (view === null) return <DocumentPlainText body={body} />;

  const preambleNotes = view.preamble.filter(
    (line) => line.trim().length > 0 && line.trim() !== SCHOOL_COMPARISON_DEFAULT_TITLE,
  );
  const factLabels = orderedFactLabels(view.facts);

  return (
    <div className="mt-8 space-y-10">
      {preambleNotes.length > 0 && (
        <div className="space-y-1 text-xs leading-relaxed text-worksheet-secondary">
          {preambleNotes.map((line, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {line}
            </p>
          ))}
        </div>
      )}

      {/* 1. 今回比較する学校 */}
      <section>
        <SectionHeading>今回比較する学校</SectionHeading>
        <div className="mt-3 flex flex-wrap gap-3">
          {view.schools.map((school, i) => {
            const meta = [school.city, school.category].filter((v): v is string => Boolean(v));
            return (
              <div key={i} className="rounded-xl border border-worksheet-border px-4 py-3">
                <p className="text-sm font-medium text-worksheet-primary">{school.name}</p>
                {school.nameJa ? (
                  <p className="text-xs text-worksheet-secondary">{school.nameJa}</p>
                ) : null}
                {meta.length > 0 && (
                  <p className="mt-1 text-xs text-worksheet-secondary">{meta.join(" ・ ")}</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. あなたが大切にしている条件 */}
      {view.criteria.length > 0 && (
        <section>
          <SectionHeading>あなたが大切にしている条件</SectionHeading>
          <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {view.criteria.map((c, i) => (
              <div key={i} className="flex flex-col">
                <dt className="text-xs text-worksheet-secondary">{c.label}</dt>
                <dd className="text-sm text-worksheet-primary">{c.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* 3. 学校ごとの比較（PC: 表 / Mobile: 学校カード） */}
      {view.facts.length > 0 && factLabels.length > 0 && (
        <section>
          <SectionHeading>学校ごとの比較</SectionHeading>

          <div className="mt-3 hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th scope="col" className="border-b border-worksheet-border p-2 text-left" />
                  {view.facts.map((school, i) => (
                    <th
                      key={i}
                      scope="col"
                      className="border-b border-worksheet-border p-2 text-left text-sm font-medium text-worksheet-primary"
                    >
                      {school.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {factLabels.map((label, ri) => (
                  <tr key={ri}>
                    <th
                      scope="row"
                      className="border-b border-worksheet-border p-2 text-left align-top text-xs font-normal text-worksheet-secondary"
                    >
                      {label}
                    </th>
                    {view.facts.map((school, ci) => {
                      const value = factValue(school, label);
                      return (
                        <td
                          key={ci}
                          className="border-b border-worksheet-border p-2 align-top text-worksheet-primary"
                        >
                          {value === null ? (
                            <span className="text-worksheet-secondary/40" aria-hidden>
                              —
                            </span>
                          ) : (
                            <FactValue value={value} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 space-y-4 md:hidden">
            {view.facts.map((school, i) => (
              <div key={i} className="rounded-xl border border-worksheet-border p-4">
                <p className="text-sm font-medium text-worksheet-primary">{school.name}</p>
                <dl className="mt-2 space-y-1.5">
                  {school.items.map((item, j) => (
                    <div key={j} className="flex flex-col">
                      <dt className="text-xs text-worksheet-secondary">{item.label}</dt>
                      <dd className="text-sm text-worksheet-primary">
                        <FactValue value={item.value} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 4. 条件との合い方 */}
      {view.fits.length > 0 && (
        <section>
          <SectionHeading>条件との合い方</SectionHeading>
          <div className="mt-3 space-y-5">
            {view.fits.map((school, i) => (
              <div key={i}>
                <p className="text-sm font-medium text-worksheet-primary">{school.name}</p>
                <ul className="mt-2 space-y-2">
                  {school.fits.map((fit, j) => (
                    <li key={j}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-worksheet-primary">{fit.label}</span>
                        <VerdictChip verdict={fit.verdict} />
                      </div>
                      {fit.basis ? (
                        <p className="mt-0.5 text-xs leading-relaxed text-worksheet-secondary">
                          根拠：{fit.basis}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5. まだ比較できないこと */}
      {view.unresolvedText.length > 0 && (
        <section>
          <SectionHeading>まだ比較できないこと</SectionHeading>
          <div className="mt-3 space-y-1.5 text-sm leading-relaxed text-worksheet-secondary">
            {view.unresolvedText.map((line, i) => (
              <p key={i} className="whitespace-pre-wrap">
                {line}
              </p>
            ))}
          </div>
        </section>
      )}

      {/* 6. 候補として提示された理由・メモ */}
      {view.reasonMemoText.length > 0 && (
        <section>
          <SectionHeading>候補として提示された理由・メモ</SectionHeading>
          <div className="mt-3 space-y-1.5 text-sm leading-relaxed text-worksheet-secondary">
            {view.reasonMemoText.map((line, i) => (
              <p key={i} className="whitespace-pre-wrap">
                {line}
              </p>
            ))}
          </div>
        </section>
      )}

      {/* 7. 認識対象外の「■ 」セクション（テキストを捨てない） */}
      {view.otherSections.map((section, i) => (
        <section key={i}>
          <SectionHeading>{section.heading}</SectionHeading>
          <div className="mt-3 space-y-1.5 text-sm leading-relaxed text-worksheet-secondary">
            {section.lines
              .filter((line) => line.trim().length > 0)
              .map((line, j) => (
                <p key={j} className="whitespace-pre-wrap">
                  {line}
                </p>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
