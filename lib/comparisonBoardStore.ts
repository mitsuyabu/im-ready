/**
 * Comparison Board の「画面が購読する状態」。
 *
 * なぜ useState + useEffect ではないのか:
 *   保存先（localStorage）はブラウザにしか無いので、素直に書くと
 *   「effect の中で setState して復元する」形になる。これは React の cascading render を
 *   招く書き方で、この repo の lint（react-hooks/set-state-in-effect）でも error になる。
 *   そこで **外部ストア**として持ち、画面は useSyncExternalStore で購読する:
 *     - SSR / hydration 中は getServerSnapshot（常に空のボード）を使う → hydration mismatch が無い
 *     - hydration 後に getSnapshot が localStorage の内容を返す → 復元は effect 無しで済む
 *
 * 副産物として、ボードの状態が **コンポーネントの外**に生きるため、
 * Comparison Board を閉じて（＝中身が unmount されて）開き直しても入力内容が失われない。
 *
 * Plan ごとに独立したエントリを持つので、Plan をまたいで状態が混ざらない。
 */

import { emptyComparisonBoard, type ComparisonBoardState } from "@/lib/comparisonBoard";
import { loadComparisonBoard, saveComparisonBoard } from "@/lib/comparisonBoardStorage";

/**
 * SSR / hydration で返す値。**常に同じ参照**を返す必要がある
 * （毎回新しいオブジェクトを返すと useSyncExternalStore が無限に再レンダリングする）。
 */
const EMPTY: ComparisonBoardState = emptyComparisonBoard();

type Entry = {
  /** null = まだ localStorage から読んでいない。 */
  state: ComparisonBoardState | null;
  listeners: Set<() => void>;
};

const entries = new Map<string, Entry>();

function entryFor(planId: string): Entry {
  let entry = entries.get(planId);
  if (!entry) {
    entry = { state: null, listeners: new Set() };
    entries.set(planId, entry);
  }
  return entry;
}

export function subscribeComparisonBoard(planId: string, onChange: () => void): () => void {
  const entry = entryFor(planId);
  entry.listeners.add(onChange);
  return () => {
    entry.listeners.delete(onChange);
  };
}

/**
 * 画面が読む現在の値。初回だけ localStorage から読み、以後はキャッシュを返す
 * （同じ値には同じ参照を返す。useSyncExternalStore の要件）。
 */
export function getComparisonBoardSnapshot(planId: string): ComparisonBoardState {
  if (typeof window === "undefined") return EMPTY;
  const entry = entryFor(planId);
  if (entry.state === null) entry.state = loadComparisonBoard(planId);
  return entry.state;
}

/** SSR / hydration 用のスナップショット。 */
export function getComparisonBoardServerSnapshot(): ComparisonBoardState {
  return EMPTY;
}

/**
 * 値を更新し、この端末へ保存して、購読している画面へ通知する。
 * updater が同じ参照を返した（＝変更なし）ときは保存も通知もしない。
 */
export function updateComparisonBoard(
  planId: string,
  updater: (prev: ComparisonBoardState) => ComparisonBoardState,
): void {
  const entry = entryFor(planId);
  const prev = getComparisonBoardSnapshot(planId);
  const next = updater(prev);
  if (next === prev) return;
  entry.state = next;
  // 保存に失敗しても（プライベートブラウジング等）その場の編集は続けられる。
  saveComparisonBoard(planId, next);
  for (const listener of entry.listeners) listener();
}

/**
 * 候補案の件数だけを購読したい画面（ページ上部のサマリータイル）向け。
 *
 * ボード本体と同じストアを見るので、比較ボードで案を足すとタイルもその場で更新される。
 * サーバー側はこの端末の内容を知らないため **null**（「—」と出す）を返す:
 * 空のボードとして 0 を描いてしまうと、復元後に 0 → 3 と数字が入れ替わって見えるため。
 */
export function getComparisonBoardCountSnapshot(planId: string): number | null {
  if (typeof window === "undefined") return null;
  return getComparisonBoardSnapshot(planId).options.length;
}

export function getComparisonBoardCountServerSnapshot(): number | null {
  return null;
}

/**
 * テスト用。モジュールに溜まった状態を捨てる
 * （本番の画面からは呼ばない。Plan 削除時の後片付けは lib/planDelete.ts の責務）。
 */
export function resetComparisonBoardStoreForTest(): void {
  entries.clear();
}
