import { parseStudyPlanBodyView } from "@/lib/studyPlanBodyView";
import { STUDY_PLAN_DEFAULT_TITLE } from "@/lib/studyPlanPrompt";
import DocumentPlainText from "@/components/DocumentPlainText";

/**
 * Study Plan 本文の表示。共有デザインの「整理された留学計画書 / snapshot」に寄せて、
 * 先頭に deep navy の CURRENT PLAN 帯 ＋ 4-up サマリー、その下に section カードを並べる。
 *
 * 本文そのものは一切加工しない:
 *  - lib/studyPlanBodyView.ts（parseStudyPlanBodyView）で「■ 見出し / ラベル：値 / freeText」へ
 *    機械分解するだけ（要約・言い換え・並べ替え・補完なし）
 *  - 「■ 」見出しが 1 つも無い body は parser が null → 元 body 全文を plain text で完全 fallback
 *  - 各 section の items / freeText の非空行を 1 行も落とさない
 *  - サマリー 4 項目は「保存済み Study Plan 本文の『現在のプラン』section」からのみ取得し、
 *    取れない項目は「これから整理」。最新 Karte で勝手に補完しない（snapshot 性）
 *
 * フォントは他画面と統一して基本 sans。serif は装飾的な大きい番号（01〜）だけ。
 * hooks を持たない純粋表示コンポーネント。
 */

const NEUTRAL = "これから整理";

/** 02 以降のカード上辺のテーマカラー（Worksheet 一覧と近い sage / pale blue / beige / navy / coral / gray）。 */
const ACCENT_LINE = ["#7d9a63", "#9fb6cb", "#b6a889", "#3a4a63", "#c8836b", "#b0aa9e"];

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
const PinIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <path d="M12 21s7-5.6 7-11a7 7 0 0 0-14 0c0 5.4 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);
const CalendarIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <rect x="4" y="5" width="16" height="16" rx="2" />
    <path d="M4 9h16M8 3v4M16 3v4" />
  </svg>
);
const ClockIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);
const YenIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <path d="M7 5l5 7 5-7M12 12v7M8.5 14h7M8.5 17h7" />
  </svg>
);

export default function StudyPlanBody({ body }: { body: string }) {
  const view = parseStudyPlanBodyView(body);
  if (view === null) return <DocumentPlainText body={body} />;

  const preambleLines = view.preamble.filter(
    (line) => line.trim().length > 0 && line.trim() !== STUDY_PLAN_DEFAULT_TITLE,
  );

  // 「現在のプラン」section は hero サマリーへ昇格し、カードグリッドからは外す。
  const currentPlan = view.sections.find((s) => s.heading.includes("現在のプラン")) ?? null;
  const restSections = view.sections.filter((s) => s !== currentPlan);

  const cpItems = currentPlan?.items ?? [];
  const valueByLabel = (pred: (label: string) => boolean): string | null =>
    cpItems.find((it) => pred(it.label))?.value ?? null;

  const summaryItems = [
    { label: "希望する都市", value: valueByLabel((l) => l.includes("都市")) ?? NEUTRAL, Icon: PinIcon },
    { label: "出発目安", value: valueByLabel((l) => l.includes("時期")) ?? NEUTRAL, Icon: CalendarIcon },
    {
      label: "期間",
      value: valueByLabel((l) => l === "期間" || (l.includes("期間") && !l.includes("時期"))) ?? NEUTRAL,
      Icon: ClockIcon,
    },
    {
      label: "総予算",
      value:
        valueByLabel((l) => l === "総予算") ??
        valueByLabel((l) => l.includes("予算") && !l.includes("融通") && !l.includes("月")) ??
        NEUTRAL,
      Icon: YenIcon,
    },
  ];

  return (
    <div className="mt-8 space-y-6">
      {preambleLines.length > 0 && (
        <div className="space-y-2 text-sm leading-7 text-[#625f59]">
          {preambleLines.map((line, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {line}
            </p>
          ))}
        </div>
      )}

      {/* 01: CURRENT PLAN band + 4-up summary */}
      <section
        id="studyplan-section-1"
        className="scroll-mt-6 overflow-hidden rounded-[18px] border border-[#e5dfd6] shadow-[0_1px_3px_rgba(30,28,24,0.05)]"
      >
        <div className="relative overflow-hidden bg-[#173154] px-6 py-6 sm:px-9 sm:py-7">
          <div className="relative flex items-baseline gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8ea3bf]">
              Current Plan
            </span>
            <span className="text-sm font-semibold text-white/70">/ 01</span>
          </div>
          <span
            aria-hidden
            className="pointer-events-none absolute right-5 top-0 select-none font-serif text-[64px] font-normal leading-none text-white/15 sm:text-[84px]"
          >
            01
          </span>
          <svg
            aria-hidden
            viewBox="0 0 220 90"
            preserveAspectRatio="none"
            className="pointer-events-none absolute bottom-0 left-0 h-14 w-2/3"
          >
            <path d="M-10 80 C 60 78, 90 30, 230 8" fill="none" stroke="rgba(199,212,228,0.28)" strokeWidth="1.3" />
            <circle cx="150" cy="20" r="2.4" fill="rgba(199,212,228,0.45)" />
            <circle cx="24" cy="72" r="2" fill="rgba(199,212,228,0.35)" />
          </svg>
        </div>

        <div className="grid grid-cols-2 gap-px bg-[#e5dfd6] sm:grid-cols-4">
          {summaryItems.map((it) => (
            <div key={it.label} className="flex items-center gap-3 bg-white px-4 py-4 sm:px-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eef2f4] text-[#5a6b7d]">
                <it.Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-medium tracking-wide text-[#8a8578]">{it.label}</p>
                <p
                  className={`mt-0.5 truncate text-sm font-semibold ${
                    it.value === NEUTRAL ? "text-[#a8a297]" : "text-[#172033]"
                  }`}
                >
                  {it.value}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 02〜: section カード（実 parser の section / item をそのまま） */}
      {restSections.length > 0 && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {restSections.map((section, idx) => {
            const num = String(idx + 2).padStart(2, "0");
            const isDecided = section.heading.includes("決まって");
            const isChecklist =
              section.heading.includes("確認したい") || section.heading.includes("まだ確認");
            const accent = isDecided ? "#c8836b" : ACCENT_LINE[idx % ACCENT_LINE.length];
            const asChecklist = isChecklist && section.freeText.length > 0;

            return (
              <section
                key={idx}
                id={`studyplan-section-${idx + 2}`}
                style={{ borderTopColor: accent }}
                className={`scroll-mt-6 rounded-[16px] border border-[#e5dfd6] border-t-[3px] bg-white p-5 shadow-[0_1px_3px_rgba(30,28,24,0.05)] sm:p-6 ${
                  isChecklist ? "sm:col-span-2" : ""
                }`}
              >
                <span
                  aria-hidden
                  className="select-none font-serif text-4xl font-normal leading-none text-[#173154]/20"
                >
                  {num}
                </span>
                <h3 className="mt-1.5 text-lg font-semibold text-[#172033]">{section.heading}</h3>

                {section.items.length > 0 && (
                  <dl className="mt-3 space-y-2">
                    {section.items.map((item, j) => (
                      <div
                        key={j}
                        className="grid grid-cols-[minmax(5.5rem,auto)_1fr] gap-x-3 gap-y-0.5"
                      >
                        <dt className="text-xs leading-relaxed text-[#8a8578]">{item.label}</dt>
                        <dd className="text-sm leading-relaxed text-[#2f2c26]">{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                {section.freeText.length > 0 &&
                  (asChecklist ? (
                    <ul className="mt-3 space-y-2">
                      {section.freeText.map((text, j) => (
                        <li key={j} className="flex gap-2.5 text-sm leading-relaxed text-[#3f3a34]">
                          <span
                            aria-hidden
                            className="mt-0.5 h-4 w-4 shrink-0 rounded-[4px] border border-[#c8836b]"
                          />
                          <span className="whitespace-pre-wrap">{text}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-3 space-y-2 text-sm leading-7 text-[#3f3a34]">
                      {section.freeText.map((text, j) => (
                        <p key={j} className="whitespace-pre-wrap">
                          {text}
                        </p>
                      ))}
                    </div>
                  ))}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
