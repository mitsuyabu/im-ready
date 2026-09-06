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

function optionCount(planDurationMonths: number | null): number {
  // 分からなければ 12。分かれば Plan 期間（12〜24 にクランプ）。
  if (planDurationMonths == null) return 12;
  return Math.min(24, Math.max(12, planDurationMonths));
}

export default function PlanTimingControl({
  startMonth,
  durationMonths,
  planDurationMonths,
  disabled = false,
  saving = false,
  saved = false,
  onChange,
}: {
  startMonth: number | undefined;
  durationMonths: number | undefined;
  planDurationMonths: number | null;
  disabled?: boolean;
  saving?: boolean;
  saved?: boolean;
  onChange: (patch: BlueprintTimingPatch) => void;
}) {
  const startId = useId();
  const durId = useId();
  const count = optionCount(planDurationMonths);
  const startMax = Math.min(24, Math.max(count, planDurationMonths ?? 12));

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
            {Array.from({ length: startMax }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}ヶ月目
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
            {Array.from({ length: count }, (_, i) => i + 1).map((m) => (
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
