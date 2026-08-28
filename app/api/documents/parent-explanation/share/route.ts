import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateShareToken, hashShareToken } from "@/lib/documentShareToken";
import type { PlanDocumentType } from "@/lib/planDocuments";

/**
 * 親向け説明資料の共有URL発行エンドポイント（Step 10）。
 *
 * 責務はここまで: 認証確認 → request body validation → Plan ownership確認 →
 * parent_explanation document取得 → content shape validation → 既存の有効share確認
 * （あれば409、上書きしない） → raw token生成 → SHA-256 hash化 →
 * document_sharesへsnapshot INSERT（authenticated owner用RLS経由、service role不使用）→
 * share URLをresponse。
 *
 * 公開閲覧側（/share/documents/[token]、Step 11で実装予定）はまだ作らない。
 * Step 9で作ったSECURITY DEFINER RPC（get_public_document_by_token_hash）は匿名閲覧専用で、
 * このAPI（authenticated ownerの操作）からは呼ばない。ここでのDB書き込みは、通常の
 * Server Supabase client + 既存RLS（document_shares_insert_own policy）で行う。
 *
 * Client由来のデータはplanIdのみ。title/body/type/token/tokenHash/expiresAt/
 * planDocumentIdはいずれもClientから送らせず、Server側でCanonicalな`plan_documents`
 * から取得・算出する（既存/api/documents/parent-explanationと同じ「Client→planIdのみ、
 * Server→本物のDBデータで判断」という設計を踏襲）。
 *
 * 同時リクエスト競合: 事前の「既存有効share確認」だけでは、複数タブ等でほぼ同時に
 * 2リクエストが走った場合、両方が「既存なし」を確認してしまい両方がINSERTを試みる
 * 可能性がある。Step 9のpartial unique index（1 documentにつきenabled=true最大1件）に
 * より、後発のINSERTはPostgresのunique_violation（23505）で失敗するため、これを検知して
 * 409 share_already_existsへ変換する（500にしない。既存/api/documents/parent-explanationの
 * unique violation処理と同じ考え方）。token_hashのunique制約も同じ23505を使うが、
 * 256bitのtoken空間では衝突は現実的に起こり得ないため、両者を区別する追加ロジック
 * （constraint名の判定・再試行loop等）は今回作らず、どちらも一律409として扱う
 * （詳細は完了報告のR参照）。
 */

const DOCUMENT_TYPE: PlanDocumentType = "parent_explanation";

/** Postgres unique_violation のSQLSTATEコード */
const POSTGRES_UNIQUE_VIOLATION = "23505";

/** MVPのdefault共有期限。ユーザーがrevokeするまで無期限にはせず、忘れられたリンクが
 *  半永久的に残り続けるリスクを抑える（詳細な検討はStep 8報告のQ参照）。 */
const SHARE_EXPIRY_DAYS = 90;

/** request bodyのplanId（unknown）を検証する。既存/api/documents/parent-explanationの
 *  parsePlanIdと同じ方針（UUID厳格チェックはせず、該当行が無ければ404にする）。
 *  「小さな重複を許容し、routeごとに独立させる」という既存/api/worksheet-*群の
 *  方針を踏襲し、あちらのrouteからimportはしない。exportしているのは
 *  scripts/test-parent-explanation-share-api.tsからテストするため
 *  （Step 5/7の同種routeと同じ手法）。 */
export function parsePlanId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

type ParentExplanationDocumentRow = {
  id: string;
  title: string;
  content: unknown;
  updated_at: string;
};

type ParsedContent = { format: "text"; body: string };

/** plan_documents.content（jsonb）の最低限のshape確認。既存
 *  parent-explanation詳細ページのparseParentExplanationContentと同じ考え方
 *  （新しいschema validation libraryは追加せず、想定shapeだけを狭く確認する）。 */
function parseContent(content: unknown): ParsedContent | null {
  if (!content || typeof content !== "object") return null;
  const record = content as Record<string, unknown>;
  if (record.format !== "text") return null;
  if (typeof record.body !== "string" || record.body.trim().length === 0) return null;
  return { format: "text", body: record.body };
}

type ShareCreateResponse = { shareUrl: string; expiresAt: string };

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

  // Plan ownership確認。既存/api/documents/parent-explanationと同じ方針
  // （存在しないPlanと他人のPlanを区別せず404にする）。
  const { data: plan } = await supabase
    .from("plans")
    .select("id")
    .eq("id", planId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!plan) {
    return Response.json({ error: "対象のPlanが見つかりません" }, { status: 404 });
  }

  const { data: doc, error: docError } = await supabase
    .from("plan_documents")
    .select("id, title, content, updated_at")
    .eq("plan_id", planId)
    .eq("type", DOCUMENT_TYPE)
    .maybeSingle();

  if (docError) {
    console.error("parent explanation share: document fetch error:", docError.message);
    return Response.json({ error: "share_create_failed" }, { status: 500 });
  }

  if (!doc) {
    return Response.json({ error: "document_not_found" }, { status: 404 });
  }

  const document = doc as ParentExplanationDocumentRow;
  const parsedContent = parseContent(document.content);
  if (!parsedContent) {
    console.error("parent explanation share: invalid content shape for document", document.id);
    return Response.json({ error: "document_content_invalid" }, { status: 500 });
  }

  // 既存の有効share確認。1 documentにつき有効shareは最大1件（Step 9のpartial unique
  // indexと同じ不変条件をアプリ側でも事前チェックする）。expires_atが過去でも
  // enabled=trueのままなら「既存あり」として扱い、勝手にrevoke・上書きしない
  // （revoke/再発行はまだ実装しない別Stepの責務）。
  const { data: existingShare, error: existingShareError } = await supabase
    .from("document_shares")
    .select("id")
    .eq("plan_document_id", document.id)
    .eq("enabled", true)
    .maybeSingle();

  if (existingShareError) {
    console.error("parent explanation share: existing share check error:", existingShareError.message);
    return Response.json({ error: "share_create_failed" }, { status: 500 });
  }

  if (existingShare) {
    return Response.json({ error: "share_already_exists" }, { status: 409 });
  }

  const rawToken = generateShareToken();
  const tokenHash = hashShareToken(rawToken);
  const expiresAt = new Date(Date.now() + SHARE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error: insertError } = await supabase.from("document_shares").insert({
    plan_document_id: document.id,
    token_hash: tokenHash,
    title: document.title,
    body: parsedContent.body,
    document_updated_at: document.updated_at,
    expires_at: expiresAt,
  });

  if (insertError) {
    // unique violationは、①1 documentにつきenabled=true最大1件のpartial unique index
    // （同時リクエスト競合）と、②token_hashのunique制約（256bit空間での衝突。現実的には
    // 起こり得ない）のどちらでも同じ23505になる。constraint名までは判定せず、どちらも
    // 一律409として扱う（token衝突時の再生成retry loopは今回作らない。詳細は完了報告R参照）。
    if (insertError.code === POSTGRES_UNIQUE_VIOLATION) {
      return Response.json({ error: "share_already_exists" }, { status: 409 });
    }
    console.error("parent explanation share: insert error:", insertError.message);
    return Response.json({ error: "share_create_failed" }, { status: 500 });
  }

  // Vercel/Next.jsが解決した実際のrequest originをそのまま使う（新しい環境変数は
  // 追加しない）。ここでのoriginは表示用のURL文字列を組み立てるためだけに使い、
  // 実際のアクセス制御はtoken自体とStep 9のRLS/RPCが担うため、originの信頼性が
  // セキュリティ境界になっているわけではない。
  const shareUrl = `${req.nextUrl.origin}/share/documents/${rawToken}`;

  const result: ShareCreateResponse = { shareUrl, expiresAt };
  return Response.json(result);
}
