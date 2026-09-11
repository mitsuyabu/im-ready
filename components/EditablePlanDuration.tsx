"use client";

import { useId, useState } from "react";
import {
  PLAN_DURATION_MONTH_OPTIONS,
  patchPlanSettingsSection,
} from "@/lib/planBlueprintClient";
import type { PlanDurationSource } from "@/lib/myPlanView";

/**
 * YOUR PLAN AT A GLANCE の「期間」metric を編集可能にする小さな client island（Step 2-8）。
 *
 * - 常時 select。select 変更で auto-save（`update_plan_blueprint_section("planSettings", …)`）。
 * - 表示は「実効値」（My Plan user-saved > Karte fallback）。Karte fallback 中は小さく「Karteから」。
 * - 「未定」= override 解除（planSettings に {} を保存）→ Karte 値があれば即その値へ戻る（§20）。
 * - editingEnabled=false（blueprint unavailable）は plain text（操作できそうに見せない・§38）。
 * - Hero をフォーム化しすぎない。他 metric と同じカード見た目に収める（§13 / §51）。
 */

function ClockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export default function EditablePlanDuration({
  planId,
  blueprintMonths,
  karteMonths,
  editingEnabled,
}: {
  planId: string;
  /** My Plan user-saved（planSettings.durationMonths）。無ければ null。 */
  blueprintMonths: number | null;
  /** Karte から機械変換した期間（月）。override 解除時の fallback。 */
  karteMonths: number | null;
  editingEnabled: boolean;
}) {
  const selectId = useId();
  const [override, setOverride] = useState<number | null>(blueprintMonths);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effective = override ?? karteMonths;
  const source: PlanDurationSource =
    override != null ? "blueprint" : karteMonths != null ? "karte" : "unknown";

  const options = (() => {
    const set = new Set<number>(PLAN_DURATION_MONTH_OPTIONS);
    // 既存保存値が preset に無くても option から消さない（§28）。
    if (override != null) set.add(override);
    return [...set].sort((a, b) => a - b);
  })();

  async function save(raw: string) {
    const next = raw === "" ? null : Number(raw);
    const prev = override;
    setOverride(next);
    setError(null);
    setSaved(false);
    setBusy(true);
    const res = await patchPlanSettingsSection(
      planId,
      next == null ? {} : { durationMonths: next },
      null,
    );
    setBusy(false);
    if (!res.ok) {
      setOverride(prev);
      setError("保存できませんでした。");
      return;
    }
    setOverride(
      typeof res.data.planSettings.durationMonths === "number"
        ? res.data.planSettings.durationMonths
        : null,
    );
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/80 bg-white/85 px-4 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/80 text-[#5b6b63]">
        <ClockIcon />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium tracking-wide text-[#68727c]">
          期間
          {source === "karte" && <span className="ml-1 text-[#8a949c]">／Karteから</span>}
        </p>

        {editingEnabled ? (
          <>
            <label htmlFor={selectId} className="sr-only">
              留学全体の期間
            </label>
            <select
              id={selectId}
              value={effective != null ? String(effective) : ""}
              disabled={busy}
              onChange={(e) => save(e.target.value)}
              className="mt-0.5 w-full rounded-xl border border-white/80 bg-white/65 px-2 py-1 text-base font-semibold text-[#172033] transition-colors hover:bg-white/85 focus:outline-none focus:ring-2 focus:ring-white/80 disabled:opacity-60 sm:text-[13px]"
            >
              <option value="">未定</option>
              {options.map((m) => (
                <option key={m} value={m}>
                  {m}ヶ月
                </option>
              ))}
            </select>
            <span className="mt-0.5 block min-h-[12px] text-[10px] leading-3 text-[#5f7050]">
              {busy ? "保存中…" : saved ? "保存しました" : ""}
            </span>
            {error && <span className="block text-[10px] leading-3 text-red-600">{error}</span>}
          </>
        ) : (
          <p
            className={`mt-0.5 truncate text-sm font-semibold ${effective != null ? "text-[#172033]" : "text-[#98a1a8]"}`}
          >
            {effective != null ? `${effective}ヶ月` : "これから整理"}
          </p>
        )}
      </div>
    </div>
  );
}
