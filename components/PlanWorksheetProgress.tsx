"use client";

import { useEffect, useState } from "react";
import type { Karte } from "@/lib/karte";
import { loadWorksheetState, type WorksheetPersistedData } from "@/lib/worksheetStorage";
import { countAnsweredWorksheetQuestions, type WorksheetProgress } from "@/lib/worksheetProgress";
import { countWorksheetKarteCandidates } from "@/lib/worksheetKarteCandidates";

/**
 * Worksheetの回答はブラウザのlocalStorageにのみ保存されている（DBには無い）ため、
 * サーバーコンポーネントのPlan Homeでは件数を出せない。マウント後にクライアント側だけで
 * 復元・集計する（Worksheet.tsx本体の復元パターンと同じ理由）。
 * 進捗率・progress barのような見せ方はせず、「8 / 19 問に回答済み」の実数表示のみ行う。
 *
 * karte が渡された場合は、AI相談からの「回答候補」件数（未回答 & stated & 非conflict）も
 * 同じ pure helper で数え、あれば1行だけ小さく添える（§14 / §15）。候補0なら何も出さない。
 */
export default function PlanWorksheetProgress({
  planId,
  karte,
}: {
  planId: string;
  karte?: Karte | null;
}) {
  const [progress, setProgress] = useState<WorksheetProgress | null>(null);
  const [candidateCount, setCandidateCount] = useState(0);

  useEffect(() => {
    const stored: WorksheetPersistedData | null = loadWorksheetState(planId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProgress(countAnsweredWorksheetQuestions(stored));
    setCandidateCount(karte ? countWorksheetKarteCandidates(karte, stored) : 0);
  }, [planId, karte]);

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
