"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const MAX_LEN = 14;

function countChars(s: string): number {
  return Array.from(s).length; // 日本語・英数字を単純に 1 文字カウント
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

/**
 * Plan Home Hero 内の Plan タイトル（＝ plans.title）を、その場で編集する。
 *
 * - 表示は Hero の <h1> スタイル（headingClassName）＋ font-size を responsive に絞って 1 行に収める。
 *   14 文字以内は必ず全文表示（ellipsis / line-clamp は使わない）。既存の 14 文字超だけ折り返し許可
 * - 編集は 14 文字以内 / trim / 空不可 / Enter 保存・Escape キャンセル・blur はキャンセル（勝手に保存しない）
 * - 保存は既存 owner-scoped パターン（クライアントから plans を update、RLS が本人のみ許可）。新規 API・schema なし
 * - 保存失敗時は元タイトルへ rollback ＋ エラー表示。既存で 14 文字超の title も表示時は短縮保存しない
 */
export default function EditablePlanTitle({
  planId,
  initialTitle,
  headingClassName = "",
}: {
  planId: string;
  initialTitle: string;
  headingClassName?: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialTitle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open() {
    setDraft(title);
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  async function save() {
    if (busy) return;
    const next = draft.trim();
    if (next.length === 0) {
      setError("タイトルを入力してください");
      return;
    }
    if (countChars(next) > MAX_LEN) {
      setError(`${MAX_LEN}文字以内で入力してください`);
      return;
    }
    if (next === title) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    const prev = title;
    setTitle(next); // optimistic
    const { error: updErr } = await createClient()
      .from("plans")
      .update({ title: next })
      .eq("id", planId);
    setBusy(false);
    if (updErr) {
      setTitle(prev); // rollback
      setError("保存できませんでした。もう一度お試しください。");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (editing) {
    const over = countChars(draft.trim()) > MAX_LEN;
    return (
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <input
            autoFocus
            value={draft}
            maxLength={MAX_LEN}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void save();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
            className="min-w-0 flex-1 rounded-xl border border-[#c9c2b4] bg-white px-3 py-2 text-xl font-bold text-[#182233] focus:outline-none focus:ring-2 focus:ring-[#24324a]/25 sm:text-2xl"
            aria-label="Planタイトル"
          />
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || over}
            className="shrink-0 rounded-full bg-[#1e2b3d] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#172033] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "保存中…" : "保存"}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={busy}
            className="shrink-0 rounded-full border border-[#c9c2b4] bg-white px-4 py-2 text-sm font-medium text-[#3f3a34] transition-colors hover:bg-[#f2efe7]"
          >
            キャンセル
          </button>
        </div>
        <p className={`mt-1 text-xs ${over ? "text-red-600" : "text-[#8a8578]"}`}>
          {error ?? `${countChars(draft.trim())} / ${MAX_LEN} 文字`}
        </p>
      </div>
    );
  }

  // 14 文字以内は必ず 1 行全文（font-size を絞って収める・ellipsis / line-clamp は使わない）。
  // 既存 DB に残る 14 文字超だけは例外的に折り返しを許可（DB は書き換えない・§3 / §4 / §7）。
  const overMax = countChars(title) > MAX_LEN;
  return (
    <div className="group/title flex min-w-0 items-center gap-2">
      <h1 className={`min-w-0 ${overMax ? "break-words" : "whitespace-nowrap"} ${headingClassName}`}>
        {title}
      </h1>
      <button
        type="button"
        onClick={open}
        aria-label="Planタイトルを編集"
        className="shrink-0 rounded-full p-1.5 text-[#5b6b7e] opacity-0 transition-opacity duration-150 hover:bg-black/5 hover:text-[#182233] focus-visible:opacity-100 group-hover/title:opacity-100"
      >
        <PencilIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
