"use client";

import { useId, useState } from "react";
import { parseStudyPlanBodyView } from "@/lib/studyPlanBodyView";
import DocumentPlainText from "@/components/DocumentPlainText";

/**
 * 親向け説明資料 本文の表示。「家族へ見せるための読みやすい説明資料」として、
 * 上部に PLAN AT A GLANCE（保存済み本文の概要リストから作る要約カード）、
 * その下に本文セクションを accordion（開閉できるカード）で並べる。
 *
 * 本文そのものは一切加工しない:
 *  - lib/studyPlanBodyView.ts（parseStudyPlanBodyView）で「■ 見出し / 項目：値 / 文章」へ機械分解するだけ
 *  - parser が null なら元 body 全文を DocumentPlainText で完全 fallback（部分 accordion 化しない）
 *  - 概要カードは保存済み本文の概要セクション（items）からのみ。最新 Karte は混ぜない（snapshot）
 *  - preview は section 本文の冒頭段落を機械的に取り出すだけ（AI 要約なし）
 *  - open 時は section 本文を verbatim（whitespace / 段落を維持）
 *
 * accordion の開閉は client state のみ（DB 保存・URL 変更・API 呼び出しなし）。初期は先頭 section を open。
 * hideLeadingTitle（保存済み row.title / ページ見出し）と概要の題名行が完全一致する場合だけ重複表示を避ける。
 */

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
const BookIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5ZM19 18v3H6.5A1.5 1.5 0 0 1 5 19.5" />
  </svg>
);
const BriefcaseIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <rect x="3.5" y="7.5" width="17" height="12" rx="2" />
    <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3.5 12.5h17" />
  </svg>
);
const YenIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <path d="M7 5l5 7 5-7M12 12v7M8.5 14h7M8.5 17h7" />
  </svg>
);
const HeartIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
    <path d="M12 20s-7-4.35-9.33-8.5C1.1 8.28 2.7 5 6 5c2 0 3.2 1.2 4 2.3C10.8 6.2 12 5 14 5c3.3 0 4.9 3.28 3.33 6.5C19 15.65 12 20 12 20Z" />
  </svg>
);
const ChevronDownIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

/** 概要カードのラベルに応じたアイコン（意味の推測は表示時の選択のみ）。 */
function summaryIcon(label: string) {
  if (/予算|費用|金額|万円|コスト/.test(label)) return YenIcon;
  if (/仕事|就労|働|ワーホリ|ワーキングホリデー|アルバイト|バイト/.test(label)) return BriefcaseIcon;
  if (/学校|コース|語学|英語|授業|プログラム/.test(label)) return BookIcon;
  if (/出発|渡航|時期/.test(label)) return CalendarIcon;
  if (/期間|週|ヶ月|か月|年/.test(label)) return ClockIcon;
  if (/都市|行き先|国|エリア|地域|滞在先/.test(label)) return PinIcon;
  return PinIcon;
}

/** section 本文の冒頭段落（最初の非空行ブロック）だけを機械的に返す。 */
function previewOf(freeText: string[]): string {
  for (const t of freeText) {
    const s = t.trim();
    if (s.length > 0) return s;
  }
  return "";
}

/** accordion の連番丸の配色（presentation order のみ・意味/進捗なし）。 */
const NUMBER_ACCENT = [
  { bg: "#e7efe1", fg: "#4b5b3e" }, // sage
  { bg: "#e6eef4", fg: "#3a5266" }, // pale blue
  { bg: "#f5e7dc", fg: "#8a5a3c" }, // pale orange
  { bg: "#e9e6df", fg: "#4a4640" }, // warm gray
];

export default function ParentExplanationBody({
  body,
  hideLeadingTitle,
}: {
  body: string;
  hideLeadingTitle?: string;
}) {
  const view = parseStudyPlanBodyView(body);
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const baseId = useId();

  if (view === null) return <DocumentPlainText body={body} />;

  const preambleLines = view.preamble.filter(
    (line) => line.trim().length > 0 && line.trim() !== hideLeadingTitle?.trim(),
  );

  // 概要セクション: items を持つ最初のセクション（本文が無ければ PLAN AT A GLANCE 専用に昇格）。
  const overview = view.sections.find((s) => s.items.length > 0) ?? null;
  const glanceItems = overview ? overview.items.slice(0, 6) : [];
  const sections = view.sections.filter((s) => s !== overview || s.freeText.length > 0);

  return (
    <div className="mt-8 space-y-8 sm:space-y-10">
      {preambleLines.length > 0 && (
        <div className="max-w-3xl space-y-2 text-[15px] leading-8 text-[#45413b]">
          {preambleLines.map((line, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {line}
            </p>
          ))}
        </div>
      )}

      {/* PLAN AT A GLANCE */}
      {glanceItems.length > 0 && (
        <section
          aria-labelledby={`${baseId}-glance`}
          className="relative overflow-hidden rounded-[20px] border border-[#e3e6e0] p-5 shadow-[0_1px_3px_rgba(30,28,24,0.04)] sm:rounded-[22px] sm:p-7"
          style={{ backgroundImage: "linear-gradient(135deg, #eef2f4 0%, #fbf9f3 62%)" }}
        >
          <svg
            aria-hidden
            viewBox="0 0 400 120"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 w-full text-[#c9d6dd]"
          >
            <path d="M0 70 C 90 55, 150 90, 250 70 S 360 45, 400 60" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <path d="M0 92 C 100 80, 170 104, 260 90 S 370 70, 400 84" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.6" />
          </svg>

          <p
            id={`${baseId}-glance`}
            className="relative text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5f7050]"
          >
            Plan at a glance
          </p>

          <div className="relative mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {glanceItems.map((item, i) => {
              const Icon = summaryIcon(item.label);
              return (
                <div
                  key={i}
                  className="rounded-[16px] border border-white/80 bg-white/75 p-4 shadow-[0_1px_2px_rgba(30,28,24,0.04)]"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f2efe6] text-[#7a8a6d]">
                    <Icon className="h-4 w-4" />
                  </span>
                  <p className="mt-2 text-[10px] font-medium tracking-wide text-[#817b71]">
                    {item.label}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold leading-snug text-[#242c38]">
                    {item.value}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 本文セクション（accordion） */}
      {sections.length > 0 && (
        <div className="space-y-3">
          {sections.map((section, i) => {
            const open = openIndex === i;
            const preview = previewOf(section.freeText);
            const isFeeling = /気持ち|きもち/.test(section.heading);
            const accent = NUMBER_ACCENT[i % NUMBER_ACCENT.length];
            const panelId = `${baseId}-sec-${i}`;
            return (
              <div
                key={i}
                className={`overflow-hidden rounded-[18px] border shadow-[0_1px_2px_rgba(30,28,24,0.03)] ${
                  isFeeling ? "border-[#f2d8cc] bg-[#fff6f1]" : "border-[#e9e3d8] bg-white"
                }`}
              >
                <h2>
                  <button
                    type="button"
                    onClick={() => setOpenIndex(open ? null : i)}
                    aria-expanded={open}
                    aria-controls={panelId}
                    className="flex w-full items-start gap-4 px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e2b3d]/30 sm:px-6"
                  >
                    <span
                      aria-hidden
                      className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                      style={{ backgroundColor: accent.bg, color: accent.fg }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        {isFeeling && (
                          <HeartIcon aria-hidden className="h-4 w-4 shrink-0 text-[#d98b6f]" />
                        )}
                        <span className="text-lg font-semibold leading-snug text-[#172033] sm:text-xl">
                          {section.heading}
                        </span>
                      </span>
                      {!open && preview && (
                        <span className="mt-1 line-clamp-2 block text-sm leading-6 text-[#6b665d]">
                          {preview}
                        </span>
                      )}
                    </span>
                    <ChevronDownIcon
                      className={`mt-1.5 h-4 w-4 shrink-0 text-[#9b958a] transition-transform duration-200 ${
                        open ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                </h2>

                {open && (
                  <div
                    id={panelId}
                    className={`border-t px-5 pb-5 pt-4 sm:px-6 ${
                      isFeeling ? "border-[#f2d8cc]" : "border-[#efe9dc]"
                    }`}
                  >
                    {section.items.length > 0 && (
                      <dl className="mb-4 space-y-2 rounded-xl border border-[#efe9dc] bg-[#fbfaf6] p-4">
                        {section.items.map((it, j) => (
                          <div key={j} className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-3 gap-y-0.5">
                            <dt className="text-xs leading-relaxed text-[#817b71]">{it.label}</dt>
                            <dd className="text-sm leading-relaxed text-[#45413b]">{it.value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {section.freeText.length > 0 && (
                      <div className="space-y-3 text-base leading-7 text-[#45413b]">
                        {section.freeText.map((t, j) => (
                          <p key={j} className="whitespace-pre-wrap">
                            {t}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
