"use client";

import { useState } from "react";
import type { DocumentsKarteView } from "@/lib/documentsKarteView";

type GenerationStatus = "idle" | "generating" | "success" | "error";

/**
 * サーバーから返るstatus codeを、内部用語（Anthropic/API/DocumentsKarteView/422等）を
 * 一切出さない簡潔な日本語メッセージへ変換する。エラー本文はconsole.errorのみに出す
 * （既存Worksheet生成UIと同じ方針）。
 */
function errorMessageFor(status: number): string {
  if (status === 401) return "ログイン状態を確認できませんでした。再度ログインしてからお試しください。";
  if (status === 422) return "資料を作るには、もう少しMy Planの内容を整理する必要があります。";
  if (status === 400) return "資料を作成する準備ができませんでした。ページを再読み込みしてからお試しください。";
  return "資料を作成できませんでした。時間をおいてもう一度お試しください。";
}

/**
 * 親向け説明資料の「一時生成」フロー（Step 6）。plan_documentsに保存済みの行が無い場合のみ、
 * このComponentが描画される（Server Component側で判定済み）。
 *
 * まだDB保存を実装していないため、生成結果はReact stateだけで保持する。ページを
 * reloadすれば消える前提（意図的な暫定仕様。保存する/もう一度作る等のボタンは今回置かない）。
 * hasEnoughContext=falseの場合はボタン自体を出さない（API側の422ガードと二重防御）。
 */
export default function ParentExplanationGenerator({ view }: { view: DocumentsKarteView }) {
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [generatedBody, setGeneratedBody] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleGenerate() {
    setStatus("generating");
    setErrorMessage(null);

    try {
      const res = await fetch("/api/documents/parent-explanation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ view }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || typeof data?.body !== "string") {
        console.error("parent explanation generation failed:", res.status, data);
        setErrorMessage(errorMessageFor(res.status));
        setStatus("error");
        return;
      }

      setGeneratedBody(data.body);
      setStatus("success");
    } catch (err) {
      console.error("parent explanation generation network error:", err);
      setErrorMessage("通信エラーが発生しました。ネットワーク状態を確認してください。");
      setStatus("error");
    }
  }

  if (!view.hasEnoughContext) {
    return (
      <div className="mt-10 rounded-2xl border border-worksheet-border p-6 sm:p-8">
        <p className="text-base font-medium text-worksheet-primary">
          資料を作るには、もう少しMy Planの内容を整理する必要があります。
        </p>
      </div>
    );
  }

  if (status === "success" && generatedBody) {
    return (
      <div className="mt-10">
        <p className="text-xs text-worksheet-secondary">
          この内容はまだ一時表示です。ページを閉じると消えます。
        </p>
        {/* Step 4の保存済みDocument表示と同じTypography（whitespace-pre-wrap・プレーンテキスト表示。
            dangerouslySetInnerHTMLは使わない。{generatedBody}はJSX内の文字列展開のみで、
            Reactが自動エスケープするためHTMLとして解釈されない）。 */}
        <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-worksheet-border bg-worksheet-surface-2 p-5 text-sm leading-relaxed text-worksheet-primary sm:p-6">
          {generatedBody}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-10 rounded-2xl border border-worksheet-border p-6 sm:p-8">
      <p className="text-base font-medium text-worksheet-primary">まだ資料は作られていません。</p>
      <p className="mt-3 text-sm leading-relaxed text-worksheet-secondary">
        この資料では、My Planに整理した内容をもとに、
        <br className="hidden sm:block" />
        今考えていることを家族に伝えられるようになります。
      </p>

      <div className="mt-6">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={status === "generating"}
          className="inline-flex items-center gap-2 rounded-full bg-worksheet-accent px-5 py-3 text-sm font-medium text-worksheet-accent-contrast transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
        >
          {status === "generating" ? "作成中…" : "資料を作る"}
        </button>
      </div>

      {errorMessage && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{errorMessage}</p>}
    </div>
  );
}
