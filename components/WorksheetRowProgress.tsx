"use client";

import { useEffect, useState } from "react";
import { loadWorksheetState } from "@/lib/worksheetStorage";
import { countAnsweredWorksheetQuestions, type WorksheetProgress } from "@/lib/worksheetProgress";

/**
 * /worksheets（一覧）の各row用。Worksheetの回答はlocalStorageにのみ保存されており
 * Server Componentからは取得できないため、マウント後にクライアント側だけで読む
 * （PlanWorksheetProgress.tsxと同じ理由・同じパターン。Worksheet answer schemaは変更しない）。
 * 進捗件数を主情報として表示する（activityの日付は呼び出し側で別途、補助的に表示する）。
 */
export default function WorksheetRowProgress({ planId }: { planId: string }) {
  const [progress, setProgress] = useState<WorksheetProgress | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProgress(countAnsweredWorksheetQuestions(loadWorksheetState(planId)));
  }, [planId]);

  if (!progress) return null;

  if (progress.answered === 0) {
    return <span className="text-sm text-worksheet-secondary">まだ始めていません</span>;
  }

  return (
    <span className="text-sm font-medium text-worksheet-primary">
      {progress.answered} / {progress.total} 問
    </span>
  );
}
