"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PRIORITY_ITEMS, COMPROMISE_NONE_ID, type PriorityItem } from "@/lib/worksheetPriorities";
import { READINESS_OPTIONS, NEXT_TOPICS, type ChoiceOption } from "@/lib/worksheetNextStep";
import {
  loadWorksheetState,
  saveWorksheetState,
  sanitizeWorksheetState,
  type WorksheetPersistedData,
} from "@/lib/worksheetStorage";
import { deriveWorksheetKartePatch } from "@/lib/worksheetKarte";
import { kartePatchToFieldPatches } from "@/lib/karte";
import { applyKartePatch } from "@/lib/planChat";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, ALL_QUESTIONS, type Question, type Category } from "@/lib/worksheetQuestions";

const KARTE_SYNC_DEBOUNCE_MS = 1500;

function findCategoryOf(questionId: string): Category | undefined {
  return CATEGORIES.find((category) => category.questions.some((q) => q.id === questionId));
}

/**
 * 回答state・localStorage復元/保存・Karte同期(debounce)をまとめたhook。
 * 元はWorksheetコンポーネント内に直接書かれていたロジックをそのまま移しただけで、挙動は変えていない。
 * 匿名Worksheet（Worksheetコンポーネント本体）と、Plan側のI'm ready!セクション詳細画面
 * （components/WorksheetSectionDetail.tsx）の両方から同じ状態管理を再利用するために独立させている。
 */
export function useWorksheetAnswers(planId?: string) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [ratings, setRatings] = useState<Record<string, Record<string, 1 | 2 | 3 | 4 | 5>>>({});
  const [rankings, setRankings] = useState<Record<string, string[]>>({});
  const [compromises, setCompromises] = useState<Record<string, string[]>>({});
  const [singleSelections, setSingleSelections] = useState<Record<string, string>>({});
  const [multiSelections, setMultiSelections] = useState<Record<string, string[]>>({});
  const [hasRestored, setHasRestored] = useState(false);

  // マウント後（クライアント側でのみ）localStorageから復元する。SSRとの初回レンダーを
  // 一致させるため、useStateの初期値は空のままにし、復元はここで1回だけ行う。
  // localStorageというReact外部のシステムからの初期化であり、他に起点となるイベントが
  // 存在しないため、effect内でのsetState呼び出しが正しい手段（差分の派生ではない）。
  useEffect(() => {
    const stored = loadWorksheetState(planId);
    if (stored) {
      const sanitized = sanitizeWorksheetState(stored, {
        questionIds: new Set(ALL_QUESTIONS.map((entry) => entry.question.id)),
        priorityItemIds: new Set(PRIORITY_ITEMS.map((item) => item.id)),
        compromiseNoneId: COMPROMISE_NONE_ID,
        readinessOptionIds: new Set(READINESS_OPTIONS.map((option) => option.id)),
        topicOptionIds: new Set(NEXT_TOPICS.map((option) => option.id)),
      });
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAnswers(sanitized.answers);
      setRatings(sanitized.ratings);
      setRankings(sanitized.rankings);
      setCompromises(sanitized.compromises);
      setSingleSelections(sanitized.singleSelections);
      setMultiSelections(sanitized.multiSelections);
    }
    setHasRestored(true);
  }, [planId]);

  // 復元より前に保存が走ると、空の初期stateでlocalStorageを上書きしてしまうため、
  // 復元が完了する（hasRestoredがtrueになる）まで保存しない。
  useEffect(() => {
    if (!hasRestored) return;
    saveWorksheetState(
      { answers, ratings, rankings, compromises, singleSelections, multiSelections },
      planId,
    );
  }, [hasRestored, answers, ratings, rankings, compromises, singleSelections, multiSelections, planId]);

  const karteSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedFieldPatchesJsonRef = useRef<string | null>(null);

  /**
   * planId指定時のみ、確定済みのdeterministic項目（5〜6件）をKarteへ同期する。
   * 1文字ごとに発火するlocalStorage保存とは独立し、1.5秒のdebounceを挟む。
   * unmount時の送信保証は行わない（保証できないため）。前回送信した内容と同一なら送信しない。
   */
  useEffect(() => {
    if (!hasRestored || !planId) return;

    if (karteSyncTimerRef.current) clearTimeout(karteSyncTimerRef.current);
    karteSyncTimerRef.current = setTimeout(() => {
      const data: WorksheetPersistedData = {
        answers,
        ratings,
        rankings,
        compromises,
        singleSelections,
        multiSelections,
      };
      const patch = deriveWorksheetKartePatch(data);
      const fieldPatches = kartePatchToFieldPatches(patch, "worksheet");
      if (fieldPatches.length === 0) return;

      const json = JSON.stringify(fieldPatches);
      if (json === lastSyncedFieldPatchesJsonRef.current) return;

      void applyKartePatch(createClient(), planId, { fieldPatches }).then((result) => {
        if (result) lastSyncedFieldPatchesJsonRef.current = json;
      });
    }, KARTE_SYNC_DEBOUNCE_MS);

    return () => {
      if (karteSyncTimerRef.current) clearTimeout(karteSyncTimerRef.current);
    };
  }, [hasRestored, planId, answers, ratings, rankings, compromises, singleSelections, multiSelections]);

  /**
   * 「回答済み」判定はkindごとに異なる（オーナー承認済みの基準）:
   * - rating: 1項目でも評価すれば回答済み（全項目必須にしない）
   * - ranking: 1つ（1位）でも選べば回答済み（UI上は3つ選ぶよう促す）
   * - compromise: 0件も正当な回答だが、「特にない」を明示選択した場合のみ回答済みにする
   *   （未選択のまま=未回答、と区別する）
   */
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
        return (singleSelections[question.id] ?? null) !== null;
      case "multiSelect":
        return (multiSelections[question.id] ?? []).length > 0;
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
            <p className="text-sm text-worksheet-primary">{item.label}</p>
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
function SingleSelectBody({
  options,
  selected,
  onSelect,
}: {
  options: ChoiceOption[];
  selected: string | null;
  onSelect: (optionId: string) => void;
}) {
  return (
    <div className="mt-4 flex flex-col gap-2">
      {options.map((option) => {
        const isSelected = selected === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onSelect(option.id)}
            aria-pressed={isSelected}
            className={
              isSelected
                ? "rounded-xl bg-worksheet-accent px-4 py-2.5 text-left text-sm font-medium text-worksheet-accent-contrast transition-colors duration-150"
                : "rounded-xl border-[0.5px] border-worksheet-border bg-worksheet-surface px-4 py-2.5 text-left text-sm text-worksheet-primary transition-colors duration-150 hover:bg-worksheet-border/50"
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
}: {
  options: ChoiceOption[];
  selected: string[];
  onToggle: (optionId: string) => void;
}) {
  return (
    <div className="mt-4 flex flex-col gap-2">
      {options.map((option) => {
        const isSelected = selected.includes(option.id);
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onToggle(option.id)}
            aria-pressed={isSelected}
            className={
              isSelected
                ? "rounded-xl bg-worksheet-accent px-4 py-2.5 text-left text-sm font-medium text-worksheet-accent-contrast transition-colors duration-150"
                : "rounded-xl border-[0.5px] border-worksheet-border bg-worksheet-surface px-4 py-2.5 text-left text-sm text-worksheet-primary transition-colors duration-150 hover:bg-worksheet-border/50"
            }
          >
            {option.label}
          </button>
        );
      })}
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
                  className="rounded-xl border-[0.5px] border-worksheet-border bg-worksheet-surface px-3 py-1.5 text-xs leading-relaxed text-worksheet-secondary"
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
            className="mt-4 w-full resize-y rounded-xl border-[0.5px] border-worksheet-border bg-worksheet-surface px-3 py-2 text-sm leading-relaxed text-worksheet-primary transition-shadow focus:border-worksheet-sage-hover focus:outline-none focus:ring-2 focus:ring-worksheet-sage-hover/50"
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
        <SingleSelectBody
          options={question.options}
          selected={singleSelected}
          onSelect={onSelectSingle}
        />
      )}

      {question.kind === "multiSelect" && (
        <MultiSelectBody
          options={question.options}
          selected={multiSelected}
          onToggle={onToggleMulti}
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
        <p className="mt-2 text-sm leading-relaxed text-worksheet-secondary">{question.supplement}</p>
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
        <span className="flex-1 text-sm font-medium text-worksheet-primary">
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
          <p className="text-sm leading-relaxed text-worksheet-secondary">
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

  /** その問いが自由記述で、答えがあるものだけをカテゴリごとにまとめる（案B: サーバーにはid照合させない） */
  function buildFreeTextByCategory() {
    const result: { categoryTitle: string; entries: { heading: string; text: string }[] }[] = [];
    for (const category of CATEGORIES) {
      const entries: { heading: string; text: string }[] = [];
      for (const q of category.questions) {
        if (q.kind !== "freeText") continue;
        const text = (answers[q.id] ?? "").trim();
        if (text) entries.push({ heading: q.heading, text });
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
      <p className="mt-3 text-sm leading-relaxed text-worksheet-secondary">
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
                  <div className="mt-4 whitespace-pre-wrap rounded-[20px] border-[0.5px] border-worksheet-border bg-worksheet-surface-2 p-5 text-sm leading-relaxed text-worksheet-primary">
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
          className="inline-flex items-center gap-2 rounded-full bg-worksheet-accent px-5 py-3 text-sm font-medium text-worksheet-accent-contrast transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
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
            className="inline-flex items-center gap-2 rounded-full bg-worksheet-accent px-5 py-3 text-sm font-medium text-worksheet-accent-contrast transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
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
          <div className="mt-4 whitespace-pre-wrap rounded-[20px] border-[0.5px] border-worksheet-border bg-worksheet-surface-2 p-5 text-sm leading-relaxed text-worksheet-primary">
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
            className="inline-flex items-center gap-2 rounded-full bg-worksheet-accent px-5 py-3 text-sm font-medium text-worksheet-accent-contrast transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
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
          <div className="mt-4 whitespace-pre-wrap rounded-[20px] border-[0.5px] border-worksheet-border bg-worksheet-surface-2 p-5 text-sm leading-relaxed text-worksheet-primary">
            {letterResult}
          </div>
        )}
      </div>
    </div>
  );
}
