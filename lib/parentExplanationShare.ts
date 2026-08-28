/**
 * 親向け説明資料の「共有する」導線（Step 12）＋ 停止・再発行（Step 13）＋ LINE 共有（Step 14）
 * が使う純粋関数。
 *
 * components/ParentExplanationShare.tsx（Client Component）と、詳細ページの Server Component
 * （初期 share 状態の分類）から使うが、この lib 自体は React にも fetch にも Supabase にも
 * 依存しない。担当するのは:
 *  - Step 10 作成 API（POST /api/documents/parent-explanation/share）のレスポンス解釈
 *  - revoke API（POST /api/documents/parent-explanation/share/revoke）のレスポンス解釈
 *  - fetch 済みの document_shares 行（enabled/revoked_at/expires_at のみ）を
 *    "none" | "active" | "expired" へ分類する
 *  - 期限日の日本語フォーマット
 *  - 公開 share URL から LINE 共有 URL（LINE 公式 URL スキーム）を組み立てる（Step 14）
 *
 * hash 化・token 生成は Server 専用（lib/documentShareToken.ts）でここには一切持ち込まない。
 * share URL / token をこの module がログ・storage に出すこともない（文字列を組み立てて
 * 返すだけ）。既存 raw URL の復元はしない（DB は token_hash しか持たない）。
 */

/** Step 10 API の成功レスポンス（{ shareUrl, expiresAt }）。 */
export type ShareCreateSuccess = {
  shareUrl: string;
  expiresAt: string;
};

/**
 * Step 10 API 成功レスポンスの最低限の runtime validation。
 * schema validation library は使わず、必要な2フィールドの型・非空・日付妥当性だけを見る。
 * 1つでも欠ければ null（呼び出し側は汎用エラー表示へ倒す）。
 */
export function parseShareCreateResponse(raw: unknown): ShareCreateSuccess | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const { shareUrl, expiresAt } = record;

  if (typeof shareUrl !== "string" || shareUrl.trim().length === 0) return null;
  if (typeof expiresAt !== "string" || expiresAt.trim().length === 0) return null;
  if (Number.isNaN(new Date(expiresAt).getTime())) return null;

  return { shareUrl, expiresAt };
}

/**
 * 「2026年11月26日」の形（Asia/Tokyo の絶対日付）。
 * active/expired 状態の「有効期限: …」表示に使う。
 * lib/publicDocumentShare.ts の formatShareUpdatedAt()（document の「更新日」）とは
 * 意味が違うため同じ関数へは寄せず、日付の組み立て方だけ既存方針に揃えている。
 */
export function formatShareExpiryDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "不明";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

/**
 * 「このリンクは2026年11月26日まで有効です」の形。発行直後（issued）の表示に使う。
 */
export function formatShareExpiry(iso: string): string {
  if (Number.isNaN(new Date(iso).getTime())) {
    // parseShareCreateResponse を通っていれば到達しないが、防御的に無害な表示にする。
    return "このリンクには有効期限があります。";
  }
  return `このリンクは${formatShareExpiryDate(iso)}まで有効です`;
}

/**
 * Step 10 API の呼び出し結果を、UI が扱う3状態へ変換する。
 * - success: URL 表示へ
 * - already_exists: 409。既存 URL は DB に raw token が無いため復元できない。
 *   「発行済み」の案内だけ出し、再試行 button にはしない（§13・§14 の設計制約）。
 * - error: 上記以外。message はそのまま画面に出せる汎用日本語（内部用語を含めない）。
 *   一時的エラーとして再度「共有リンクを作成」を押せる状態へ戻す。
 */
export type ShareRequestOutcome =
  | { kind: "success"; data: ShareCreateSuccess }
  | { kind: "already_exists" }
  | { kind: "error"; message: string };

export function interpretShareResponse(
  status: number,
  ok: boolean,
  rawBody: unknown,
): ShareRequestOutcome {
  if (ok) {
    const parsed = parseShareCreateResponse(rawBody);
    if (parsed) return { kind: "success", data: parsed };
    return { kind: "error", message: "共有リンクを作成できませんでした。時間をおいてもう一度お試しください。" };
  }

  if (status === 409) return { kind: "already_exists" };

  if (status === 401) {
    return { kind: "error", message: "ログイン状態を確認してください。ページを再読み込みしてからお試しください。" };
  }

  if (status === 404) {
    return { kind: "error", message: "共有する資料を確認できませんでした。ページを再読み込みしてからお試しください。" };
  }

  // 400・500・その他。内部 DB エラーや token 関連語は出さない。
  return { kind: "error", message: "共有リンクを作成できませんでした。時間をおいてもう一度お試しください。" };
}

// ============================================================
// Step 13: 既存 share の状態分類 + revoke レスポンス解釈
// ============================================================

/**
 * 詳細ページ（Server Component）が Client へ渡す share 状態。
 * - none:    有効な共有リンクが無い（未発行・revoke 済み含む）
 * - active:  enabled かつ revoke されておらず、期限内
 * - expired: enabled のまま期限切れ（DB の partial unique index を専有し続けるため、
 *            新規発行は 409 になる。UI 上「停止 → 再発行」の明示操作が必要）
 */
export type ShareStatus = "none" | "active" | "expired";

/** Server Component が document_shares から取る最小限の列（enabled=true 行を高々1件）。 */
export type ShareStatusRow = {
  enabled: boolean;
  revoked_at: string | null;
  expires_at: string | null;
};

/**
 * fetch 済みの document_shares 行（enabled=true で絞った高々1件、または null）を
 * ShareStatus へ分類する。now は差し替え可能（テスト用）。
 *
 * 判定基準（§25）: active = enabled=true AND revoked_at is null AND
 * (expires_at is null OR expires_at > now)。expiry だけ満たさない行は expired。
 * enabled=false / 行なし は none。revoked_at が入った行は（通常 enabled=false だが
 * 万一 enabled=true でも）active でも expired でもなく none 扱いにする。
 */
export function classifyShareStatus(
  row: ShareStatusRow | null | undefined,
  now: Date = new Date(),
): { status: ShareStatus; expiresAt?: string } {
  if (!row || row.enabled !== true) return { status: "none" };
  if (row.revoked_at != null) return { status: "none" };

  const expiresAt = row.expires_at ?? undefined;
  if (row.expires_at != null) {
    const t = new Date(row.expires_at).getTime();
    if (Number.isNaN(t) || t <= now.getTime()) {
      return { status: "expired", expiresAt };
    }
  }
  return { status: "active", expiresAt };
}

/**
 * revoke API（POST .../share/revoke）の呼び出し結果を UI の3系統へ変換する。
 * - revoked:        停止成功 → none 表示へ、「共有を停止しました。」
 * - no_active_share: 409。既に有効な share が無い（別タブで停止済み等）→ none 表示へ、
 *                    「現在有効な共有リンクはありません。」
 * - error:          401/404/500/その他。message はそのまま画面に出せる汎用日本語。
 */
export type RevokeOutcome =
  | { kind: "revoked" }
  | { kind: "no_active_share" }
  | { kind: "error"; message: string };

export function interpretRevokeResponse(
  status: number,
  ok: boolean,
): RevokeOutcome {
  if (ok) return { kind: "revoked" };

  if (status === 409) return { kind: "no_active_share" };

  if (status === 401) {
    return { kind: "error", message: "ログイン状態を確認してください。ページを再読み込みしてからお試しください。" };
  }

  if (status === 404) {
    return { kind: "error", message: "対象の資料を確認できませんでした。ページを再読み込みしてからお試しください。" };
  }

  // 500・その他。内部 code（revoke_failed 等）はそのまま見せない。
  return { kind: "error", message: "共有を停止できませんでした。時間をおいてもう一度お試しください。" };
}

// ============================================================
// Step 14: LINE 共有 URL の組み立て
// ============================================================

/**
 * LINE 共有時に本文へ添える固定の短い案内文（§20）。
 * ユーザー本人になりきった長文は生成しない。この1文 + 公開 share URL だけを渡す。
 */
export const LINE_SHARE_MESSAGE = "留学について今考えていることをまとめました。";

/**
 * 公開 share URL から、LINE の「送信先を選ぶ」画面を開く URL を作る（Step 14）。
 *
 * 方式: LINE 公式の URL スキーム `https://line.me/R/share?text=...`
 * （developers.line.biz の "Use LINE features with the LINE URL scheme" で現行の
 * 推奨形。旧 `line://` / `line.me/R/msg/text/` は使わない）。text に案内文 + URL を
 * 改行で連結し、全体を encodeURIComponent で percent-encode（UTF-8）する。
 * LINE Messaging API / LINE Login / LIFF / 外部 SDK は使わない。
 *
 * text へ入れるのは「固定案内文 + 公開 share URL」だけ。document 本文・budget・
 * worries・Plan 名・Karte・title 全文・planId・tokenHash・internal ID は一切入れない。
 *
 * shareUrl が空 / URL として不正 / http(s) 以外なら null（呼び出し側は LINE ボタンを
 * 出さない）。
 */
export function buildLineShareUrl(shareUrl: string): string | null {
  if (typeof shareUrl !== "string" || shareUrl.trim().length === 0) return null;

  let parsed: URL;
  try {
    parsed = new URL(shareUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  const text = `${LINE_SHARE_MESSAGE}\n${shareUrl}`;
  return `https://line.me/R/share?text=${encodeURIComponent(text)}`;
}
