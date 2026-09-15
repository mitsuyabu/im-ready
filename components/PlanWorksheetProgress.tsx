"use client";

import { useEffect, useState } from "react";
import type { Karte } from "@/lib/karte";
import type { WorksheetPersistedData } from "@/lib/worksheetStorage";
import type { LoadedPlanWorksheet } from "@/lib/planWorksheet";
import { resolvePlanWorksheetForDisplay, serverWorksheetStateOrNull } from "@/lib/planWorksheetClient";
import { countAnsweredWorksheetQuestions, type WorksheetProgress } from "@/lib/worksheetProgress";
import { countWorksheetKarteCandidates } from "@/lib/worksheetKarteCandidates";

/**
 * Worksheet の回答済み件数。回答の正本は plan_worksheet（server component が読んで渡す）なので、
 * どの端末でも同じ件数になる。サーバーに回答があれば初回描画から出し、無ければ（未移行・
 * migration 未適用）マウント後にこの端末の localStorage から集計する（移行もそこで1回だけ行う）。
 * 進捗率・progress barのような見せ方はせず、「8 / 19 問に回答済み」の実数表示のみ行う。
 *
 * karte が渡された場合は、AI相談からの「回答候補」件数（未回答 & stated & 非conflict）も
 * 同じ pure helper で数え、あれば1行だけ小さく添える（§14 / §15）。候補0なら何も出さない。
 */
export default function PlanWorksheetProgress({
  planId,
  karte,
  serverWorksheet,
}: {
  planId: string;
  karte?: Karte | null;
  serverWorksheet?: LoadedPlanWorksheet;
}) {
  const fromServer = serverWorksheetStateOrNull(serverWorksheet);
  const [stored, setStored] = useState<WorksheetPersistedData | null | undefined>(
    fromServer ?? undefined,
  );

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

  // undefined = まだ決まっていない（件数を仮に 0 と表示しない）
  const progress: WorksheetProgress | null =
    stored === undefined ? null : countAnsweredWorksheetQuestions(stored);
  const candidateCount = stored !== undefined && karte ? countWorksheetKarteCandidates(karte, stored) : 0;

  if (!progress) return null;

  return (
    <>
      <p className="mt-2 text-xs text-worksheet-secondary">
        {progress.answered} / {progress.total} 問に回答済み
      </p>
      {candidateCount > 0 && (
        <span className="mt-1 block text-[11px] text-[#5a7186]">
          AI相談から{candidateCount}件候補あり
        </span>
      )}
    </>
  );
}
