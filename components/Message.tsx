import type { ChatMessage } from "@/lib/chat";
import { stripMarkdownBold } from "@/lib/markdown";

export type { ChatMessage };

/**
 * "bubble"（既定・/widget向け）: 既存の左右チャットバブル。見た目・挙動とも一切変更していない。
 * "document"（Plan Chat向け）: Mindtrip参考の「相談記録」型。左右位置ではなくavatar色と
 * タイポグラフィだけでuser/assistantを識別する。テキスト自体（stripMarkdownBoldの結果）は共通。
 */
export type MessageVariant = "bubble" | "document";

/** AI avatar用の最小限のブランドマーク（4方向スパーク）。ロゴ画像は使わず、SVG1つだけの軽量アイコン */
export function AiSparkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 3.5c.4 2.9 1.1 4.9 2.1 5.9s3 1.7 5.9 2.1c-2.9.4-4.9 1.1-5.9 2.1s-1.7 3-2.1 5.9c-.4-2.9-1.1-4.9-2.1-5.9s-3-1.7-5.9-2.1c2.9-.4 4.9-1.1 5.9-2.1s1.7-3 2.1-5.9Z" />
    </svg>
  );
}

/**
 * Markdownライブラリは追加せず、\n\n（空行）区切りだけを見た目上の段落として分ける。
 * 各段落の中身はこれまで通りwhitespace-pre-wrapで単一の改行・箇条書き・番号付きリストの
 * 見た目をそのまま保つ（テキスト自体・stripMarkdownBoldの結果は一切変更しない）。
 */
function splitParagraphs(text: string): string[] {
  const parts = text.split(/\n{2,}/).filter((p) => p.length > 0);
  return parts.length > 0 ? parts : [text];
}

export default function Message({
  role,
  content,
  variant = "bubble",
}: ChatMessage & { variant?: MessageVariant }) {
  const isUser = role === "user";
  const text = stripMarkdownBold(content);

  if (variant === "document") {
    return (
      <div className="flex items-start gap-4 border-b border-worksheet-border/60 py-5 sm:py-6">
        <span
          aria-hidden
          className={
            isUser
              ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 sm:h-9 sm:w-9"
              : "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-worksheet-sage sm:h-9 sm:w-9"
          }
        >
          {isUser ? (
            <span className="h-2.5 w-2.5 rounded-full bg-worksheet-secondary" />
          ) : (
            <AiSparkIcon className="h-3.5 w-3.5 text-worksheet-primary" />
          )}
        </span>
        <div className="min-w-0 flex-1 space-y-3 text-[15px] leading-7 text-worksheet-primary">
          {splitParagraphs(text).map((para, i) => (
            <p key={i} className="whitespace-pre-wrap break-words">
              {para}
            </p>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm leading-relaxed ${
          isUser
            ? "bg-blue-600 text-white"
            : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
        }`}
      >
        {text}
      </div>
    </div>
  );
}
