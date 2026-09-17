"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CONSULTATION_TEXT_MAX,
  coerceConsultationSheet,
  createEmptyConsultationSheet,
  type ConsultationItem,
  type ConsultationListKey,
  type ConsultationSheetRow,
  type ConsultationSheetState,
} from "@/lib/consultationSheet";
import {
  createConsultationSheetSync,
  loadPendingConsultationChange,
  savePendingConsultationChange,
  type ConsultationSaveStatus,
} from "@/lib/consultationSheetSync";
import { visibleConsultationCandidates, type ConsultationCandidate } from "@/lib/consultationCandidates";
import type { ConsultationSummaryRow } from "@/lib/consultationSummary";

/**
 * Consultation Sheet の編集 UI（Client）。4 セクションを縦に並べ、各項目をその場で編集できる。
 *
 * - 追加 / 編集 / 削除 / To Do の完了 は、すべて 1 つの state 変更（commit）を通り、自動保存される
 *   （lib/consultationSheetSync.ts。サーバーが正本、保存失敗時は入力を消さず再試行）
 * - 候補（相談したいこと・確認したいこと）は「追加する」で通常の項目になる。「表示しない」で隠せる。
 *   どちらも扱い済みとして記録し、候補を作り直しても同じものを出し直さない。候補からの追加後は
 *   普通の項目として自由に編集でき、あとから候補の文面で上書きされることはない
 * - 「相談して分かったこと」「次にやること」には候補を出さない（本人が書くメモ）
 */

const SECTIONS: {
  key: ConsultationListKey;
  title: string;
  description: string;
  addLabel: string;
  placeholder: string;
  empty: string;
  checkable: boolean;
  withCandidates: boolean;
}[] = [
  {
    key: "topics",
    title: "相談したいこと",
    description: "エージェントやカウンセラーに聞きたいテーマ。",
    addLabel: "相談したいことを追加",
    placeholder: "例: 学生ビザとワーホリの違いを聞きたい",
    empty: "まだ相談したいことは追加されていません",
    checkable: false,
    withCandidates: true,
  },
  {
    key: "todos",
    title: "確認したいこと / To Do",
    description: "相談のときや相談前に確認する質問・チェック事項。",
    addLabel: "確認事項を追加",
    placeholder: "例: 学校Aの見積もりをもらう",
    empty: "まだ確認したいことは追加されていません",
    checkable: true,
    withCandidates: true,
  },
  {
    key: "findings",
    title: "相談して分かったこと",
    description: "相談で聞いた内容や分かったことのメモ。",
    addLabel: "分かったことを追加",
    placeholder: "例: ホームステイは最初の4週間だけでもOK",
    empty: "相談のあとに分かったことを、ここにメモできます",
    checkable: false,
    withCandidates: false,
  },
  {
    key: "nextActions",
    title: "次にやること",
    description: "相談のあとに自分で進めるアクション。",
    addLabel: "次にやることを追加",
    placeholder: "例: 学校を2校まで絞る",
    empty: "まだ次にやることは追加されていません",
    checkable: false,
    withCandidates: false,
  },
];

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export default function ConsultationSheetEditor({
  planId,
  initialRow,
  summary,
  candidates,
}: {
  planId: string;
  initialRow: ConsultationSheetRow | null;
  summary: ConsultationSummaryRow[];
  candidates: ConsultationCandidate[];
}) {
  const [sheet, setSheet] = useState<ConsultationSheetState>(() => initialRow?.state ?? createEmptyConsultationSheet());
  // 連続した編集でも常に最新のシートから次の状態を作るための参照（描画には使わない）。
  const latest = useRef(sheet);
  // 保存時のマージ（onMerged）で state が変わったときも、描画後に参照を追従させる。
  useEffect(() => {
    latest.current = sheet;
  }, [sheet]);
  const [saveStatus, setSaveStatus] = useState<ConsultationSaveStatus>("idle");

  const [sync] = useState(() =>
    createConsultationSheetSync({
      planId,
      getClient: createClient,
      initialRow,
      onMerged: setSheet,
      onStatus: setSaveStatus,
      persistPending: (pending) => savePendingConsultationChange(planId, pending),
    }),
  );

  /** すべての編集はここを通る（画面の state 更新 → 自動保存の予約）。 */
  function commit(update: (current: ConsultationSheetState) => ConsultationSheetState) {
    const next = update(latest.current);
    latest.current = next;
    setSheet(next);
    sync.notifyChange(next);
  }

  // 前回この端末で保存しきれなかった変更があれば、今のサーバー状態に重ねて保存し直す。
  useEffect(() => {
    const pending = loadPendingConsultationChange(planId);
    if (!pending) return;
    const restored = sync.restorePending({
      baseRevision: pending.baseRevision,
      base: coerceConsultationSheet(pending.base),
      local: coerceConsultationSheet(pending.local),
    });
    if (restored) {
      latest.current = restored;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSheet(restored);
    }
  }, [planId, sync]);

  // 画面遷移・タブが裏に回る・ページを離れる・通信が戻ったときに、未保存分を送る。
  useEffect(() => {
    sync.activate();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") sync.flushIfPending();
    };
    const onLeaveOrOnline = () => sync.flushIfPending();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onLeaveOrOnline);
    window.addEventListener("online", onLeaveOrOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onLeaveOrOnline);
      window.removeEventListener("online", onLeaveOrOnline);
      sync.flushIfPending();
      sync.dispose();
    };
  }, [sync]);

  function addItem(list: ConsultationListKey, text: string) {
    const trimmed = text.trim().slice(0, CONSULTATION_TEXT_MAX);
    if (!trimmed) return;
    const t = nowIso();
    const item: ConsultationItem = { id: newId(), text: trimmed, source: "user", createdAt: t, updatedAt: t };
    commit((s) => ({ ...s, [list]: [...s[list], item] }));
  }

  function editItem(list: ConsultationListKey, id: string, text: string) {
    commit((s) => ({
      ...s,
      [list]: s[list].map((i) => (i.id === id ? { ...i, text: text.slice(0, CONSULTATION_TEXT_MAX), updatedAt: nowIso() } : i)),
    }));
  }

  function toggleItem(list: ConsultationListKey, id: string) {
    commit((s) => ({
      ...s,
      [list]: s[list].map((i) => {
        if (i.id !== id) return i;
        const next: ConsultationItem = { ...i, updatedAt: nowIso() };
        if (i.completed) delete next.completed;
        else next.completed = true;
        return next;
      }),
    }));
  }

  function deleteItem(list: ConsultationListKey, id: string) {
    commit((s) => ({ ...s, [list]: s[list].filter((i) => i.id !== id) }));
  }

  function adoptCandidate(c: ConsultationCandidate) {
    const t = nowIso();
    const item: ConsultationItem = { id: newId(), text: c.text, category: c.category, source: "candidate", createdAt: t, updatedAt: t };
    commit((s) => ({
      ...s,
      [c.list]: [...s[c.list], item],
      handledCandidateKeys: Array.from(new Set([...s.handledCandidateKeys, c.key])),
    }));
  }

  function dismissCandidate(c: ConsultationCandidate) {
    commit((s) => ({ ...s, handledCandidateKeys: Array.from(new Set([...s.handledCandidateKeys, c.key])) }));
  }

  const visibleCandidates = visibleConsultationCandidates(candidates, sheet);

  return (
    <div className="mt-8 space-y-6 sm:space-y-8">
      <p className="text-xs text-[#8a8578]" role="status" aria-live="polite">
        {saveStatus === "saving"
          ? "保存中…"
          : saveStatus === "error"
            ? "保存できませんでした。この端末には残っているので、自動でもう一度保存します。"
            : "入力は自動で保存されます"}
      </p>

      <PlanSummary rows={summary} />

      {SECTIONS.map((section) => (
        <ItemSection
          key={section.key}
          section={section}
          items={sheet[section.key]}
          candidates={section.withCandidates ? visibleCandidates.filter((c) => c.list === section.key) : []}
          onAdd={(text) => addItem(section.key, text)}
          onEdit={(id, text) => editItem(section.key, id, text)}
          onToggle={(id) => toggleItem(section.key, id)}
          onDelete={(id) => deleteItem(section.key, id)}
          onAdopt={adoptCandidate}
          onDismiss={dismissCandidate}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PlanSummary({ rows }: { rows: ConsultationSummaryRow[] }) {
  return (
    <section className="rounded-[18px] border border-[#e6e1d8] bg-[#fbfaf6] p-5 sm:p-6">
      <h2 className="text-[15px] font-semibold text-[#172033]">相談時に共有する基本情報</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-[#8a8578]">
        My Plan やこれまでの相談・ワークシートの内容です。変えたいときは、それぞれの画面で更新してください。
      </p>
      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline gap-3 border-b border-[#eeeae2] pb-2 last:border-b-0 sm:last:border-b">
            <dt className="w-20 shrink-0 text-[13px] text-[#8a8578]">{row.label}</dt>
            <dd
              className={`min-w-0 text-[14px] leading-snug ${
                row.status === "set" ? "font-medium text-[#3f3a34]" : "text-[#9a948a]"
              }`}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ItemSection({
  section,
  items,
  candidates,
  onAdd,
  onEdit,
  onToggle,
  onDelete,
  onAdopt,
  onDismiss,
}: {
  section: (typeof SECTIONS)[number];
  items: ConsultationItem[];
  candidates: ConsultationCandidate[];
  onAdd: (text: string) => void;
  onEdit: (id: string, text: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onAdopt: (c: ConsultationCandidate) => void;
  onDismiss: (c: ConsultationCandidate) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  function submitDraft() {
    if (draft.trim()) onAdd(draft);
    setDraft("");
    setAdding(false);
  }

  return (
    <section className="rounded-[18px] border border-[#e6e1d8] bg-white p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-[#172033]">{section.title}</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-[#8a8578]">{section.description}</p>

      {items.length === 0 ? (
        <p className="mt-4 text-[14px] text-[#9a948a]">{section.empty}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-2.5 rounded-xl border border-[#eeeae2] bg-[#fdfcf9] px-3 py-2">
              {section.checkable && (
                <input
                  type="checkbox"
                  checked={item.completed === true}
                  onChange={() => onToggle(item.id)}
                  aria-label={item.completed ? "未完了に戻す" : "完了にする"}
                  className="mt-1.5 h-4 w-4 shrink-0 accent-[#5f7050]"
                />
              )}
              <div className="min-w-0 flex-1">
                {item.category && (
                  <span className="mb-0.5 inline-block text-[11px] font-medium text-[#8a8578]">{item.category}</span>
                )}
                <textarea
                  value={item.text}
                  rows={1}
                  maxLength={CONSULTATION_TEXT_MAX}
                  onChange={(e) => onEdit(item.id, e.target.value)}
                  onBlur={(e) => {
                    if (!e.target.value.trim()) onDelete(item.id);
                  }}
                  aria-label={`${section.title}の項目を編集`}
                  className={`block w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none [field-sizing:content] focus:rounded-md focus:bg-white focus:ring-2 focus:ring-[#dfe6dc] ${
                    item.completed ? "text-[#a8a297] line-through" : "text-[#3f3a34]"
                  }`}
                />
              </div>
              <button
                type="button"
                onClick={() => onDelete(item.id)}
                aria-label="この項目を削除"
                className="mt-0.5 shrink-0 rounded-full px-2 py-1 text-[13px] text-[#a8a297] transition-colors hover:bg-[#f2efe7] hover:text-[#6f6a61]"
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
          <textarea
            autoFocus
            value={draft}
            rows={1}
            maxLength={CONSULTATION_TEXT_MAX}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submitDraft();
              }
              if (e.key === "Escape") {
                setDraft("");
                setAdding(false);
              }
            }}
            placeholder={section.placeholder}
            className="min-w-0 flex-1 resize-none rounded-xl border border-[#d8d2c6] bg-white px-3 py-2 text-[15px] leading-relaxed text-[#3f3a34] outline-none [field-sizing:content] focus:border-[#b9c7b3] focus:ring-2 focus:ring-[#dfe6dc]"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submitDraft}
              className="rounded-lg bg-[#3f5142] px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#344436]"
            >
              追加
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft("");
                setAdding(false);
              }}
              className="rounded-lg border border-[#d8d2c6] bg-white px-3.5 py-2 text-[13px] text-[#6f6a61] transition-colors hover:bg-[#f2efe7]"
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-3 inline-flex items-center gap-1 rounded-lg border border-dashed border-[#d8d2c6] px-3.5 py-2 text-[13px] font-medium text-[#5f5a52] transition-colors hover:border-[#b6ae9f] hover:bg-[#fbfaf6]"
        >
          <span aria-hidden>＋</span> {section.addLabel}
        </button>
      )}

      {candidates.length > 0 && (
        <div className="mt-5 border-t border-[#eeeae2] pt-4">
          <p className="text-[12px] font-semibold tracking-wide text-[#5a7186]">AI相談・ワークシートからの候補</p>
          <ul className="mt-2 space-y-2">
            {candidates.map((c) => (
              <li key={c.key} className="rounded-xl border border-dashed border-[#c7d3dd] bg-[#f5f8fa] px-3.5 py-3">
                <p className="text-[14px] leading-relaxed text-[#3f3a34]">{c.text}</p>
                <p className="mt-0.5 text-[12px] text-[#8a949c]">{c.basis}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onAdopt(c)}
                    className="rounded-full bg-[#3f5a72] px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-[#334a5e]"
                  >
                    追加する
                  </button>
                  <button
                    type="button"
                    onClick={() => onDismiss(c)}
                    className="rounded-full px-3 py-1.5 text-[13px] text-[#8a949c] transition-colors hover:bg-[#e9eef2]"
                  >
                    表示しない
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
