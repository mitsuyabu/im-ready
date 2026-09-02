"use client";

import { useState } from "react";
import { myNoteErrorMessageFor, parseMyNoteDocumentResponse } from "@/lib/myNoteGenerator";
import { DOCUMENT_ROLE_DEFINITIONS } from "@/lib/documentRoles";
import MyNoteBody from "@/components/MyNoteBody";

/**
 * My Note の生成 + 保存済み表示 + 作り直し（Step 18）。詳細ページ全体は Server Component の
 * ままで、button click / loading / fetch / confirmation / state 遷移を持つこの部分だけを
 * Client へ切り出している。
 *
 * ParentExplanationGenerator を複製ベースにしているが、以下が my_note 固有:
 * - 1つの component で「未生成 → 作成」と「保存済み → 作り直す」の両方を扱う
 *   （initialBody の有無で分岐）。
 * - 「作り直す」はインライン確認（version 履歴が無く、前の内容は残らないため）。
 * - 再生成失敗時は現在表示中の旧 body を消さない（§22）。
 *
 * Client が持つ・送るのは planId だけ。body / title / view / MyNoteView は props でも
 * request でも扱わず、API（POST /api/documents/my-note）が Server 側で Canonical な
 * 最新 Karte から生成・保存する。再生成時も送るのは planId のみ（§38）。
 *
 * canGenerate は UI 表示の一次防御にすぎず、実際の生成可否は API が MyNoteView から
 * 再判定する（false なら 422。二重防御）。
 */

type Status = "idle" | "generating";

export default function MyNoteGenerator({
  planId,
  canGenerate,
  initialBody,
}: {
  planId: string;
  canGenerate: boolean;
  initialBody?: string;
}) {
  const [body, setBody] = useState<string | null>(initialBody ?? null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);

  async function callGenerate(isRegenerate: boolean) {
    if (status === "generating") return; // 二重送信防止（button の disabled と二重防御）
    setStatus("generating");
    setErrorMessage(null);
    setNotice(null);

    let res: Response;
    try {
      res = await fetch("/api/documents/my-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 送るのは planId だけ。現在の body は API へ送らない（Server が最新 Karte から生成）。
        body: JSON.stringify({ planId }),
      });
    } catch {
      // 通信到達前の失敗。旧 body は state に残したまま error だけ出す。
      setErrorMessage("通信エラーが発生しました。ネットワーク状態を確認してください。");
      setStatus("idle");
      return;
    }

    const raw = await res.json().catch(() => null);

    if (!res.ok) {
      // API エラー。旧 body を消さない（§22）。confirmation は閉じて再試行できる状態へ。
      setErrorMessage(myNoteErrorMessageFor(res.status));
      setStatus("idle");
      setConfirmingRegenerate(false);
      return;
    }

    const parsed = parseMyNoteDocumentResponse(raw);
    if (!parsed) {
      // DB 保存成功が確認できないレスポンス shape。一時表示はせず error 扱い（旧 body は保持）。
      setErrorMessage(myNoteErrorMessageFor(500));
      setStatus("idle");
      setConfirmingRegenerate(false);
      return;
    }

    setBody(parsed.body);
    setStatus("idle");
    setConfirmingRegenerate(false);
    if (isRegenerate) setNotice("更新しました。");
  }

  const primaryButtonClass =
    "inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-[#161616] px-5 py-3 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#000] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto";
  const secondaryButtonClass =
    "inline-flex min-h-[44px] w-full items-center justify-center rounded-full border border-[#1e2b3d] px-5 py-2.5 text-sm font-medium text-[#172033] transition-colors duration-150 hover:bg-[#1e2b3d]/[0.06] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent sm:w-auto";

  // ---- 未生成 ----
  if (body === null) {
    return (
      <div className="mt-8 rounded-2xl border border-[#e5dfd6] bg-white p-6 sm:p-8">
        <p className="text-sm leading-relaxed text-[#625f59]">
          今の自分の考えや、迷っていることを整理して、あとから読み返せるノートを作ります。
          <br className="hidden sm:block" />
          My Plan が「今の状態」を映すのに対して、My Note はある時点の考えを整理して残すものです。
        </p>

        <div className="mt-6">
          <button
            type="button"
            onClick={() => callGenerate(false)}
            disabled={!canGenerate || status === "generating"}
            className={primaryButtonClass}
          >
            {status === "generating"
              ? "My Noteを作成中…"
              : DOCUMENT_ROLE_DEFINITIONS.my_note.createLabel}
          </button>
        </div>

        {!canGenerate && (
          <p className="mt-3 text-sm leading-relaxed text-[#625f59]">
            My Note を作るには、Chat や Worksheet でもう少し考えを整理してください。
          </p>
        )}
        {errorMessage && <p className="mt-3 text-xs text-red-600">{errorMessage}</p>}
      </div>
    );
  }

  // ---- 保存済み（read-only 表示 ＋ 最新の内容で更新） ----
  return (
    <div className="mt-8">
      {notice && <p className="text-xs text-[#8a8578]">{notice}</p>}

      {/* pure parser で内省ノートらしく表示。解析できなければ元 body 全文へ fallback。 */}
      <MyNoteBody body={body} />

      {!confirmingRegenerate ? (
        <div className="mt-10 flex flex-col items-start gap-2.5 border-t border-[#e5dfd6] pt-6 sm:flex-row sm:items-center sm:gap-4">
          <button
            type="button"
            onClick={() => {
              setErrorMessage(null);
              setNotice(null);
              setConfirmingRegenerate(true);
            }}
            className={secondaryButtonClass}
          >
            最新の内容で更新
          </button>
          <p className="text-xs leading-relaxed text-[#8a8578]">
            会話やワークシートで整理した内容をもとに更新します。
          </p>
        </div>
      ) : (
        <div className="mt-10 rounded-xl border border-[#e5dfd6] bg-[#faf7f0] p-4">
          <p className="text-sm text-[#172033]">現在のPlanの内容を反映して更新します。</p>
          <p className="mt-1 text-xs leading-relaxed text-[#8a8578]">前の内容は残りません。</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setConfirmingRegenerate(false)}
              disabled={status === "generating"}
              className={secondaryButtonClass}
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => callGenerate(true)}
              disabled={status === "generating"}
              className={primaryButtonClass}
            >
              {status === "generating" ? "更新しています…" : "更新する"}
            </button>
          </div>
        </div>
      )}

      {errorMessage && <p className="mt-3 text-xs text-red-600">{errorMessage}</p>}
    </div>
  );
}
