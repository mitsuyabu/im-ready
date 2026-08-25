"use client";

import { useEffect, useState } from "react";
import { loadWorksheetState } from "@/lib/worksheetStorage";
import { countAnsweredWorksheetQuestions, type WorksheetProgress } from "@/lib/worksheetProgress";

/**
 * Worksheetの回答はブラウザのlocalStorageにのみ保存されている（DBには無い）ため、
 * サーバーコンポーネントのPlan Homeでは件数を出せない。マウント後にクライアント側だけで
 * 復元・集計する（Worksheet.tsx本体の復元パターンと同じ理由）。
 * 進捗率・progress barのような見せ方はせず、「8 / 19 問に回答済み」の実数表示のみ行う。
 */
export default function PlanWorksheetProgress({ planId }: { planId: string }) {
  const [progress, setProgress] = useState<WorksheetProgress | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProgress(countAnsweredWorksheetQuestions(loadWorksheetState(planId)));
  }, [planId]);

  if (!progress) return null;

  return (
    <p className="mt-2 text-xs text-worksheet-secondary">
      {progress.answered} / {progress.total} 問に回答済み
    </p>
  );
}
