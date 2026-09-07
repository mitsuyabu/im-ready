"use client";

import { useState } from "react";
import type { BlueprintItem, BlueprintStay } from "@/lib/planBlueprint";
import type { MyPlanCandidate } from "@/lib/myPlanView";
import {
  applyStayCity,
  applyStayTiming,
  canAddLabel,
  makeBlueprintItem,
  makeBlueprintStay,
  patchDestinationsSection,
  type BlueprintTimingPatch,
} from "@/lib/planBlueprintClient";
import PlanTimingControl from "@/components/PlanTimingControl";

/**
 * Destination セクションの編集 island。
 *   - primary（最初の滞在都市・1件） / interested（行ってみたい都市・wishlist・複数）
 *   - stays（実際の滞在スケジュール・複数）: 都市 / 開始時期（0=到着時）/ 期間。同じ都市を複数回可（戻るケース）
 *   - 追加 / Karte 候補の採用は必ず interested へ。「第一候補にする」で interested → primary
 *
 * write は update_plan_blueprint_section RPC に { primary, interested, stays } を渡す。
 * optimistic ＋ 失敗時 rollback。editingEnabled=false では編集 UI を出さない。
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

export default function EditableDestination({
  planId,
  initialPrimary,
  initialInterested,
  initialStays,
  candidates = [],
  hints = [],
  editingEnabled,
  planDurationMonths = null,
}: {
  planId: string;
  initialPrimary: BlueprintItem | null;
  initialInterested: BlueprintItem[];
  initialStays: BlueprintStay[];
  candidates?: MyPlanCandidate[];
  hints?: MyPlanCandidate[];
  editingEnabled: boolean;
  /** stay timing の選択肢範囲 / 超過 warning 用。 */
  planDurationMonths?: number | null;
}) {
  const [primary, setPrimary] = useState<BlueprintItem | null>(initialPrimary);
  const [interested, setInterested] = useState<BlueprintItem[]>(initialInterested);
  const [stays, setStays] = useState<BlueprintStay[]>(initialStays);
  const [openCandidates, setOpenCandidates] = useState<MyPlanCandidate[]>(candidates);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [staySavedId, setStaySavedId] = useState<string | null>(null);

  const allLabels = () => [primary, ...interested].filter((x): x is BlueprintItem => x !== null);
  /** stay の都市 select 候補（primary ＋ interested。重複除去）。 */
  const knownCities = () => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const it of allLabels()) {
      const k = it.label.trim().toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        out.push(it.label);
      }
    }
    return out;
  };

  async function commit(
    nextPrimary: BlueprintItem | null,
    nextInterested: BlueprintItem[],
    nextStays: BlueprintStay[],
  ) {
    const prev = { p: primary, i: interested, s: stays };
    setPrimary(nextPrimary);
    setInterested(nextInterested);
    setStays(nextStays);
    setError(null);
    setSaved(false);
    const res = await patchDestinationsSection(planId, nextPrimary, nextInterested, nextStays, null);
    if (!res.ok) {
      setPrimary(prev.p);
      setInterested(prev.i);
      setStays(prev.s);
      setError(
        res.reason === "stale"
          ? "ほかで更新があったようです。ページを再読み込みしてください。"
          : "保存できませんでした。もう一度お試しください。",
      );
      return false;
    }
    setPrimary(res.data.destinations.primary);
    setInterested(res.data.destinations.interested);
    setStays(res.data.destinations.stays);
    setSaved(true);
    return true;
  }

  async function handleAdd() {
    const label = draft.trim();
    if (!canAddLabel(label, allLabels())) {
      setError(label.length === 0 ? "都市名を入力してください。" : "同じ都市がすでにあります。");
      return;
    }
    setBusy("add");
    const ok = await commit(primary, [...interested, makeBlueprintItem(label)], stays);
    setBusy(null);
    if (ok) {
      setDraft("");
      setAdding(false);
    }
  }

  async function handleAdopt(c: MyPlanCandidate) {
    if (!canAddLabel(c.label, allLabels())) {
      setOpenCandidates((cs) => cs.filter((x) => x.key !== c.key));
      return;
    }
    setBusy(`adopt:${c.key}`);
    const ok = await commit(primary, [...interested, makeBlueprintItem(c.label)], stays);
    setBusy(null);
    if (ok) setOpenCandidates((cs) => cs.filter((x) => x.key !== c.key));
  }

  async function handleMakePrimary(item: BlueprintItem) {
    setBusy(`primary:${item.id}`);
    const nextInterested = interested.filter((i) => i.id !== item.id);
    if (primary) nextInterested.push(primary);
    await commit(item, nextInterested, stays);
    setBusy(null);
  }

  async function handleDeletePrimary() {
    setBusy("del:primary");
    await commit(null, interested, stays);
    setBusy(null);
  }

  async function handleDeleteInterested(id: string) {
    setBusy(`del:${id}`);
    await commit(
      primary,
      interested.filter((i) => i.id !== id),
      stays,
    );
    setBusy(null);
  }

  /* ---- stays ---- */
  async function handleAddStay() {
    const city = knownCities()[0] ?? primary?.label ?? "";
    if (!city) return;
    setBusy("add-stay");
    await commit(primary, interested, [...stays, makeBlueprintStay(city)]);
    setBusy(null);
  }

  async function handleDeleteStay(id: string) {
    setBusy(`del-stay:${id}`);
    await commit(
      primary,
      interested,
      stays.filter((s) => s.id !== id),
    );
    setBusy(null);
  }

  async function handleStayCity(id: string, city: string) {
    setBusy(`stay-city:${id}`);
    await commit(primary, interested, applyStayCity(stays, id, city));
    setBusy(null);
  }

  async function handleStayTiming(id: string, patch: BlueprintTimingPatch) {
    setBusy(`stay-timing:${id}`);
    setStaySavedId(null);
    const ok = await commit(primary, interested, applyStayTiming(stays, id, patch));
    setBusy(null);
    if (ok) {
      setStaySavedId(id);
      window.setTimeout(() => setStaySavedId((cur) => (cur === id ? null : cur)), 1800);
    }
  }

  const disabled = busy !== null;
  const nothing =
    !primary &&
    interested.length === 0 &&
    stays.length === 0 &&
    openCandidates.length === 0 &&
    hints.length === 0;
  const cityOptions = knownCities();

  return (
    <div>
      {nothing && (
        <div className="mt-4">
          <p className="text-sm text-[#7d776c]">行ってみたい都市がまだありません。</p>
          <p className="mt-1 text-xs leading-relaxed text-[#8a8578]">
            暮らしたい場所や旅してみたい場所を、ここに残していきます。
          </p>
        </div>
      )}

      {primary && (
        <div className="mt-4">
          <p className="text-[10px] font-medium tracking-wide text-[#6b665d]">最初の滞在都市</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="inline-flex rounded-xl border border-[#cfdbe6] bg-[#eef3f7] px-4 py-2 text-base font-semibold text-[#2f3a4a]">
              {primary.label}
            </span>
            {editingEnabled && (
              <button
                type="button"
                onClick={handleDeletePrimary}
                disabled={disabled}
                aria-label={`最初の滞在都市「${primary.label}」を外す`}
                className="rounded-lg p-1 text-[#8a8578] transition-colors hover:bg-[#f0ece2] hover:text-[#57534b] disabled:opacity-40"
              >
                <XIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {interested.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] font-medium tracking-wide text-[#6b665d]">行ってみたい都市</p>
          <ul className="mt-1.5 space-y-1.5">
            {interested.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-[#e5dfd6] bg-white px-3 py-2"
              >
                <span className="min-w-0 text-[13px] text-[#3f3a34]">{d.label}</span>
                {editingEnabled && (
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleMakePrimary(d)}
                      disabled={disabled}
                      className="rounded-full border border-[#cfdbe6] bg-[#eef3f7] px-2.5 py-1 text-[11px] font-medium text-[#3a5266] transition-colors hover:bg-[#e2ecf3] disabled:opacity-40"
                    >
                      {busy === `primary:${d.id}` ? "…" : "最初の都市にする"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteInterested(d.id)}
                      disabled={disabled}
                      aria-label={`「${d.label}」を削除`}
                      className="rounded-full p-1 text-[#8a8578] transition-colors hover:bg-[#f0ece2] hover:text-[#57534b] disabled:opacity-40"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {editingEnabled && (
        <div className="mt-3">
          {adding ? (
            <div className="rounded-xl border border-[#e0d9ca] bg-[#faf8f2] p-3">
              <label htmlFor="add-destination" className="sr-only">
                行ってみたい都市を追加
              </label>
              <input
                id="add-destination"
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleAdd();
                  }
                }}
                placeholder="例：ゴールドコースト"
                maxLength={120}
                autoFocus
                disabled={disabled}
                className="w-full rounded-lg border border-[#e6e2d8] bg-white px-3 py-2 text-sm text-[#172033] placeholder:text-[#a7a08f] focus:outline-none focus:ring-2 focus:ring-worksheet-accent/30 disabled:opacity-60"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={disabled}
                  className="inline-flex min-h-[36px] items-center rounded-full bg-[#1e2b3d] px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#172033] disabled:opacity-40"
                >
                  {busy === "add" ? "追加中…" : "追加"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setDraft("");
                    setError(null);
                  }}
                  disabled={disabled}
                  className="inline-flex min-h-[36px] items-center rounded-full px-3 py-1.5 text-sm text-[#6f6a64] transition-colors hover:bg-[#f0ece2] disabled:opacity-40"
                >
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setAdding(true);
                setSaved(false);
                setError(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#e0d9ca] bg-[#f6f2e8] px-3.5 py-1.5 text-[13px] font-medium text-[#3a4a5f] transition-colors hover:bg-[#efe9db]"
            >
              <span aria-hidden>＋</span>
              都市を追加
            </button>
          )}
        </div>
      )}

      {/* 滞在スケジュール（stays）: 都市 / 開始時期（0=到着時）/ 期間。同じ都市を複数回可。 */}
      {(stays.length > 0 || (editingEnabled && cityOptions.length > 0)) && (
        <div className="mt-5">
          <p className="text-[10px] font-medium tracking-wide text-[#6b665d]">滞在スケジュール</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[#8a8578]">
            どの都市に、いつから、どれくらい滞在するか。同じ都市を後から追加すれば「戻る」も表せます。
          </p>
          <ul className="mt-2 space-y-2">
            {stays.map((s) => {
              const opts = cityOptions.includes(s.city) ? cityOptions : [s.city, ...cityOptions];
              return (
                <li key={s.id} className="rounded-xl border border-[#e5dfd6] bg-white px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    {editingEnabled ? (
                      <label className="min-w-0 flex-1">
                        <span className="sr-only">滞在する都市</span>
                        <select
                          value={s.city}
                          disabled={disabled}
                          onChange={(e) => handleStayCity(s.id, e.target.value)}
                          className="min-h-[36px] w-full max-w-[220px] rounded-lg border border-[#d8d1c5] bg-[#fffefa] px-2 py-1 text-base font-medium text-[#2f3a4a] focus:outline-none focus:ring-2 focus:ring-[#c9d3bb]/50 disabled:opacity-50 sm:text-[13px]"
                        >
                          {opts.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <span className="min-w-0 text-[13px] font-medium text-[#2f3a4a]">{s.city}</span>
                    )}
                    {editingEnabled && (
                      <button
                        type="button"
                        onClick={() => handleDeleteStay(s.id)}
                        disabled={disabled}
                        aria-label={`「${s.city}」の滞在を削除`}
                        className="shrink-0 rounded-lg p-1 text-[#8a8578] transition-colors hover:bg-[#f0ece2] hover:text-[#57534b] disabled:opacity-40"
                      >
                        <XIcon className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {editingEnabled && (
                    <div className="mt-2 border-t border-[#eef0e9] pt-2.5">
                      <PlanTimingControl
                        startMonth={s.startMonth}
                        durationMonths={s.durationMonths}
                        planDurationMonths={planDurationMonths}
                        minStartMonth={0}
                        zeroMonthLabel="到着時"
                        disabled={disabled}
                        saving={busy === `stay-timing:${s.id}`}
                        saved={staySavedId === s.id}
                        onChange={(patch) => handleStayTiming(s.id, patch)}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {editingEnabled && (
            <button
              type="button"
              onClick={handleAddStay}
              disabled={disabled || cityOptions.length === 0}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#cfdbe6] bg-[#eef3f7] px-3.5 py-1.5 text-[13px] font-medium text-[#3a5266] transition-colors hover:bg-[#e2ecf3] disabled:opacity-40"
            >
              <span aria-hidden>＋</span>
              {busy === "add-stay" ? "追加中…" : "滞在を追加"}
            </button>
          )}
          {editingEnabled && cityOptions.length === 0 && (
            <p className="mt-1 text-[11px] text-[#8a8578]">
              先に「都市を追加」から滞在する都市を登録してください。
            </p>
          )}
        </div>
      )}

      {openCandidates.length > 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-[#d9d3c8] bg-[#f6f4ec] px-4 py-3">
          <p className="text-[10px] font-semibold tracking-wide text-[#6b665d]">Karteからの候補</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[#7d776c]">
            会話やWorksheetから見えている内容
          </p>
          <ul className="mt-2.5 space-y-2">
            {openCandidates.map((c) => (
              <li key={c.key} className="flex items-start justify-between gap-3">
                <span className="min-w-0 text-sm leading-snug text-[#6f6a64]">{c.label}</span>
                {editingEnabled && (
                  <button
                    type="button"
                    onClick={() => handleAdopt(c)}
                    disabled={disabled}
                    className="shrink-0 rounded-full border border-[#c9c2b4] bg-white px-2.5 py-1 text-[11px] font-medium text-[#3a4a5f] transition-colors hover:bg-[#efe9db] disabled:opacity-40"
                  >
                    {busy === `adopt:${c.key}` ? "追加中…" : "＋ Planに追加"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {hints.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-medium tracking-wide text-[#8a8578]">都市選びのヒント</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {hints.map((h) => (
              <span key={h.key} className="text-xs text-[#6b665d]">
                {h.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      {saved && !error && <p className="mt-3 text-xs text-[#5f7050]">保存しました</p>}
    </div>
  );
}
