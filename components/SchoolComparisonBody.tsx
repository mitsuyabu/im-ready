import Image from "next/image";
import Link from "next/link";
import {
  parseSchoolComparisonBodyView,
  type SchoolComparisonBodySchool,
} from "@/lib/schoolComparisonBodyView";
import { SCHOOL_COMPARISON_DEFAULT_TITLE } from "@/lib/schoolComparisonFormatter";
import DocumentPlainText from "@/components/DocumentPlainText";

/**
 * School Comparison 本文の表示。共有デザインの「候補校の比較ダッシュボード」に寄せて、
 * 上部に候補校カード（01〜03）＋「あなたが大切にしている条件」チップ、下部を
 * 2 カラム（左＝比較テーブル / 右＝確認したいこと）で見せる。
 *
 * 本文そのものは一切加工しない:
 *  - lib/schoolComparisonBodyView.ts（parseSchoolComparisonBodyView）で構造化するだけ
 *    （要約・言い換え・並べ替え・補完・ranking・score・○△× は一切しない）
 *  - parser が null なら元 body 全文を DocumentPlainText で完全 fallback（部分 table 化しない）
 *  - schools master / 最新 Karte は読まない。保存済み本文の値だけで組む（snapshot）
 *  - 「条件に合っている」バッジは、fit の verdict とテーブル項目ラベルが完全一致したときだけ出す
 *    （データに無い match 判定は作らない）
 *
 * 候補校カード（01〜03）は共有画像（public/school-comparison-cards/*.webp）を背景に使い、
 * 番号・学校アイコン・波線・背景色・texture は画像側が持つ（コードでは描かない）。
 * フォントは他画面と統一して基本 sans。hooks を持たない純粋表示コンポーネント。
 */

const TABLE_ANCHOR = "school-comparison-table";

function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? value.trim() : null;
  } catch {
    return null;
  }
}

type IconProps = { className?: string };
function svgProps(className?: string) {
  return {
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
}
const YenIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <path d="M7 5l5 7 5-7M12 12v7M8.5 14h7M8.5 17h7" />
  </svg>
);
const ChevronRightIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);
const ArrowRightIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const CheckIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
const HelpIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7M12 17h.01" />
  </svg>
);

/**
 * 候補校カードの背景ビジュアル。共有された3枚のデザインカード画像をそのまま使う
 * （背景色・大きな 01〜03・学校アイコン・波線・texture・角丸はすべて画像側が持つ）。
 * index（＝候補校の並び順）で sage / blue / sand を割り当てるだけで、色に意味は持たせない。
 * 画像はいずれも 1676×938（同一比率）。
 */
const SCHOOL_CARD_IMAGE = [
  "/school-comparison-cards/school-01-sage.webp",
  "/school-comparison-cards/school-02-blue.webp",
  "/school-comparison-cards/school-03-sand.webp",
];

function VerdictChip({ verdict }: { verdict: string }) {
  if (verdict === "条件に合っている") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#e7efe1] px-2.5 py-0.5 text-xs text-[#3c4a33]">
        <CheckIcon className="h-3 w-3" />
        {verdict}
      </span>
    );
  }
  if (verdict === "確認が必要") {
    return (
      <span className="inline-flex items-center rounded-full border border-[#e5dfd6] bg-[#faf7f0] px-2.5 py-0.5 text-xs text-[#3f3a34]">
        {verdict}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-[#f2efe7] px-2.5 py-0.5 text-xs text-[#8a8578]">
      {verdict}
    </span>
  );
}

function FactValue({ value }: { value: string }) {
  const url = safeHttpUrl(value);
  if (url !== null) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="break-all text-[#1e2b3d] underline decoration-[#8a8578]/40 underline-offset-2 transition-colors hover:decoration-[#1e2b3d]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e2b3d]/40"
      >
        {value}
      </a>
    );
  }
  return <span className="whitespace-pre-wrap">{value}</span>;
}

function CardHeading({ children }: { children: string }) {
  return <h2 className="text-lg font-semibold text-[#172033]">{children}</h2>;
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

export default function SchoolComparisonBody({ body, planId }: { body: string; planId: string }) {
  const view = parseSchoolComparisonBodyView(body);
  if (view === null) return <DocumentPlainText body={body} />;

  const preambleNotes = view.preamble.filter(
    (line) => line.trim().length > 0 && line.trim() !== SCHOOL_COMPARISON_DEFAULT_TITLE,
  );
  const factLabels = orderedFactLabels(view.facts);
  const topSchools = view.schools.slice(0, 3);
  const criteria = view.criteria.slice(0, 4);

  // fit verdict をテーブルセルの淡緑バッジに使うための、学校名 → (ラベル → verdict) の完全一致マップ。
  const fitVerdictBySchool = new Map<string, Map<string, string>>();
  for (const school of view.fits) {
    const m = new Map<string, string>();
    for (const f of school.fits) m.set(f.label, f.verdict);
    fitVerdictBySchool.set(school.name, m);
  }
  const hasMatchBadge = (schoolName: string, label: string) =>
    fitVerdictBySchool.get(schoolName)?.get(label) === "条件に合っている";

  return (
    <div className="mt-8 space-y-8">
      {preambleNotes.length > 0 && (
        <div className="space-y-1 text-xs leading-relaxed text-[#8a8578]">
          {preambleNotes.map((line, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {line}
            </p>
          ))}
        </div>
      )}

      {/* 候補校カード 01〜03: 共有画像を背景ビジュアルとして使い、学校情報だけを上に重ねる */}
      {topSchools.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {topSchools.map((school, i) => {
            const cardImage = SCHOOL_CARD_IMAGE[i] ?? SCHOOL_CARD_IMAGE[0];
            const meta = [school.city, school.category].filter((v): v is string => Boolean(v));
            return (
              <a
                key={i}
                href={`#${TABLE_ANCHOR}`}
                className="group relative block aspect-[1676/938] overflow-hidden rounded-[20px] shadow-[0_1px_2px_rgba(30,28,24,0.06)] transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e2b3d]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fcfbf8]"
              >
                <Image
                  src={cardImage}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 92vw"
                  className="object-cover"
                  priority={i < 3}
                />
                {/* 画像の左中央〜中央の空きスペースに学校情報を重ねる（左の番号・アイコン、右の波線に被らない位置） */}
                <div className="absolute inset-y-0 left-[30%] right-[16%] flex flex-col justify-center text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.28)]">
                  <p className="line-clamp-3 text-base font-semibold leading-snug sm:text-lg">
                    {school.name}
                  </p>
                  {school.nameJa && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-white/85">{school.nameJa}</p>
                  )}
                  {meta.length > 0 && (
                    <p className="mt-1 line-clamp-2 text-sm text-white/85">{meta.join(" ・ ")}</p>
                  )}
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-white">
                    比較表を見る
                    <ArrowRightIcon className="h-3.5 w-3.5" />
                  </span>
                </div>
              </a>
            );
          })}
        </div>
      )}

      {/* あなたが大切にしている条件 */}
      {criteria.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5f7050]">
            あなたが大切にしている条件
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {criteria.map((c, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#e0d7c4] bg-[#f6f2e8] px-3 py-1.5 text-[13px] text-[#3f3a34]"
                title={c.label}
              >
                {c.label.includes("予算") && <YenIcon className="h-3.5 w-3.5 text-[#8a8578]" />}
                {c.value}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 2カラム: 左=比較テーブル / 右=確認したいこと */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
        <div className="min-w-0 space-y-6">
          {/* 学校ごとの比較 */}
          <section
            id={TABLE_ANCHOR}
            className="scroll-mt-6 rounded-[18px] border border-[#e5dfd6] bg-white p-5 shadow-[0_1px_3px_rgba(30,28,24,0.05)] sm:p-6"
          >
            <CardHeading>学校ごとの比較</CardHeading>

            {view.facts.length > 0 && factLabels.length > 0 ? (
              <>
                <div className="mt-4 hidden overflow-x-auto md:block">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr>
                        <th scope="col" className="border-b border-[#e5dfd6] p-2 text-left" />
                        {view.facts.map((school, i) => (
                          <th
                            key={i}
                            scope="col"
                            className="border-b border-[#e5dfd6] p-2 text-left text-sm font-semibold text-[#172033]"
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
                            className="border-b border-[#efe9dc] p-2 text-left align-top text-xs font-normal text-[#8a8578]"
                          >
                            {label}
                          </th>
                          {view.facts.map((school, ci) => {
                            const value = factValue(school, label);
                            return (
                              <td
                                key={ci}
                                className="border-b border-[#efe9dc] p-2 align-top text-[#2f2c26]"
                              >
                                {value === null ? (
                                  <span className="text-[#c9c4b8]" aria-hidden>
                                    —
                                  </span>
                                ) : (
                                  <span className="flex flex-col gap-1">
                                    <FactValue value={value} />
                                    {hasMatchBadge(school.name, label) && (
                                      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-[#e7efe1] px-2 py-0.5 text-[11px] text-[#3c4a33]">
                                        <CheckIcon className="h-2.5 w-2.5" />
                                        条件に合っている
                                      </span>
                                    )}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 space-y-4 md:hidden">
                  {view.facts.map((school, i) => (
                    <div key={i} className="rounded-xl border border-[#e5dfd6] p-4">
                      <p className="text-sm font-semibold text-[#172033]">{school.name}</p>
                      <dl className="mt-2 space-y-1.5">
                        {school.items.map((item, j) => (
                          <div key={j} className="flex flex-col">
                            <dt className="text-xs text-[#8a8578]">{item.label}</dt>
                            <dd className="text-sm text-[#2f2c26]">
                              <FactValue value={item.value} />
                              {hasMatchBadge(school.name, item.label) && (
                                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[#e7efe1] px-2 py-0.5 text-[11px] text-[#3c4a33]">
                                  <CheckIcon className="h-2.5 w-2.5" />
                                  条件に合っている
                                </span>
                              )}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-4 text-sm text-[#8a8578]">
                比較できる項目は、まだ十分に整理されていません。
              </p>
            )}
          </section>

          {/* 条件との合い方 */}
          {view.fits.length > 0 && (
            <section className="rounded-[18px] border border-[#e5dfd6] bg-white p-5 shadow-[0_1px_3px_rgba(30,28,24,0.05)] sm:p-6">
              <CardHeading>条件との合い方</CardHeading>
              <div className="mt-4 space-y-5">
                {view.fits.map((school, i) => (
                  <div key={i}>
                    <p className="text-sm font-semibold text-[#172033]">{school.name}</p>
                    <ul className="mt-2 space-y-2">
                      {school.fits.map((fit, j) => (
                        <li key={j}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm text-[#2f2c26]">{fit.label}</span>
                            <VerdictChip verdict={fit.verdict} />
                          </div>
                          {fit.basis && (
                            <p className="mt-0.5 text-xs leading-relaxed text-[#8a8578]">
                              根拠：{fit.basis}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 候補として提示された理由・メモ */}
          {view.reasonMemoText.length > 0 && (
            <section className="rounded-[18px] border border-[#e5dfd6] bg-white p-5 shadow-[0_1px_3px_rgba(30,28,24,0.05)] sm:p-6">
              <CardHeading>候補として提示された理由・メモ</CardHeading>
              <div className="mt-3 space-y-1.5 text-sm leading-relaxed text-[#6f6a64]">
                {view.reasonMemoText.map((line, i) => (
                  <p key={i} className="whitespace-pre-wrap">
                    {line}
                  </p>
                ))}
              </div>
            </section>
          )}

          {/* 認識対象外の「■ 」セクション（テキストを捨てない） */}
          {view.otherSections.map((section, i) => (
            <section
              key={i}
              className="rounded-[18px] border border-[#e5dfd6] bg-white p-5 shadow-[0_1px_3px_rgba(30,28,24,0.05)] sm:p-6"
            >
              <CardHeading>{section.heading}</CardHeading>
              <div className="mt-3 space-y-1.5 text-sm leading-relaxed text-[#6f6a64]">
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

        {/* 右: 確認したいこと */}
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <div className="rounded-[18px] border border-[#e5dfd6] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <CardHeading>確認したいこと</CardHeading>

            {view.unresolvedText.length > 0 ? (
              <ul className="mt-4 space-y-2.5">
                {view.unresolvedText.map((line, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 rounded-xl border border-[#ece7dd] bg-[#fcfbf8] px-3 py-2.5"
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#eef2f4] text-[#5a6b7d]">
                      <HelpIcon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[#3f3a34]">
                      {line}
                    </span>
                    <ChevronRightIcon className="mt-1 h-3.5 w-3.5 shrink-0 text-[#c9c4b8]" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-[13px] leading-6 text-[#8a8578]">
                いま追加で確認したいことは、本文にはありません。
              </p>
            )}

            <Link
              href={`/plans/${planId}/worksheet/conditions`}
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#1e2b3d] px-4 py-2 text-sm font-medium text-[#172033] transition-colors hover:bg-[#1e2b3d]/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e2b3d]/40"
            >
              条件を見直す
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
