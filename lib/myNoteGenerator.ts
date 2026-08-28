/**
 * My Note 詳細画面（Step 18）の pure helper。
 * - Server Component（app/plans/[planId]/documents/my-note/page.tsx）: DB の
 *   plan_documents.content（jsonb）の shape 検証に parseMyNoteContent を使う。
 * - Client Component（components/MyNoteGenerator.tsx）: 生成 API のレスポンス検証に
 *   parseMyNoteDocumentResponse、HTTP status → 日本語メッセージ変換に myNoteErrorMessageFor を使う。
 *
 * React / fetch / Supabase / Anthropic には依存しない pure module。
 * parent_explanation 側の parseParentExplanationContent / errorMessageFor と同じ考え方だが、
 * あちらのファイルは import せず（過度な共通化はしない）、My Note 用に独立させている。
 */

/** plan_documents.content（jsonb）の想定 shape。 */
export type MyNoteContent = { format: "text"; body: string };

/**
 * plan_documents.content の最低限の shape 確認。
 * { format: "text", body: 非空 string } だけを狭く確認し、一致しなければ null
 * （呼び出し側は「表示できませんでした」に fallback。クラッシュさせない）。
 */
export function parseMyNoteContent(content: unknown): MyNoteContent | null {
  if (!content || typeof content !== "object") return null;
  const record = content as Record<string, unknown>;
  if (record.format !== "text") return null;
  if (typeof record.body !== "string" || record.body.trim().length === 0) return null;
  return { format: "text", body: record.body };
}

/** POST /api/documents/my-note の成功レスポンス（{ document: {...} }）の中身。 */
export type MyNoteDocumentResult = {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
};

/**
 * 生成 API の成功レスポンス（unknown）を検証する。
 * document object があり、id / title / body が非空 string、updatedAt が日付として妥当な
 * 非空 string であることを確認する。1つでも欠ければ null（呼び出し側は error 扱い）。
 */
export function parseMyNoteDocumentResponse(raw: unknown): MyNoteDocumentResult | null {
  if (!raw || typeof raw !== "object") return null;
  const doc = (raw as Record<string, unknown>).document;
  if (!doc || typeof doc !== "object") return null;
  const record = doc as Record<string, unknown>;
  const { id, title, body, updatedAt } = record;

  if (typeof id !== "string" || id.trim().length === 0) return null;
  if (typeof title !== "string" || title.trim().length === 0) return null;
  if (typeof body !== "string" || body.trim().length === 0) return null;
  if (typeof updatedAt !== "string" || updatedAt.trim().length === 0) return null;
  if (Number.isNaN(new Date(updatedAt).getTime())) return null;

  return { id, title, body, updatedAt };
}

/**
 * サーバーから返る HTTP status を、内部用語（Anthropic / API / 422 / upsert 等）を
 * 一切出さない簡潔な日本語メッセージへ変換する（parent_explanation の errorMessageFor と同方針）。
 * my_note は既存があれば UPDATE するため 409 は返らない。
 */
export function myNoteErrorMessageFor(status: number): string {
  if (status === 400) return "リクエストを確認できませんでした。ページを再読み込みしてからお試しください。";
  if (status === 401) return "ログイン状態を確認してください。再度ログインしてからお試しください。";
  if (status === 404) return "対象のPlanを確認できませんでした。ページを再読み込みしてからお試しください。";
  if (status === 422) return "My Noteを作るには、ChatやWorksheetでもう少し考えを整理してください。";
  return "My Noteを作成できませんでした。時間をおいてもう一度お試しください。";
}
