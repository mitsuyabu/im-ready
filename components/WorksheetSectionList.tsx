"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { CATEGORIES } from "@/lib/worksheetQuestions";
import { loadWorksheetState } from "@/lib/worksheetStorage";
import { countAnsweredInCategory, type WorksheetProgress } from "@/lib/worksheetProgress";
import { WORKSHEET_SECTION_META } from "@/lib/worksheetSectionMeta";

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
 * 各テーマカードのビジュアル。共有された6枚のカード画像をそのまま使う
 * （背景色・枠・角丸・大きな連番・タイトル・サブコピー・右下の矢印・装飾線は画像側が持つ）。
 * 画像は public/worksheet-cards/*.webp（拡張子どおりの本物のWebP）。intrinsic size は各画像の実寸で、
 * next/image に width/height を渡して h-auto で比率を保つ（トリミングしない）。
 * key は既存 CATEGORIES の category.id で、遷移先ルートも既存のまま。
 */
const CARD_IMAGE: Record<string, { src: string; w: number; h: number }> = {
  motivation: { src: "/worksheet-cards/why.webp", w: 1536, h: 1024 },
  future: { src: "/worksheet-cards/my-future.webp", w: 1536, h: 1024 },
  conditions: { src: "/worksheet-cards/conditions.webp", w: 1570, h: 1002 },
  priorities: { src: "/worksheet-cards/my-priorities.webp", w: 1609, h: 977 },
  anxiety: { src: "/worksheet-cards/worries.webp", w: 1663, h: 945 },
  nextstep: { src: "/worksheet-cards/next-step.webp", w: 1557, h: 1010 },
};

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
 * Worksheet の回答は localStorage にのみ保存されているため、各テーマの回答済み件数と
 * 「整理済み」判定はマウント後にクライアント側だけで集計する
 * （PlanWorksheetProgress.tsx と同じ理由・同じパターン。判定ロジック・保存形式は変更しない）。
 *
 * 見た目は、共有された6枚のカード画像を next/image でそのままカードUIとして表示する。
 * 上部の summary bar（テーマ数・整理済み数・見直し導線）は実データ由来のまま維持。
 * カードごとの進捗は、画像デザインを邪魔しないよう画像の「下」に小さく添えるだけにする。
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

  return (
    <div className="mt-8">
      {/* summary bar（実データ由来の進捗表示） */}
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

      {/* テーマカード一覧: 共有画像をそのままカードとして使う */}
      <div className="mt-6 grid grid-cols-1 items-start gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
        {CATEGORIES.map((category) => {
          const meta = WORKSHEET_SECTION_META[category.id];
          const img = CARD_IMAGE[category.id];
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
              className="group block rounded-[18px] transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2b2a26]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f7f4ec]"
            >
              {img ? (
                <Image
                  src={img.src}
                  alt={`${meta.enName} — ${meta.tagline}`}
                  width={img.w}
                  height={img.h}
                  className="h-auto w-full"
                  sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 92vw"
                />
              ) : (
                // 画像が無い場合のフォールバック（通常発生しない。CATEGORIES は6テーマ固定）
                <span className="block rounded-[18px] border border-[#e4ddcf] bg-white px-5 py-6 font-serif text-2xl text-[#2b2a26]">
                  {meta.enName}
                </span>
              )}

              {state && (
                <p className="mt-2 flex items-center gap-1.5 px-1 text-[11px] text-[#6f6b62]">
                  <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${statusDotClass(state)}`} />
                  {statusLabel(state, progress!)}
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
