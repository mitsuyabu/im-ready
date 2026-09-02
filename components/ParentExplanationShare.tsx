"use client";

import { useState } from "react";
import {
  buildLineShareUrl,
  formatShareExpiry,
  formatShareExpiryDate,
  interpretRevokeResponse,
  interpretShareResponse,
  type ShareCreateSuccess,
  type ShareStatus,
} from "@/lib/parentExplanationShare";

/**
 * 親向け説明資料の詳細画面に出す「共有する」導線（Step 12）＋ 停止・再発行（Step 13）
 * ＋ LINE 共有（Step 14）。
 *
 * 保存済み parent_explanation document がある場合にだけ Server Component
 * （app/plans/[planId]/documents/parent-explanation/page.tsx）から描画される。
 * ページ全体は Server Component のまま。button click / loading / fetch / clipboard /
 * confirmation / state 遷移を持つこの部分だけを Client へ切り出している。
 *
 * Client が持つ・送るのは planId だけ（＋ Server が算出した初期 share 状態）。
 * share URL・document body・title・token・tokenHash・document_shares.id はいずれも
 * props で受け取らず、API が Server 側で Canonical に特定する。
 *
 * 設計上の制約（§1・§14・§19）: DB は token の hash しか保持しないため、発行された
 * share URL が分かるのは作成 API のレスポンスの瞬間だけ。reload するとこの URL 表示は
 * 消える（既存 URL は復元しない）。ただし「有効な share があるか」は Server が
 * initialShareStatus で毎回渡すので、reload 後は「発行済み・停止できます」表示に戻る。
 * 別の URL が必要なら「停止 → 新規発行」という明示操作で回復する。
 * share URL は React state だけで保持し、localStorage / sessionStorage / cookie /
 * history.state / module singleton / query param には一切載せない。console にも出さない。
 *
 * Step 14: issued 状態でのみ「LINEで共有」を出す（LINE 公式 URL スキーム。外部 SDK なし）。
 * LINE へ渡すのは固定の短い案内文 + 公開 share URL だけ。document 本文・Plan/User/内部 ID・
 * tokenHash は渡さない。active/expired 状態では raw URL が無いので LINE ボタン自体を出さない。
 */

type View = ShareStatus | "issued";
type CopyStatus = "idle" | "copied" | "failed";
type BusyKind = "create" | "revoke" | null;

export default function ParentExplanationShare({
  planId,
  initialShareStatus,
  initialExpiresAt,
}: {
  planId: string;
  initialShareStatus: ShareStatus;
  initialExpiresAt?: string;
}) {
  const [view, setView] = useState<View>(initialShareStatus);
  const [expiresAt, setExpiresAt] = useState<string | undefined>(initialExpiresAt);
  const [issued, setIssued] = useState<ShareCreateSuccess | null>(null);
  const [busyKind, setBusyKind] = useState<BusyKind>(null);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  // revoke 経由で none に戻った直後だけ button 文言を「新しい共有リンクを作成」にする。
  const [postRevoke, setPostRevoke] = useState(false);

  const busy = busyKind !== null;

  async function handleCreate() {
    if (busy) return; // 連打・二重送信防止（button の disabled と二重防御）
    setBusyKind("create");
    setErrorMessage(null);
    setNotice(null);

    let res: Response;
    try {
      res = await fetch("/api/documents/parent-explanation/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // same-origin fetch。auth は既存 cookie セッションに任せる。送るのは planId だけ。
        body: JSON.stringify({ planId }),
      });
    } catch {
      setErrorMessage("通信エラーが発生しました。ネットワーク状態を確認してください。");
      setBusyKind(null);
      return;
    }

    const rawBody = await res.json().catch(() => null);
    const outcome = interpretShareResponse(res.status, res.ok, rawBody);
    setBusyKind(null);

    if (outcome.kind === "success") {
      setIssued(outcome.data);
      setCopyStatus("idle");
      setPostRevoke(false);
      setView("issued");
      return;
    }

    if (outcome.kind === "already_exists") {
      // §23: 既存 raw URL は復元できないが、有効な share がある事実に UI を合わせる。
      // 期限はこの経路では分からないため expiresAt は伏せる。
      setExpiresAt(undefined);
      setPostRevoke(false);
      setNotice("この資料にはすでに共有リンクが発行されています。");
      setView("active");
      return;
    }

    setErrorMessage(outcome.message);
  }

  async function handleRevoke() {
    if (busy) return;
    setBusyKind("revoke");
    setErrorMessage(null);
    setNotice(null);

    let res: Response;
    try {
      res = await fetch("/api/documents/parent-explanation/share/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
    } catch {
      setErrorMessage("通信エラーが発生しました。ネットワーク状態を確認してください。");
      setBusyKind(null);
      setConfirmingRevoke(false);
      return;
    }

    // revoke レスポンスの本文は読み捨てる（{ revoked: true } / { error } のみ、表示に使わない）。
    await res.json().catch(() => null);
    const outcome = interpretRevokeResponse(res.status, res.ok);
    setBusyKind(null);
    setConfirmingRevoke(false);

    if (outcome.kind === "revoked" || outcome.kind === "no_active_share") {
      setIssued(null);
      setExpiresAt(undefined);
      setPostRevoke(true);
      setView("none");
      setNotice(
        outcome.kind === "revoked"
          ? "共有を停止しました。"
          : "現在有効な共有リンクはありません。",
      );
      return;
    }

    setErrorMessage(outcome.message);
  }

  async function handleCopy() {
    if (!issued) return;
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
        throw new Error("clipboard unavailable");
      }
      await navigator.clipboard.writeText(issued.shareUrl);
      setCopyStatus("copied");
    } catch {
      // 失敗しても share URL は画面に出したままにし、手動選択でコピーできるようにする。
      setCopyStatus("failed");
    }
  }

  const primaryButtonClass =
    "inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-[#161616] px-5 py-3 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#000] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto";
  const secondaryButtonClass =
    "inline-flex min-h-[44px] w-full items-center justify-center rounded-full border border-[#1e2b3d] px-5 py-2.5 text-sm font-medium text-[#172033] transition-colors duration-150 hover:bg-[#1e2b3d]/[0.06] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent sm:w-auto";

  // LINE 公式 URL スキームへの共有 URL。issued（発行直後、raw URL が React state にある間）
  // だけ組み立てる。active/expired では raw URL が無いので null のまま = LINE ボタンを出さない。
  const lineShareUrl = issued ? buildLineShareUrl(issued.shareUrl) : null;

  const shareActive = view === "issued" || view === "active";
  const statusLabel =
    view === "issued" || view === "active"
      ? "共有中"
      : view === "expired"
        ? "共有リンクの期限切れ"
        : "まだ共有していません";

  return (
    <section className="mt-10 rounded-[20px] border border-[#e6e2d8] bg-[#fbfbf7] p-5 shadow-[0_1px_3px_rgba(30,28,24,0.04)] sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eef2e8] text-[#5f7050]">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden
          >
            <circle cx="18" cy="5" r="2.5" />
            <circle cx="6" cy="12" r="2.5" />
            <circle cx="18" cy="19" r="2.5" />
            <path d="M8.2 10.8 15.8 6.2M8.2 13.2l7.6 4.6" />
          </svg>
        </span>
        <h2 className="text-lg font-semibold text-[#172033]">家族への共有</h2>
        <span
          className={`ml-auto inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${
            shareActive
              ? "border-[#cdddc5] bg-[#eef3e8] text-[#4b5b3e]"
              : view === "expired"
                ? "border-[#e5dac7] bg-[#f6f1e8] text-[#75644b]"
                : "border-[#e0dccf] bg-white text-[#817b71]"
          }`}
        >
          {statusLabel}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[#817b71]">
        この資料を家族に共有できます。
      </p>

      {notice && <p className="mt-4 text-sm text-[#172033]">{notice}</p>}

      {view === "none" && (
        <div className="mt-6">
          <button type="button" onClick={handleCreate} disabled={busy} className={primaryButtonClass}>
            {busyKind === "create"
              ? "共有リンクを作成中…"
              : postRevoke
                ? "新しい共有リンクを作成"
                : "共有リンクを作成"}
          </button>
          {errorMessage && (
            <p className="mt-3 text-xs text-red-600 dark:text-red-400">{errorMessage}</p>
          )}
        </div>
      )}

      {(view === "active" || view === "expired") && (
        <div className="mt-6">
          <p className="text-sm text-[#172033]">
            {view === "expired"
              ? "この共有リンクは有効期限が切れています。"
              : "この資料には共有リンクが発行されています。"}
          </p>
          {view === "active" && (
            <p className="mt-1 text-xs leading-relaxed text-[#817b71]">
              安全のため、発行済みのリンクは再表示できません。
            </p>
          )}
          {expiresAt && (
            <p className="mt-2 text-sm text-[#817b71]">
              有効期限: {formatShareExpiryDate(expiresAt)}
              {view === "expired" && "（期限切れ）"}
            </p>
          )}

          {!confirmingRevoke ? (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => {
                  setErrorMessage(null);
                  setConfirmingRevoke(true);
                }}
                disabled={busy}
                className={secondaryButtonClass}
              >
                共有を停止
              </button>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-[#e6e2d8] bg-[#faf7f0] p-4">
              <p className="text-sm text-[#172033]">この共有リンクを停止しますか？</p>
              <p className="mt-1 text-xs leading-relaxed text-[#817b71]">
                停止すると、現在のリンクは開けなくなります。この操作は取り消せません。
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setConfirmingRevoke(false)}
                  disabled={busy}
                  className={secondaryButtonClass}
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleRevoke}
                  disabled={busy}
                  className={primaryButtonClass}
                >
                  {busyKind === "revoke" ? "停止中…" : "共有を停止"}
                </button>
              </div>
            </div>
          )}

          {errorMessage && (
            <p className="mt-3 text-xs text-red-600 dark:text-red-400">{errorMessage}</p>
          )}
        </div>
      )}

      {view === "issued" && issued && (
        <div className="mt-6">
          <p className="text-xs text-[#817b71]">共有リンク</p>
          <input
            type="text"
            readOnly
            value={issued.shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-2 w-full rounded-full border border-[#e6e2d8] bg-[#faf7f0] px-4 py-2 text-sm text-[#172033]"
          />

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            {lineShareUrl && (
              <a
                href={lineShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={primaryButtonClass}
              >
                LINEで共有
              </a>
            )}
            <button type="button" onClick={handleCopy} className={secondaryButtonClass}>
              リンクをコピー
            </button>
          </div>

          {copyStatus === "copied" && (
            <p className="mt-2 text-xs text-[#817b71]">コピーしました。</p>
          )}
          {copyStatus === "failed" && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">
              コピーできませんでした。リンクを選択してコピーしてください。
            </p>
          )}

          <p className="mt-3 text-xs text-[#817b71]">{formatShareExpiry(issued.expiresAt)}</p>
          <p className="mt-2 text-xs leading-relaxed text-[#817b71]">
            ※ このリンクは、この画面を離れると再表示できません。今のうちにコピーまたは共有してください。
          </p>
        </div>
      )}
    </section>
  );
}
