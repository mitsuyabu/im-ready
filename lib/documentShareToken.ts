import { randomBytes, createHash } from "crypto";

/**
 * 親向け説明資料のshare機能で使う、token生成・hash化の純粋関数。
 * Node標準の`crypto`のみを使用（新規packageは追加しない）。
 *
 * raw tokenはDBへ一切保存しない。保存するのは常にhashだけ（Step 8/9の設計）。
 * 生成側（app/api/documents/parent-explanation/share/route.ts、将来の再発行API）と
 * 閲覧側（将来の公開route。受け取ったraw tokenをここでhash化してから
 * get_public_document_by_token_hash RPCへ渡す）の両方が同じhash方式に依存するため、
 * どちらの側でも使えるようlibへ切り出している。
 */

/** 32byte（256bit）の暗号学的に安全な乱数を、URL-safeなbase64urlへ変換したraw share token */
export function generateShareToken(): string {
  return randomBytes(32).toString("base64url");
}

/** raw tokenのSHA-256 hash（16進64文字）。DBの`document_shares.token_hash`と同じ形式 */
export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
