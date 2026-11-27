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
  hasPlanChatInsights,
} from "./PlanChatInsightNote";
import { fallbackGradientForPlan } from "./PlanCard";
import { getPlanCoverImage } from "@/lib/planCover";
import { summarizeKarteForCard } from "@/lib/planCardSummary";
import type { ChatMessage, DisplayMessage, ProposalMessageData } from "@/lib/chat";
import SourceDisclosure from "@/components/chat/SourceDisclosure";
import { isSafeSourceUrl, type ChatSource } from "@/lib/referenceSources";
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

/**
 * /api/chat の X-Reference-Sources ヘッダ（base64 の JSON）を読む。
 * 本文はこれまで通り素のテキストストリームなので、読み取り処理は変えていない。
 * 壊れていた場合は出典なしとして扱い、チャット自体は止めない。
 */
function readSourcesHeader(res: Response): ChatSource[] {
  const raw = res.headers.get("X-Reference-Sources");
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(atob(raw), (c) => c.charCodeAt(0))),
    );
    if (!Array.isArray(parsed)) return [];
    const sources: ChatSource[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const s = item as Record<string, unknown>;
      // 画面へ出す前にクライアント側でも最低限の確認をする（https 以外は捨てる）。
      if (typeof s.name !== "string" || typeof s.url !== "string" || typeof s.label !== "string") continue;
      if (!isSafeSourceUrl(s.url)) continue;
      sources.push({
        name: s.name,
        url: s.url,
        label: s.label,
        reviewedAt: typeof s.reviewedAt === "string" ? s.reviewedAt : undefined,
        updatedAt: typeof s.updatedAt === "string" ? s.updatedAt : undefined,
        note: typeof s.note === "string" ? s.note : undefined,
        topic: typeof s.topic === "string" ? s.topic : undefined,
      });
    }
    return sources;
  } catch {
    return [];
  }
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

/**
 * AI が回答を作っている間だけ送信ボタンに出す「…」。
 * 色だけでなく形でも「いまは送れない」と分かるようにするための**表示だけ**のアイコンで、
 * 停止操作ではない（この画面に停止機能は無いので追加していない）。
 */
function PendingDotsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <circle cx="6" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="18" cy="12" r="1.6" />
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
  /**
   * ログイン中ユーザーのプロフィール画像 signed URL（AppNav と同じ loadAppNavViewer 由来）。
   * Plan Chat の user メッセージ avatar に使う。未設定なら null で、既存の汎用アイコンへ fallback。
   * /widget（匿名）では渡さない。
   */
  userAvatarUrl?: string | null;
};

export default function Chat({
  initialKarte,
  planId,
  sessionId,
  initialMessages = [],
  planTitle,
  userAvatarUrl = null,
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
  function persistMessage(
    role: "user" | "assistant",
    content: string,
    proposalData: ProposalMessageData | null = null,
    /** その回答で表示した出典（assistant のときだけ）。reload 後も出典パネルを復元するため保存する。 */
    sources: ChatSource[] | null = null,
  ) {
    if (!planId || !sessionId) return;
    void saveChatMessage(createClient(), sessionId, role, content, proposalData, sources);
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
          // 都市の治安・生活費を聞かれたときに、My Plan の確定都市をサーバー側で
          // 参照できるようにするためだけに送る（/widget では未指定のまま）。
          planId,
        }),
      });

      if (!res.ok || !res.body) {
        const message = await readErrorMessage(res);
        setError(message);
        // 空のプレースホルダーを取り除く
        setMessages(history);
        return;
      }

      // 出典はヘッダで来るので、ストリームを読み始める前に取得できる。
      const sources = readSourcesHeader(res);

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
          { role: "assistant", content: assistantText, ...(sources.length > 0 ? { sources } : {}) },
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
      // 出典（ヘッダ由来の sanitized な値）も一緒に保存し、reload 後も同じパネルを出せるようにする。
      persistMessage("assistant", assistantText, null, sources.length > 0 ? sources : null);

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
  /** 右カラム（いま分かっていること）を出しているか。画面下部の位置合わせにも使う。 */
  const showInsightAside = isPlanChat && hasPlanChatInsights(karte);

  /**
   * 画面下部（確認カード / アクション行 / エラー / 入力欄）を**会話カラムと同じ位置**に置くための枠。
   * 会話は `max-w-[1240px]` の中で「本文 + 右カラム 264px」に分かれているので、下部も同じ骨格にする。
   * 以前は下部だけ画面全体の中央に置いていたため、「学校を提案してもらう」が右カラムとの
   * 境目ぎりぎりに見えていた。右カラムを出していないときは本文と同じく中央のままになる。
   */
  function planBottomShell(children: React.ReactNode) {
    return (
      <div className="mx-auto w-full max-w-[1240px] px-4 sm:px-6">
        <div className="flex gap-6 lg:gap-10">
          <div className="min-w-0 flex-1">
            <div className="mx-auto max-w-[860px]">{children}</div>
          </div>
          {showInsightAside && <div aria-hidden className="hidden w-[264px] shrink-0 lg:block" />}
        </div>
      </div>
    );
  }

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
            comparisonHref={planId ? `/plans/${planId}/documents/school-comparison` : undefined}
          />
        ) : (
          <div key={i}>
            <Message
              role={m.role}
              content={m.content}
              variant={isPlanChat ? "document" : "bubble"}
            />
            {m.role === "assistant" && m.sources && m.sources.length > 0 ? (
              <SourceDisclosure
                sources={m.sources}
                className={isPlanChat ? "" : "px-1 sm:px-2"}
              />
            ) : null}
          </div>
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
  /*
   * 送信ボタンの見た目を状態で出し分ける（**押せるかどうかの判定・送信処理は従来どおり**）。
   *   送信できる     … 蛍光ライムの面 + near-black のアイコン（この画面の主操作）
   *   入力が空       … 淡いグレーの面 + 薄い文字。蛍光にはしない
   *   AI が生成中    … 淡いグレーの面 + 「…」。押せないことが色以外でも分かる
   * 停止操作は今の実装に無いので追加しない。
   */
  const canSend = !isSending && input.trim().length > 0;
  const sendButtonClass = canSend
    ? "bg-[var(--neon-lime)] text-[var(--neon-ink)] hover:bg-[#cdf23e]"
    : "bg-[var(--mk-block)] text-[#b4b7b1]";

  const sageInputCapsule = (
    <div
      className="flex w-full items-end gap-2 rounded-[20px] border border-[var(--mk-border)] bg-[var(--mk-card)] px-3 py-2 shadow-card transition-colors duration-150 focus-within:border-[#b7d94a] focus-within:ring-2 focus-within:ring-[var(--neon-lime)] sm:gap-3 sm:px-4"
      /* 通常時 60px。複数行を入力すると textarea（max-h-40）に合わせて自然に伸びる。 */
      style={{ minHeight: 60 }}
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
        className="max-h-40 min-h-[40px] flex-1 resize-none self-center bg-transparent py-1.5 text-[16px] leading-[1.7] text-[var(--mk-body)] placeholder:text-[#9ca09a] focus:outline-none disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={isSending || !input.trim()}
        aria-label={isSending ? "送信中" : "送信"}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors duration-150 disabled:cursor-not-allowed ${sendButtonClass}`}
      >
        {isSending ? <PendingDotsIcon className="h-5 w-5" /> : <ArrowUpIcon className="h-5 w-5" />}
      </button>
    </div>
  );

  /*
   * 「学校を提案してもらう」＝次のアクション。
   * **専用の行は作らず**、入力欄のすぐ上のクイックアクションと同じ行の右端に置く
   * （PC・スマートフォンとも同じ場所。狭い画面では自然に折り返す）。
   * 表示条件（確認カードを出していない & 希望の都市が決まっている）と
   * 押したときの動きは従来どおり変更していない。
   */
  const showProposalAction = !showSummary && Boolean(karte.schoolPrefs.preferredCity.value);
  /*
   * 配色だけの更新。通常は蛍光ライムの面＋同色の縁＋黒文字、
   * hover では「面だけ」が白に抜ける（縁は蛍光ライム、文字は黒のまま）。
   * 押せないとき（送信中）は蛍光色を使わず、ニュートラルな置きになる。
   * 送信ボタンと同じく、状態でクラスを入れ替える（disabled: の優先順位に頼らない）。
   * 位置・サイズ・角丸・表示条件・クリック処理は変えていない。
   */
  const proposalButtonColor = isSending
    ? "border-[var(--mk-border)] bg-[var(--mk-block)] text-[#b4b7b1]"
    : "border-[var(--neon-lime)] bg-[var(--neon-lime)] text-[var(--neon-ink)] hover:bg-white";
  const proposalButton = (
    <button
      type="button"
      onClick={handleRequestProposalCard}
      disabled={isSending}
      className={`group inline-flex shrink-0 items-center gap-2 rounded-full border-[1.5px] px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neon-lime)] disabled:cursor-not-allowed ${proposalButtonColor}`}
    >
      {/* 面が蛍光ライムになったため、小さな点は黒（--neon-ink）にして白地・ライム地のどちらでも読めるようにする。 */}
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full bg-[var(--neon-ink)] group-disabled:bg-[#d7d9d4]"
      />
      学校を提案してもらう
    </button>
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
              comparisonHref={planId ? `/plans/${planId}/documents/school-comparison` : undefined}
            />
          ) : (
            <>
              <PlanChatMessage role={m.role} content={m.content} userAvatarUrl={userAvatarUrl} />
              {m.role === "assistant" && m.sources && m.sources.length > 0 ? (
                /* 出す件数・並び・リンク・初期は閉じたまま。variant は色だけを切り替える。 */
                <SourceDisclosure sources={m.sources} variant="plan" className="ml-[3rem]" />
              ) : null}
            </>
          )}
          {i === firstAssistantIdx && i < messages.length - 1 && <PlanChatDivider />}
        </Fragment>
      ))}
      {isSending && (
        <div className="flex items-start gap-3 sm:gap-3.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- PlanChatMessage の AI avatar と方式を揃える */}
          <img
            src="/images/chat/ai-alert.png"
            alt=""
            aria-hidden
            className="mt-0.5 h-9 w-9 shrink-0 rounded-full bg-white object-contain ring-2 ring-[var(--neon-lime-soft)]"
          />
          <div className="flex items-center gap-1.5 py-3">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#b4b7b1] [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#b4b7b1] [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#b4b7b1]" />
          </div>
        </div>
      )}
    </>
  );

  return (
    // Plan Chat は「読む画面」なので地を白にする（淡いグレーの canvas は使わない）。
    // 会話・入力欄・右カラムの境界は、面の色ではなく border とラインで示す。
    // /widget 側（isPlanChat=false）のクラスは一切変えていない。
    <div
      className={
        isPlanChat
          ? "relative flex h-full min-h-0 flex-col bg-white"
          : "flex h-full flex-col"
      }
    >
      {isPlanChat && (
        <header className="sticky top-0 z-20 shrink-0 border-b border-[var(--mk-border)] bg-[var(--mk-card)]/95 backdrop-blur-sm">
          {/* 下端の光るライン。面ではなく 2px の線として、左から蛍光ライムが消えていく。 */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px]"
            style={{
              background:
                "linear-gradient(90deg, var(--neon-lime) 0%, rgba(216,251,87,0.45) 22%, rgba(216,251,87,0) 46%)",
            }}
          />
          <div className="relative flex items-center gap-2.5 px-3 py-2 sm:gap-3 sm:px-6">
            {/* lg以上ではAppNavの左sidebarに同じロゴがあるため、ここでは隠す（sticky・戻る導線は維持） */}
            <BrandLogo href="/mypage" className="h-7 w-auto shrink-0 lg:hidden" />
            <span aria-hidden className="hidden h-6 w-px shrink-0 bg-[var(--mk-border)] sm:block lg:hidden" />

            <Link
              href={`/plans/${planId}`}
              aria-label="Plan Homeに戻る"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--mk-sub)] transition-colors hover:bg-[var(--mk-block)] hover:text-[var(--mk-ink)]"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </Link>

            {/* 都市サムネイル（フラットな写真カード。傾き・テープ演出なし）。都市画像があれば再利用し、
                無ければ中立のグラデ（架空の都市画像は出さない）。 */}
            <div
              aria-hidden
              className={`relative h-10 w-10 shrink-0 overflow-hidden rounded-[10px] border border-[var(--mk-border)] bg-linear-to-br ${fallbackGradientForPlan(
                planId ?? "",
              )} sm:h-10 sm:w-10`}
            >
              {headerCover.imageSrc && (
                <Image
                  src={headerCover.imageSrc}
                  alt=""
                  fill
                  sizes="40px"
                  className="object-cover object-center"
                />
              )}
            </div>

            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              {/* 見出し横の細いライン（面ではなくアクセント） */}
              <span aria-hidden className="h-6 w-[3px] shrink-0 rounded-full bg-[var(--neon-lime)]" />
              <div className="min-w-0">
                <p className="mk-card-title truncate">留学プランの相談</p>
                {planTitle && <p className="mk-sub-text truncate">{planTitle}</p>}
              </div>
            </div>

            {/* 固定UIコピーのピル。狭い画面では省略。 */}
            <span className="mk-sub-text hidden shrink-0 items-center gap-1.5 rounded-full border border-[var(--mk-border)] bg-[var(--mk-block)] px-3 py-1 font-medium sm:inline-flex">
              <LeafIcon className="h-3.5 w-3.5 text-[#9aa98a]" />
              考えを整理する時間
            </span>
          </div>
        </header>
      )}

      <div
        className={
          isPlanChat
            ? "min-h-0 flex-1 overflow-y-auto"
            : "flex-1 space-y-3 overflow-y-auto p-4"
        }
      >
        {isPlanChat ? (
          showStartScreen ? (
            // 見出し・説明・Quick Start・入力欄を1つのまとまりとして中央に見せる
            // （会話開始前だけ、入力欄をスクロール領域の外＝画面下部固定ではなくここに置く）。
            <div className="flex h-full flex-col items-center justify-center gap-6 px-4 py-8 sm:px-6">
              <ChatStartScreen onQuickStart={handleQuickStart} />
              <form onSubmit={handleSubmit} className="w-full max-w-[860px]">
                {sageInputCapsule}
              </form>
            </div>
          ) : (
            <>
              {/* Desktop: 左に会話（720〜850px相当）＋右に「いま分かっていること」。Tablet/Mobile: 会話の下へ。
                  要点が 2 件未満なら aside ごと出さない（右カラム幅は変えず、会話は 860px 中央寄せのまま）。 */}
              <div className="mx-auto flex w-full max-w-[1240px] gap-6 px-4 pb-4 pt-3 sm:px-6 lg:gap-10 lg:pb-6">
                <div className="min-w-0 flex-1">
                  <div className="mx-auto max-w-[860px] space-y-5">{planMessageListContent}</div>
                </div>
                {hasPlanChatInsights(karte) && (
                  <aside className="hidden w-[264px] shrink-0 lg:block">
                    {/* 補助情報。長くなってもここだけスクロールし、会話や入力欄に重ならない。 */}
                    <div className="sticky top-3 max-h-[70vh] overflow-y-auto pr-0.5">
                      <PlanChatInsightNote karte={karte} />
                    </div>
                  </aside>
                )}
              </div>
              {hasPlanChatInsights(karte) && (
                <div className="mx-auto w-full max-w-[860px] px-4 pb-2 sm:px-6 lg:hidden">
                  <PlanChatInsightNote karte={karte} variant="inline" />
                </div>
              )}
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
      {showSummary &&
        (() => {
          const summaryCard = (
            <KarteSummary
              karte={karte}
              onConfirm={handleConfirmSummary}
              onRequestCorrection={handleRequestCorrection}
              onSkip={handleSkipSummary}
              variant={isPlanChat ? "plan" : "default"}
            />
          );
          return isPlanChat ? (
            <div className="shrink-0">{planBottomShell(summaryCard)}</div>
          ) : (
            summaryCard
          );
        })()}

      {/* /widget 側の提案ボタンは従来のまま（Plan Chat はチップ行の右端に置く） */}
      {showProposalAction && !isPlanChat && (
        <div className="mx-4 mb-2 flex justify-end">
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

      {/*
        開発用のカルテ表示。Plan Chat では**会話領域の高さを奪わない**ように、
        通常のフローから外して右上に浮かせる（開発環境限定なのは従来どおり）。
      */}
      {isDev &&
        (isPlanChat ? (
          <div className="pointer-events-none absolute right-2 top-[60px] z-40 flex justify-end">
            <div className="pointer-events-auto">
              <KarteDebugPanel karte={karte} variant="corner" />
            </div>
          </div>
        ) : (
          <KarteDebugPanel karte={karte} variant="inline" />
        ))}

      {error &&
        (() => {
          const errorRow = (
        <div
          className={
            isPlanChat
              ? "mb-2 flex items-center justify-between gap-3 text-[14px] text-[#9c3b2e]"
              : "mx-4 mb-2 flex items-center justify-between gap-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
          }
        >
          <span className={isPlanChat ? "rounded-[14px] border border-[#f0d7d1] bg-[#fdf4f2] px-4 py-2.5" : undefined}>
            {error}
          </span>
          <button
            type="button"
            onClick={handleRetry}
            className={
              isPlanChat
                ? "shrink-0 rounded-full border border-[var(--mk-border)] bg-[var(--mk-card)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--mk-ink)] transition-colors hover:border-[var(--neon-lime)]"
                : "shrink-0 rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
            }
          >
            再送信
          </button>
        </div>
          );
          return isPlanChat ? (
            <div className="shrink-0">{planBottomShell(errorRow)}</div>
          ) : (
            errorRow
          );
        })()}

      {isPlanChat ? (
        // 会話開始前は入力欄が上のスタート画面側（スクロール領域内）にあるため、
        // ここでの画面下部固定表示は会話開始後だけ行う（二重表示を避ける）。
        !showStartScreen && (
          <form
            onSubmit={handleSubmit}
            className="shrink-0 border-t border-[var(--mk-border)] bg-white/95 pt-2.5 backdrop-blur-sm"
            /* モバイルでホームバーに入力欄が隠れないよう、下端に safe-area を足す。 */
            style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
          >
            {planBottomShell(
              <>
              {/*
                クイックアクションの行。右端に「学校を提案してもらう」を同居させ、
                提案ボタンのために独立した行を作らない（狭い画面では自然に折り返す）。
                チップは押すと入力欄に文言を入れるだけ（既存 handleQuickStart と同じ。送信はしない）。
              */}
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {PLAN_CHAT_SUGGESTIONS.map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => handleQuickStart(label)}
                    disabled={isSending}
                    className="group inline-flex items-center gap-1.5 rounded-full border border-[var(--mk-border)] bg-[var(--mk-card)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--mk-ink)] transition-colors hover:border-[var(--neon-lime)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neon-lime)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <LeafIcon className="h-3.5 w-3.5 text-[#9aa98a] transition-colors group-hover:text-[#8fbf2e]" />
                    {label}
                  </button>
                ))}
                {showProposalAction && <div className="ml-auto">{proposalButton}</div>}
              </div>
              {sageInputCapsule}
              <p className="mk-sub-text mt-1.5 flex items-center justify-center gap-1.5">
                <LeafIcon className="h-3.5 w-3.5" />
                答えを急がなくて大丈夫です。
              </p>
              </>,
            )}
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
