/**
 * Comparison Board の保存（この端末のブラウザだけに閉じた保存）。
 *
 * **これは本番の正式な保存機能ではない。** 初期実装として、ローカルで UI・UX を確認できる
 * ところまでを localStorage で持つ。サーバー保存・端末間同期は行わない（lib/comparisonBoard.ts
 * のモデルと分離してあるので、将来 DB へ移すときはこのファイルの差し替えで済む）。
 *
 * 設計は lib/worksheetStorage.ts と同じ方針に揃える:
 *   - キーは **Plan ごとに名前空間を分ける**（`...:plan:<planId>`）。Plan をまたいでデータが混ざらない。
 *     planId は Plan ごとに一意な UUID で、ページ側で user_id との所有者確認を通ったものだけが
 *     渡ってくるため、別ユーザーのボードを同じキーで読むことは起こらない。
 *   - planId が無いときはキーを作らない（匿名 Worksheet のような「Plan なしの利用」は無い機能のため）。
 *   - 保存・読み込みは**例外を投げない**。プライベートブラウジング・容量超過・壊れた JSON でも
 *     画面を落とさず、空のボードとして続行する。
 *   - 読み込んだ値は必ず sanitizeComparisonBoard を通す（型も件数も信用しない）。
 *   - Plan 削除時の後片付けは lib/planDelete.ts が planComparisonBoardStorageKeys を呼ぶ
 *     （キーを持っているモジュール自身に列挙させる既存方針。前方一致で広く消さない）。
 */

import {
  emptyComparisonBoard,
  sanitizeComparisonBoard,
  type ComparisonBoardState,
} from "@/lib/comparisonBoard";

const STORAGE_KEY = "ryugaku-comparison-board";
const STORAGE_VERSION = 1;

/**
 * この Plan のボードの localStorage キー。
 * 既存キー（`ryugaku-worksheet-answers` / 相談シート）とは別の接頭辞なので上書きしない。
 */
export function comparisonBoardStorageKey(planId: string): string {
  return `${STORAGE_KEY}:plan:${planId}`;
}

/**
 * Plan 削除時に消してよいキーの列挙（lib/planDelete.ts から呼ばれる）。
 * planId が空なら何も返さない（前方一致で他の Plan や匿名データを巻き込まないため）。
 */
export function planComparisonBoardStorageKeys(planId: string): string[] {
  const trimmed = planId.trim();
  return trimmed ? [comparisonBoardStorageKey(trimmed)] : [];
}

type StoredPayload = ComparisonBoardState & { version: number };

/**
 * 保存する。失敗しても（プライベートブラウジング・容量超過）例外を投げず静かに諦める。
 * @returns 実際に保存できたか（UI 側で「この端末に保存されない」旨を出す判断に使える）
 */
export function saveComparisonBoard(planId: string, state: ComparisonBoardState): boolean {
  const trimmed = planId.trim();
  if (!trimmed) return false;
  try {
    const payload: StoredPayload = { version: STORAGE_VERSION, options: state.options };
    window.localStorage.setItem(comparisonBoardStorageKey(trimmed), JSON.stringify(payload));
    return true;
  } catch {
    // 保存できなくても、その場の編集は続けられる（メモリ上の state は保持される）。
    return false;
  }
}

/**
 * 読み込む。キーが無い・JSON が壊れている・version が違う・型が違う場合はすべて
 * **空のボード**を返す（例外は投げない / 部分的に壊れた案は sanitize が落とす）。
 */
export function loadComparisonBoard(planId: string): ComparisonBoardState {
  const trimmed = planId.trim();
  if (!trimmed) return emptyComparisonBoard();
  try {
    const raw = window.localStorage.getItem(comparisonBoardStorageKey(trimmed));
    if (!raw) return emptyComparisonBoard();

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return emptyComparisonBoard();
    if ((parsed as { version?: unknown }).version !== STORAGE_VERSION) {
      // 将来 version を上げたときは、ここで移行するか空で始める。推測で読み替えない。
      return emptyComparisonBoard();
    }
    return sanitizeComparisonBoard(parsed);
  } catch {
    return emptyComparisonBoard();
  }
}

/** この端末の、この Plan のボードだけを消す。 */
export function clearComparisonBoard(planId: string): void {
  const trimmed = planId.trim();
  if (!trimmed) return;
  try {
    window.localStorage.removeItem(comparisonBoardStorageKey(trimmed));
  } catch {
    // 消せなくても機能は続行できる。
  }
}
