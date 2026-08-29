"use client";

import { useState } from "react";
import { formatLastUpdated } from "@/lib/planActivity";
import {
  parseStudyPlanDocumentResponse,
  studyPlanErrorMessageFor,
} from "@/lib/studyPlanGenerator";

/**
 * Study Plan の生成 + 保存済み表示 + 作り直し（Step 22）。詳細ページ全体は Server Component の
 * ままで、button click / loading / fetch / confirmation / state 遷移を持つこの部分だけを
 * Client へ切り出している。
 *
 * MyNoteGenerator を複製ベースにしている（過度な共通化はしない）。以下は共通:
 * - 1つの component で「未生成 → 作成」と「保存済み → 作り直す」の両方を扱う（initialBody の有無）。
 * - 「作り直す」はインライン確認（version 履歴が無く、前の内容は残らないため）。
 * - 再生成失敗時は現在表示中の旧 body を消さない。
 *
 * Client が持つ・送るのは planId だけ。body / title / view / StudyPlanView は props でも
 * request でも扱わず、API（POST /api/documents/study-plan）が Server 側で Canonical な
 * 最新 Karte から生成・保存する。再生成時も送るのは planId のみ。
 *
 * canGenerate は UI 表示の一次防御にすぎず、実際の生成可否は API が StudyPlanView から
 * 再判定する（false なら 422。二重防御）。
 */

type Status = "idle" | "generating";

export default function StudyPlanGenerator({
  planId,
  canGenerate,
  initialBody,
  initialUpdatedAt,
}: {
  planId: string;
  canGenerate: boolean;
  initialBody?: string;
  initialUpdatedAt?: string;
}) {
  const [body, setBody] = useState<string | null>(initialBody ?? null);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>(initialUpdatedAt);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);

  const hasBody = body !== null;

  async function callGenerate(isRegenerate: boolean) {
    if (status === "generating") return; // 二重送信防止（button の disabled と二重防御）
    setStatus("generating");
    setErrorMessage(null);
    setNotice(null);

    let res: Response;
    try {
      res = await fetch("/api/documents/study-plan", {
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
      // API エラー。旧 body を消さない。confirmation は閉じて再試行できる状態へ。
      setErrorMessage(studyPlanErrorMessageFor(res.status));
      setStatus("idle");
      setConfirmingRegenerate(false);
      return;
    }

    const parsed = parseStudyPlanDocumentResponse(raw);
    if (!parsed) {
      // DB 保存成功が確認できないレスポンス shape。一時表示はせず error 扱い（旧 body は保持）。
      setErrorMessage(studyPlanErrorMessageFor(500));
      setStatus("idle");
      setConfirmingRegenerate(false);
      return;
    }

    setBody(parsed.body);
    setUpdatedAt(parsed.updatedAt);
    setStatus("idle");
    setConfirmingRegenerate(false);
    if (isRegenerate) setNotice("更新しました。");
  }

  const primaryButtonClass =
    "inline-flex items-center justify-center gap-2 rounded-full bg-worksheet-accent px-5 py-3 text-sm font-medium text-worksheet-accent-contrast transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100";
  const secondaryButtonClass =
    "inline-flex items-center justify-center rounded-full border border-worksheet-border px-5 py-2.5 text-sm font-medium text-worksheet-primary transition-colors duration-150 hover:bg-worksheet-sage disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

  // ---- 未生成 ----
  if (!hasBody) {
    return (
      <div className="mt-10 rounded-2xl border border-worksheet-border p-6 sm:p-8">
        <p className="text-base font-medium text-worksheet-primary">まだ Study Plan は作られていません。</p>
        <p className="mt-3 text-sm leading-relaxed text-worksheet-secondary">
          今決まっている条件や候補を整理して、現在の留学プランとして残します。
          <br className="hidden sm:block" />
          AI が新しい計画を提案するのではなく、これまでに整理した内容を計画としてまとめます。
        </p>

        <div className="mt-6">
          <button
            type="button"
            onClick={() => callGenerate(false)}
            disabled={!canGenerate || status === "generating"}
            className={primaryButtonClass}
          >
            {status === "generating" ? "Study Planを作成中…" : "作成する"}
          </button>
        </div>

        {!canGenerate && (
          <p className="mt-3 text-sm leading-relaxed text-worksheet-secondary">
            Study Plan を作るには、Chat や Worksheet でもう少し条件を整理してください。
          </p>
        )}
        {errorMessage && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{errorMessage}</p>}
      </div>
    );
  }

  // ---- 保存済み（read-only 表示 ＋ 作り直す） ----
  return (
    <div className="mt-8">
      {updatedAt && (
        <p className="text-xs text-worksheet-secondary">最終更新: {formatLastUpdated(updatedAt)}</p>
      )}
      {notice && <p className="mt-1 text-xs text-worksheet-secondary">{notice}</p>}

      {/* plain text 表示。dangerouslySetInnerHTML は使わず、{body} は JSX 内の文字列展開のみ
          （React が自動エスケープするため HTML として解釈されない）。Markdown renderer も使わない。
          「■ 見出し／項目：値」という structured なテキストをそのまま whitespace-pre-wrap で表示する。 */}
      <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-worksheet-border bg-worksheet-surface-2 p-5 text-sm leading-relaxed text-worksheet-primary sm:p-6">
        {body}
      </div>

      {!confirmingRegenerate ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => {
              setErrorMessage(null);
              setNotice(null);
              setConfirmingRegenerate(true);
            }}
            className={secondaryButtonClass}
          >
            作り直す
          </button>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-worksheet-border bg-worksheet-surface-2 p-4">
          <p className="text-sm text-worksheet-primary">今の内容を新しく作り直します。</p>
          <p className="mt-1 text-xs leading-relaxed text-worksheet-secondary">前の内容は残りません。</p>
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
              {status === "generating" ? "作り直しています…" : "作り直す"}
            </button>
          </div>
        </div>
      )}

      {errorMessage && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{errorMessage}</p>}
    </div>
  );
}
