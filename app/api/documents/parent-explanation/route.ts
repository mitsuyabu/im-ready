import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODEL } from "@/lib/anthropic";
import { stripMarkdownBold } from "@/lib/markdown";
import { createClient } from "@/lib/supabase/server";
import { loadPlanKarte } from "@/lib/planChat";
import { buildDocumentsKarteView } from "@/lib/documentsKarteView";
import {
  buildParentExplanationSystemPrompt,
  canGenerateParentExplanation,
  PARENT_EXPLANATION_DEFAULT_TITLE,
  PARENT_EXPLANATION_USER_MESSAGE,
} from "@/lib/parentExplanationPrompt";

/**
 * 親向け説明資料の生成 + 保存エンドポイント（Step 7）。
 *
 * Step 5からの最大の変更点: requestが `{ view: DocumentsKarteView }` ではなく
 * `{ planId: string }` になった。Clientから改変可能なDocumentsKarteViewを保存の
 * 根拠として信用しないため、Karte取得・DocumentsKarteView構築・生成可否判定・
 * Anthropic生成・DB保存のすべてをこのServer側で行う
 * （Client → planIdだけ送る → Serverが本物のPlan Karteから生成用viewを作る →
 * Serverが生成 → Serverが保存、という一方向の構造）。
 *
 * 処理順: 認証確認 → request body validation → Plan ownership確認 →
 * 既存parent_explanation document確認（あれば409） → Karte取得 → DocumentsKarteView構築 →
 * hasEnoughContext確認（falseなら422、Anthropicを呼ばない） → Anthropic生成 → sanitize →
 * plan_documentsへINSERT → 成功response。
 *
 * 同時リクエスト競合について: 事前の既存document確認だけでは、複数タブ等でほぼ同時に
 * 2リクエストが走った場合に両方が「既存なし」を確認してしまい、両方が生成・INSERTを
 * 試みる可能性がある。plan_documentsの既存unique(plan_id, type)制約により後発の
 * INSERTはPostgresのunique_violation（SQLSTATE 23505）で失敗するため、これを検知して
 * 409 document_already_existsへ変換する（500にしない）。新しいconstraint・migrationは
 * 追加せず、既存のunique(plan_id, type)をそのまま利用する。DB内部のエラーメッセージは
 * ログにのみ出し、clientへは返さない。
 */

const DOCUMENT_TYPE = "parent_explanation";

/** Postgres unique_violation のSQLSTATEコード。plan_documentsのunique(plan_id, type)制約違反時にPostgRESTがこの値をerror.codeへ設定する */
const POSTGRES_UNIQUE_VIOLATION = "23505";

/** request bodyのplanId（unknown）を検証する。UUID形式の厳格な検証はせず、既存の
 *  Server Component側のownership確認パターン（Postgres側にidの妥当性判定を委ね、
 *  該当行が見つからなければ404にする）と同じ方針に合わせている。 */
export function parsePlanId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

type ParentExplanationDocumentResponse = {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
};

type ParentExplanationGenerateResponse = { document: ParentExplanationDocumentResponse };

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

  const { planId: rawPlanId } = (requestBody ?? {}) as { planId?: unknown };
  const planId = parsePlanId(rawPlanId);
  if (!planId) {
    return Response.json({ error: "planId が不正です" }, { status: 400 });
  }

  // Plan ownership確認。既存Server Componentと同じ方針（存在しないPlanと他人のPlanを
  // 区別しない）。他人のPlanの存在自体を示さないため403ではなく404にする。
  const { data: plan } = await supabase
    .from("plans")
    .select("id")
    .eq("id", planId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!plan) {
    return Response.json({ error: "対象のPlanが見つかりません" }, { status: 404 });
  }

  // 既存document確認（事前チェック）。Anthropicを呼ぶ前に行い、無駄なAPI呼び出しを避ける。
  // ここでのDBエラー（例: migration未適用でテーブルが存在しない）はunique_violationとは
  // 別物なので、一律500 document_save_failedとして扱い、生成には進まない。
  const { data: existingDoc, error: existingDocError } = await supabase
    .from("plan_documents")
    .select("id")
    .eq("plan_id", planId)
    .eq("type", DOCUMENT_TYPE)
    .maybeSingle();

  if (existingDocError) {
    console.error("parent explanation existing check error:", existingDocError.message);
    return Response.json({ error: "document_save_failed" }, { status: 500 });
  }

  if (existingDoc) {
    return Response.json({ error: "document_already_exists" }, { status: 409 });
  }

  // Client由来のデータは一切使わず、Server側でPlan Karteから改めてDocumentsKarteViewを作る。
  const karte = await loadPlanKarte(supabase, planId);
  const view = buildDocumentsKarteView(karte);

  if (!canGenerateParentExplanation(view)) {
    return Response.json({ error: "not_enough_context" }, { status: 422 });
  }

  let generatedBody: string;
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
    generatedBody = textBlock ? stripMarkdownBold(textBlock.text.trim()) : "";

    if (!generatedBody) {
      return Response.json({ error: "資料を生成できませんでした" }, { status: 502 });
    }
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

  const { data: inserted, error: insertError } = await supabase
    .from("plan_documents")
    .insert({
      plan_id: planId,
      type: DOCUMENT_TYPE,
      title: PARENT_EXPLANATION_DEFAULT_TITLE,
      content: { format: "text", body: generatedBody },
      updated_at: new Date().toISOString(),
    })
    .select("id, title, updated_at")
    .single();

  if (insertError) {
    // 同時リクエスト競合: 事前確認の直後に別リクエストが先にINSERTした場合、こちらの
    // INSERTはunique(plan_id, type)違反で失敗する。生成された文章は破棄し（AI生成成功が
    // 保存成功を意味しない）、409として扱う。
    if (insertError.code === POSTGRES_UNIQUE_VIOLATION) {
      return Response.json({ error: "document_already_exists" }, { status: 409 });
    }
    console.error("parent explanation insert error:", insertError.message);
    return Response.json({ error: "document_save_failed" }, { status: 500 });
  }

  const result: ParentExplanationGenerateResponse = {
    document: {
      id: inserted.id,
      title: inserted.title,
      body: generatedBody,
      updatedAt: inserted.updated_at,
    },
  };
  return Response.json(result);
}
