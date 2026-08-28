/**
 * 親向け説明資料の「共有する」導線（Step 12）が使う純粋関数。
 *
 * components/ParentExplanationShare.tsx（Client Component）から使うが、この lib 自体は
 * React にも fetch にも依存しない。Step 10 API（POST /api/documents/parent-explanation/share）
 * のレスポンス解釈と、期限日の日本語フォーマットだけを担当する。テストから
 * Client Component を読み込まずに済むよう関数を切り出している。
 *
 * hash 化・token 生成は Server 専用（lib/documentShareToken.ts）でここには一切持ち込まない。
 * share URL / token をこの module がログ・storage に出すこともない（文字列を組み立てて
 * 返すだけ）。
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
 * 「このリンクは2026年11月26日まで有効です」の形。
 *
 * lib/publicDocumentShare.ts の formatShareUpdatedAt() とは意味が違う
 * （あちらは document の「更新日」、こちらは共有リンクの「失効日」で、前後の文言も
 * 別）ため同じ関数へは寄せない。日付部分の組み立て方（Asia/Tokyo の絶対日付）だけは
 * 既存プロジェクト方針に合わせて揃えている。
 */
export function formatShareExpiry(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    // parseShareCreateResponse を通っていれば到達しないが、防御的に無害な表示にする。
    return "このリンクには有効期限があります。";
  }
  const formatted = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
  return `このリンクは${formatted}まで有効です`;
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
