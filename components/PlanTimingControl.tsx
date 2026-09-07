"use client";

import { useId } from "react";
import type { BlueprintTimingPatch } from "@/lib/planBlueprintClient";

/**
 * duration activity（School / Work 等）の「何ヶ月目から・何ヶ月間」を設定する小さな control。
 *
 *   開始 [ 1ヶ月目 ▼ ]   期間 [ 2ヶ月 ▼ ]
 *
 * - select 変更で即 onChange（呼び出し側が auto-save）。明示 保存 button は持たない（§32）。
 * - 「未定」を必ず用意（値なし＝null）。「0ヶ月＝やらない」は表現しない（Plan から外す・§9）。
 * - 選択肢の上限は Plan 全体期間（分かれば）に合わせる。分からなければ 12（§8）。
 * - Plan 期間を超える設定は警告のみ・保存はブロックしない（§21 / §22）。
 * - native select・visible label・mobile 16px 以上（§30 / §49）。
 */

const SELECT_CLS =
  "min-h-[40px] w-full rounded-xl border border-[#d8d1c5] bg-[#fffefa] px-2.5 py-1.5 text-base text-[#3f3c37] transition-colors focus:border-[#b9c4a8] focus:outline-none focus:ring-2 focus:ring-[#c9d3bb]/50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-[128px] sm:text-[13px]";
const LABEL_CLS = "text-[11px] font-medium tracking-wide text-[#7d776c]";

/** min..max の連番。既存の保存値が範囲外でも option から消さない（§27 / §28）。 */
function monthOptions(max: number, current: number | undefined, min = 1): number[] {
  const set = new Set<number>();
  for (let i = min; i <= max; i += 1) set.add(i);
  if (typeof current === "number" && Number.isInteger(current) && current >= min) set.add(current);
  return [...set].sort((a, b) => a - b);
}

/** activity timing の選択肢上限。Plan 全体期間が分かればそれに合わせる（§27）。分からなければ 12。 */
function activityMonthMax(planDurationMonths: number | null): number {
  if (planDurationMonths == null) return 12;
  return Math.min(24, Math.max(3, planDurationMonths));
}

export default function PlanTimingControl({
  startMonth,
  durationMonths,
  planDurationMonths,
  minStartMonth = 1,
  zeroMonthLabel,
  disabled = false,
  saving = false,
  saved = false,
  onChange,
}: {
  startMonth: number | undefined;
  durationMonths: number | undefined;
  planDurationMonths: number | null;
  /** 開始月の下限。Destination のみ 0（到着時）を許可（§4 / §21）。既定 1（School / Work）。 */
  minStartMonth?: 0 | 1;
  /** minStartMonth=0 のときの「0」の表示ラベル（例: "到着時"）。 */
  zeroMonthLabel?: string;
  disabled?: boolean;
  saving?: boolean;
  saved?: boolean;
  onChange: (patch: BlueprintTimingPatch) => void;
}) {
  const startId = useId();
  const durId = useId();
  const max = activityMonthMax(planDurationMonths);
  const startOpts = monthOptions(max, startMonth, minStartMonth);
  const durOpts = monthOptions(max, durationMonths);

  const startOptionLabel = (m: number) =>
    m === 0 ? (zeroMonthLabel ?? "0ヶ月目") : `${m}ヶ月目`;

  const overPlan =
    typeof startMonth === "number" &&
    typeof durationMonths === "number" &&
    planDurationMonths != null &&
    startMonth - 1 + durationMonths > planDurationMonths;

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
        <label htmlFor={startId} className="flex flex-col gap-0.5">
          <span className={LABEL_CLS}>開始</span>
          <select
            id={startId}
            className={SELECT_CLS}
            disabled={disabled}
            value={typeof startMonth === "number" ? String(startMonth) : ""}
            onChange={(e) =>
              onChange({ startMonth: e.target.value === "" ? null : Number(e.target.value) })
            }
          >
            <option value="">未定</option>
            {startOpts.map((m) => (
              <option key={m} value={m}>
                {startOptionLabel(m)}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor={durId} className="flex flex-col gap-0.5">
          <span className={LABEL_CLS}>期間</span>
          <select
            id={durId}
            className={SELECT_CLS}
            disabled={disabled}
            value={typeof durationMonths === "number" ? String(durationMonths) : ""}
            onChange={(e) =>
              onChange({ durationMonths: e.target.value === "" ? null : Number(e.target.value) })
            }
          >
            <option value="">未定</option>
            {durOpts.map((m) => (
              <option key={m} value={m}>
                {m}ヶ月
              </option>
            ))}
          </select>
        </label>

        {(saving || saved) && (
          <span className="text-[11px] text-[#5f7050] sm:pb-2">
            {saving ? "保存中…" : "保存しました"}
          </span>
        )}
      </div>

      {overPlan && (
        <p className="mt-1 text-[11px] leading-relaxed text-[#9a6a3c]">
          この期間は{planDurationMonths}ヶ月のPlanを超えています。
        </p>
      )}
    </div>
  );
}
