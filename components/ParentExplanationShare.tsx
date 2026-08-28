"use client";

import { useState } from "react";
import {
  formatShareExpiry,
  interpretShareResponse,
  type ShareCreateSuccess,
} from "@/lib/parentExplanationShare";

/**
 * 親向け説明資料の詳細画面に出す「共有する」導線（Step 12）。
 *
 * 保存済み parent_explanation document がある場合にだけ Server Component
 * （app/plans/[planId]/documents/parent-explanation/page.tsx）から描画される。
 * ページ全体は Server Component のままで、button click / loading / fetch / clipboard /
 * success・error state を持つこの部分だけを Client へ切り出している。
 *
 * Client が持つ・送るのは planId だけ。share URL・document body・title・token・
 * tokenHash・expiresAt はいずれも props で受け取らず、Step 10 API が Server 側で
 * Canonical な plan_documents から取得・生成する。
 *
 * 設計上の制約（§14）: DB には token の hash しか保存しないため、発行された share URL は
 * このレスポンスでしか分からない。reload するとこの表示は消え、既存 URL の再表示は
 * できない（再発行 UX は別 Step）。そのため share URL は React state だけで保持し、
 * localStorage / sessionStorage / cookie / query param には一切載せない。console にも出さない。
 */

type ShareStatus = "idle" | "creating" | "created" | "exists" | "error";
type CopyStatus = "idle" | "copied" | "failed";

export default function ParentExplanationShare({ planId }: { planId: string }) {
  const [status, setStatus] = useState<ShareStatus>("idle");
  const [share, setShare] = useState<ShareCreateSuccess | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");

  async function handleCreate() {
    // 連打・二重送信防止（button の disabled と二重で防御する）。
    if (status === "creating") return;

    setStatus("creating");
    setErrorMessage(null);

    let res: Response;
    try {
      res = await fetch("/api/documents/parent-explanation/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // same-origin fetch。auth は既存の cookie セッションに任せ、Authorization header は
        // 手で組み立てない。送るのは planId だけ。
        body: JSON.stringify({ planId }),
      });
    } catch {
      // 通信到達前の失敗。内部情報は出さず、再試行できる状態へ。
      setErrorMessage("通信エラーが発生しました。ネットワーク状態を確認してください。");
      setStatus("error");
      return;
    }

    const rawBody = await res.json().catch(() => null);
    const outcome = interpretShareResponse(res.status, res.ok, rawBody);

    if (outcome.kind === "success") {
      setShare(outcome.data);
      setCopyStatus("idle");
      setStatus("created");
      return;
    }

    if (outcome.kind === "already_exists") {
      setStatus("exists");
      return;
    }

    setErrorMessage(outcome.message);
    setStatus("error");
  }

  async function handleCopy() {
    if (!share) return;
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
        throw new Error("clipboard unavailable");
      }
      await navigator.clipboard.writeText(share.shareUrl);
      setCopyStatus("copied");
    } catch {
      // 失敗しても share URL は画面に出したままにし、手動選択でコピーできるようにする。
      setCopyStatus("failed");
    }
  }

  return (
    <section className="mt-10 rounded-2xl border border-worksheet-border p-6 sm:p-8">
      <h2 className="text-base font-medium text-worksheet-primary">共有</h2>
      <p className="mt-2 text-sm leading-relaxed text-worksheet-secondary">
        この資料を家族に共有できます。
      </p>

      {(status === "idle" || status === "creating" || status === "error") && (
        <div className="mt-6">
          <button
            type="button"
            onClick={handleCreate}
            disabled={status === "creating"}
            className="inline-flex items-center gap-2 rounded-full bg-worksheet-accent px-5 py-3 text-sm font-medium text-worksheet-accent-contrast transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
          >
            {status === "creating" ? "共有リンクを作成中…" : "共有リンクを作成"}
          </button>
          {status === "error" && errorMessage && (
            <p className="mt-3 text-xs text-red-600 dark:text-red-400">{errorMessage}</p>
          )}
        </div>
      )}

      {status === "exists" && (
        <div className="mt-6">
          <p className="text-sm font-medium text-worksheet-primary">
            この資料にはすでに共有リンクが発行されています。
          </p>
          <p className="mt-2 text-sm leading-relaxed text-worksheet-secondary">
            既存リンクの再表示・再発行は今後対応予定です。
          </p>
        </div>
      )}

      {status === "created" && share && (
        <div className="mt-6">
          <p className="text-xs text-worksheet-secondary">共有リンク</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              readOnly
              value={share.shareUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full flex-1 rounded-full border border-worksheet-border bg-worksheet-surface-2 px-4 py-2 text-sm text-worksheet-primary"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex shrink-0 items-center justify-center rounded-full border border-worksheet-border px-5 py-2.5 text-sm font-medium text-worksheet-primary transition-colors duration-150 hover:bg-worksheet-sage"
            >
              リンクをコピー
            </button>
          </div>

          {copyStatus === "copied" && (
            <p className="mt-2 text-xs text-worksheet-secondary">コピーしました。</p>
          )}
          {copyStatus === "failed" && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">
              コピーできませんでした。リンクを選択してコピーしてください。
            </p>
          )}

          <p className="mt-3 text-xs text-worksheet-secondary">{formatShareExpiry(share.expiresAt)}</p>
        </div>
      )}
    </section>
  );
}
