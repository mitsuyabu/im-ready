"use client";

import { useEffect, useState } from "react";
import qrcode from "qrcode-generator";
import {
  CONSULTATION_SHARE_SECTIONS,
  DEFAULT_CONSULTATION_SHARE_CONFIG,
  consultationShareUrl,
  type ActiveConsultationShare,
  type ConsultationShareConfig,
} from "@/lib/consultationShare";

/**
 * Consultation Sheet を「ログイン不要・閲覧専用の URL」でエージェントへ渡すための導線。
 *
 * 編集 UI（ConsultationSheetEditor）とは独立した Client Component。シートの中身は受け取らず、
 * 扱うのは planId と「共有中かどうか / 公開範囲 / token」だけ。
 *
 * 状態:
 *   共有していない … 公開範囲を選んで「共有リンクを作成」
 *   共有中         … URL・コピー・QR・公開範囲の変更・共有を停止
 *
 * URL は token から組み立てるだけで、localStorage / query param / console には残さない。
 * 共有中は同じ URL を再表示する（別端末で開いても同じ）。停止すると URL は二度と使えず、
 * 再共有は新しい URL になる。公開範囲を変えても URL は変わらない。
 */

type Busy = "create" | "config" | "revoke" | null;

/** origin は Client でしか分からないため、dialog を開いた後（＝必ず Client）で組み立てる。 */
function buildShareUrl(share: ActiveConsultationShare | null, open: boolean): string | null {
  if (!open || !share || typeof window === "undefined") return null;
  return consultationShareUrl(window.location.origin, share.token);
}

export default function ConsultationShareDialog({
  planId,
  initialShare,
}: {
  planId: string;
  initialShare: ActiveConsultationShare | null;
}) {
  const [share, setShare] = useState<ActiveConsultationShare | null>(initialShare);
  const [config, setConfig] = useState<ConsultationShareConfig>(
    initialShare?.config ?? DEFAULT_CONSULTATION_SHARE_CONFIG,
  );
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);

  const shareUrl = buildShareUrl(share, open);

  // 開いている間だけ Escape で閉じられるようにする。
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function resetTransient() {
    setError(null);
    setNotice(null);
    setCopied(false);
    setConfirmingRevoke(false);
  }

  async function callShareApi(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) {
    const res = await fetch("/api/documents/consultation-sheet/share", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, ...body }),
    });
    const json: unknown = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, json };
  }

  async function handleCreate() {
    if (busy) return;
    setBusy("create");
    resetTransient();
    try {
      const { ok, json } = await callShareApi("POST", { config });
      if (!ok || !json || typeof json !== "object" || typeof (json as { shareUrl?: unknown }).shareUrl !== "string") {
        setError("共有リンクを作成できませんでした。しばらくしてからもう一度お試しください。");
        return;
      }
      const url = (json as { shareUrl: string }).shareUrl;
      const token = url.slice(url.lastIndexOf("/") + 1);
      setShare({ token, config, createdAt: new Date().toISOString() });
      setNotice("共有リンクを作成しました。");
    } catch {
      setError("通信エラーが発生しました。ネットワーク状態を確認してください。");
    } finally {
      setBusy(null);
    }
  }

  async function handleToggle(key: keyof ConsultationShareConfig) {
    const next = { ...config, [key]: !config[key] };
    setConfig(next);
    resetTransient();
    // 共有していない間は、作成時にまとめて送る。
    if (!share || busy) return;
    setBusy("config");
    try {
      const { ok, status } = await callShareApi("PATCH", { config: next });
      if (status === 404) {
        setShare(null);
        setError("この共有はすでに停止されています。もう一度共有リンクを作成してください。");
        return;
      }
      if (!ok) {
        setError("公開範囲を変更できませんでした。しばらくしてからもう一度お試しください。");
        return;
      }
      setShare((current) => (current ? { ...current, config: next } : current));
      setNotice("公開範囲を更新しました。共有中のURLはそのまま使えます。");
    } catch {
      setError("通信エラーが発生しました。ネットワーク状態を確認してください。");
    } finally {
      setBusy(null);
    }
  }

  async function handleRevoke() {
    if (busy) return;
    setBusy("revoke");
    setError(null);
    setNotice(null);
    try {
      const { ok } = await callShareApi("DELETE", {});
      if (!ok) {
        setError("共有を停止できませんでした。しばらくしてからもう一度お試しください。");
        return;
      }
      setShare(null);
      setShowQr(false);
      setConfirmingRevoke(false);
      setNotice("共有を停止しました。このURLはもう開けません。");
    } catch {
      setError("通信エラーが発生しました。ネットワーク状態を確認してください。");
    } finally {
      setBusy(null);
    }
  }

  async function handleCopy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setError(null);
    } catch {
      setCopied(false);
      setError("コピーできませんでした。URLを長押し（右クリック）してコピーしてください。");
    }
  }

  async function handleWebShare() {
    if (!shareUrl) return;
    try {
      await navigator.share({ title: "留学相談シート", text: "相談前に共有したい内容です。", url: shareUrl });
    } catch {
      // ユーザーがキャンセルした場合もここに来るため、エラー表示はしない。
    }
  }

  const canWebShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            resetTransient();
            setOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8d2c6] bg-white px-4 py-2 text-sm font-medium text-[#3f3a34] transition-colors hover:border-[#b6ae9f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1e2b3d]/40"
        >
          共有する
        </button>
        {share && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#cfd9c7] bg-[#f4f7f0] px-2.5 py-1 text-[12px] font-medium text-[#4f6142]">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#7d9169]" />
            共有中
          </span>
        )}
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-[#8a8578]">
        エージェントやカウンセラーに、閲覧だけできるURLで渡せます。相手のログインは不要です。
      </p>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1c1c1c]/35 p-0 sm:items-center sm:p-6">
          {/* 背景クリックで閉じる。中身のクリックは伝播させない。 */}
          <button
            type="button"
            aria-label="閉じる"
            className="absolute inset-0 h-full w-full cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="consultation-share-title"
            className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-[20px] border border-[#e6e1d8] bg-white p-5 shadow-[0_8px_40px_rgba(30,28,24,0.18)] sm:rounded-[20px] sm:p-7"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="consultation-share-title" className="text-[17px] font-semibold text-[#172033]">
                  相談シートを共有する
                </h2>
                <p className="mt-1 text-[13px] leading-relaxed text-[#8a8578]">
                  選んだ内容だけが、閲覧専用のページに表示されます。相手は編集できません。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="-mr-1 -mt-1 rounded-lg px-2 py-1 text-[13px] text-[#8a8578] transition-colors hover:text-[#1c1c1c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1e2b3d]/40"
              >
                閉じる
              </button>
            </div>

            <section className="mt-5">
              <h3 className="text-[14px] font-semibold text-[#172033]">共有する内容</h3>
              <ul className="mt-2.5 space-y-1.5">
                {CONSULTATION_SHARE_SECTIONS.map((section) => (
                  <li key={section.key}>
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[#eeeae2] bg-[#fbfaf6] px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={config[section.key]}
                        onChange={() => void handleToggle(section.key)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#5f7050]"
                      />
                      <span className="min-w-0">
                        <span className="block text-[14px] text-[#3f3a34]">{section.label}</span>
                        {section.note && (
                          <span className="mt-0.5 block text-[12px] text-[#9a948a]">{section.note}</span>
                        )}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 text-[12px] leading-relaxed text-[#9a948a]">
                チェックを外したものは共有ページに表示されません。AI相談のやりとりや、まだ「検討中」として
                扱っている推測はいつでも共有されません。
              </p>
            </section>

            {!share ? (
              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => void handleCreate()}
                  disabled={busy !== null}
                  className="w-full rounded-lg bg-[#1e2b3d] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2a3a51] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1e2b3d]/40"
                >
                  {busy === "create" ? "作成中…" : "共有リンクを作成"}
                </button>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <div>
                  <p className="text-[13px] font-medium text-[#172033]">共有中のURL</p>
                  <input
                    readOnly
                    value={shareUrl ?? ""}
                    onFocus={(e) => e.currentTarget.select()}
                    className="mt-1.5 w-full rounded-lg border border-[#e6e1d8] bg-[#fbfaf6] px-3 py-2 text-[13px] text-[#3f3a34]"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopy()}
                      className="rounded-lg border border-[#d8d2c6] bg-white px-3.5 py-2 text-[13px] font-medium text-[#3f3a34] transition-colors hover:border-[#b6ae9f]"
                    >
                      {copied ? "コピーしました" : "リンクをコピー"}
                    </button>
                    {canWebShare && (
                      <button
                        type="button"
                        onClick={() => void handleWebShare()}
                        className="rounded-lg border border-[#d8d2c6] bg-white px-3.5 py-2 text-[13px] font-medium text-[#3f3a34] transition-colors hover:border-[#b6ae9f]"
                      >
                        LINEなどで送る
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowQr((v) => !v)}
                      className="rounded-lg border border-[#d8d2c6] bg-white px-3.5 py-2 text-[13px] font-medium text-[#3f3a34] transition-colors hover:border-[#b6ae9f]"
                    >
                      {showQr ? "QRコードを閉じる" : "QRコード"}
                    </button>
                  </div>
                </div>

                {showQr && shareUrl && (
                  <div className="rounded-xl border border-[#eeeae2] bg-white p-4 text-center">
                    <QrCode value={shareUrl} />
                    <p className="mt-2 text-[12px] text-[#8a8578]">対面のときは、これを読み取ってもらえます。</p>
                  </div>
                )}

                <div className="border-t border-[#eeeae2] pt-4">
                  {confirmingRevoke ? (
                    <div>
                      <p className="text-[13px] leading-relaxed text-[#3f3a34]">
                        共有を停止すると、このURLは開けなくなります。もう一度共有するときは、新しいURLになります。
                      </p>
                      <div className="mt-2.5 flex gap-2">
                        <button
                          type="button"
                          onClick={() => void handleRevoke()}
                          disabled={busy !== null}
                          className="rounded-lg border border-[#d9c3c3] bg-white px-3.5 py-2 text-[13px] font-medium text-[#8c4b4b] transition-colors hover:border-[#c49a9a] disabled:opacity-60"
                        >
                          {busy === "revoke" ? "停止中…" : "共有を停止する"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingRevoke(false)}
                          className="rounded-lg px-3 py-2 text-[13px] text-[#8a8578] transition-colors hover:text-[#1c1c1c]"
                        >
                          やめる
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingRevoke(true)}
                      className="text-[13px] text-[#8c4b4b] underline underline-offset-4 transition-colors hover:text-[#6f3b3b]"
                    >
                      共有を停止する
                    </button>
                  )}
                </div>
              </div>
            )}

            <p className="mt-4 text-[12px] leading-relaxed text-[#9a948a]">
              URLを知っている人は誰でも開けます。送り先を確かめてから共有してください。
            </p>

            {(notice || error) && (
              <p
                role="status"
                aria-live="polite"
                className={`mt-3 text-[13px] leading-relaxed ${error ? "text-[#8c4b4b]" : "text-[#4f6142]"}`}
              >
                {error ?? notice}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** URL を QR にする（描画のみ・外部通信なし）。同じ色の並びは 1 本の矩形にまとめる。 */
function QrCode({ value }: { value: string }) {
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();
  const quiet = 4;
  const size = count + quiet * 2;
  const rects: { x: number; y: number; w: number }[] = [];
  for (let row = 0; row < count; row += 1) {
    let runStart = -1;
    for (let col = 0; col <= count; col += 1) {
      const dark = col < count && qr.isDark(row, col);
      if (dark && runStart < 0) runStart = col;
      if (!dark && runStart >= 0) {
        rects.push({ x: runStart + quiet, y: row + quiet, w: col - runStart });
        runStart = -1;
      }
    }
  }
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="共有リンクのQRコード"
      className="mx-auto h-44 w-44"
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill="#ffffff" />
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill="#1c1c1c" />
      ))}
    </svg>
  );
}
