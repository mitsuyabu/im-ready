"use client";

import { useEffect, useState } from "react";
import type { WorksheetPersistedData } from "@/lib/worksheetStorage";
import type { LoadedPlanWorksheet } from "@/lib/planWorksheet";
import { resolvePlanWorksheetForDisplay, serverWorksheetStateOrNull } from "@/lib/planWorksheetClient";
import { countAnsweredWorksheetQuestions, type WorksheetProgress } from "@/lib/worksheetProgress";

/**
 * /worksheets（一覧）の各row用。回答の正本 plan_worksheet（一覧ページが全 Plan 分まとめて読む）から
 * 件数を出す。サーバーに無い Plan だけマウント後にこの端末の localStorage を見る
 * （PlanWorksheetProgress.tsx と同じ決まり方）。
 * 進捗件数を主情報として表示する（activityの日付は呼び出し側で別途、補助的に表示する）。
 */
export default function WorksheetRowProgress({
  planId,
  serverWorksheet,
}: {
  planId: string;
  serverWorksheet?: LoadedPlanWorksheet;
}) {
  const fromServer = serverWorksheetStateOrNull(serverWorksheet);
  const [stored, setStored] = useState<WorksheetPersistedData | null | undefined>(fromServer ?? undefined);

  useEffect(() => {
    if (serverWorksheetStateOrNull(serverWorksheet)) return;
    let cancelled = false;
    void resolvePlanWorksheetForDisplay(planId, serverWorksheet).then((data) => {
      if (!cancelled) setStored(data);
    });
    return () => {
      cancelled = true;
    };
  }, [planId, serverWorksheet]);

  const progress: WorksheetProgress | null =
    stored === undefined ? null : countAnsweredWorksheetQuestions(stored);

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
