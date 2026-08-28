import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODEL } from "@/lib/anthropic";
import { stripMarkdownBold } from "@/lib/markdown";
import { createClient } from "@/lib/supabase/server";
import { BLOCK_SPECS, type FieldSource } from "@/lib/karte";
import type { DecisionLeaning, DocumentCertainty, DocumentKarteItem, DocumentsKarteView } from "@/lib/documentsKarteView";
import {
  buildParentExplanationSystemPrompt,
  canGenerateParentExplanation,
  PARENT_EXPLANATION_USER_MESSAGE,
} from "@/lib/parentExplanationPrompt";

/**
 * 親向け説明資料の生成専用エンドポイント（Step 5）。
 *
 * 責務はここまで: ログイン確認 → request bodyのDocumentsKarteViewをruntime validation →
 * hasEnoughContext確認 → lib/parentExplanationPrompt.tsのprompt builderへそのまま渡す →
 * Anthropic呼び出し → 生成結果のsanitize → JSON応答。
 *
 * 意図的にDB（plans / plan_karte / plan_documents）へは一切触れない
 * （生成と保存を分離する。保存は次Stepで別途扱う）。そのためplanIdもrequestに含めない。
 * 呼び出し側（将来のUI）が、既にbuildDocumentsKarteView()で安全に変換した後のviewを
 * ここへ渡す前提。ここでのvalidationは「その変換結果の形が壊れていないか」だけを見る
 * （lib/documentsKarteView.tsのビジネスロジック—certaintyの振り分け・conflict除外・
 * hasEnoughContextの算出—をここで再実装しない）。
 *
 * 既存の/api/worksheet-letter・/api/worksheet-note（匿名Worksheet向け、認証不要）とは異なり、
 * Plan Documents機能かつAnthropic APIコストが発生するため、Supabase Authのログイン確認を必須にする。
 * ただしPlan ownership確認（plansテーブルを読む）は行わない — それはplanIdを扱う次Step
 * （UIからの呼び出し・DB保存）の責務。
 */

const VALID_BLOCKS = new Set(Object.keys(BLOCK_SPECS));
const VALID_SOURCES: readonly FieldSource[] = ["chat", "worksheet", "profile"];
const VALID_DECISION_LEANINGS: readonly DecisionLeaning[] = ["going", "not_going", "undecided"];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * expectedCertaintyは呼び出し側（stated配列 / inferred配列）が決める。item自身が持つ
 * certainty値がそれと一致しない場合はrejectする＝stated/inferredの取り違えをここで防ぐ
 * （7節: stated配列にinferredが紛れる・その逆を400にする）。
 */
function parseDocumentKarteItem(raw: unknown, expectedCertainty: DocumentCertainty): DocumentKarteItem | null {
  if (!raw || typeof raw !== "object") return null;
  const { block, key, label, value, certainty, source } = raw as Record<string, unknown>;

  if (typeof block !== "string" || !VALID_BLOCKS.has(block)) return null;
  if (!isNonEmptyString(key)) return null;
  if (!isNonEmptyString(label)) return null;
  if (!isNonEmptyString(value)) return null;
  if (certainty !== expectedCertainty) return null;
  if (source !== undefined && !VALID_SOURCES.includes(source as FieldSource)) return null;

  return {
    block: block as DocumentKarteItem["block"],
    key,
    label,
    value,
    certainty: expectedCertainty,
    source: source as FieldSource | undefined,
  };
}

function parseDocumentKarteItemArray(raw: unknown, expectedCertainty: DocumentCertainty): DocumentKarteItem[] | null {
  if (!Array.isArray(raw)) return null;
  const result: DocumentKarteItem[] = [];
  for (const entry of raw) {
    const item = parseDocumentKarteItem(entry, expectedCertainty);
    if (!item) return null;
    result.push(item);
  }
  return result;
}

function parseExcludedConflicts(raw: unknown): DocumentsKarteView["excludedConflicts"] | null {
  if (!Array.isArray(raw)) return null;
  const result: DocumentsKarteView["excludedConflicts"] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const { block, key } = entry as Record<string, unknown>;
    if (typeof block !== "string" || !VALID_BLOCKS.has(block)) return null;
    if (!isNonEmptyString(key)) return null;
    result.push({ block: block as DocumentKarteItem["block"], key });
  }
  return result;
}

function parseDecisionLeaning(raw: unknown): { ok: true; value: DecisionLeaning | undefined } | { ok: false } {
  if (raw === undefined) return { ok: true, value: undefined };
  if (typeof raw === "string" && VALID_DECISION_LEANINGS.includes(raw as DecisionLeaning)) {
    return { ok: true, value: raw as DecisionLeaning };
  }
  return { ok: false };
}

/** request bodyのview（unknown）を検証し、安全なDocumentsKarteViewへ変換する。不正な形は一律null */
export function parseDocumentsKarteView(raw: unknown): DocumentsKarteView | null {
  if (!raw || typeof raw !== "object") return null;
  const { stated, inferred, excludedConflicts, decisionLeaning, hasEnoughContext } = raw as Record<string, unknown>;

  const statedItems = parseDocumentKarteItemArray(stated, "stated");
  if (!statedItems) return null;

  const inferredItems = parseDocumentKarteItemArray(inferred, "inferred");
  if (!inferredItems) return null;

  const excludedConflictItems = parseExcludedConflicts(excludedConflicts);
  if (!excludedConflictItems) return null;

  const leaningResult = parseDecisionLeaning(decisionLeaning);
  if (!leaningResult.ok) return null;

  if (typeof hasEnoughContext !== "boolean") return null;

  return {
    stated: statedItems,
    inferred: inferredItems,
    excludedConflicts: excludedConflictItems,
    decisionLeaning: leaningResult.value,
    hasEnoughContext,
  };
}

type ParentExplanationGenerateResponse = { body: string };

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "認証が必要です" }, { status: 401 });
  }

  let requestBody: unknown;
  try {
    requestBody = await req.json();
  } catch {
    return Response.json({ error: "リクエストの形式が不正です" }, { status: 400 });
  }

  const { view: rawView } = (requestBody ?? {}) as { view?: unknown };
  const view = parseDocumentsKarteView(rawView);
  if (!view) {
    return Response.json({ error: "view が不正です" }, { status: 400 });
  }

  if (!canGenerateParentExplanation(view)) {
    return Response.json({ error: "not_enough_context" }, { status: 422 });
  }

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: buildParentExplanationSystemPrompt(view),
      messages: [
        {
          role: "user",
          content: PARENT_EXPLANATION_USER_MESSAGE,
        },
      ],
    });

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );
    const generatedBody = textBlock ? stripMarkdownBold(textBlock.text.trim()) : "";

    if (!generatedBody) {
      return Response.json({ error: "資料を生成できませんでした" }, { status: 502 });
    }

    const result: ParentExplanationGenerateResponse = { body: generatedBody };
    return Response.json(result);
  } catch (err) {
    const isApiError = err instanceof Anthropic.APIError;
    console.error("parent explanation generation error:", isApiError ? err.message : err);
    return Response.json(
      {
        error: isApiError
          ? "AIサービスへの接続でエラーが発生しました。しばらくしてから再度お試しください。"
          : "予期しないエラーが発生しました。",
      },
      { status: isApiError && err.status ? err.status : 500 },
    );
  }
}
