/**
 * 親向け説明資料の公開閲覧ページ（`/share/documents/[token]`、Step 11）が使う純粋関数。
 *
 * これらは元々 app/share/documents/[token]/page.tsx 内に定義・export していたが、
 * page module は BrandLogo（next/image・next/link）と lib/supabase/server（next/headers）を
 * import するため、テストから page module を読み込むと Next.js 固有依存が
 * pure test へ不要に波及する。テストで安全に import できるよう、環境非依存の
 * helper だけをこの lib へ切り出した（Node 標準機能と Intl のみに依存）。
 *
 * hash 化は lib/documentShareToken.ts の hashShareToken() を使う。ここには複製しない。
 */

export type PublicDocument = {
  title: string;
  body: string;
  documentUpdatedAt: string;
};

/**
 * RPC を呼ぶ前の軽い防御。Step 10 の token は base64url 約43文字だが、将来の token 形式変更の
 * 余地を残すため厳密な文字数固定はしない。空・極端に長い値だけを弾く。
 */
export const MAX_TOKEN_LENGTH = 512;

export function isValidTokenFormat(raw: string): boolean {
  return raw.length > 0 && raw.length <= MAX_TOKEN_LENGTH;
}

/**
 * get_public_document_by_token_hash RPC の戻り値（unknown）を検証する。
 * RPC 自体は狭い3fieldしか返さない設計（Step 9）だが、レスポンスをそのまま信用せず、
 * ここでも型・非空を確認してから表示する。不正な形は null として扱い、呼び出し側は
 * 汎用の「表示できません」に fallback する。
 */
export function parsePublicDocument(raw: unknown): PublicDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const { title, body, document_updated_at: documentUpdatedAt } = record;

  if (typeof title !== "string" || title.trim().length === 0) return null;
  if (typeof body !== "string" || body.trim().length === 0) return null;
  if (typeof documentUpdatedAt !== "string" || documentUpdatedAt.trim().length === 0) return null;
  if (Number.isNaN(new Date(documentUpdatedAt).getTime())) return null;

  return { title, body, documentUpdatedAt };
}

/**
 * 「2026年8月28日 更新」のような絶対日付表示。formatLastUpdated()（相対表現、今日/昨日等）は
 * 公開ページの文脈に合わないため使わず、Intl.DateTimeFormat で直接組み立てる。
 */
export function formatShareUpdatedAt(iso: string): string {
  const formatted = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(iso));
  return `${formatted} 更新`;
}
