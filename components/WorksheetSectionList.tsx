"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CATEGORIES } from "@/lib/worksheetQuestions";
import { loadWorksheetState } from "@/lib/worksheetStorage";
import { countAnsweredInCategory, type WorksheetProgress } from "@/lib/worksheetProgress";
import { WORKSHEET_SECTION_META } from "@/lib/worksheetSectionMeta";

type IconProps = { className?: string };

function iconBaseProps(className?: string) {
  return {
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
}

function WhyIcon({ className }: IconProps) {
  return (
    <svg {...iconBaseProps(className)}>
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3 11.2c.6.4 1 1.1 1 1.8h4c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3Z" />
    </svg>
  );
}

function MyFutureIcon({ className }: IconProps) {
  return (
    <svg {...iconBaseProps(className)}>
      <path d="M4 17l6-6 4 4 6-8M20 7h-4M20 7v4" />
    </svg>
  );
}

function ConditionsIcon({ className }: IconProps) {
  return (
    <svg {...iconBaseProps(className)}>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 3.5h6M9 10h6M9 14h4" />
    </svg>
  );
}

function MyPrioritiesIcon({ className }: IconProps) {
  return (
    <svg {...iconBaseProps(className)}>
      <path d="M12 3.5l2.4 5 5.5.6-4 3.8 1 5.4L12 15.8 7.1 18.3l1-5.4-4-3.8 5.5-.6L12 3.5Z" />
    </svg>
  );
}

function WorriesIcon({ className }: IconProps) {
  return (
    <svg {...iconBaseProps(className)}>
      <path d="M7 17a4 4 0 0 1-.5-7.97A5 5 0 0 1 16.3 8 4.5 4.5 0 0 1 16 17H7Z" />
    </svg>
  );
}

function NextStepIcon({ className }: IconProps) {
  return (
    <svg {...iconBaseProps(className)}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

const SECTION_ICONS: Record<string, (props: IconProps) => React.JSX.Element> = {
  motivation: WhyIcon,
  future: MyFutureIcon,
  conditions: ConditionsIcon,
  priorities: MyPrioritiesIcon,
  anxiety: WorriesIcon,
  nextstep: NextStepIcon,
};

/**
 * 「I'm ready!」のテーマ一覧（セクション選択画面）。
 * Worksheetの回答はlocalStorageにのみ保存されているため、各テーマの回答済み件数は
 * マウント後にクライアント側だけで集計する（PlanWorksheetProgress.tsxと同じ理由・同じパターン）。
 *
 * カードは上部（白背景: 番号・アイコン・テーマ名・回答数）と下部（テーマごとの薄い背景色:
 * 日本語説明）の2エリア構成。強い区切り線は使わず、背景色の違いだけで自然に分ける。
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

  return (
    <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {CATEGORIES.map((category, index) => {
        const meta = WORKSHEET_SECTION_META[category.id];
        const Icon = SECTION_ICONS[category.id];
        const progress = progressByCategory?.[category.id];
        const isComplete = progress ? progress.answered >= progress.total : false;

        return (
          <Link
            key={category.id}
            href={`/plans/${planId}/worksheet/${category.id}`}
            className="group flex h-full flex-col overflow-hidden rounded-[20px] border-[0.5px] border-worksheet-border bg-worksheet-surface transition-colors duration-150 hover:border-worksheet-secondary/40 active:bg-worksheet-sage"
          >
            {/* テーマ領域: 通常時は白〜薄いグレー。hover時（PCのみ効く:hover）だけセージグリーンの
                薄い背景に変化し、選択できるカードであることを示す。mobileはactiveの一瞬だけ同色で軽く反応する。 */}
            <div className="bg-zinc-50 p-5 transition-colors duration-150 group-hover:bg-worksheet-sage dark:bg-zinc-900/40 sm:p-6">
              <span className="text-base font-medium text-worksheet-secondary sm:text-lg">
                {String(index + 1).padStart(2, "0")}
              </span>

              <div className="mt-2 flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-worksheet-sage">
                  <Icon className="h-4 w-4 text-worksheet-primary" />
                </span>
                <h2 className="text-xl font-bold text-worksheet-primary sm:text-2xl">{meta.enName}</h2>
              </div>

              {progress && (
                <p className="mt-3 text-xs text-worksheet-secondary">
                  {isComplete ? (
                    <span className="inline-flex items-center rounded-full bg-worksheet-sage px-2.5 py-1 text-[11px] font-medium text-worksheet-primary">
                      完了
                    </span>
                  ) : (
                    `${progress.answered} / ${progress.total} 回答済み`
                  )}
                </p>
              )}
            </div>

            {/* 説明エリア: 白背景に戻す。min-h-*とline-clamp-3で、説明文の長さが多少違っても
                6枚の高さが揃うようにする。 */}
            <div className="mt-auto bg-worksheet-surface px-5 py-4 sm:px-6">
              <p className="line-clamp-3 min-h-[4.5rem] text-sm leading-relaxed text-worksheet-primary sm:min-h-[5.25rem] sm:text-base">
                {meta.description}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
