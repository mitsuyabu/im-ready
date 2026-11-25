"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CATEGORIES } from "@/lib/worksheetQuestions";
import type { WorksheetPersistedData } from "@/lib/worksheetStorage";
import type { LoadedPlanWorksheet } from "@/lib/planWorksheet";
import { resolvePlanWorksheetForDisplay, serverWorksheetStateOrNull } from "@/lib/planWorksheetClient";
import { countAnsweredInCategory, type WorksheetProgress } from "@/lib/worksheetProgress";
import { WORKSHEET_SECTION_META } from "@/lib/worksheetSectionMeta";
import { worksheetSectionTheme } from "@/lib/worksheetSectionTheme";

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

/**
 * 各テーマのイラスト。6枚で 1 つのアイコンセットに見えるよう、次の 4 点を必ず揃える:
 *   - viewBox は 0 0 48 48（正方形）
 *   - 線は currentColor / strokeWidth 1.5 / 端と角は round（カード側で色を一度だけ指定する）
 *   - 塗りは「いま選ばれている / 進んでいる部分」だけ。色はテーマごと（SECTION_THEME.accent）
 *   - モチーフは 1 テーマ 1〜2 要素まで（説明しすぎない）
 * ラスター画像ではなくインライン SVG なので、どの解像度でもにじまず、assets も増えない。
 */
type IlloProps = { className?: string; accent: string };

function illoProps(className?: string) {
  return {
    viewBox: "0 0 48 48",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
}

/** 01 WHY: 問いかけ（はてな 1 つだけ）。 */
function WhyIllo({ className, accent }: IlloProps) {
  return (
    <svg {...illoProps(className)}>
      <path d="M17.8 19.2a6.2 6.2 0 1 1 6.2 6.9v3.2" />
      <circle cx="24" cy="34.4" r="2" fill={accent} />
    </svg>
  );
}

/**
 * 02 MY FUTURE: この先へ続く戸口（向こう側に光がある）。
 * 「道 + 太陽」「地平線 + 太陽」も試したが、44px ではどちらも
 * 人のシルエット（頭と肩）に見えたため、戸口のかたちにしている。
 */
function FutureIllo({ className, accent }: IlloProps) {
  return (
    <svg {...illoProps(className)}>
      <path d="M15 37V22a9 9 0 0 1 18 0v15" fill={accent} />
    </svg>
  );
}

/** 03 CONDITIONS: 複数の条件を少しずつ決めていく（つまみの位置がそれぞれ違う）。 */
function ConditionsIllo({ className, accent }: IlloProps) {
  return (
    <svg {...illoProps(className)}>
      <path d="M9 15h30M9 24h30M9 33h30" />
      <circle cx="19" cy="15" r="3" fill={accent} />
      <circle cx="29" cy="24" r="3" fill={accent} />
      <circle cx="15" cy="33" r="3" fill={accent} />
    </svg>
  );
}

/** 04 MY PRIORITIES: 並べた中の 1 番目だけを選び取る。 */
function PrioritiesIllo({ className, accent }: IlloProps) {
  return (
    <svg {...illoProps(className)}>
      <rect x="9" y="10" width="30" height="7" rx="3.5" fill={accent} />
      <rect x="9" y="21.5" width="22" height="7" rx="3.5" />
      <rect x="9" y="33" width="14" height="7" rx="3.5" />
    </svg>
  );
}

/** 05 WORRIES: 小さな雲（重くしない。うしろに光を残す）。 */
function WorriesIllo({ className, accent }: IlloProps) {
  return (
    <svg {...illoProps(className)}>
      <circle cx="33.5" cy="16.5" r="4.2" fill={accent} />
      <path
        d="M16.5 33h15a6 6 0 0 0 .6-12 8.2 8.2 0 0 0-15.3 2.2A5 5 0 0 0 16.5 33Z"
        fill="#ffffff"
      />
    </svg>
  );
}

/** 06 NEXT STEP: 低い階段と、いま上がる一段。 */
function NextStepIllo({ className, accent }: IlloProps) {
  return (
    <svg {...illoProps(className)}>
      <path d="M8 35h10v-7h10v-7h12" />
      <circle cx="34" cy="18" r="3" fill={accent} />
    </svg>
  );
}

/**
 * category.id とイラストの対応。テーマが増減したときに気づけるよう、
 * 描画側では「無ければ何も描かない」ではなく必ずここを引く。
 */
const SECTION_ILLO: Record<string, (props: IlloProps) => React.JSX.Element> = {
  motivation: WhyIllo,
  future: FutureIllo,
  conditions: ConditionsIllo,
  priorities: PrioritiesIllo,
  anxiety: WorriesIllo,
  nextstep: NextStepIllo,
};

/*
 * テーマごとの色は lib/worksheetSectionTheme.ts に集約した（テーマ詳細画面と共用）。
 * **カード本体は白のまま**で、色が付くのは下部フッター帯（theme.tint）と
 * イラストのアクセント（theme.accent）だけ。彩度は低く、白との差は 1.1 倍程度。
 * 進捗の状態（整理済み / 整理中 / 未整理）とは無関係で、状態はドットの色だけで表す。
 */

type SectionState = "complete" | "partial" | "empty";

function statusLabel(state: SectionState, progress: WorksheetProgress): string {
  if (state === "complete") return "整理済み";
  if (state === "partial") return `整理中 ${progress.answered}/${progress.total}`;
  return "未整理";
}

function statusDotClass(state: SectionState): string {
  if (state === "complete") return "bg-[#7d9a63]";
  if (state === "partial") return "bg-[#c8a15a]";
  return "bg-[#bdb8ad]";
}

/**
 * 「I'm ready!」のテーマ一覧（セクション選択画面）。
 * 各テーマの回答済み件数と「整理済み」判定は、回答の正本（plan_worksheet）から集計する。
 * サーバーに回答があれば初回描画から出し、無ければ（未移行・migration 未適用）マウント後に
 * この端末の localStorage から集計する（lib/planWorksheetClient.ts。移行もそこで1回だけ行う）。
 *
 * 見た目は、番号 / 英語タイトル / 日本語の一行 / 小さなイラスト を実テキストと SVG で組む
 * （以前は 6 枚の完成画像をそのまま貼っていたため、文字がにじみ・教材的に見えていた）。
 * 上部の summary bar（テーマ数・整理済み数・見直し導線）は実データ由来のまま維持。
 * カードごとの進捗はカード下端に小さく添える。読み込み前後で高さが動かないよう枠は常に置く。
 */
function progressFor(data: WorksheetPersistedData | null): Record<string, WorksheetProgress> {
  const next: Record<string, WorksheetProgress> = {};
  for (const category of CATEGORIES) {
    next[category.id] = countAnsweredInCategory(data, category);
  }
  return next;
}

export default function WorksheetSectionList({
  planId,
  serverWorksheet,
}: {
  planId: string;
  serverWorksheet?: LoadedPlanWorksheet;
}) {
  const [progressByCategory, setProgressByCategory] = useState<Record<string, WorksheetProgress> | null>(() => {
    const fromServer = serverWorksheetStateOrNull(serverWorksheet);
    return fromServer ? progressFor(fromServer) : null;
  });

  useEffect(() => {
    if (serverWorksheetStateOrNull(serverWorksheet)) return;
    let cancelled = false;
    void resolvePlanWorksheetForDisplay(planId, serverWorksheet).then((data) => {
      if (!cancelled) setProgressByCategory(progressFor(data));
    });
    return () => {
      cancelled = true;
    };
  }, [planId, serverWorksheet]);

  const totalThemes = CATEGORIES.length;
  const completedThemes = progressByCategory
    ? CATEGORIES.filter((c) => {
        const p = progressByCategory[c.id];
        return p && p.answered >= p.total;
      }).length
    : null;

  return (
    <div className="mt-8">
      {/* summary bar（実データ由来の進捗表示） */}
      <div className="flex flex-col gap-3 rounded-2xl border border-[#e4ddcf] bg-[#fdfbf4] px-5 py-4 shadow-card sm:flex-row sm:items-center sm:gap-5 sm:px-6">
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

      {/*
        テーマカード一覧。
        カードは白地 + 細い border + 既存の shadow-card。色でテーマを塗り分けず、
        番号・小さなイラストだけに控えめなアクセントを置く（見やすさを優先する）。
        高さは 1 行の中で揃え（items-stretch）、進捗行は常に下端に来るようにする。
      */}
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
        {CATEGORIES.map((category, index) => {
          const meta = WORKSHEET_SECTION_META[category.id];
          const Illo = SECTION_ILLO[category.id];
          const theme = worksheetSectionTheme(category.id);
          const progress = progressByCategory?.[category.id];
          const state: SectionState | null = progress
            ? progress.answered >= progress.total
              ? "complete"
              : progress.answered > 0
                ? "partial"
                : "empty"
            : null;

          return (
            <Link
              key={category.id}
              href={`/plans/${planId}/worksheet/${category.id}`}
              className="group flex min-h-[208px] flex-col overflow-hidden rounded-[18px] border border-[#e9e4d9] bg-white p-7 shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-[#d8d1c1] hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2b2a26]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white sm:min-h-[232px] sm:p-8"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="font-serif text-[13px] tracking-[0.2em] text-[#a8a296]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {Illo && (
                  <Illo
                    className="h-12 w-12 shrink-0 text-[#3f3d38] sm:h-14 sm:w-14"
                    accent={theme.accent}
                  />
                )}
              </div>

              <h2 className="mt-5 font-serif text-[28px] leading-[1.15] tracking-tight text-[#26251f] sm:text-[31px]">
                {meta.enName}
              </h2>
              <p className="mt-2 text-[14px] leading-relaxed text-[#6f6b62]">{meta.tagline}</p>

              {/*
                フッター帯。負の margin でカード内側の余白を打ち消し、カード幅いっぱいの
                帯にする（カードの大きさ・余白そのものは変えない。角丸は overflow-hidden 任せ）。
                state が決まる前も帯と高さはそのまま出すので、描画後に高さが動かない。
              */}
              <div
                className="-mx-7 -mb-7 mt-auto flex min-h-[22px] items-center gap-2 px-7 py-3.5 text-[12px] text-[#67635b] sm:-mx-8 sm:-mb-8 sm:px-8"
                style={{ backgroundColor: theme.tint }}
              >
                {state && (
                  <>
                    <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClass(state)}`} />
                    {statusLabel(state, progress!)}
                  </>
                )}
                <span
                  aria-hidden
                  className="ml-auto text-[#8f8a80] transition-transform duration-200 group-hover:translate-x-0.5"
                >
                  →
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
