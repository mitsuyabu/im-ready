"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CATEGORIES } from "@/lib/worksheetQuestions";
import { loadWorksheetState } from "@/lib/worksheetStorage";
import { countAnsweredInCategory, type WorksheetProgress } from "@/lib/worksheetProgress";
import { WORKSHEET_SECTION_META } from "@/lib/worksheetSectionMeta";

/* ------------------------------------------------------------------ */
/* アイコン                                                            */
/* ------------------------------------------------------------------ */

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function PaperclipIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20 11.5 12.5 19a4.5 4.5 0 0 1-6.4-6.4l8-8a3 3 0 0 1 4.3 4.3l-8 8a1.5 1.5 0 0 1-2.2-2.1l7.1-7.1" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* テーマカードの配色・装飾（presentation のみ）                        */
/* ------------------------------------------------------------------ */

type CardTheme = {
  /** カード上部の色面 */
  field: string;
  /** カード下部の情報パネル */
  panel: string;
  /** 大きな連番の色（薄め・装飾） */
  numeral: string;
  /** serif タイトル・右下矢印の色 */
  title: string;
  /** サブコピーの色 */
  sub: string;
  /** 右下の丸ボタンの枠線色 */
  arrowBorder: string;
  /** 上部色面に重ねる装飾 SVG（aria-hidden） */
  decoration: ReactNode;
};

/** 01 Why? — muted sage / deep green。上品な曲線ライン。 */
const decoWhy = (
  <svg viewBox="0 0 200 170" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
    <path d="M-10 150 C 60 120, 90 40, 210 -10" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
    <path d="M-10 170 C 80 150, 120 70, 210 20" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="1.5" />
  </svg>
);

/** 02 My Future — pale blue。やわらかい曲線＋終点のドット。 */
const decoFuture = (
  <svg viewBox="0 0 200 170" className="absolute right-0 top-0 h-full w-full" aria-hidden="true">
    <path
      d="M20 150 C 70 150, 55 90, 100 90 S 150 60, 150 30"
      fill="none"
      stroke="rgba(255,255,255,0.5)"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <circle cx="150" cy="26" r="3.4" fill="#ffffff" />
  </svg>
);

/** 03 Conditions — beige / cream。右上のドットパターン。 */
const decoConditions = (
  <svg viewBox="0 0 120 90" className="absolute right-4 top-4 h-16 w-24" aria-hidden="true">
    {Array.from({ length: 5 }).map((_, r) =>
      Array.from({ length: 6 }).map((_, c) => (
        <circle key={`${r}-${c}`} cx={4 + c * 20} cy={4 + r * 18} r="2" fill="rgba(120,102,74,0.4)" />
      )),
    )}
  </svg>
);

/** 04 My Priorities — dark navy。右側に星／光の線。 */
const decoPriorities = (
  <svg viewBox="0 0 200 170" className="absolute right-2 top-1/2 h-40 w-40 -translate-y-1/2" aria-hidden="true">
    <g stroke="rgba(255,255,255,0.55)" strokeWidth="1.4" strokeLinecap="round">
      <path d="M120 30 V 130" />
      <path d="M70 80 H 170" />
      <path d="M85 45 L 155 115" />
      <path d="M155 45 L 85 115" />
    </g>
    <circle cx="120" cy="80" r="2.6" fill="#ffffff" />
  </svg>
);

/** 05 Worries — very light gray。水平線と黒いドット。 */
const decoWorries = (
  <svg viewBox="0 0 200 60" className="absolute left-6 right-6 top-8 w-auto" aria-hidden="true">
    <line x1="0" y1="20" x2="180" y2="20" stroke="rgba(60,58,54,0.35)" strokeWidth="1.4" />
    <circle cx="150" cy="20" r="4" fill="#2f2d2a" />
  </svg>
);

/** 06 Next Step — coral / peach。右上のステップ状のライン。 */
const decoNextStep = (
  <svg viewBox="0 0 120 100" className="absolute right-4 top-5 h-20 w-24" aria-hidden="true">
    <path
      d="M4 92 H 28 V 66 H 52 V 40 H 76 V 14 H 108"
      fill="none"
      stroke="rgba(255,255,255,0.55)"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CARD_THEMES: Record<string, CardTheme> = {
  motivation: {
    field: "#6f7d63",
    panel: "#f3f1e8",
    numeral: "rgba(255,255,255,0.3)",
    title: "#2c352a",
    sub: "#6a6459",
    arrowBorder: "#c6c2b2",
    decoration: decoWhy,
  },
  future: {
    field: "#a2b7ca",
    panel: "#eef2f4",
    numeral: "rgba(255,255,255,0.45)",
    title: "#2b3948",
    sub: "#5f6b76",
    arrowBorder: "#c3ccd3",
    decoration: decoFuture,
  },
  conditions: {
    field: "#d9cab0",
    panel: "#efe9dc",
    numeral: "rgba(120,102,74,0.32)",
    title: "#4a4230",
    sub: "#7a715f",
    arrowBorder: "#cec5b1",
    decoration: decoConditions,
  },
  priorities: {
    field: "#33404f",
    panel: "#dfe0da",
    numeral: "rgba(255,255,255,0.22)",
    title: "#242b34",
    sub: "#5c6069",
    arrowBorder: "#bcbdb4",
    decoration: decoPriorities,
  },
  anxiety: {
    field: "#d6d3cd",
    panel: "#e9e7e2",
    numeral: "rgba(70,68,64,0.24)",
    title: "#3a3934",
    sub: "#75726b",
    arrowBorder: "#c9c6bf",
    decoration: decoWorries,
  },
  nextstep: {
    field: "#c67c68",
    panel: "#e9dcd4",
    numeral: "rgba(255,255,255,0.34)",
    title: "#5c3a30",
    sub: "#7d6258",
    arrowBorder: "#d5bfb4",
    decoration: decoNextStep,
  },
};

const NEUTRAL_THEME: CardTheme = {
  field: "#dedbd3",
  panel: "#efece5",
  numeral: "rgba(70,68,64,0.22)",
  title: "#3a3934",
  sub: "#75726b",
  arrowBorder: "#c9c6bf",
  decoration: null,
};

/* ------------------------------------------------------------------ */

type SectionState = "complete" | "partial" | "empty";

function statusLabel(state: SectionState, progress: WorksheetProgress): string {
  if (state === "complete") return "整理済み";
  if (state === "partial") return `整理中 ${progress.answered}/${progress.total}`;
  return "未整理";
}

/**
 * 「I'm ready!」のテーマ一覧（セクション選択画面）。
 * Worksheet の回答は localStorage にのみ保存されているため、各テーマの回答済み件数と
 * 「整理済み」判定はマウント後にクライアント側だけで集計する
 * （PlanWorksheetProgress.tsx と同じ理由・同じパターン。判定ロジック・保存形式は変更しない）。
 *
 * 見た目は共有デザインに合わせたエディトリアル／カード一覧型：
 * 上部に summary bar（テーマ数・整理済み数・見直し導線）、その下に 6 枚のテーマカードを
 * desktop 3 列 / tablet 2 列 / mobile 1 列で並べる。カードは色面＋大きな連番＋装飾 SVG の上段と、
 * serif タイトル・サブコピー・状態 pill・右下の丸い矢印ボタンを載せた下段パネルで構成する。
 */
export default function WorksheetSectionList({ planId }: { planId: string }) {
  const [progressByCategory, setProgressByCategory] = useState<Record<string, WorksheetProgress> | null>(
    null,
  );

  useEffect(() => {
    const stored = loadWorksheetState(planId);
    const next: Record<string, WorksheetProgress> = {};
    for (const category of CATEGORIES) {
      next[category.id] = countAnsweredInCategory(stored, category);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProgressByCategory(next);
  }, [planId]);

  const totalThemes = CATEGORIES.length;
  const completedThemes = progressByCategory
    ? CATEGORIES.filter((c) => {
        const p = progressByCategory[c.id];
        return p && p.answered >= p.total;
      }).length
    : null;

  const firstIncompleteId = progressByCategory
    ? CATEGORIES.find((c) => {
        const p = progressByCategory[c.id];
        return !p || p.answered < p.total;
      })?.id ?? null
    : null;

  return (
    <div className="mt-8">
      {/* summary bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-[#e4ddcf] bg-[#fdfbf4] px-5 py-4 shadow-[0_1px_3px_rgba(40,33,20,0.04)] sm:flex-row sm:items-center sm:gap-5 sm:px-6">
        <div className="flex items-center gap-3 sm:gap-5">
          <span className="text-sm font-medium text-[#3f3d38]">{totalThemes}つのテーマ</span>
          <span aria-hidden className="hidden h-4 w-px bg-[#d8d1c1] sm:block" />
          {completedThemes !== null && (
            <span className="inline-flex items-center rounded-full bg-[#e4ebd9] px-3 py-1 text-xs font-medium text-[#4b5b3e]">
              {completedThemes} / {totalThemes} 整理済み
            </span>
          )}
        </div>
        <Link
          href={`/plans/${planId}/worksheet/${CATEGORIES[0].id}`}
          className="group inline-flex items-center gap-1.5 text-sm text-[#6f6b62] transition-colors hover:text-[#3f3d38] sm:ml-auto"
        >
          <PaperclipIcon className="h-4 w-4" />
          <span className="underline decoration-[#c9c1af] underline-offset-2 group-hover:decoration-[#3f3d38]">
            もう一度見直す
          </span>
        </Link>
      </div>

      {/* テーマカード一覧 */}
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((category, index) => {
          const meta = WORKSHEET_SECTION_META[category.id];
          const theme = CARD_THEMES[category.id] ?? NEUTRAL_THEME;
          const progress = progressByCategory?.[category.id];
          const state: SectionState | null = progress
            ? progress.answered >= progress.total
              ? "complete"
              : progress.answered > 0
                ? "partial"
                : "empty"
            : null;
          const isNext = firstIncompleteId === category.id;
          const num = String(index + 1).padStart(2, "0");

          return (
            <Link
              key={category.id}
              href={`/plans/${planId}/worksheet/${category.id}`}
              className={`group flex h-full flex-col overflow-hidden rounded-[22px] border border-[#e4ddcf] bg-white shadow-[0_1px_3px_rgba(40,33,20,0.05)] transition-shadow duration-200 hover:shadow-[0_10px_28px_rgba(40,33,20,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2b2a26]/50 ${
                isNext ? "ring-2 ring-[#2b2a26]/70 ring-offset-2 ring-offset-[#f7f4ec]" : ""
              }`}
            >
              {/* 上段：色面＋大きな連番＋装飾 */}
              <div
                className="relative min-h-[168px] flex-1 overflow-hidden"
                style={{ backgroundColor: theme.field }}
              >
                {theme.decoration}
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1 select-none font-serif text-[104px] font-semibold leading-none tracking-tight"
                  style={{ color: theme.numeral }}
                >
                  {num}
                </span>
              </div>

              {/* 下段：タイトル・サブコピー・状態・矢印 */}
              <div className="px-5 pb-5 pt-4 sm:px-6" style={{ backgroundColor: theme.panel }}>
                <h2
                  className="font-serif text-[25px] font-semibold leading-tight sm:text-[26px]"
                  style={{ color: theme.title }}
                >
                  {meta.enName}
                </h2>
                <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: theme.sub }}>
                  {meta.tagline}
                </p>

                <div className="mt-4 flex items-center justify-between gap-3">
                  {state ? (
                    <span className="inline-flex items-center rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-medium text-[#4c4a44] ring-1 ring-black/[0.05]">
                      {statusLabel(state, progress!)}
                    </span>
                  ) : (
                    <span />
                  )}
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-white/0 transition-colors duration-150 group-hover:bg-white/70"
                    style={{ borderColor: theme.arrowBorder, color: theme.title }}
                  >
                    <ArrowRightIcon className="h-4 w-4" />
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
