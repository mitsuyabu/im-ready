"use client";

import { useState } from "react";
import { ACCOMMODATION_PRESETS, type BlueprintAccommodation } from "@/lib/planBlueprint";
import {
  applyAccTiming,
  applyAccType,
  makeBlueprintAccommodation,
  patchAccommodationsSection,
  type BlueprintTimingPatch,
} from "@/lib/planBlueprintClient";
import PlanTimingControl from "@/components/PlanTimingControl";

/**
 * Accommodation（滞在方法）セクションの編集 island。
 *   - ホームステイ / シェアハウス / 学生寮 / ホステル・ホテル / その他（自由入力）
 *   - 各 record に開始時期（0=到着時）/ 期間。同じ type を複数回可（戻る等・§21）
 *   - Karte stated（schoolPrefs.accommodation）は候補として表示、「＋ Planに追加」で採用（§32）
 *
 * write は update_plan_blueprint_section RPC に accommodations 配列だけ渡す。
 * select 変更で auto-save、失敗時 rollback ＋ inline error（§47）。
 */

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

const SELECT_CLS =
  "min-h-[40px] w-full max-w-[220px] rounded-xl border border-[#d8d1c5] bg-[#fffefa] px-2.5 py-1.5 text-base font-medium text-[#3f3c37] focus:outline-none focus:ring-2 focus:ring-[#c9d3bb]/50 disabled:opacity-50 sm:text-[13px]";

export default function EditableAccommodation({
  planId,
  initialAccommodations,
  candidate,
  editingEnabled,
  planDurationMonths = null,
}: {
  planId: string;
  initialAccommodations: BlueprintAccommodation[];
  /** Karte stated 由来の候補（未採用）。 */
  candidate: { type: string; label: string } | null;
  editingEnabled: boolean;
  planDurationMonths?: number | null;
}) {
  const [accs, setAccs] = useState<BlueprintAccommodation[]>(initialAccommodations);
  const [showCandidate, setShowCandidate] = useState(candidate !== null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  async function commit(next: BlueprintAccommodation[]): Promise<boolean> {
    const prev = accs;
    setAccs(next);
    setError(null);
    const res = await patchAccommodationsSection(planId, next, null);
    if (!res.ok) {
      setAccs(prev);
      setError(
        res.reason === "stale"
          ? "ほかで更新があったようです。ページを再読み込みしてください。"
          : "保存できませんでした。もう一度お試しください。",
      );
      return false;
    }
    setAccs(res.data.accommodations);
    return true;
  }

  async function handleAdd(type: string, label?: string) {
    setBusy("add");
    await commit([...accs, makeBlueprintAccommodation(type, label)]);
    setBusy(null);
  }

  async function handleAdoptCandidate() {
    if (!candidate) return;
    setBusy("adopt");
    const ok = await commit([
      ...accs,
      makeBlueprintAccommodation(candidate.type, candidate.type === "other" ? candidate.label : undefined),
    ]);
    setBusy(null);
    if (ok) setShowCandidate(false);
  }

  async function handleDelete(id: string) {
    setBusy(`del:${id}`);
    await commit(accs.filter((a) => a.id !== id));
    setBusy(null);
  }

  async function handleType(id: string, type: string) {
    setBusy(`type:${id}`);
    const current = accs.find((a) => a.id === id);
    await commit(applyAccType(accs, id, type, current?.label));
    setBusy(null);
  }

  async function handleLabel(id: string, label: string) {
    setBusy(`label:${id}`);
    await commit(applyAccType(accs, id, "other", label));
    setBusy(null);
  }

  async function handleTiming(id: string, patch: BlueprintTimingPatch) {
    setBusy(`timing:${id}`);
    setSavedId(null);
    const ok = await commit(applyAccTiming(accs, id, patch));
    setBusy(null);
    if (ok) {
      setSavedId(id);
      window.setTimeout(() => setSavedId((cur) => (cur === id ? null : cur)), 1800);
    }
  }

  const disabled = busy !== null;

  return (
    <div>
      {accs.length === 0 && !showCandidate && (
        <div className="mt-4">
          <p className="text-sm text-[#7d776c]">滞在方法はまだ設定していません。</p>
          <p className="mt-1 text-xs leading-relaxed text-[#8a8578]">
            ホームステイやシェアハウスなど、どんなふうに住むかを期間つきで残せます。
          </p>
        </div>
      )}

      {accs.length > 0 && (
        <ul className="mt-4 space-y-2">
          {accs.map((a) => (
            <li key={a.id} className="rounded-xl border border-[#e5dfd6] bg-white px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                {editingEnabled ? (
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">滞在方法</span>
                    <select
                      value={a.type}
                      disabled={disabled}
                      onChange={(e) => handleType(a.id, e.target.value)}
                      className={SELECT_CLS}
                    >
                      {ACCOMMODATION_PRESETS.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <span className="min-w-0 text-[13px] font-medium text-[#2f3a4a]">
                    {a.type === "other" ? a.label || "その他" : ACCOMMODATION_PRESETS.find((p) => p.key === a.type)?.label ?? a.type}
                  </span>
                )}
                {editingEnabled && (
                  <button
                    type="button"
                    onClick={() => handleDelete(a.id)}
                    disabled={disabled}
                    aria-label="この滞在方法を削除"
                    className="shrink-0 rounded-lg p-1 text-[#8a8578] transition-colors hover:bg-[#f0ece2] hover:text-[#57534b] disabled:opacity-40"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {editingEnabled && a.type === "other" && (
                <input
                  type="text"
                  defaultValue={a.label ?? ""}
                  placeholder="例：住み込み、会社寮、友人宅"
                  maxLength={120}
                  disabled={disabled}
                  onBlur={(e) => {
                    if (e.target.value.trim() !== (a.label ?? "").trim()) {
                      void handleLabel(a.id, e.target.value);
                    }
                  }}
                  className="mt-2 w-full max-w-[280px] rounded-lg border border-[#e6e2d8] bg-white px-3 py-1.5 text-sm text-[#172033] placeholder:text-[#a7a08f] focus:outline-none focus:ring-2 focus:ring-[#c9d3bb]/40 disabled:opacity-60"
                />
              )}

              {editingEnabled && (
                <div className="mt-2 border-t border-[#eef0e9] pt-2.5">
                  <PlanTimingControl
                    startMonth={a.startMonth}
                    durationMonths={a.durationMonths}
                    planDurationMonths={planDurationMonths}
                    minStartMonth={0}
                    zeroMonthLabel="到着時"
                    disabled={disabled}
                    saving={busy === `timing:${a.id}`}
                    saved={savedId === a.id}
                    onChange={(patch) => handleTiming(a.id, patch)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editingEnabled && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleAdd("homestay")}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#cfdbe6] bg-[#eef3f7] px-3.5 py-1.5 text-[13px] font-medium text-[#3a5266] transition-colors hover:bg-[#e2ecf3] disabled:opacity-40"
          >
            <span aria-hidden>＋</span>
            {busy === "add" ? "追加中…" : "滞在方法を追加"}
          </button>
        </div>
      )}

      {showCandidate && candidate && editingEnabled && (
        <div className="mt-4 rounded-xl border border-dashed border-[#d9d3c8] bg-[#f6f4ec] px-4 py-3">
          <p className="text-[10px] font-semibold tracking-wide text-[#6b665d]">Karteからの候補</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[#7d776c]">
            会話やWorksheetから見えている滞在方法の希望
          </p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="min-w-0 text-sm leading-snug text-[#6f6a64]">{candidate.label}</span>
            <button
              type="button"
              onClick={handleAdoptCandidate}
              disabled={disabled}
              className="shrink-0 rounded-full border border-[#c9c2b4] bg-white px-2.5 py-1 text-[11px] font-medium text-[#3a4a5f] transition-colors hover:bg-[#efe9db] disabled:opacity-40"
            >
              {busy === "adopt" ? "追加中…" : "＋ Planに追加"}
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
    </div>
  );
}
