"use client";

import { useState } from "react";
import type { BlueprintItem } from "@/lib/planBlueprint";
import type { MyPlanCandidate } from "@/lib/myPlanView";
import { canAddLabel, makeBlueprintItem, patchDestinationsSection } from "@/lib/planBlueprintClient";

/**
 * Destination セクションの編集 island（Step 2-3）。
 *   - primary（第一候補・1件） / interested（行ってみたい都市・複数）
 *   - 追加 / Karte 候補の採用は必ず interested へ（勝手に primary にしない・§30 / §34）
 *   - 「第一候補にする」で interested → primary、旧 primary は interested へ戻す（§31）
 *   - primary 削除は primary=null のみ（別都市を勝手に primary にしない・§32）
 *   - duplicate は primary + interested 全体で判定（§35）
 *
 * write は update_plan_blueprint_section RPC に { primary, interested } だけを渡す。
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
  candidates = [],
  hints = [],
  editingEnabled,
}: {
  planId: string;
  initialPrimary: BlueprintItem | null;
  initialInterested: BlueprintItem[];
  candidates?: MyPlanCandidate[];
  hints?: MyPlanCandidate[];
  editingEnabled: boolean;
}) {
  const [primary, setPrimary] = useState<BlueprintItem | null>(initialPrimary);
  const [interested, setInterested] = useState<BlueprintItem[]>(initialInterested);
  const [openCandidates, setOpenCandidates] = useState<MyPlanCandidate[]>(candidates);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const allLabels = () => [primary, ...interested].filter((x): x is BlueprintItem => x !== null);

  async function commit(nextPrimary: BlueprintItem | null, nextInterested: BlueprintItem[]) {
    const prevP = primary;
    const prevI = interested;
    setPrimary(nextPrimary);
    setInterested(nextInterested);
    setError(null);
    setSaved(false);
    const res = await patchDestinationsSection(planId, nextPrimary, nextInterested, null);
    if (!res.ok) {
      setPrimary(prevP);
      setInterested(prevI);
      setError(
        res.reason === "stale"
          ? "ほかで更新があったようです。ページを再読み込みしてください。"
          : "保存できませんでした。もう一度お試しください。",
      );
      return false;
    }
    setPrimary(res.data.destinations.primary);
    setInterested(res.data.destinations.interested);
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
    const ok = await commit(primary, [...interested, makeBlueprintItem(label)]);
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
    const ok = await commit(primary, [...interested, makeBlueprintItem(c.label)]);
    setBusy(null);
    if (ok) setOpenCandidates((cs) => cs.filter((x) => x.key !== c.key));
  }

  async function handleMakePrimary(item: BlueprintItem) {
    setBusy(`primary:${item.id}`);
    const nextInterested = interested.filter((i) => i.id !== item.id);
    if (primary) nextInterested.push(primary);
    await commit(item, nextInterested);
    setBusy(null);
  }

  async function handleDeletePrimary() {
    setBusy("del:primary");
    await commit(null, interested);
    setBusy(null);
  }

  async function handleDeleteInterested(id: string) {
    setBusy(`del:${id}`);
    await commit(
      primary,
      interested.filter((i) => i.id !== id),
    );
    setBusy(null);
  }

  const disabled = busy !== null;
  const nothing = !primary && interested.length === 0 && openCandidates.length === 0 && hints.length === 0;

  return (
    <div>
      {nothing && (
        <div className="mt-4">
          <p className="text-sm text-[#a8a297]">行ってみたい都市がまだありません。</p>
          <p className="mt-1 text-xs leading-relaxed text-[#b7b1a6]">
            暮らしたい場所や旅してみたい場所を、ここに残していきます。
          </p>
        </div>
      )}

      {primary && (
        <div className="mt-4">
          <p className="text-[10px] font-medium tracking-wide text-[#8a8578]">第一候補</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="inline-flex rounded-xl border border-[#cfdbe6] bg-[#eef3f7] px-4 py-2 text-base font-semibold text-[#2f3a4a]">
              {primary.label}
            </span>
            {editingEnabled && (
              <button
                type="button"
                onClick={handleDeletePrimary}
                disabled={disabled}
                aria-label={`第一候補「${primary.label}」を外す`}
                className="rounded-lg p-1 text-[#b7b1a6] transition-colors hover:bg-[#f0ece2] hover:text-[#6f6a64] disabled:opacity-40"
              >
                <XIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {interested.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] font-medium tracking-wide text-[#8a8578]">行ってみたい都市</p>
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
                      {busy === `primary:${d.id}` ? "…" : "第一候補にする"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteInterested(d.id)}
                      disabled={disabled}
                      aria-label={`「${d.label}」を削除`}
                      className="rounded-full p-1 text-[#b7b1a6] transition-colors hover:bg-[#f0ece2] hover:text-[#6f6a64] disabled:opacity-40"
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

      {openCandidates.length > 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-[#d9d3c8] bg-[#f6f4ec] px-4 py-3">
          <p className="text-[10px] font-semibold tracking-wide text-[#8a8578]">Karteからの候補</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[#a8a297]">
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
          <p className="text-[10px] font-medium tracking-wide text-[#b7b1a6]">都市選びのヒント</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {hints.map((h) => (
              <span key={h.key} className="text-xs text-[#8a8578]">
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
