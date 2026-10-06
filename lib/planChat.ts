/**
 * Plan配下のChat（/plans/[planId]/chat）の永続化ヘルパー。
 * サーバー(lib/supabase/server.ts)・クライアント(lib/supabase/client.ts)いずれの
 * SupabaseClientでも共通して使えるよう、クライアントの種類には依存しない形にする。
 * RLSは常に有効（plans.user_id経由の所有者判定）で、service role keyは使わない。
 */

import { sanitizeStoredChatSources, type ChatSource } from "@/lib/referenceSources";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createEmptyKarte,
  normalizeKarte,
  type FieldPatch,
  type Karte,
  type KarteProposals,
} from "@/lib/karte";
import type { DisplayMessage, ProposalMessageData } from "@/lib/chat";

type ChatSessionRow = { id: string };

/**
 * そのPlanのMain Chat(is_main=true)を取得する。無ければ作成する。
 * chat_sessions_one_main_per_plan（部分UNIQUE INDEX）が同時作成を防ぐため、
 * INSERTがユニーク制約違反(23505)で失敗した場合は、他のリクエストが先に
 * 作成済みとみなして再SELECTする。
 */
export async function getOrCreateMainChatSession(
  supabase: SupabaseClient,
  planId: string,
): Promise<ChatSessionRow> {
  const existing = await supabase
    .from("chat_sessions")
    .select("id")
    .eq("plan_id", planId)
    .eq("is_main", true)
    .maybeSingle();

  if (existing.data) return existing.data as ChatSessionRow;

  const inserted = await supabase
    .from("chat_sessions")
    .insert({ plan_id: planId, is_main: true })
    .select("id")
    .single();

  if (inserted.data) return inserted.data as ChatSessionRow;

  if (inserted.error?.code === "23505") {
    const retry = await supabase
      .from("chat_sessions")
      .select("id")
      .eq("plan_id", planId)
      .eq("is_main", true)
      .single();
    if (retry.data) return retry.data as ChatSessionRow;
  }

  throw new Error("Main Chatの取得に失敗しました");
}

type ChatMessageRow = {
  role: "user" | "assistant";
  content: string;
  proposal_data: ProposalMessageData | null;
  /** 回答下の出典パネル用。古い行には無いので null が来る。 */
  sources?: unknown;
};

/** そのセッションの会話履歴を、作成順（created_at, idの順）で復元する */
export async function loadChatMessages(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<DisplayMessage[]> {
  // sources 列はあとから足した列なので、まだ適用されていない環境でも履歴が壊れないよう、
  // 列が無い場合は sources なしで読み直す（本文の復元を出典のために失敗させない）。
  let rows: ChatMessageRow[] | null = null;
  const withSources = await supabase
    .from("chat_messages")
    .select("role, content, proposal_data, sources")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (withSources.error) {
    console.error("chat_messages select error (sources):", withSources.error.message);
    const fallback = await supabase
      .from("chat_messages")
      .select("role, content, proposal_data")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    rows = (fallback.data ?? []) as ChatMessageRow[];
  } else {
    rows = (withSources.data ?? []) as ChatMessageRow[];
  }

  return rows.map((row) => {
    // 保存済みの値をそのまま信用せず、表示前に再検証する。
    const sources = row.role === "assistant" ? sanitizeStoredChatSources(row.sources) : [];
    return {
      role: row.role,
      content: row.content,
      ...(row.proposal_data ? { proposalData: row.proposal_data } : {}),
      ...(sources.length > 0 ? { sources } : {}),
    };
  });
}

/**
 * そのPlanのMain Chatに保存された最新のchat_messages.created_atを返す。
 * Main Chatがまだ存在しない（一度もChatを開いていない）Planはnullを返す。
 * Plan Home表示のためだけにgetOrCreateMainChatSessionを呼んでセッションを新規作成する
 * 副作用は避け、既存セッションの有無を素直に確認するだけに留める。
 */
export async function loadLastChatMessageAt(
  supabase: SupabaseClient,
  planId: string,
): Promise<string | null> {
  const { data: session } = await supabase
    .from("chat_sessions")
    .select("id")
    .eq("plan_id", planId)
    .eq("is_main", true)
    .maybeSingle();

  if (!session) return null;

  const { data: message } = await supabase
    .from("chat_messages")
    .select("created_at")
    .eq("session_id", (session as { id: string }).id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (message as { created_at: string } | null)?.created_at ?? null;
}

/**
 * そのPlanのkarteを復元する。行が無ければ空カルテを返す（DBへは書き込まない）。
 * DB の raw jsonb は旧schema / block欠損 / 非object の可能性があるため、必ず
 * normalizeKarte を通して現行 Karte schema に整えてから返す（consumer の型前提を守る）。
 */
export async function loadPlanKarte(supabase: SupabaseClient, planId: string): Promise<Karte> {
  const { data } = await supabase
    .from("plan_karte")
    .select("karte")
    .eq("plan_id", planId)
    .maybeSingle();

  return normalizeKarte(data?.karte, planId);
}

/**
 * userまたはassistantのメッセージを1件保存する。
 * 永続化は補助的な機能なので、失敗しても会話体験は止めない（フェイルソフト）。
 */
export async function saveChatMessage(
  supabase: SupabaseClient,
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  proposalData: ProposalMessageData | null = null,
  /**
   * その回答で表示した出典（assistant のときだけ）。
   * 渡す前に buildChatSources で dedupe・件数制限済みの値を使う（生の候補は渡さない）。
   */
  sources: ChatSource[] | null = null,
): Promise<void> {
  const base = { session_id: sessionId, role, content, proposal_data: proposalData };
  // 出典は assistant の回答にだけ付ける（user の発言には出典が無い）。
  const storable = role === "assistant" ? sanitizeStoredChatSources(sources ?? []) : [];

  if (storable.length === 0) {
    const { error } = await supabase.from("chat_messages").insert(base);
    if (error) console.error("chat_messages insert error:", error.message);
    return;
  }

  const { error } = await supabase.from("chat_messages").insert({ ...base, sources: storable });
  if (!error) return;

  // 出典の保存に失敗しても会話自体は成立させる（列が未適用の環境を含む）。
  // 本文だけ保存し、reload 後は出典パネルが出ないという挙動に留める。
  console.error("chat_messages insert error (sources):", error.message);
  const retry = await supabase.from("chat_messages").insert(base);
  if (retry.error) console.error("chat_messages insert error:", retry.error.message);
}

export type OtherKartePatch = {
  confirmedItems?: string[];
  openQuestions?: string[];
  immediateProposalRequested?: boolean;
  proposals?: KarteProposals;
  summary?: string;
};

/**
 * Karteの一部（Field単位のpatch、および/または meta/proposals/handoffの一部）を
 * DB側の apply_karte_patch RPCへ渡し、atomicに適用する。
 *
 * このRPCが plan_karte 行のロック（初回はINSERT ... ON CONFLICT DO NOTHINGでの作成も含む）・
 * certainty/sourceの裁定（stated同士の異source不一致だけhandoff.conflictsへ記録）・
 * meta.updatedAtの更新までを1トランザクション内で行うため、クライアント側での
 * 事前読み込み・時刻比較は不要（かつ、行っても意味を持たない）。
 *
 * 戻り値はDBが確定させた最終的なKarte全体。呼び出し側は必ずこれで自分のstateを更新すること
 * （ローカルで計算した値をそのまま使わない）。失敗時はnullを返す（会話体験は止めない）。
 */
export async function applyKartePatch(
  supabase: SupabaseClient,
  planId: string,
  patch: { fieldPatches?: FieldPatch[] } & OtherKartePatch,
): Promise<Karte | null> {
  const { data, error } = await supabase.rpc("apply_karte_patch", {
    p_plan_id: planId,
    p_initial_karte: createEmptyKarte(planId),
    p_field_patches: patch.fieldPatches ?? [],
    p_confirmed_items: patch.confirmedItems ?? null,
    p_open_questions: patch.openQuestions ?? null,
    p_immediate_proposal_requested: patch.immediateProposalRequested ?? null,
    p_proposals: patch.proposals ?? null,
    p_summary: patch.summary ?? null,
  });

  if (error) {
    console.error("apply_karte_patch error:", error.message);
    return null;
  }

  return data as Karte;
}
