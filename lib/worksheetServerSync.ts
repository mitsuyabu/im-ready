/**
 * Plan Worksheet の回答をサーバー（plan_worksheet）へ自動保存する同期器。
 *
 * React から切り離した純粋なロジックにしてあり、components/Worksheet.tsx の useWorksheetAnswers が
 * 1 Plan につき 1 つ生成して使う（テストでは SupabaseClient とタイマーを差し替えて検証する）。
 *
 * 振る舞い:
 * - notifyChange(state) … 回答が変わるたびに呼ぶ。短い debounce のあと保存する
 * - サーバーと同じ内容なら保存しない。行が無ければ INSERT、あれば revision 条件つき UPDATE
 * - 別端末が先に保存していた（conflict）ら、最新を読み直して設問単位でマージし、onMerged で画面へ反映してから保存し直す
 * - 保存失敗時は回答を捨てず dirty のまま残し、間隔を空けて再試行する（onStatus("error")）
 * - 保存中にさらに変更があれば、完了後にもう一度保存する
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PendingWorksheetChange, WorksheetPersistedData } from "@/lib/worksheetStorage";
import {
  createEmptyWorksheetState,
  hasAnyWorksheetAnswer,
  insertPlanWorksheet,
  isSameWorksheetState,
  loadPlanWorksheet,
  mergeWorksheetStates,
  updatePlanWorksheet,
  type PlanWorksheetRow,
} from "@/lib/planWorksheet";

export type WorksheetSaveStatus = "idle" | "saving" | "saved" | "error";

export type WorksheetServerSyncOptions = {
  planId: string;
  getClient: () => SupabaseClient;
  /** server component が読んだ行。null はサーバーにまだ行が無い（移行前・未回答）。 */
  initialRow: PlanWorksheetRow | null;
  /** conflict でマージした結果を画面の state に反映する。 */
  onMerged: (state: WorksheetPersistedData) => void;
  onStatus: (status: WorksheetSaveStatus) => void;
  /**
   * 未保存の変更の控え（localStorage）を更新する。保存が済んだら null で消す。
   * 保存できないまま画面を離れても、次回ロード時に restorePending で取り戻せるようにするため。
   */
  persistPending?: (pending: PendingWorksheetChange | null) => void;
  debounceMs?: number;
  retryDelaysMs?: number[];
  maxConflictAttempts?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export type WorksheetServerSync = {
  notifyChange: (state: WorksheetPersistedData) => void;
  /** debounce を待たずに保存する（保存中なら完了後にもう一度）。 */
  flush: () => Promise<void>;
  /** 未保存の変更があるときだけ flush（画面遷移・タブが裏に回るとき用）。 */
  flushIfPending: () => void;
  hasPending: () => boolean;
  /**
   * 前回保存できなかった変更の控えを、今のサーバー状態に重ねる。
   * サーバーがその後変わっていなければ控えをそのまま、変わっていれば設問単位でマージする
   * （同じ設問を別端末でも変えていた場合はサーバー＝後から保存された方を優先）。
   * 反映すべき差分が無ければ控えを消して null。あれば保存を予約し、画面に出すべき状態を返す。
   */
  restorePending: (pending: PendingWorksheetChange) => WorksheetPersistedData | null;
  /** タイマーを止める（保存はしない）。 */
  dispose: () => void;
  /** テスト・デバッグ用の内部状態。 */
  snapshot: () => { base: WorksheetPersistedData; revision: number | null; dirty: boolean; inflight: boolean };
};

export function createWorksheetServerSync(opts: WorksheetServerSyncOptions): WorksheetServerSync {
  const debounceMs = opts.debounceMs ?? 700;
  const retryDelays = opts.retryDelaysMs ?? [3000, 10000, 30000, 60000];
  const maxAttempts = opts.maxConflictAttempts ?? 3;
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let base: WorksheetPersistedData = opts.initialRow?.state ?? createEmptyWorksheetState();
  let revision: number | null = opts.initialRow?.revision ?? null;
  let latest: WorksheetPersistedData | null = opts.initialRow?.state ?? null;
  let dirty = false;
  let inflight = false;
  let debounceTimer: unknown = null;
  let retryTimer: unknown = null;
  let retryCount = 0;
  /** dispose 後は再試行を予約しない（未保存分は persistPending の控えから次回ロード時に取り戻す）。 */
  let disposed = false;

  function needsSave(current: WorksheetPersistedData): boolean {
    if (revision === null) return hasAnyWorksheetAnswer(current);
    return !isSameWorksheetState(current, base);
  }

  function refreshPending() {
    if (!opts.persistPending) return;
    if (latest && needsSave(latest)) opts.persistPending({ baseRevision: revision, base, local: latest });
    else opts.persistPending(null);
  }

  function scheduleFlush() {
    if (disposed) return;
    if (debounceTimer !== null) clearTimer(debounceTimer);
    debounceTimer = setTimer(() => {
      debounceTimer = null;
      void flush();
    }, debounceMs);
  }

  function scheduleRetry() {
    if (disposed) return;
    const delay = retryDelays[Math.min(retryCount, retryDelays.length - 1)];
    retryCount += 1;
    if (retryTimer !== null) clearTimer(retryTimer);
    retryTimer = setTimer(() => {
      retryTimer = null;
      void flush();
    }, delay);
  }

  async function flush(): Promise<void> {
    if (inflight) {
      dirty = true;
      return;
    }
    const current = latest;
    if (!current || !needsSave(current)) {
      dirty = false;
      return;
    }

    inflight = true;
    dirty = false;
    opts.onStatus("saving");
    let failed = false;
    try {
      const client = opts.getClient();
      let toSave = current;
      let done = false;
      for (let attempt = 0; attempt < maxAttempts && !done; attempt++) {
        const result =
          revision === null
            ? await insertPlanWorksheet(client, opts.planId, toSave)
            : await updatePlanWorksheet(client, opts.planId, toSave, revision);

        if (result.status === "saved") {
          base = toSave;
          revision = result.revision;
          retryCount = 0;
          refreshPending();
          opts.onStatus("saved");
          done = true;
          break;
        }
        if (result.status === "error") {
          failed = true;
          break;
        }

        // conflict: 別端末の保存を取り込んでから保存し直す。
        const fresh = await loadPlanWorksheet(client, opts.planId);
        if (!fresh.available) {
          failed = true;
          break;
        }
        const serverState = fresh.row?.state ?? createEmptyWorksheetState();
        // 保存中にこの端末で更に変更されていれば、それも含めてマージする。
        const merged = mergeWorksheetStates(base, latest ?? toSave, serverState);
        base = serverState;
        revision = fresh.row?.revision ?? null;
        latest = merged;
        opts.onMerged(merged);
        toSave = merged;
        refreshPending();
        if (fresh.row && isSameWorksheetState(merged, serverState)) {
          opts.onStatus("saved");
          done = true;
        }
      }
      if (!done && !failed) failed = true;
    } finally {
      inflight = false;
    }

    if (failed) {
      dirty = true;
      opts.onStatus("error");
      scheduleRetry();
      return;
    }
    if (dirty) await flush();
  }

  return {
    notifyChange(state) {
      latest = state;
      dirty = true;
      refreshPending();
      scheduleFlush();
    },
    flush,
    flushIfPending() {
      if (!dirty) return;
      if (debounceTimer !== null) {
        clearTimer(debounceTimer);
        debounceTimer = null;
      }
      void flush();
    },
    hasPending: () => dirty,
    restorePending(pending) {
      const sameBase = pending.baseRevision === revision;
      const restored = sameBase
        ? pending.local
        : mergeWorksheetStates(pending.base, pending.local, base, "server");
      if (!needsSave(restored)) {
        latest = latest ?? base;
        opts.persistPending?.(null);
        return null;
      }
      latest = restored;
      dirty = true;
      refreshPending();
      scheduleFlush();
      return restored;
    },
    dispose() {
      disposed = true;
      if (debounceTimer !== null) clearTimer(debounceTimer);
      if (retryTimer !== null) clearTimer(retryTimer);
      debounceTimer = null;
      retryTimer = null;
    },
    snapshot: () => ({ base, revision, dirty, inflight }),
  };
}
