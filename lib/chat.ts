import type { ChatSource } from "@/lib/referenceSources";
import type { DisplayProposal } from "@/lib/proposal/applyResult";
import type { ProposalSituation } from "@/lib/proposal/selectProposals";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/** 学校提案メッセージが保持する構造化データ。リッチ版でカード表示に差し替える際にここから復元する */
export type ProposalMessageData = {
  situation: ProposalSituation;
  introNote: string | null;
  proposals: DisplayProposal[];
};

/** 表示用のメッセージ。提案メッセージだけ、テキストの裏に構造化データ(proposalData)を持つ */
export type DisplayMessage = ChatMessage & {
  proposalData?: ProposalMessageData;
  /**
   * そのターンの回答で使った確認済みリファレンスの出典（回答の下の出典パネル用）。
   * サーバーが X-Reference-Sources ヘッダで返したものだけを入れる。
   * 画面表示専用で、/api/chat・/api/karte へは送らない（toChatMessages で落ちる）。
   */
  sources?: ChatSource[];
};

export function isValidMessages(value: unknown): value is ChatMessage[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (m) =>
        m &&
        typeof m === "object" &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.length > 0,
    )
  );
}

/** 会話履歴を「ユーザー: .../カウンセラー: ...」形式のプレーンテキストに整形する */
export function formatTranscript(messages: ChatMessage[]): string {
  return messages
    .map((m) => `${m.role === "user" ? "ユーザー" : "カウンセラー"}: ${m.content}`)
    .join("\n\n");
}
