"use client";

import { useState } from "react";
import type { BlueprintItem } from "@/lib/planBlueprint";
import type { MyPlanCandidate } from "@/lib/myPlanView";
import {
  canAddLabel,
  makeBlueprintItem,
  patchItemsSection,
  type BlueprintSectionKey,
} from "@/lib/planBlueprintClient";

/**
 * Goals / Work / Things to Do / Visa & Milestones の共通編集 island（Step 2-3）。
 *
 * 3 層構成:
 *   1. saved（自分の Plan・主役）        … 追加 / 削除できる
 *   2. candidates（Karte 由来・採用可）  … 「＋ Planに追加」で saved へ（Goals のみ）
 *   3. hints（Karte 由来・read-only）    … 「意向」だけの情報。採用ボタンは付けない（Work / Milestones）
 *
 * write は data 全体を送らず、update_plan_blueprint_section RPC に当該セクションの新配列だけ渡す。
 * optimistic UI ＋ 失敗時 rollback。editingEnabled=false（blueprint unavailable）では編集 UI を出さない。
 */

type ItemSection = Exclude<BlueprintSectionKey, "destinations">;

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

export default function EditablePlanItems({
  planId,
  section,
  initialItems,
  candidates = [],
  hints = [],
  addLabel,
  placeholder,
  emptyLine,
  emptyHelper,
  layout = "rows",
  editingEnabled,
  extraFooter,
}: {
  planId: string;
  section: ItemSection;
  initialItems: BlueprintItem[];
  candidates?: MyPlanCandidate[];
  hints?: MyPlanCandidate[];
  addLabel: string;
  placeholder: string;
  emptyLine: string;
  emptyHelper: string;
  layout?: "rows" | "chips";
  editingEnabled: boolean;
  extraFooter?: React.ReactNode;
}) {
  const [items, setItems] = useState<BlueprintItem[]>(initialItems);
  const [openCandidates, setOpenCandidates] = useState<MyPlanCandidate[]>(candidates);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const inputId = `add-${section}`;

  async function commit(nextItems: BlueprintItem[]): Promise<boolean> {
    const prev = items;
    setItems(nextItems);
    setError(null);
    setSaved(false);
    const res = await patchItemsSection(section, planId, nextItems, null);
    if (!res.ok) {
      setItems(prev);
      setError(
        res.reason === "stale"
          ? "ほかで更新があったようです。ページを再読み込みしてください。"
          : "保存できませんでした。もう一度お試しください。",
      );
      return false;
    }
    setItems(res.data[section]);
    setSaved(true);
    return true;
  }

  async function handleAdd() {
    const label = draft.trim();
    if (!canAddLabel(label, items)) {
      setError(label.length === 0 ? "内容を入力してください。" : "同じ内容がすでにあります。");
      return;
    }
    setBusy("add");
    const ok = await commit([...items, makeBlueprintItem(label)]);
    setBusy(null);
    if (ok) {
      setDraft("");
      setAdding(false);
    }
  }

  async function handleAdopt(c: MyPlanCandidate) {
    if (!canAddLabel(c.label, items)) {
      // 既に同じ内容がある → 候補だけ消す
      setOpenCandidates((cs) => cs.filter((x) => x.key !== c.key));
      return;
    }
    setBusy(`adopt:${c.key}`);
    const ok = await commit([...items, makeBlueprintItem(c.label)]);
    setBusy(null);
    if (ok) setOpenCandidates((cs) => cs.filter((x) => x.key !== c.key));
  }

  async function handleDelete(id: string) {
    setBusy(`del:${id}`);
    await commit(items.filter((i) => i.id !== id));
    setBusy(null);
  }

  const disabled = busy !== null;

  /* ---------------- saved ---------------- */
  const savedBlock =
    items.length === 0 ? null : layout === "chips" ? (
      <div className="mt-4 flex flex-wrap gap-2">
        {items.map((it) => (
          <span
            key={it.id}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5dfd6] bg-white py-1.5 pl-3 pr-1.5 text-[13px] text-[#3f3a34]"
            title={it.note ?? undefined}
          >
            {it.label}
            {editingEnabled && (
              <button
                type="button"
                onClick={() => handleDelete(it.id)}
                disabled={disabled}
                aria-label={`「${it.label}」を削除`}
                className="rounded-full p-0.5 text-[#b7b1a6] transition-colors hover:bg-[#f0ece2] hover:text-[#6f6a64] disabled:opacity-40"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        ))}
      </div>
    ) : (
      <ul className="mt-4 space-y-2">
        {items.map((it) => (
          <li
            key={it.id}
            className="flex items-start justify-between gap-3 rounded-xl border border-[#e5dfd6] bg-white px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium leading-snug text-[#2f2c26]">{it.label}</p>
              {it.note && (
                <p className="mt-0.5 text-xs leading-relaxed text-[#8a8578]">{it.note}</p>
              )}
            </div>
            {editingEnabled && (
              <button
                type="button"
                onClick={() => handleDelete(it.id)}
                disabled={disabled}
                aria-label={`「${it.label}」を削除`}
                className="mt-0.5 shrink-0 rounded-lg px-2 py-1 text-xs text-[#b7b1a6] transition-colors hover:bg-[#f0ece2] hover:text-[#6f6a64] disabled:opacity-40"
              >
                削除
              </button>
            )}
          </li>
        ))}
      </ul>
    );

  return (
    <div>
      {items.length === 0 && openCandidates.length === 0 && hints.length === 0 && (
        <div className="mt-4">
          <p className="text-sm text-[#a8a297]">{emptyLine}</p>
          <p className="mt-1 text-xs leading-relaxed text-[#b7b1a6]">{emptyHelper}</p>
        </div>
      )}

      {savedBlock}

      {/* add */}
      {editingEnabled && (
        <div className="mt-3">
          {adding ? (
            <div className="rounded-xl border border-[#e0d9ca] bg-[#faf8f2] p-3">
              <label htmlFor={inputId} className="sr-only">
                {addLabel}
              </label>
              <input
                id={inputId}
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleAdd();
                  }
                }}
                placeholder={placeholder}
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
              {addLabel}
            </button>
          )}
        </div>
      )}

      {/* Karte 候補（採用可） */}
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

      {/* Karte ヒント（read-only） */}
      {hints.length > 0 && (
        <div className="mt-4 rounded-xl bg-[#f2f4ee] px-4 py-3">
          <p className="text-[10px] font-medium tracking-wide text-[#8a8578]">Karteからのヒント</p>
          <ul className="mt-1 space-y-1">
            {hints.map((h) => (
              <li key={h.key} className="text-xs leading-relaxed text-[#6f6a64]">
                {h.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {extraFooter}

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      {saved && !error && <p className="mt-3 text-xs text-[#5f7050]">保存しました</p>}
    </div>
  );
}
