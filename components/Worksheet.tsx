"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { COMPROMISE_NONE_ID, type PriorityItem } from "@/lib/worksheetPriorities";
import { type ChoiceOption } from "@/lib/worksheetNextStep";
import {
  loadPendingWorksheetChange,
  loadWorksheetState,
  saveWorksheetState,
  sanitizeWorksheetState,
  savePendingWorksheetChange,
  type WorksheetPersistedData,
} from "@/lib/worksheetStorage";
import { deriveWorksheetKartePatch, dropUnchangedWorksheetPatches } from "@/lib/worksheetKarte";
import { kartePatchToFieldPatches, type Karte } from "@/lib/karte";
import { applyKartePatch } from "@/lib/planChat";
import { createClient } from "@/lib/supabase/client";
import {
  WORKSHEET_VALID_IDS,
  coerceWorksheetState,
  hasAnyWorksheetAnswer,
  type LoadedPlanWorksheet,
} from "@/lib/planWorksheet";
import { createWorksheetServerSync, type WorksheetSaveStatus } from "@/lib/worksheetServerSync";
import { CATEGORIES, ALL_QUESTIONS, type Question, type Category } from "@/lib/worksheetQuestions";

const KARTE_SYNC_DEBOUNCE_MS = 1500;
/** サーバー保存の debounce。タブを閉じる前に保存が済んでいるよう、長くしすぎない。 */
const SERVER_SAVE_DEBOUNCE_MS = 700;

export type { WorksheetSaveStatus };

function findCategoryOf(questionId: string): Category | undefined {
  return CATEGORIES.find((category) => category.questions.some((q) => q.id === questionId));
}

/**
 * 回答state・保存（サーバー / localStorage）・Karte同期(debounce)をまとめたhook。
 * 匿名Worksheet（Worksheetコンポーネント本体）と、Plan側のI'm ready!セクション詳細画面
 * （components/WorksheetSectionDetail.tsx）の両方から同じ状態管理を再利用する。
 *
 * 保存先の決まり方:
 * - 匿名（planId なし）、または plan_worksheet が使えない（migration 未適用・読み込み失敗）
 *   … 従来どおり localStorage だけ。
 * - Plan Worksheet で serverWorksheet（server component が読んだ plan_worksheet）が渡されたとき
 *   … **サーバーが正本**。localStorage は補助キャッシュ / 既存回答の移行元。
 *     - サーバーに行がある → その内容で初期表示（SSR 時点から表示されるので「一度消えて見える」ことがない）。
 *       端末の localStorage に古い回答があっても、サーバーを上書きしない。
 *     - サーバーに行が無い＋この端末の localStorage に回答がある → 1回だけサーバーへ移行する。
 *     - 変更は React state → localStorage（即時）→ サーバー（短い debounce）の順に反映する。
 *     - 別端末と同時に保存した場合は、revision で検出して最新を読み直し、設問単位でマージしてから保存し直す。
 */
export function useWorksheetAnswers(
  planId?: string,
  initialKarte?: Karte | null,
  serverWorksheet?: LoadedPlanWorksheet,
) {
  // 初回 render 時点の値だけを使う（以後 props の identity が変わっても読み直さない）。
  const [serverInit] = useState(() => (planId && serverWorksheet?.available ? serverWorksheet : null));
  const serverRow = serverInit?.available ? serverInit.row : null;

  const [answers, setAnswers] = useState<Record<string, string>>(() => serverRow?.state.answers ?? {});
  const [ratings, setRatings] = useState<Record<string, Record<string, 1 | 2 | 3 | 4 | 5>>>(
    () => serverRow?.state.ratings ?? {},
  );
  const [rankings, setRankings] = useState<Record<string, string[]>>(() => serverRow?.state.rankings ?? {});
  const [compromises, setCompromises] = useState<Record<string, string[]>>(
    () => serverRow?.state.compromises ?? {},
  );
  const [singleSelections, setSingleSelections] = useState<Record<string, string>>(
    () => serverRow?.state.singleSelections ?? {},
  );
  const [multiSelections, setMultiSelections] = useState<Record<string, string[]>>(
    () => serverRow?.state.multiSelections ?? {},
  );
  // サーバーに行があれば、その内容で初期化済み＝復元完了。無ければ localStorage 復元（effect）を待つ。
  const [hasRestored, setHasRestored] = useState(serverRow !== null);
  const [saveStatus, setSaveStatus] = useState<WorksheetSaveStatus>("idle");

  function applyState(next: WorksheetPersistedData) {
    setAnswers(next.answers);
    setRatings(next.ratings);
    setRankings(next.rankings);
    setCompromises(next.compromises);
    setSingleSelections(next.singleSelections);
    setMultiSelections(next.multiSelections);
  }

  // Plan につき 1 つの同期器（保存・conflict マージ・再試行は lib/worksheetServerSync.ts）。
  // 渡している callback は state setter（常に同一）だけを使うので、初回に作ったものを使い続けてよい。
  const [serverSync] = useState(() =>
    planId && serverInit
      ? createWorksheetServerSync({
          planId,
          getClient: createClient,
          initialRow: serverRow,
          onMerged: applyState,
          onStatus: setSaveStatus,
          persistPending: (pending) => savePendingWorksheetChange(planId, pending),
          debounceMs: SERVER_SAVE_DEBOUNCE_MS,
        })
      : null,
  );

  // 復元。サーバーに行がある場合は useState 初期値で済んでいるので何もしない。
  // それ以外は localStorage から（React 外部のシステムからの初期化なので effect 内の setState が正しい手段）。
  // Plan Worksheet でサーバーに行が無く、この端末にだけ回答がある場合は、下の保存 effect がそのまま
  // サーバーへ移行する（1回だけ。行ができた後はサーバーが正本になる）。
  useEffect(() => {
    if (serverRow) {
      // 前回この端末で保存しきれなかった変更があれば、今のサーバー状態に重ねて保存し直す。
      const pending = planId && serverSync ? loadPendingWorksheetChange(planId) : null;
      if (pending && serverSync) {
        const restored = serverSync.restorePending({
          baseRevision: pending.baseRevision,
          base: coerceWorksheetState(pending.base),
          local: coerceWorksheetState(pending.local),
        });
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (restored) applyState(restored);
      }
      return;
    }
    const stored = loadWorksheetState(planId);
    if (stored) {
      const sanitized = sanitizeWorksheetState(stored, WORKSHEET_VALID_IDS);
      applyState(sanitized);
    }
    setHasRestored(true);
  }, [planId, serverRow, serverSync]);

  // localStorage は補助キャッシュとして即時に更新する（匿名 Worksheet では従来どおりこれが保存先）。
  // 復元より前に保存が走ると空の初期stateで上書きしてしまうため、復元完了まで保存しない。
  useEffect(() => {
    if (!hasRestored) return;
    saveWorksheetState(
      { answers, ratings, rankings, compromises, singleSelections, multiSelections },
      planId,
    );
  }, [hasRestored, answers, ratings, rankings, compromises, singleSelections, multiSelections, planId]);

  const karteSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedFieldPatchesJsonRef = useRef<string | null>(null);
  /** 直近で分かっている Karte（初回は server 取得のもの、以後は RPC が返した確定値）。no-op write の判定用。 */
  const knownKarteRef = useRef<Karte | null>(initialKarte ?? null);
  /** debounce 待ちの同期があるか（unmount 時に取りこぼさないため）。 */
  const pendingSyncRef = useRef(false);
  const latestDataRef = useRef<WorksheetPersistedData | null>(null);

  // 回答が変わったら、サーバーへの保存を予約する（Plan Worksheet のみ・短い debounce）。
  useEffect(() => {
    if (!hasRestored || !serverSync) return;
    const data = { answers, ratings, rankings, compromises, singleSelections, multiSelections };
    // 初回（復元直後）はサーバーと同じ内容なら何もしない。移行が必要なときだけ保存される。
    if (!serverRow && !hasAnyWorksheetAnswer(data)) return;
    serverSync.notifyChange(data);
  }, [hasRestored, serverSync, serverRow, answers, ratings, rankings, compromises, singleSelections, multiSelections]);

  // 画面遷移（unmount）・タブが裏に回る・ページを離れる・通信が戻ったときに、未保存分を送る。
  // 完了は保証できないため、通常操作中に短い debounce で保存しておくことを主にしている。
  useEffect(() => {
    if (!serverSync) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") serverSync.flushIfPending();
    };
    const onPageHideOrOnline = () => serverSync.flushIfPending();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHideOrOnline);
    window.addEventListener("online", onPageHideOrOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHideOrOnline);
      window.removeEventListener("online", onPageHideOrOnline);
      serverSync.flushIfPending();
      serverSync.dispose();
    };
  }, [serverSync]);

  /**
   * Worksheet 回答から deterministic に写せる項目だけを Karte へ送る（source は "worksheet"）。
   * - Karte に既に同じ内容（stated・source=worksheet・値一致）で入っている field は送らない
   * - 前回送信した内容と同一なら送らない
   * certainty / source / conflict の裁定は従来どおり apply_karte_patch RPC が行う。
   */
  function syncWorksheetToKarte(targetPlanId: string, data: WorksheetPersistedData) {
    pendingSyncRef.current = false;
    const patch = deriveWorksheetKartePatch(data);
    const fieldPatches = dropUnchangedWorksheetPatches(
      kartePatchToFieldPatches(patch, "worksheet"),
      knownKarteRef.current,
    );
    if (fieldPatches.length === 0) return;

    const json = JSON.stringify(fieldPatches);
    if (json === lastSyncedFieldPatchesJsonRef.current) return;

    void applyKartePatch(createClient(), targetPlanId, { fieldPatches }).then((result) => {
      if (!result) return;
      lastSyncedFieldPatchesJsonRef.current = json;
      knownKarteRef.current = result;
    });
  }

  /**
   * planId指定時のみ、確定済みのdeterministic項目をKarteへ同期する。
   * 1文字ごとに発火するlocalStorage保存とは独立し、1.5秒のdebounceを挟む。
   */
  useEffect(() => {
    if (!hasRestored || !planId) return;

    const data: WorksheetPersistedData = {
      answers,
      ratings,
      rankings,
      compromises,
      singleSelections,
      multiSelections,
    };
    latestDataRef.current = data;
    pendingSyncRef.current = true;

    if (karteSyncTimerRef.current) clearTimeout(karteSyncTimerRef.current);
    karteSyncTimerRef.current = setTimeout(() => {
      syncWorksheetToKarte(planId, data);
    }, KARTE_SYNC_DEBOUNCE_MS);

    return () => {
      if (karteSyncTimerRef.current) clearTimeout(karteSyncTimerRef.current);
    };
  }, [hasRestored, planId, answers, ratings, rankings, compromises, singleSelections, multiSelections]);

  /**
   * 画面遷移（例: 回答直後に Chat へ移動）で debounce 待ちの回答が Karte に届かず、
   * Chat で同じことを聞き直す原因になるのを防ぐため、unmount 時に待ち分だけ送る。
   * アプリ内遷移では JS 実行が続くので届く。タブを閉じる等の完全な離脱では保証できない（best effort）。
   */
  useEffect(() => {
    return () => {
      if (!planId || !pendingSyncRef.current || !latestDataRef.current) return;
      syncWorksheetToKarte(planId, latestDataRef.current);
    };
    // unmount 時だけ動かす。値は ref 経由で最新を読む。
  }, [planId]);

  /**
   * 「回答済み」判定はkindごとに異なる（オーナー承認済みの基準）:
   * - rating: 1項目でも評価すれば回答済み（全項目必須にしない）
   * - ranking: 1つ（1位）でも選べば回答済み（UI上は3つ選ぶよう促す）
   * - compromise: 0件も正当な回答だが、「特にない」を明示選択した場合のみ回答済みにする
   *   （未選択のまま=未回答、と区別する）
   */
  /** 選択式に添えた自由記入欄だけが埋まっている場合も回答済みとして扱う。 */
  function hasFreeTextAnswer(question: Question): boolean {
    if (question.kind !== "singleSelect" && question.kind !== "multiSelect") return false;
    if (!question.freeText) return false;
    return (answers[question.id] ?? "").trim().length > 0;
  }

  function isQuestionAnswered(question: Question): boolean {
    switch (question.kind) {
      case "freeText":
        return (answers[question.id] ?? "").trim().length > 0;
      case "rating":
        return Object.keys(ratings[question.id] ?? {}).length > 0;
      case "ranking":
        return (rankings[question.id] ?? []).length > 0;
      case "compromise":
        return (compromises[question.id] ?? []).length > 0;
      case "singleSelect":
        return (
          (singleSelections[question.id] ?? null) !== null || hasFreeTextAnswer(question)
        );
      case "multiSelect":
        return (multiSelections[question.id] ?? []).length > 0 || hasFreeTextAnswer(question);
      case "number":
        return (answers[question.id] ?? "").trim().length > 0;
    }
  }

  function handleChange(id: string, value: string) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  /** 既に選んでいる点数を再タップしたら、未評価に戻す（問2の「再タップで解除」と挙動を揃える） */
  function handleRate(questionId: string, itemId: string, value: 1 | 2 | 3 | 4 | 5) {
    setRatings((prev) => {
      const current = prev[questionId] ?? {};
      if (current[itemId] === value) {
        const next = { ...current };
        delete next[itemId];
        return { ...prev, [questionId]: next };
      }
      return { ...prev, [questionId]: { ...current, [itemId]: value } };
    });
  }

  function handleToggleRank(questionId: string, itemId: string) {
    setRankings((prev) => {
      const current = prev[questionId] ?? [];
      if (current.includes(itemId)) {
        return { ...prev, [questionId]: current.filter((id) => id !== itemId) };
      }
      const question = ALL_QUESTIONS.find((entry) => entry.question.id === questionId)?.question;
      const maxRanks = question && question.kind === "ranking" ? question.maxRanks : 3;
      if (current.length >= maxRanks) return prev;
      return { ...prev, [questionId]: [...current, itemId] };
    });
  }

  function handleToggleCompromise(questionId: string, itemId: string) {
    setCompromises((prev) => {
      const current = prev[questionId] ?? [];
      if (itemId === COMPROMISE_NONE_ID) {
        const next = current.includes(COMPROMISE_NONE_ID) ? [] : [COMPROMISE_NONE_ID];
        return { ...prev, [questionId]: next };
      }
      const withoutNone = current.filter((id) => id !== COMPROMISE_NONE_ID);
      const next = withoutNone.includes(itemId)
        ? withoutNone.filter((id) => id !== itemId)
        : [...withoutNone, itemId];
      return { ...prev, [questionId]: next };
    });
  }

  /** 単一選択。同じ選択肢を再タップしたら選択解除する（他の選択式と操作感を揃える） */
  function handleSelectSingle(questionId: string, optionId: string) {
    setSingleSelections((prev) => {
      const next = { ...prev };
      if (next[questionId] === optionId) {
        delete next[questionId];
      } else {
        next[questionId] = optionId;
      }
      return next;
    });
  }

  /** 複数選択。「特にない」のような特別な選択肢は持たない、単純なトグル（0件選択も許容） */
  function handleToggleMulti(questionId: string, optionId: string) {
    setMultiSelections((prev) => {
      const current = prev[questionId] ?? [];
      const next = current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId];
      return { ...prev, [questionId]: next };
    });
  }

  return {
    answers,
    ratings,
    rankings,
    compromises,
    singleSelections,
    multiSelections,
    hasRestored,
    saveStatus,
    isQuestionAnswered,
    handleChange,
    handleRate,
    handleToggleRank,
    handleToggleCompromise,
    handleSelectSingle,
    handleToggleMulti,
  };
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function RatingBody({
  items,
  values,
  onRate,
}: {
  items: PriorityItem[];
  values: Record<string, 1 | 2 | 3 | 4 | 5>;
  onRate: (itemId: string, value: 1 | 2 | 3 | 4 | 5) => void;
}) {
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between text-[11px] text-worksheet-secondary">
        <span>あまり重要ではない</span>
        <span>とても重要</span>
      </div>
      <div className="mt-3 space-y-4">
        {items.map((item) => (
          <div key={item.id}>
            <p className="text-[15px] text-worksheet-primary">{item.label}</p>
            <div className="mt-2 grid grid-cols-5 gap-1.5">
              {([1, 2, 3, 4, 5] as const).map((n) => {
                const selected = values[item.id] === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => onRate(item.id, n)}
                    aria-pressed={selected}
                    className={
                      selected
                        ? "flex h-10 items-center justify-center rounded-xl bg-worksheet-accent text-sm font-semibold text-worksheet-accent-contrast transition-colors duration-150"
                        : "flex h-10 items-center justify-center rounded-xl bg-zinc-100 text-sm font-medium text-zinc-400 transition-colors duration-150 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-500 dark:hover:bg-zinc-700"
                    }
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RankingBody({
  items,
  maxRanks,
  order,
  onToggle,
}: {
  items: PriorityItem[];
  maxRanks: number;
  order: string[];
  onToggle: (itemId: string) => void;
}) {
  const isFull = order.length >= maxRanks;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: maxRanks }).map((_, i) => {
          const itemId = order[i];
          const item = itemId ? items.find((it) => it.id === itemId) : undefined;
          return (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 rounded-full border-[0.5px] border-worksheet-border bg-worksheet-surface px-3 py-1.5 text-xs text-worksheet-secondary"
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-worksheet-accent text-[10px] font-semibold text-worksheet-accent-contrast">
                {i + 1}
              </span>
              {item ? item.label : "未選択"}
            </span>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => {
          const rank = order.indexOf(item.id);
          const selected = rank !== -1;
          const disabled = !selected && isFull;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggle(item.id)}
              disabled={disabled}
              aria-pressed={selected}
              className={
                selected
                  ? "inline-flex items-center gap-1.5 rounded-full bg-worksheet-accent px-3 py-1.5 text-xs font-medium text-worksheet-accent-contrast transition-colors duration-150"
                  : disabled
                    ? "inline-flex items-center gap-1.5 rounded-full border-[0.5px] border-worksheet-border bg-worksheet-surface px-3 py-1.5 text-xs text-zinc-300 dark:text-zinc-600"
                    : "inline-flex items-center gap-1.5 rounded-full border-[0.5px] border-worksheet-border bg-worksheet-surface px-3 py-1.5 text-xs text-worksheet-primary transition-colors duration-150 hover:bg-worksheet-border/50"
              }
            >
              {selected && (
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-worksheet-accent-contrast text-[10px] font-semibold text-worksheet-accent">
                  {rank + 1}
                </span>
              )}
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CompromiseBody({
  items,
  selected,
  onToggle,
}: {
  items: PriorityItem[];
  selected: string[];
  onToggle: (itemId: string) => void;
}) {
  const noneSelected = selected.includes(COMPROMISE_NONE_ID);

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {items.map((item) => {
        const isSelected = selected.includes(item.id);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onToggle(item.id)}
            aria-pressed={isSelected}
            className={
              isSelected
                ? "rounded-full bg-worksheet-accent px-3 py-1.5 text-xs font-medium text-worksheet-accent-contrast transition-colors duration-150"
                : "rounded-full border-[0.5px] border-worksheet-border bg-worksheet-surface px-3 py-1.5 text-xs text-worksheet-primary transition-colors duration-150 hover:bg-worksheet-border/50"
            }
          >
            {item.label}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => onToggle(COMPROMISE_NONE_ID)}
        aria-pressed={noneSelected}
        className={
          noneSelected
            ? "rounded-full bg-worksheet-accent px-3 py-1.5 text-xs font-medium text-worksheet-accent-contrast transition-colors duration-150"
            : "rounded-full border-[0.5px] border-dashed border-worksheet-border bg-worksheet-surface px-3 py-1.5 text-xs text-worksheet-secondary transition-colors duration-150 hover:bg-worksheet-border/50"
        }
      >
        特にない
      </button>
    </div>
  );
}

/** 縦積みの単一選択（1行1選択肢。選んだものだけ黒背景+白文字、他はアウトライン） */
/** 選択肢が多い設問（国・都市・学び方・滞在方法）が mobile で縦に伸びすぎないよう、chip 並びにする。 */
const OPTION_LIST_CLASS = "mt-4 flex flex-col gap-2";
const OPTION_CHIPS_CLASS = "mt-4 flex flex-wrap gap-2";
const CHIP_SELECTED_CLASS =
  "rounded-full bg-worksheet-accent px-3.5 py-2 text-left text-[14px] font-medium text-worksheet-accent-contrast transition-colors duration-150";
const CHIP_CLASS =
  "rounded-full border-[0.5px] border-worksheet-border bg-worksheet-surface px-3.5 py-2 text-left text-[14px] text-worksheet-primary transition-colors duration-150 hover:bg-worksheet-border/50";

function SingleSelectBody({
  options,
  selected,
  onSelect,
  optionLayout = "list",
}: {
  options: ChoiceOption[];
  selected: string | null;
  onSelect: (optionId: string) => void;
  optionLayout?: "list" | "chips";
}) {
  const isChips = optionLayout === "chips";
  return (
    <div className={isChips ? OPTION_CHIPS_CLASS : OPTION_LIST_CLASS}>
      {options.map((option) => {
        const isSelected = selected === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onSelect(option.id)}
            aria-pressed={isSelected}
            className={
              isChips
                ? isSelected
                  ? CHIP_SELECTED_CLASS
                  : CHIP_CLASS
                : isSelected
                  ? "rounded-xl bg-worksheet-accent px-4 py-2.5 text-left text-[15px] font-medium text-worksheet-accent-contrast transition-colors duration-150"
                  : "rounded-xl border-[0.5px] border-worksheet-border bg-worksheet-surface px-4 py-2.5 text-left text-[15px] text-worksheet-primary transition-colors duration-150 hover:bg-worksheet-border/50"
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** 縦積みの複数選択（1行1選択肢。0件選択も許容し、「特にない」のような特別な選択肢は持たない） */
function MultiSelectBody({
  options,
  selected,
  onToggle,
  optionLayout = "list",
}: {
  options: ChoiceOption[];
  selected: string[];
  onToggle: (optionId: string) => void;
  optionLayout?: "list" | "chips";
}) {
  const isChips = optionLayout === "chips";
  return (
    <div className={isChips ? OPTION_CHIPS_CLASS : OPTION_LIST_CLASS}>
      {options.map((option) => {
        const isSelected = selected.includes(option.id);
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onToggle(option.id)}
            aria-pressed={isSelected}
            className={
              isChips
                ? isSelected
                  ? CHIP_SELECTED_CLASS
                  : CHIP_CLASS
                : isSelected
                  ? "rounded-xl bg-worksheet-accent px-4 py-2.5 text-left text-[15px] font-medium text-worksheet-accent-contrast transition-colors duration-150"
                  : "rounded-xl border-[0.5px] border-worksheet-border bg-worksheet-surface px-4 py-2.5 text-left text-[15px] text-worksheet-primary transition-colors duration-150 hover:bg-worksheet-border/50"
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 選択式の下に置く 1 行の自由記入欄（§17 の「選択 + 自由記入」）。
 * 常時大きく出さないよう textarea ではなく 1 行の input にし、ラベルも小さく муted にする。
 * 値は freeText 設問と同じ answers[question.id] に入るため、保存・復元の仕組みは変わらない。
 */
function FreeTextSupplementBody({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="mt-3 block">
      <span className="text-[12px] font-medium text-worksheet-secondary">{label}（任意）</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-xl border-[0.5px] border-worksheet-border bg-worksheet-surface px-3 py-2 text-[15px] leading-relaxed text-worksheet-primary transition-shadow focus:border-worksheet-sage-hover focus:outline-none focus:ring-2 focus:ring-worksheet-sage-hover/50"
      />
    </label>
  );
}

/** 数値だけを答える設問（年齢）。空文字も許容し、未入力を「未回答」として扱う。 */
function NumberBody({
  value,
  onChange,
  placeholder,
  unit,
  min,
  max,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  unit: string;
  min: number;
  max: number;
}) {
  return (
    <div className="mt-4 flex items-center gap-2">
      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-28 rounded-xl border-[0.5px] border-worksheet-border bg-worksheet-surface px-3 py-2 text-[15px] text-worksheet-primary transition-shadow focus:border-worksheet-sage-hover focus:outline-none focus:ring-2 focus:ring-worksheet-sage-hover/50"
      />
      <span className="text-[14px] text-worksheet-secondary">{unit}</span>
    </div>
  );
}

export interface QuestionCardProps {
  question: Question;
  index: number;
  isOpen: boolean;
  hasAnswer: boolean;
  examplesOpen: boolean;
  onToggle: () => void;
  onToggleExamples: () => void;
  cardRef: (el: HTMLDivElement | null) => void;
  textValue: string;
  onTextChange: (value: string) => void;
  ratingValues: Record<string, 1 | 2 | 3 | 4 | 5>;
  onRate: (itemId: string, value: 1 | 2 | 3 | 4 | 5) => void;
  rankOrder: string[];
  onToggleRank: (itemId: string) => void;
  compromiseSelected: string[];
  onToggleCompromise: (itemId: string) => void;
  singleSelected: string | null;
  onSelectSingle: (optionId: string) => void;
  multiSelected: string[];
  onToggleMulti: (optionId: string) => void;
  /**
   * "card"（既定）: 匿名Worksheetのアコーディオン表示。従来通りタップで開閉し、閉時は本文を描画しない。
   * "inline": I'm ready!セクション詳細の「連続したワークエリア」表示。開閉トグルを持たず、常に本文を表示する。
   * "bare": 見出し・補足・番号を呼び出し側（テーマ詳細のカード）が持つ場合の、回答UI（answerBody）だけの表示。
   * いずれも回答UI・保存・Karte同期に関わるprops/ロジックは完全に共通で、見た目の出し分けのみ行う。
   */
  layout?: "card" | "inline" | "bare";
  /** layout="inline"のときだけ使う「1 / 5」のような通し番号表示。省略時はcard表示の丸番号バッジを使う */
  stepLabel?: string;
}

export function QuestionCard({
  question,
  index,
  isOpen,
  hasAnswer,
  examplesOpen,
  onToggle,
  onToggleExamples,
  cardRef,
  textValue,
  onTextChange,
  ratingValues,
  onRate,
  rankOrder,
  onToggleRank,
  compromiseSelected,
  onToggleCompromise,
  singleSelected,
  onSelectSingle,
  multiSelected,
  onToggleMulti,
  layout = "card",
  stepLabel,
}: QuestionCardProps) {
  const answerBody = (
    <>
      {question.kind === "freeText" && (
        <>
          <button
            type="button"
            onClick={onToggleExamples}
            aria-expanded={examplesOpen}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-worksheet-sage px-3 py-1.5 text-xs font-medium text-worksheet-primary transition-colors duration-150 hover:bg-worksheet-sage-hover"
          >
            記入例
            <ChevronDownIcon
              className={`h-3.5 w-3.5 transition-transform duration-200 ${
                examplesOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          <div
            className={`grid transition-all duration-200 ease-out ${
              examplesOpen ? "mt-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className="flex flex-col gap-1.5 overflow-hidden">
              {question.examples.map((example) => (
                <span
                  key={example}
                  className="rounded-xl border-[0.5px] border-worksheet-border bg-worksheet-surface px-3 py-1.5 text-[13px] leading-relaxed text-worksheet-secondary"
                >
                  {example}
                </span>
              ))}
            </div>
          </div>

          <textarea
            value={textValue}
            onChange={(e) => onTextChange(e.target.value)}
            rows={4}
            placeholder="あなたの言葉で、自由に書いてみてください"
            className="mt-4 w-full resize-y rounded-xl border-[0.5px] border-worksheet-border bg-worksheet-surface px-3 py-2 text-base leading-relaxed text-worksheet-primary transition-shadow focus:border-worksheet-sage-hover focus:outline-none focus:ring-2 focus:ring-worksheet-sage-hover/50"
          />
        </>
      )}

      {question.kind === "rating" && (
        <RatingBody items={question.items} values={ratingValues} onRate={onRate} />
      )}

      {question.kind === "ranking" && (
        <RankingBody
          items={question.items}
          maxRanks={question.maxRanks}
          order={rankOrder}
          onToggle={onToggleRank}
        />
      )}

      {question.kind === "compromise" && (
        <CompromiseBody
          items={question.items}
          selected={compromiseSelected}
          onToggle={onToggleCompromise}
        />
      )}

      {question.kind === "singleSelect" && (
        <>
          <SingleSelectBody
            options={question.options}
            selected={singleSelected}
            onSelect={onSelectSingle}
            optionLayout={question.optionLayout}
          />
          {question.freeText && (
            <FreeTextSupplementBody
              label={question.freeText.label}
              placeholder={question.freeText.placeholder}
              value={textValue}
              onChange={onTextChange}
            />
          )}
        </>
      )}

      {question.kind === "multiSelect" && (
        <>
          <MultiSelectBody
            options={question.options}
            selected={multiSelected}
            onToggle={onToggleMulti}
            optionLayout={question.optionLayout}
          />
          {question.freeText && (
            <FreeTextSupplementBody
              label={question.freeText.label}
              placeholder={question.freeText.placeholder}
              value={textValue}
              onChange={onTextChange}
            />
          )}
        </>
      )}

      {question.kind === "number" && (
        <NumberBody
          value={textValue}
          onChange={onTextChange}
          placeholder={question.placeholder}
          unit={question.unit}
          min={question.min}
          max={question.max}
        />
      )}

      {layout !== "bare" && (
        <Link
          href="/widget"
          className="mt-3 inline-block text-xs text-worksheet-accent underline decoration-worksheet-accent/40 underline-offset-2 transition-colors hover:decoration-worksheet-accent"
        >
          {question.kind === "freeText"
            ? "うまく書けないときは、AIと話しながら整理する"
            : "迷ったときは、AIと話しながら整理する"}
        </Link>
      )}
    </>
  );

  if (layout === "bare") {
    // 見出し・補足・ステップ番号はテーマ詳細カード側が描画するため、ここでは回答UIだけを返す。
    return <div ref={cardRef}>{answerBody}</div>;
  }

  if (layout === "inline") {
    return (
      <div ref={cardRef}>
        <span className="text-xs font-medium text-worksheet-secondary">{stepLabel}</span>
        <h3 className="mt-2 text-lg font-semibold leading-snug text-worksheet-primary sm:text-xl">
          {question.heading}
        </h3>
        <p className="mt-2 text-[17px] leading-[1.75] text-worksheet-secondary">{question.supplement}</p>
        <div className="mt-4">{answerBody}</div>
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      className="rounded-[20px] border-[0.5px] border-worksheet-border bg-worksheet-surface-2"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <span
          className={
            isOpen
              ? "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-worksheet-accent text-xs font-semibold text-worksheet-accent-contrast transition-colors duration-200"
              : "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-400 transition-colors duration-200 dark:bg-zinc-800 dark:text-zinc-500"
          }
        >
          {index + 1}
        </span>
        <span className="flex-1 text-[15px] font-medium text-worksheet-primary">
          {question.heading}
        </span>
        {!isOpen && hasAnswer && (
          <span className="shrink-0 text-xs text-worksheet-secondary">回答済み</span>
        )}
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-worksheet-secondary transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="px-5 pb-5">
          <p className="text-[17px] leading-[1.75] text-worksheet-secondary">
            {question.supplement}
          </p>
          {answerBody}
        </div>
      )}
    </div>
  );
}

interface WorksheetProps {
  /**
   * 指定すると、そのPlan専用のlocalStorage名前空間（ryugaku-worksheet-answers:plan:<planId>）を
   * 使う。未指定時（/worksheetの匿名利用）は既存の固定キーのままで、挙動は一切変わらない。
   */
  planId?: string;
}

/**
 * きっかけ・目的を整理する1枚のワークシート。保存はしない（ページ内stateのみ）。
 * 「AIに相談する」は最小実装として /widget への遷移のみ。内容の引き継ぎは将来の拡張。
 * カテゴリ（きっかけ・目的／将来像／現実条件／優先順位）を縦に並べ、ページ全体を通して
 * 常に0〜1問だけが開くアコーディオン（クリックで自由に開閉・切替。カテゴリをまたいでも仕組みは1つ）。
 * 「優先順位」カテゴリの3問（評価・順位・妥協）は自由記述とは異なる回答形式だが、
 * 1問=1アコーディオンカードという既存の粒度はそのまま（kindで中身の描画だけ出し分ける）。
 */
export default function Worksheet({ planId }: WorksheetProps = {}) {
  const {
    answers,
    ratings,
    rankings,
    compromises,
    singleSelections,
    multiSelections,
    isQuestionAnswered,
    handleChange,
    handleRate,
    handleToggleRank,
    handleToggleCompromise,
    handleSelectSingle,
    handleToggleMulti,
  } = useWorksheetAnswers(planId);
  const [openId, setOpenId] = useState<string | null>(CATEGORIES[0].questions[0].id);
  const [axisSummary, setAxisSummary] = useState<string | null>(null);
  const [axisLoading, setAxisLoading] = useState(false);
  const [axisError, setAxisError] = useState<string | null>(null);
  const [myNoteResult, setMyNoteResult] = useState<string | null>(null);
  const [myNoteLoading, setMyNoteLoading] = useState(false);
  const [myNoteError, setMyNoteError] = useState<string | null>(null);
  const [letterResult, setLetterResult] = useState<string | null>(null);
  const [letterLoading, setLetterLoading] = useState(false);
  const [letterError, setLetterError] = useState<string | null>(null);
  const [openExamples, setOpenExamples] = useState<Record<string, boolean>>({});
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({});

  /**
   * 「優先順位」カテゴリの回答（評価・順位・妥協）を /api/worksheet-summary に送り、
   * 判断軸の文章を取得する。失敗しても入力（answers/ratings/rankings/compromises）には触れない。
   */
  async function handleGenerateAxisSummary() {
    setAxisLoading(true);
    setAxisError(null);

    try {
      const res = await fetch("/api/worksheet-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ratings: ratings["priority-rating"] ?? {},
          rankings: rankings["priority-ranking"] ?? [],
          compromises: compromises["priority-compromise"] ?? [],
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || typeof data?.summary !== "string") {
        setAxisError(
          typeof data?.error === "string"
            ? data.error
            : "整理結果を取得できませんでした。しばらくしてから再度お試しください。",
        );
        return;
      }

      setAxisSummary(data.summary);
    } catch {
      setAxisError("通信エラーが発生しました。ネットワーク状態を確認してください。");
    } finally {
      setAxisLoading(false);
    }
  }

  /**
   * my note / 親向け資料に渡す「本人が書いた・選んだ内容」をカテゴリごとにまとめる
   * （案B: サーバーには id 照合させない）。
   *
   * 自由記述に加え、現実条件のような選択式（＋自由記入）の回答も、選択肢ラベルをそのまま
   * テキストにして渡す。ラベル以上の言い換え・推測はしない。数値設問は単位を付けるだけ。
   * 未回答の設問は entry を作らない（空欄のカテゴリはプロンプトのデータ自体に含めない既存方針）。
   */
  function buildFreeTextByCategory() {
    const result: { categoryTitle: string; entries: { heading: string; text: string }[] }[] = [];
    for (const category of CATEGORIES) {
      const entries: { heading: string; text: string }[] = [];
      for (const q of category.questions) {
        const note = (answers[q.id] ?? "").trim();
        if (q.kind === "freeText") {
          if (note) entries.push({ heading: q.heading, text: note });
          continue;
        }
        if (q.kind === "number") {
          if (note) entries.push({ heading: q.heading, text: `${note}${q.unit}` });
          continue;
        }
        if (q.kind === "singleSelect" || q.kind === "multiSelect") {
          const selectedIds =
            q.kind === "singleSelect"
              ? singleSelections[q.id]
                ? [singleSelections[q.id]]
                : []
              : (multiSelections[q.id] ?? []);
          const labels = q.options.filter((o) => selectedIds.includes(o.id)).map((o) => o.label);
          const text = [labels.join("、"), note].filter((t) => t.length > 0).join(" / ");
          if (text) entries.push({ heading: q.heading, text });
        }
      }
      if (entries.length > 0) result.push({ categoryTitle: category.title, entries });
    }
    return result;
  }

  /**
   * ワークシート全6カテゴリの回答を /api/worksheet-note に送り、my note（5部構成）を取得する。
   * 失敗しても入力・優先順位のAI整理結果・localStorage保存には一切触れない。
   */
  async function handleGenerateMyNote() {
    setMyNoteLoading(true);
    setMyNoteError(null);

    try {
      const res = await fetch("/api/worksheet-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          freeTextByCategory: buildFreeTextByCategory(),
          priorities: {
            ratings: ratings["priority-rating"] ?? {},
            rankings: rankings["priority-ranking"] ?? [],
            compromises: compromises["priority-compromise"] ?? [],
          },
          nextStep: {
            readiness: singleSelections["nextstep-readiness"] ?? null,
            topics: multiSelections["nextstep-topics"] ?? [],
          },
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || typeof data?.note !== "string") {
        setMyNoteError(
          typeof data?.error === "string"
            ? data.error
            : "my noteを取得できませんでした。しばらくしてから再度お試しください。",
        );
        return;
      }

      setMyNoteResult(data.note);
    } catch {
      setMyNoteError("通信エラーが発生しました。ネットワーク状態を確認してください。");
    } finally {
      setMyNoteLoading(false);
    }
  }

  /**
   * ワークシート全6カテゴリの回答を /api/worksheet-letter に送り、親に見せる資料（手紙形式）を
   * 取得する。失敗しても入力・my note結果・優先順位のAI整理結果・localStorage保存には触れない。
   */
  async function handleGenerateLetter() {
    setLetterLoading(true);
    setLetterError(null);

    try {
      const res = await fetch("/api/worksheet-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          freeTextByCategory: buildFreeTextByCategory(),
          priorities: {
            ratings: ratings["priority-rating"] ?? {},
            rankings: rankings["priority-ranking"] ?? [],
            compromises: compromises["priority-compromise"] ?? [],
          },
          nextStep: {
            readiness: singleSelections["nextstep-readiness"] ?? null,
            topics: multiSelections["nextstep-topics"] ?? [],
          },
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || typeof data?.letter !== "string") {
        setLetterError(
          typeof data?.error === "string"
            ? data.error
            : "資料を取得できませんでした。しばらくしてから再度お試しください。",
        );
        return;
      }

      setLetterResult(data.letter);
    } catch {
      setLetterError("通信エラーが発生しました。ネットワーク状態を確認してください。");
    } finally {
      setLetterLoading(false);
    }
  }

  function handleToggle(id: string) {
    setOpenId((prev) => (prev === id ? null : id));
  }

  function handleToggleExamples(id: string) {
    setOpenExamples((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  /**
   * 「次へ進む」。遷移先が無いため最小実装として、次の未回答の問いを開いてスクロールする。
   * カテゴリをまたぐ場合は、区切りラベルごと視界に入るようカテゴリ先頭にスクロールする
   * （どのカテゴリに移ったかが自然に伝わるようにするための最小限の配慮）。
   * 残り全て回答済みなら最後のカードまでスクロールするだけにとどめる。
   */
  function handleNext() {
    const currentFlatIndex = openId
      ? ALL_QUESTIONS.findIndex((entry) => entry.question.id === openId)
      : -1;
    const currentCategoryId = currentFlatIndex >= 0 ? ALL_QUESTIONS[currentFlatIndex].categoryId : null;
    const nextEntry = ALL_QUESTIONS.slice(currentFlatIndex + 1).find(
      (entry) => !isQuestionAnswered(entry.question),
    );

    if (nextEntry) {
      const enteringNewCategory = nextEntry.categoryId !== currentCategoryId;
      setOpenId(nextEntry.question.id);
      requestAnimationFrame(() => {
        if (enteringNewCategory) {
          categoryRefs.current[nextEntry.categoryId]?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        } else {
          cardRefs.current[nextEntry.question.id]?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      });
    } else {
      const lastQuestionId = ALL_QUESTIONS[ALL_QUESTIONS.length - 1].question.id;
      cardRefs.current[lastQuestionId]?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }

  const answeredCount = ALL_QUESTIONS.filter((entry) => isQuestionAnswered(entry.question)).length;
  const openCategory = openId ? findCategoryOf(openId) : undefined;
  const openIndexInCategory = openCategory
    ? openCategory.questions.findIndex((q) => q.id === openId)
    : -1;
  const stepLabel =
    openCategory && openIndexInCategory !== -1
      ? `${openCategory.title} ・ステップ ${openIndexInCategory + 1} / ${openCategory.questions.length}`
      : `${answeredCount} / ${ALL_QUESTIONS.length} 問に回答済み`;

  // 問2（順位づけ）が核心のため、これが最低1件あることを「判断軸を確認する」の有効化条件にする
  const canGenerateAxisSummary = (rankings["priority-ranking"] ?? []).length > 0;

  // 6カテゴリのうち3カテゴリ以上に何らかの入力があれば「my noteを作る」を有効化する
  const answeredCategoryCount = CATEGORIES.filter((category) =>
    category.questions.some((q) => isQuestionAnswered(q)),
  ).length;
  const canGenerateMyNote = answeredCategoryCount >= 3;

  // 「親に見せる資料を作る」もmy noteと同じ閾値だが、my note側のコードには触れず1行複製する
  const canGenerateLetter = answeredCategoryCount >= 3;

  return (
    <div className="mx-auto max-w-[600px] px-4 py-12 sm:py-16">
      <span className="inline-flex items-center rounded-full bg-worksheet-accent px-3 py-1 text-xs font-medium text-worksheet-accent-contrast">
        {stepLabel}
      </span>

      <h1 className="mt-4 text-[26px] font-medium leading-snug text-worksheet-primary">
        まずは、あなたの気持ちを整理してみましょう
      </h1>
      <p className="mt-3 text-[16px] leading-[1.7] text-worksheet-secondary">
        正直に、思いつく範囲で大丈夫です。うまく書けなくても、あとからAIと一緒に整理できます。
      </p>
      <p className="mt-2 text-xs text-worksheet-secondary">
        入力内容はこの端末のブラウザに保存されます。
      </p>

      <div className="mt-8 space-y-10">
        {CATEGORIES.map((category) => (
          <div
            key={category.id}
            ref={(el) => {
              categoryRefs.current[category.id] = el;
            }}
          >
            <span className="inline-flex items-center rounded-full border-[0.5px] border-worksheet-border px-3 py-1 text-xs font-medium text-worksheet-secondary">
              {category.title}
            </span>

            <div className="mt-3 space-y-3">
              {category.questions.map((q, i) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  index={i}
                  isOpen={openId === q.id}
                  hasAnswer={isQuestionAnswered(q)}
                  examplesOpen={openExamples[q.id] ?? false}
                  onToggle={() => handleToggle(q.id)}
                  onToggleExamples={() => handleToggleExamples(q.id)}
                  cardRef={(el) => {
                    cardRefs.current[q.id] = el;
                  }}
                  textValue={answers[q.id] ?? ""}
                  onTextChange={(value) => handleChange(q.id, value)}
                  ratingValues={ratings[q.id] ?? {}}
                  onRate={(itemId, value) => handleRate(q.id, itemId, value)}
                  rankOrder={rankings[q.id] ?? []}
                  onToggleRank={(itemId) => handleToggleRank(q.id, itemId)}
                  compromiseSelected={compromises[q.id] ?? []}
                  onToggleCompromise={(itemId) => handleToggleCompromise(q.id, itemId)}
                  singleSelected={singleSelections[q.id] ?? null}
                  onSelectSingle={(optionId) => handleSelectSingle(q.id, optionId)}
                  multiSelected={multiSelections[q.id] ?? []}
                  onToggleMulti={(optionId) => handleToggleMulti(q.id, optionId)}
                />
              ))}
            </div>

            {category.id === "priorities" && (
              <div className="mt-4">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleGenerateAxisSummary}
                    disabled={!canGenerateAxisSummary || axisLoading}
                    className="inline-flex items-center gap-2 rounded-full bg-worksheet-accent px-4 py-2 text-xs font-medium text-worksheet-accent-contrast transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                  >
                    {axisSummary ? "もう一度整理する" : "判断軸を確認する"}
                  </button>
                  {axisLoading && (
                    <span className="text-xs text-worksheet-secondary">整理しています…</span>
                  )}
                </div>

                {!canGenerateAxisSummary && (
                  <p className="mt-2 text-xs text-worksheet-secondary">
                    問2で1つ以上順位をつけると、判断軸を整理できます。
                  </p>
                )}

                {axisError && (
                  <p className="mt-3 text-xs text-red-600 dark:text-red-400">{axisError}</p>
                )}

                {axisSummary && (
                  <div className="mt-4 whitespace-pre-wrap rounded-[20px] border-[0.5px] border-worksheet-border bg-worksheet-surface-2 p-5 text-[16px] leading-[1.75] text-worksheet-primary">
                    {axisSummary}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 flex justify-center">
        <button
          type="button"
          onClick={handleNext}
          className="inline-flex items-center gap-2 rounded-full bg-worksheet-accent px-5 py-3 text-[15px] font-medium text-worksheet-accent-contrast transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
        >
          次へ進む
          <ArrowRightIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-10 border-t border-[0.5px] border-worksheet-border pt-8">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleGenerateMyNote}
            disabled={!canGenerateMyNote || myNoteLoading}
            className="inline-flex items-center gap-2 rounded-full bg-worksheet-accent px-5 py-3 text-[15px] font-medium text-worksheet-accent-contrast transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
          >
            {myNoteResult ? "もう一度作る" : "my noteを作る"}
          </button>
          {myNoteLoading && (
            <span className="text-xs text-worksheet-secondary">作成しています…</span>
          )}
        </div>

        {!canGenerateMyNote && (
          <p className="mt-3 text-center text-xs text-worksheet-secondary">
            3つ以上のカテゴリに入力があると、my noteを作れます。
          </p>
        )}

        {myNoteError && (
          <p className="mt-3 text-center text-xs text-red-600 dark:text-red-400">{myNoteError}</p>
        )}

        {myNoteResult && (
          <div className="mt-4 whitespace-pre-wrap rounded-[20px] border-[0.5px] border-worksheet-border bg-worksheet-surface-2 p-5 text-[16px] leading-[1.75] text-worksheet-primary">
            {myNoteResult}
          </div>
        )}
      </div>

      <div className="mt-10 border-t border-[0.5px] border-worksheet-border pt-8">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleGenerateLetter}
            disabled={!canGenerateLetter || letterLoading}
            className="inline-flex items-center gap-2 rounded-full bg-worksheet-accent px-5 py-3 text-[15px] font-medium text-worksheet-accent-contrast transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
          >
            {letterResult ? "もう一度作る" : "親に見せる資料を作る"}
          </button>
          {letterLoading && (
            <span className="text-xs text-worksheet-secondary">作成しています…</span>
          )}
        </div>

        {!canGenerateLetter && (
          <p className="mt-3 text-center text-xs text-worksheet-secondary">
            3つ以上のカテゴリに入力があると、資料を作れます。
          </p>
        )}

        {letterError && (
          <p className="mt-3 text-center text-xs text-red-600 dark:text-red-400">{letterError}</p>
        )}

        {letterResult && (
          <div className="mt-4 whitespace-pre-wrap rounded-[20px] border-[0.5px] border-worksheet-border bg-worksheet-surface-2 p-5 text-[16px] leading-[1.75] text-worksheet-primary">
            {letterResult}
          </div>
        )}
      </div>
    </div>
  );
}
