"use client";

import { useRef, useState } from "react";
import { QuestionCard, useWorksheetAnswers } from "@/components/Worksheet";
import { CATEGORIES } from "@/lib/worksheetQuestions";
import { WORKSHEET_SECTION_META } from "@/lib/worksheetSectionMeta";

/**
 * 「I'm ready!」のテーマ詳細画面。指定されたsectionId（=category.id）の質問だけを、
 * 1つの連続したワークエリアとして縦に並べて表示する（QuestionCardのlayout="inline"）。
 * 個々の設問はもう独立したアコーディオンカードとしては開閉せず、常に全問展開表示。
 * 回答state・localStorage保存・Karte同期はuseWorksheetAnswers（Worksheet.tsxから抽出した
 * 既存ロジック）をそのまま使うため、schema・保存形式・同期ロジックには一切触れていない。
 */
export default function WorksheetSectionDetail({
  planId,
  sectionId,
}: {
  planId: string;
  sectionId: string;
}) {
  const category = CATEGORIES.find((c) => c.id === sectionId);

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

  const [openExamples, setOpenExamples] = useState<Record<string, boolean>>({});
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // 既存Worksheet.tsxの「判断軸を確認する」と同じロジック（priorities専用）。
  // ロジック自体はcomponents/Worksheet.tsx内の実装と同一で、priorities向けにここへも複製している
  // （priorities以外では使わない小さな機能のため、共有hook化はしていない）。
  const [axisSummary, setAxisSummary] = useState<string | null>(null);
  const [axisLoading, setAxisLoading] = useState(false);
  const [axisError, setAxisError] = useState<string | null>(null);

  if (!category) return null;

  const meta = WORKSHEET_SECTION_META[category.id];
  const answeredCount = category.questions.filter((q) => isQuestionAnswered(q)).length;
  const canGenerateAxisSummary = (rankings["priority-ranking"] ?? []).length > 0;

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

  function handleToggleExamples(id: string) {
    setOpenExamples((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div>
      <span className="inline-flex items-center rounded-full bg-worksheet-sage px-3 py-1 text-xs font-medium text-worksheet-primary">
        {answeredCount} / {category.questions.length} 回答済み
      </span>

      <h1 className="mt-4 text-[26px] font-medium leading-snug text-worksheet-primary">
        {meta.enName}
      </h1>
      <p className="mt-1 text-sm text-worksheet-secondary">{category.title}</p>

      {/* 連続したワークエリア: 個々の設問はカード化せず、divide-yの区切り線と余白だけで区切る */}
      <div className="mx-auto mt-10 max-w-2xl divide-y divide-worksheet-border">
        {category.questions.map((q, i) => (
          <div key={q.id} className="py-8 first:pt-0 last:pb-0">
            <QuestionCard
              layout="inline"
              stepLabel={`${i + 1} / ${category.questions.length}`}
              question={q}
              index={i}
              isOpen
              hasAnswer={isQuestionAnswered(q)}
              examplesOpen={openExamples[q.id] ?? false}
              onToggle={() => {}}
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
          </div>
        ))}
      </div>

      {category.id === "priorities" && (
        <div className="mx-auto mt-8 max-w-2xl border-t border-[0.5px] border-worksheet-border pt-8">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleGenerateAxisSummary}
              disabled={!canGenerateAxisSummary || axisLoading}
              className="inline-flex items-center gap-2 rounded-full bg-worksheet-accent px-4 py-2 text-xs font-medium text-worksheet-accent-contrast transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
            >
              {axisSummary ? "もう一度整理する" : "判断軸を確認する"}
            </button>
            {axisLoading && <span className="text-xs text-worksheet-secondary">整理しています…</span>}
          </div>

          {!canGenerateAxisSummary && (
            <p className="mt-2 text-xs text-worksheet-secondary">
              「特に大事にしたいものを3つ選ぶ」で1つ以上順位をつけると、判断軸を整理できます。
            </p>
          )}

          {axisError && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{axisError}</p>}

          {axisSummary && (
            <div className="mt-4 whitespace-pre-wrap rounded-[20px] border-[0.5px] border-worksheet-border bg-worksheet-surface-2 p-5 text-sm leading-relaxed text-worksheet-primary">
              {axisSummary}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
