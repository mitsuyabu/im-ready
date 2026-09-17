/**
 * Consultation Sheet をサーバー（plan_consultation_sheet）へ自動保存する同期器。
 *
 * Plan Worksheet の lib/worksheetServerSync.ts と同じ自動保存の考え方をそのまま使う（型が違うので実装は別）:
 * - notifyChange(state) … 編集のたびに呼ぶ。短い debounce のあと保存する
 * - サーバーと同じ内容なら保存しない。行が無ければ INSERT、あれば revision 条件つき UPDATE
 * - 別端末が先に保存していた（conflict）ら、最新を読み直して項目（id）単位でマージし、画面へ反映してから保存し直す
 * - 保存失敗時は入力を捨てず、間隔を空けて再試行する。未保存分は persistPending で端末に控え、
 *   次に開いたとき restorePending でサーバー状態に重ねて取り戻す
 * React から切り離した純粋なロジック（SupabaseClient とタイマーは差し替え可能）。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createEmptyConsultationSheet,
  hasAnyConsultationContent,
  insertConsultationSheet,
  isSameConsultationSheet,
  loadConsultationSheet,
  mergeConsultationSheets,
  updateConsultationSheet,
  type ConsultationSheetRow,
  type ConsultationSheetState,
} from "@/lib/consultationSheet";

export type ConsultationSaveStatus = "idle" | "saving" | "saved" | "error";

export type PendingConsultationChange = {
  baseRevision: number | null;
  base: ConsultationSheetState;
  local: ConsultationSheetState;
};

export type ConsultationSheetSyncOptions = {
  planId: string;
  getClient: () => SupabaseClient;
  initialRow: ConsultationSheetRow | null;
  onMerged: (state: ConsultationSheetState) => void;
  onStatus: (status: ConsultationSaveStatus) => void;
  persistPending?: (pending: PendingConsultationChange | null) => void;
  debounceMs?: number;
  retryDelaysMs?: number[];
  maxConflictAttempts?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export type ConsultationSheetSync = {
  notifyChange: (state: ConsultationSheetState) => void;
  flush: () => Promise<void>;
  flushIfPending: () => void;
  restorePending: (pending: PendingConsultationChange) => ConsultationSheetState | null;
  dispose: () => void;
  /**
   * dispose を解除する。React の開発時 StrictMode では effect が mount → cleanup → mount と2回走るため、
   * cleanup の dispose で止めたままにすると、その後の保存が予約されなくなる。effect の setup で毎回呼ぶ。
   */
  activate: () => void;
  snapshot: () => { base: ConsultationSheetState; revision: number | null; dirty: boolean };
};

export function createConsultationSheetSync(opts: ConsultationSheetSyncOptions): ConsultationSheetSync {
  const debounceMs = opts.debounceMs ?? 700;
  const retryDelays = opts.retryDelaysMs ?? [3000, 10000, 30000, 60000];
  const maxAttempts = opts.maxConflictAttempts ?? 3;
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let base: ConsultationSheetState = opts.initialRow?.state ?? createEmptyConsultationSheet();
  let revision: number | null = opts.initialRow?.revision ?? null;
  let latest: ConsultationSheetState | null = opts.initialRow?.state ?? null;
  let dirty = false;
  let inflight = false;
  let debounceTimer: unknown = null;
  let retryTimer: unknown = null;
  let retryCount = 0;
  let disposed = false;

  function needsSave(current: ConsultationSheetState): boolean {
    if (revision === null) return hasAnyConsultationContent(current);
    return !isSameConsultationSheet(current, base);
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
            ? await insertConsultationSheet(client, opts.planId, toSave)
            : await updateConsultationSheet(client, opts.planId, toSave, revision);
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
        const fresh = await loadConsultationSheet(client, opts.planId);
        if (!fresh.available) {
          failed = true;
          break;
        }
        const serverState = fresh.row?.state ?? createEmptyConsultationSheet();
        const merged = mergeConsultationSheets(base, latest ?? toSave, serverState);
        base = serverState;
        revision = fresh.row?.revision ?? null;
        latest = merged;
        opts.onMerged(merged);
        toSave = merged;
        refreshPending();
        if (fresh.row && isSameConsultationSheet(merged, serverState)) {
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
    restorePending(pending) {
      const restored =
        pending.baseRevision === revision
          ? pending.local
          : mergeConsultationSheets(pending.base, pending.local, base, "server");
      if (!needsSave(restored)) {
        opts.persistPending?.(null);
        return null;
      }
      latest = restored;
      dirty = true;
      refreshPending();
      scheduleFlush();
      return restored;
    },
    activate() {
      disposed = false;
    },
    dispose() {
      disposed = true;
      if (debounceTimer !== null) clearTimer(debounceTimer);
      if (retryTimer !== null) clearTimer(retryTimer);
      debounceTimer = null;
      retryTimer = null;
    },
    snapshot: () => ({ base, revision, dirty }),
  };
}

/* ---- 未保存の変更の控え（localStorage）。サーバーが正本で、これは保存失敗時の取りこぼし防止だけ ---- */

const PENDING_KEY_PREFIX = "ryugaku-consultation-pending:plan:";

export function savePendingConsultationChange(planId: string, pending: PendingConsultationChange | null): void {
  try {
    if (pending === null) window.localStorage.removeItem(`${PENDING_KEY_PREFIX}${planId}`);
    else window.localStorage.setItem(`${PENDING_KEY_PREFIX}${planId}`, JSON.stringify({ version: 1, ...pending }));
  } catch {
    // 保存できなくても編集は継続できる
  }
}

export function loadPendingConsultationChange(planId: string): { baseRevision: number | null; base: unknown; local: unknown } | null {
  try {
    const raw = window.localStorage.getItem(`${PENDING_KEY_PREFIX}${planId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || parsed.version !== 1) return null;
    const baseRevision =
      typeof parsed.baseRevision === "number" && Number.isInteger(parsed.baseRevision) ? parsed.baseRevision : null;
    return { baseRevision, base: parsed.base, local: parsed.local };
  } catch {
    return null;
  }
}
