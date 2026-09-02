"use client";

import {
  Fragment,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import Image from "next/image";
import Message, { AiSparkIcon } from "./Message";
import KarteDebugPanel from "./KarteDebugPanel";
import { ProposalMessage } from "./proposal/ProposalMessage";
import KarteSummary from "./KarteSummary";
import BrandLogo from "./BrandLogo";
import ChatStartScreen from "./ChatStartScreen";
import PlanChatMessage from "./PlanChatMessage";
import PlanChatInsightNote, {
  PlanChatDivider,
  LeafIcon,
  PLAN_CHAT_SUGGESTIONS,
} from "./PlanChatInsightNote";
import { fallbackGradientForPlan } from "./PlanCard";
import { getPlanCoverImage } from "@/lib/planCover";
import { summarizeKarteForCard } from "@/lib/planCardSummary";
import type { ChatMessage, DisplayMessage, ProposalMessageData } from "@/lib/chat";
import {
  confirmKarte,
  flagOpenQuestions,
  kartePatchToFieldPatches,
  mergeKarte,
  type FieldPatch,
  type Karte,
  type KartePatch,
} from "@/lib/karte";
// バレル(@/lib/proposal)経由だと selectProposals.ts の @anthropic-ai/sdk 依存が
// クライアントバンドルに混入するため、依存の無い gates.ts から直接importする。
import { readyForSchoolProposal } from "@/lib/proposal/gates";
import { createClient } from "@/lib/supabase/client";
import { applyKartePatch, saveChatMessage, type OtherKartePatch } from "@/lib/planChat";
import type { DisplayProposal } from "@/lib/proposal/applyResult";
import type { ProposalSituation } from "@/lib/proposal/selectProposals";

const isDev = process.env.NODE_ENV !== "production";

/** /api/chat・/api/karte に送るときは role/content だけの素の形に戻す */
function toChatMessages(list: DisplayMessage[]): ChatMessage[] {
  return list.map(({ role, content }) => ({ role, content }));
}

function formatProposalMessage(
  situation: ProposalSituation,
  introNote: string | null,
  proposals: DisplayProposal[],
): string {
  const lines: string[] = [];

  if (introNote) {
    lines.push(introNote);
    lines.push("");
  } else if (situation === "none") {
    lines.push("今のご希望に完全に合う学校は、現在のデータには見つかりませんでした。");
    lines.push("");
  }

  const matches = proposals.filter((p) => p.category === "match");
  const references = proposals.filter((p) => p.category === "reference");

  if (matches.length > 0) {
    lines.push("【ご希望に合う候補】");
    for (const p of matches) {
      lines.push(`■ ${p.name}（${p.city}）`);
      lines.push(p.reason);
      if (p.caveat) lines.push(`※ ${p.caveat}`);
      lines.push("");
    }
  }

  if (references.length > 0) {
    lines.push("【条件を一部外れる参考候補】");
    for (const p of references) {
      lines.push(`■ ${p.name}（${p.city}）`);
      lines.push(p.reason);
      if (p.caveat) lines.push(`→ 希望と外れる点: ${p.caveat}`);
      lines.push("");
    }
  }

  return lines.join("\n").trim();
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.error === "string") return data.error;
  } catch {
    // レスポンスがJSONでない場合（ストリーミング開始後のエラー等）
  }
  return "エラーが発生しました。しばらくしてから再度お試しください。";
}

function ArrowUpIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

type ChatProps = {
  /**
   * このウィジェット表示に割り当てられた初期カルテ（meta.karteId・meta.createdAt 含む）。
   * サーバー側（app/widget/page.tsx または app/plans/[planId]/chat/page.tsx）で1回だけ生成・
   * 復元して渡す。クライアント側で crypto.randomUUID() や new Date() を呼ぶと、SSRとハイドレーション
   * で値が食い違い hydration mismatch を起こすため、ここでは生成しない。
   */
  initialKarte: Karte;
  /**
   * Plan配下のChat（/plans/[planId]/chat）でのみ指定する。指定時のみ chat_messages・
   * plan_karte への永続化を行う。/widget では未指定のまま（匿名・非永続を維持）。
   */
  planId?: string;
  /** そのPlanのMain Chat(chat_sessions.id)。page.tsx側で取得・作成済みのものを渡す。クライアント側で再取得・再作成はしない */
  sessionId?: string;
  /** DBから復元した会話履歴。/widget では未指定（常に空から始まる） */
  initialMessages?: DisplayMessage[];
  /** そのPlanの表示名（plans.title）。Plan Chatヘッダーのサブタイトルにのみ使う表示専用の値 */
  planTitle?: string;
};

export default function Chat({
  initialKarte,
  planId,
  sessionId,
  initialMessages = [],
  planTitle,
}: ChatProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [karte, setKarte] = useState<Karte>(initialKarte);
  const [showSummary, setShowSummary] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const prevSummaryRef = useRef<string | null>(karte.meta.summary);
  const prevGateReadyRef = useRef<boolean>(readyForSchoolProposal(karte).ready);
  const prevImmediateRequestRef = useRef<boolean>(karte.handoff.immediateProposalRequested);
  // 確認カードを出したいタイミングでAIが質問中だった場合、いったん保留する
  const pendingSummaryRef = useRef<boolean>(false);
  // apply_karte_patchの結果を古い順に適用してしまわないための単調カウンタ
  // （呼び出し順とRPC完了順が前後しても、常に最後に開始した呼び出しの結果でstateを確定させる）
  const karteSeqRef = useRef(0);
  const latestAppliedSeqRef = useRef(0);

  /** planId指定時のみ chat_messages に1件保存する。/widget（planId未指定）では何もしない */
  function persistMessage(role: "user" | "assistant", content: string, proposalData: ProposalMessageData | null = null) {
    if (!planId || !sessionId) return;
    void saveChatMessage(createClient(), sessionId, role, content, proposalData);
  }

  /**
   * Plan Chat専用。Field patch・その他(handoff/proposals等)の変更をapply_karte_patchへ送り、
   * DBが確定させた最終的なKarteでstateを更新する。source/certaintyの裁定・conflictsの記録は
   * すべてDB側で行われるため、ここでは結果を待って必ずそれを採用する（ローカル計算を使わない）。
   */
  async function persistFieldPatches(fieldPatches: FieldPatch[], other?: OtherKartePatch) {
    if (!planId) return;
    const hasOther = other && Object.values(other).some((v) => v !== undefined);
    if (fieldPatches.length === 0 && !hasOther) return;
    const seq = ++karteSeqRef.current;
    const result = await applyKartePatch(createClient(), planId, { fieldPatches, ...other });
    if (!result) return; // 失敗時はローカルstateをそのまま維持する（フェイルソフト）
    if (seq > latestAppliedSeqRef.current) {
      latestAppliedSeqRef.current = seq;
      setKarte(result);
    }
  }

  /** 文末が「?」「？」で終わっているか（簡易判定。取りこぼしは許容） */
  function endsWithQuestionMark(text: string): boolean {
    const trimmed = text.trim();
    return trimmed.endsWith("?") || trimmed.endsWith("？");
  }

  /** 直近のアシスタント発言が質問で終わっているか */
  function lastAssistantEndsWithQuestion(): boolean {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") {
        return endsWithQuestionMark(messages[i].content);
      }
    }
    return false;
  }

  /** 確認カードを出す条件が揃った瞬間に呼ぶ。AIが質問中なら出さずに保留する */
  function requestShowSummary() {
    if (lastAssistantEndsWithQuestion()) {
      pendingSummaryRef.current = true;
    } else {
      setShowSummary(true);
    }
  }

  /**
   * ユーザーが条件確認に答えず提案を求め続けている場合の暫定モード。
   * 確認カード（「間違いありません」ボタン）を経由せず、条件が揃っていなくても /api/proposal を呼ぶ。
   * ゲート未充足のまま呼ぶため、都市・コースどちらの手がかりも無ければ API 側がガードとして
   * guardMessage（1つだけ聞き返す一言）を返す。その場合は提案ではなく通常の会話メッセージとして表示する。
   */
  async function fetchProvisionalProposal(baseKarte: Karte) {
    setIsSending(true);
    setError(null);

    try {
      const res = await fetch("/api/proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ karte: baseKarte, provisional: true }),
      });

      if (!res.ok) {
        const message = await readErrorMessage(res);
        setError(message);
        return;
      }

      const data = await res.json();

      if (typeof data?.guardMessage === "string") {
        setMessages((prev) => [...prev, { role: "assistant", content: data.guardMessage }]);
        persistMessage("assistant", data.guardMessage);
        if (data.karte) {
          if (planId) {
            void persistFieldPatches([], {
              proposals: data.karte.proposals,
              immediateProposalRequested: data.karte.handoff.immediateProposalRequested,
            });
          } else {
            setKarte(data.karte);
          }
        }
        return;
      }

      if (!data?.ready) {
        // ガード以外の ready:false は暫定モードでは理論上来ないが、念のため何もしない
        return;
      }

      const proposalMessage: DisplayMessage = {
        role: "assistant",
        content: formatProposalMessage(data.situation, data.introNote, data.proposals),
        proposalData: {
          situation: data.situation,
          introNote: data.introNote,
          proposals: data.proposals,
        },
      };
      setMessages((prev) => [...prev, proposalMessage]);
      persistMessage("assistant", proposalMessage.content, proposalMessage.proposalData ?? null);
      if (data.karte) {
        if (planId) {
          void persistFieldPatches([], {
            proposals: data.karte.proposals,
            immediateProposalRequested: data.karte.handoff.immediateProposalRequested,
          });
        } else {
          setKarte(data.karte);
        }
      }
    } catch {
      setError("通信エラーが発生しました。ネットワーク状態を確認してください。");
    } finally {
      setIsSending(false);
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  // 会話の区切り（AIが要約と確認を求めたタイミング=meta.summaryが新規に埋まった時）でカルテ要約を提示する
  useEffect(() => {
    if (karte.meta.summary && karte.meta.summary !== prevSummaryRef.current) {
      requestShowSummary();
    }
    prevSummaryRef.current = karte.meta.summary;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [karte.meta.summary]);

  // 学校提案のゲートが揃った瞬間（false→true）に、上記とは独立して必ず要約確認を挟む
  useEffect(() => {
    const ready = readyForSchoolProposal(karte).ready;
    if (ready && !prevGateReadyRef.current) {
      requestShowSummary();
    }
    prevGateReadyRef.current = ready;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [karte]);

  // ユーザーが条件確認に答えず提案を求め続けている、と抽出LLMが判断した瞬間（false→true）に、
  // 確認カードを挟まず暫定モードで /api/proposal を呼ぶ
  useEffect(() => {
    const requested = karte.handoff.immediateProposalRequested === true;
    if (requested && !prevImmediateRequestRef.current) {
      void fetchProvisionalProposal(karte);
    }
    prevImmediateRequestRef.current = requested;
  }, [karte]);

  async function extractKarte(history: DisplayMessage[], baseKarte: Karte) {
    try {
      const res = await fetch("/api/karte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: toChatMessages(history), karte: baseKarte }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const patch = data?.patch as KartePatch | undefined;
      if (!patch) return;

      if (planId) {
        const fieldPatches = kartePatchToFieldPatches(patch, "chat");
        // summary/immediateProposalRequestedはField化されないため、他patchとして別送りする
        void persistFieldPatches(fieldPatches, {
          summary: patch.summary,
          immediateProposalRequested: patch.immediateProposalRequested,
        });
      } else {
        setKarte((prev) => mergeKarte(prev, patch));
      }
    } catch {
      // カルテ抽出は補助機能。失敗しても会話体験は継続する。
    }
  }

  async function sendMessages(history: DisplayMessage[]) {
    setIsSending(true);
    setError(null);

    // アシスタントの応答用プレースホルダーを追加
    setMessages([...history, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // karte も送る（都市が確定していれば学校知識、Plan Chatなら既知情報・矛盾もSYSTEM_PROMPTに注入するため）
        // includeKnownFactsはPlan Chat（planId有）のときだけtrue。/widgetでは常にfalse相当（未送信）
        body: JSON.stringify({
          messages: toChatMessages(history),
          karte,
          includeKnownFacts: Boolean(planId),
        }),
      });

      if (!res.ok || !res.body) {
        const message = await readErrorMessage(res);
        setError(message);
        // 空のプレースホルダーを取り除く
        setMessages(history);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      let receivedAny = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk.length === 0) continue;
        receivedAny = true;
        assistantText += chunk;
        setMessages([
          ...history,
          { role: "assistant", content: assistantText },
        ]);
      }

      if (!receivedAny) {
        setError("応答を取得できませんでした。しばらくしてから再度お試しください。");
        setMessages(history);
        return;
      }

      // 保留中の確認カードがあれば、このターンがAIの質問で終わっていない時点で出す
      if (pendingSummaryRef.current && !endsWithQuestionMark(assistantText)) {
        pendingSummaryRef.current = false;
        setShowSummary(true);
      }

      // ストリーミングが正常完了した時点でassistantメッセージを保存する（extractKarteの完了は待たない）
      persistMessage("assistant", assistantText);

      // 完了したやり取りからカルテを差分更新する（バックグラウンド、失敗しても会話は継続）
      void extractKarte(
        [...history, { role: "assistant", content: assistantText }],
        karte,
      );
    } catch {
      setError("通信エラーが発生しました。ネットワーク状態を確認してください。");
      setMessages(history);
    } finally {
      setIsSending(false);
    }
  }

  /**
   * 学校提案(第3層)を取得し、構造化データ(proposalData)付きのメッセージとして会話に追加する。
   * /api/chat は呼ばない（提案文はカウンセラーLLMの自由生成ではなく第3層の構造化出力そのもの）。
   * ただし追加後は通常どおり messages に残るため、続く /api/chat 呼び出しにも履歴として渡り、
   * 会話はここで終わらず自然に続けられる。
   */
  async function fetchProposal(baseKarte: Karte) {
    setIsSending(true);
    setError(null);

    const withAck: DisplayMessage[] = [
      ...messages,
      { role: "user", content: "はい、内容に間違いありません。" },
    ];
    setMessages(withAck);
    persistMessage("user", "はい、内容に間違いありません。");

    try {
      const res = await fetch("/api/proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ karte: baseKarte }),
      });

      if (!res.ok) {
        const message = await readErrorMessage(res);
        setError(message);
        return;
      }

      const data = await res.json();
      if (!data?.ready) {
        // ゲート判定直後に呼んでいるため理論上は来ないが、念のため何もしない
        return;
      }

      const proposalMessage: DisplayMessage = {
        role: "assistant",
        content: formatProposalMessage(data.situation, data.introNote, data.proposals),
        proposalData: {
          situation: data.situation,
          introNote: data.introNote,
          proposals: data.proposals,
        },
      };
      setMessages([...withAck, proposalMessage]);
      persistMessage("assistant", proposalMessage.content, proposalMessage.proposalData ?? null);
      if (data.karte) {
        if (planId) {
          void persistFieldPatches([], {
            proposals: data.karte.proposals,
            immediateProposalRequested: data.karte.handoff.immediateProposalRequested,
          });
        } else {
          setKarte(data.karte);
        }
      }
    } catch {
      setError("通信エラーが発生しました。ネットワーク状態を確認してください。");
    } finally {
      setIsSending(false);
    }
  }

  function submitText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    const history: DisplayMessage[] = [
      ...messages,
      { role: "user", content: trimmed },
    ];
    persistMessage("user", trimmed);
    setInput("");
    setShowSummary(false);
    void sendMessages(history);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submitText(input);
  }

  function handleRetry() {
    if (messages.length === 0) return;
    void sendMessages(messages);
  }

  function handleConfirmSummary() {
    const { karte: confirmed, fieldPatches } = confirmKarte(karte);
    setShowSummary(false);

    if (planId) {
      // certainty格上げ(inferred→stated)はDB側でも常に同じ結果になるため、
      // 直後のゲート判定・提案取得はローカル計算のconfirmedをそのまま使ってよい
      void persistFieldPatches(fieldPatches, { confirmedItems: confirmed.handoff.confirmedItems, openQuestions: [] });
    } else {
      setKarte(confirmed);
    }

    // 要約確認OK時点でゲートが揃っていれば、通常の会話送信の代わりに学校提案を取得する。
    // 揃っていなければこれまでどおり会話を続ける。
    if (readyForSchoolProposal(confirmed).ready) {
      void fetchProposal(confirmed);
    } else {
      submitText("はい、内容に間違いありません。");
    }
  }

  function handleRequestCorrection() {
    const flagged = flagOpenQuestions(karte);
    setShowSummary(false);
    textareaRef.current?.focus();

    if (planId) {
      void persistFieldPatches([], { openQuestions: flagged.handoff.openQuestions });
    } else {
      setKarte(flagged);
    }
  }

  /** 「まだ話したいことがある」。今は確認しない。カルテには触れず、会話に戻るだけ */
  function handleSkipSummary() {
    setShowSummary(false);
  }

  /** 「学校を提案してもらう」。確認カードを能動的に開く（暫定提案とは別経路。正式な確認→提案フローに合流させる） */
  function handleRequestProposalCard() {
    setShowSummary(true);
  }

  /**
   * UI再設計（見た目のみ）: Plan Chat（planId有）のときだけ、中央スタート画面・専用ヘッダー・
   * Mindtrip風の入力欄を使う。/widget（planId無し）は既存の見た目を一切変えない。
   */
  const isPlanChat = Boolean(planId);
  const showStartScreen = isPlanChat && messages.length === 0 && !isSending;

  // Plan cover画像。/mypage・Plan Homeと同じ既存ロジック（karte.schoolPrefs.preferredCity → 都市画像）を
  // そのまま再利用するだけで、新しいcoverロジックは作らない。karte state由来のため、会話中に
  // 都市が確定した場合はヘッダーの画像も自然に追従する。
  const headerCity = isPlanChat ? summarizeKarteForCard(karte).city : null;
  const headerCover = getPlanCoverImage(headerCity);

  /**
   * クイックスタート。新しいAPI・専用ロジックは作らず、既存の入力欄へ文言を入れるだけに留める
   * （即送信するsubmitText呼び出しより変更・副作用の範囲が小さいため、こちらを採用）。
   * 送信そのものは、ユーザーが今まで通り送信ボタン/Enterを押す既存のsubmitフローに委ねる。
   */
  function handleQuickStart(text: string) {
    setInput(text);
    textareaRef.current?.focus();
  }

  function handleTextareaKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitText(input);
    }
  }

  // proposal表示・メッセージ表示のロジックは既存のまま。isPlanChat/widgetどちらのレイアウトからも
  // 同じ内容をそのまま使い、表示ロジックの二重実装を避ける。
  const messageListContent = (
    <>
      {messages.map((m, i) =>
        m.proposalData ? (
          <ProposalMessage
            key={i}
            situation={m.proposalData.situation}
            introNote={m.proposalData.introNote}
            proposals={m.proposalData.proposals}
            variant={isPlanChat ? "document" : "default"}
          />
        ) : (
          <Message
            key={i}
            role={m.role}
            content={m.content}
            variant={isPlanChat ? "document" : "bubble"}
          />
        ),
      )}
      {isSending &&
        (isPlanChat ? (
          <div className="flex items-center gap-4 py-5 sm:py-6">
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-worksheet-sage sm:h-9 sm:w-9"
            >
              <AiSparkIcon className="h-3.5 w-3.5 text-worksheet-primary" />
            </span>
            <div className="flex items-center gap-2 text-sm text-worksheet-secondary">
              <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-worksheet-secondary [animation-delay:-0.3s]" />
              <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-worksheet-secondary [animation-delay:-0.15s]" />
              <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-worksheet-secondary" />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.3s]" />
            <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.15s]" />
            <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-zinc-400" />
            <span>送信中...</span>
          </div>
        ))}
    </>
  );

  // Plan Chatの入力欄本体（textarea+送信ボタンのカプセル）。開始画面中央に置く場合と、
  // 会話開始後に画面下部へ固定する場合とで、外側の<form>だけを出し分けて再利用する
  // （textarea/ボタン自体・ref・イベントハンドラは完全に同一のJSXを共有し、二重定義しない）。
  const sageInputCapsule = (
    <div
      className="flex w-full items-end gap-2 rounded-[28px] border border-[#e7dfce] bg-white px-3 py-3 shadow-[0_2px_10px_rgba(60,50,30,0.06)] transition-colors duration-150 focus-within:border-[#e6c3b8] focus-within:ring-2 focus-within:ring-[#efccc0]/60 sm:gap-3 sm:px-5"
      style={{ minHeight: 72 }}
    >
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleTextareaKeyDown}
        placeholder="留学について、いま思っていることをそのまま書いてください"
        rows={1}
        disabled={isSending}
        aria-label="メッセージを入力"
        className="max-h-40 min-h-[44px] flex-1 resize-none self-center bg-transparent py-2 text-[15px] leading-6 text-[#2b2a26] placeholder:text-[#a7a08f] focus:outline-none disabled:opacity-60 sm:text-base"
      />
      <button
        type="submit"
        disabled={isSending || !input.trim()}
        aria-label="送信"
        className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-[#ef8069] text-white shadow-[0_2px_6px_rgba(214,105,79,0.35)] transition-colors duration-150 hover:bg-[#e2694f] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#ef8069]"
      >
        <ArrowUpIcon className="h-5 w-5" />
      </button>
    </div>
  );

  // Plan Chat 会話本文（PlanChatMessage カード＋一度きりの区切り装飾＋紙/セージ調のローディング）。
  // /widget 側は既存の messageListContent をそのまま使い、この分岐には一切関与しない。
  const firstAssistantIdx = messages.findIndex((m) => m.role === "assistant");
  const planMessageListContent = (
    <>
      {messages.map((m, i) => (
        <Fragment key={i}>
          {m.proposalData ? (
            <ProposalMessage
              situation={m.proposalData.situation}
              introNote={m.proposalData.introNote}
              proposals={m.proposalData.proposals}
              variant="document"
            />
          ) : (
            <PlanChatMessage role={m.role} content={m.content} />
          )}
          {i === firstAssistantIdx && i < messages.length - 1 && <PlanChatDivider />}
        </Fragment>
      ))}
      {isSending && (
        <div className="flex items-start gap-3 sm:gap-4">
          <span
            aria-hidden
            className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#dbe5d0] bg-white text-[#7c9068]"
          >
            <AiSparkIcon className="h-4 w-4" />
          </span>
          <div className="flex items-center gap-1.5 rounded-[15px] border border-[#dde7d2] bg-[#f1f5ec] px-5 py-4">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#9caf88] [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#9caf88] [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#9caf88]" />
          </div>
        </div>
      )}
    </>
  );

  return (
    <div
      className={isPlanChat ? "flex h-full flex-col bg-[#faf8f3]" : "flex h-full flex-col"}
      style={
        isPlanChat
          ? {
              backgroundImage:
                "radial-gradient(rgba(120,100,60,0.025) 1px, transparent 1px)",
              backgroundSize: "22px 22px",
            }
          : undefined
      }
    >
      {isPlanChat && (
        <header className="sticky top-0 z-20 border-b border-[#e7dfce] bg-[#faf8f3]/95 backdrop-blur-sm">
          <div className="flex items-center gap-3 px-3 py-2.5 sm:gap-4 sm:px-6 sm:py-3">
            {/* lg以上ではAppNavの左sidebarに同じロゴがあるため、ここでは隠す（sticky・戻る導線は維持） */}
            <BrandLogo href="/mypage" className="h-8 w-auto shrink-0 sm:h-9 lg:hidden" />
            <span aria-hidden className="hidden h-6 w-px shrink-0 bg-[#e0d8c5] sm:block lg:hidden" />

            <Link
              href={`/plans/${planId}`}
              aria-label="Plan Homeに戻る"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#8a8578] transition-colors hover:bg-[#efe9db] hover:text-[#2b2a26]"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </Link>

            {/* ポラロイド風サムネイル。都市画像があれば再利用し、無ければ中立のグラデ（架空の都市画像は出さない）。 */}
            <div aria-hidden className="relative shrink-0 -rotate-[2.5deg]">
              <span className="absolute -top-1.5 left-1/2 z-10 h-3 w-9 -translate-x-1/2 -rotate-[4deg] rounded-[1px] bg-[#d8c7a6]/70" />
              <div
                className={`relative h-14 w-14 overflow-hidden rounded-[2px] border-[3px] border-white bg-linear-to-br ${fallbackGradientForPlan(
                  planId ?? "",
                )} shadow-[0_3px_8px_rgba(50,40,20,0.18)] sm:h-[68px] sm:w-[68px]`}
              >
                {headerCover.imageSrc && (
                  <Image src={headerCover.imageSrc} alt="" fill sizes="68px" className="object-cover" />
                )}
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold text-[#25324a] sm:text-base">
                留学プランの相談
              </p>
              {planTitle && (
                <p className="truncate text-xs text-[#8a8578] sm:text-[13px]">{planTitle}</p>
              )}
            </div>

            {/* 固定UIコピーのピル。狭い画面では省略。 */}
            <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-[#cfdcc4] bg-[#eef3e8] px-3 py-1.5 text-xs font-medium text-[#5f7050] sm:inline-flex">
              <LeafIcon className="h-3.5 w-3.5" />
              考えを整理する時間
            </span>
          </div>
        </header>
      )}

      <div className={isPlanChat ? "flex-1 overflow-y-auto" : "flex-1 space-y-3 overflow-y-auto p-4"}>
        {isPlanChat ? (
          showStartScreen ? (
            // 見出し・説明・Quick Start・入力欄を1つのまとまりとして中央に見せる
            // （会話開始前だけ、入力欄をスクロール領域の外＝画面下部固定ではなくここに置く）。
            <div className="flex h-full flex-col items-center justify-center gap-6 px-4 py-8 sm:px-6">
              <ChatStartScreen onQuickStart={handleQuickStart} />
              <form onSubmit={handleSubmit} className="w-full max-w-[820px]">
                {sageInputCapsule}
              </form>
            </div>
          ) : (
            <>
              {/* Desktop: 左に会話（720〜850px相当）＋右に付箋メモ。Tablet/Mobile: 付箋は会話の下へ。 */}
              <div className="mx-auto flex w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:gap-10 lg:py-10">
                <div className="min-w-0 flex-1">
                  <div className="mx-auto max-w-[820px] space-y-6">{planMessageListContent}</div>
                </div>
                <aside className="hidden w-[264px] shrink-0 lg:block">
                  <div className="sticky top-6">
                    <PlanChatInsightNote karte={karte} />
                  </div>
                </aside>
              </div>
              <div className="mx-auto w-full max-w-[820px] px-4 pb-2 sm:px-6 lg:hidden">
                <PlanChatInsightNote karte={karte} variant="inline" />
              </div>
            </>
          )
        ) : (
          <>
            {messages.length === 0 && !isSending && (
              // 装飾的な導入メッセージ。messages配列には含めない（/api/chat・/api/karteには一切送らない）。
              // /widgetでは今回のUI再設計の対象外のため、この分岐は既存のまま変更していない。
              <Message
                role="assistant"
                content="こんにちは。留学のこと、一緒に整理していきましょう。どんなことを考えているか、気軽に聞かせてください。"
              />
            )}
            {messageListContent}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Plan Chatでは会話本文（max-w-3xl）と横幅・左右marginを揃える。/widgetは既存のmx-4のまま */}
      {showSummary && (
        <div className={isPlanChat ? "mx-auto w-full max-w-[820px] px-4 sm:px-6" : undefined}>
          <KarteSummary
            karte={karte}
            onConfirm={handleConfirmSummary}
            onRequestCorrection={handleRequestCorrection}
            onSkip={handleSkipSummary}
          />
        </div>
      )}

      {!showSummary && karte.schoolPrefs.preferredCity.value && (
        <div className={isPlanChat ? "mx-auto mb-2 flex w-full max-w-[820px] justify-end px-4 sm:px-6" : "mx-4 mb-2 flex justify-end"}>
          <button
            type="button"
            onClick={handleRequestProposalCard}
            disabled={isSending}
            className="rounded-full border border-proposal-accent/30 bg-proposal-accent-soft px-3 py-1.5 text-xs font-medium text-proposal-accent hover:border-proposal-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
          >
            学校を提案してもらう
          </button>
        </div>
      )}

      {isDev && <KarteDebugPanel karte={karte} variant={isPlanChat ? "corner" : "inline"} />}

      {error && (
        <div
          className={
            isPlanChat
              ? "mx-auto mb-2 flex w-full max-w-[820px] items-center justify-between gap-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 sm:px-6"
              : "mx-4 mb-2 flex items-center justify-between gap-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
          }
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={handleRetry}
            className="shrink-0 rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
          >
            再送信
          </button>
        </div>
      )}

      {isPlanChat ? (
        // 会話開始前は入力欄が上のスタート画面側（スクロール領域内）にあるため、
        // ここでの画面下部固定表示は会話開始後だけ行う（二重表示を避ける）。
        !showStartScreen && (
          <form
            onSubmit={handleSubmit}
            className="border-t border-[#e7dfce] bg-[#faf8f3] px-4 pb-5 pt-4 sm:px-6"
          >
            <div className="mx-auto max-w-[820px]">
              {/* サジェストチップ。押すと入力欄に文言を入れるだけ（既存 handleQuickStart と同じ。送信はしない）。 */}
              <div className="mb-3 flex flex-wrap gap-2">
                {PLAN_CHAT_SUGGESTIONS.map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => handleQuickStart(label)}
                    disabled={isSending}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#e0d7c4] bg-[#fdfcf8] px-3.5 py-1.5 text-[13px] text-[#5f5a4e] shadow-[0_1px_2px_rgba(60,50,30,0.05)] transition-colors hover:border-[#cdbfa4] hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <LeafIcon className="h-3.5 w-3.5 text-[#9aa98a]" />
                    {label}
                  </button>
                ))}
              </div>
              {sageInputCapsule}
              <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-[#a7a08f]">
                <LeafIcon className="h-3.5 w-3.5" />
                答えを急がなくて大丈夫です。
              </p>
            </div>
          </form>
        )
      ) : (
        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            placeholder="メッセージを入力..."
            rows={1}
            disabled={isSending}
            className="max-h-32 flex-1 resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button
            type="submit"
            disabled={isSending || !input.trim()}
            className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            送信
          </button>
        </form>
      )}
    </div>
  );
}
