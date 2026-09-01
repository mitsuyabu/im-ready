"use client";

import { useState } from "react";
import Link from "next/link";
import { QuestionCard, useWorksheetAnswers } from "@/components/Worksheet";
import { CATEGORIES } from "@/lib/worksheetQuestions";
import { WORKSHEET_SECTION_META } from "@/lib/worksheetSectionMeta";

/**
 * 「I'm ready!」のテーマ詳細画面（presentation のみ）。
 *
 * カテゴリ内の設問を1問ずつ切り替えるのではなく、共有デザインどおり **全設問を縦に並べ**、
 * 最後の設問の下にだけ「次のテーマへ」CTA を置く。回答 state・localStorage 保存・Karte 同期・
 * completion 判定・ルーティングは useWorksheetAnswers（既存ロジック）のまま一切変更していない。
 * 入力は従来どおり1文字ごとに自動保存され、CTA は次カテゴリへの遷移のみで保存処理を持たない。
 * route は /plans/[planId]/worksheet/[sectionId] のままで、設問ごとの URL は作らない。
 */

/* ---------- icons ---------- */

type IconProps = { className?: string };

function ArrowRightIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function CheckIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ChatIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-4 3.5V16H5.5A1.5 1.5 0 0 1 4 14.5Z" />
    </svg>
  );
}

function LightbulbIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8h5c0-.7.4-1.5 1-1.9A6 6 0 0 0 12 3Z" />
    </svg>
  );
}

/* ---------- section color (Worksheet 一覧の各テーマカードと同じ色系。白文字が乗るよう少し濃く) ---------- */

const SECTION_HEADER: Record<string, { bg: string; numeral: string }> = {
  motivation: { bg: "#3f5142", numeral: "rgba(255,255,255,0.18)" },
  future: { bg: "#5f7f99", numeral: "rgba(255,255,255,0.2)" },
  conditions: { bg: "#8a7a5e", numeral: "rgba(255,255,255,0.2)" },
  priorities: { bg: "#2f3b4d", numeral: "rgba(255,255,255,0.16)" },
  anxiety: { bg: "#7c7a75", numeral: "rgba(255,255,255,0.2)" },
  nextstep: { bg: "#c07a63", numeral: "rgba(255,255,255,0.22)" },
};
const NEUTRAL_HEADER = { bg: "#5b5a55", numeral: "rgba(255,255,255,0.18)" };

/** その場の入力（このテーマの freeText 回答）から、機械的に短いチップを切り出す。AI 要約はしない。 */
function deriveWrittenChips(texts: string[]): string[] {
  const out: string[] = [];
  for (const raw of texts) {
    for (const seg of raw.split(/[。、\n！!？?]/).map((s) => s.trim()).filter((s) => s.length >= 5)) {
      if (out.length >= 4) return out;
      const chip = seg.length > 24 ? `${seg.slice(0, 24)}…` : seg;
      if (!out.includes(chip)) out.push(chip);
    }
  }
  return out;
}

export default function WorksheetSectionDetail({
  planId,
  sectionId,
}: {
  planId: string;
  sectionId: string;
}) {
  const category = CATEGORIES.find((c) => c.id === sectionId);
  const categoryIndex = CATEGORIES.findIndex((c) => c.id === sectionId);
  const nextCategory = categoryIndex >= 0 ? CATEGORIES[categoryIndex + 1] ?? null : null;

  const {
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
  } = useWorksheetAnswers(planId);

  const [openExamples, setOpenExamples] = useState<Record<string, boolean>>({});

  // priorities 専用「判断軸を確認する」。ロジックは既存のまま（Worksheet.tsx と同一）。
  const [axisSummary, setAxisSummary] = useState<string | null>(null);
  const [axisLoading, setAxisLoading] = useState(false);
  const [axisError, setAxisError] = useState<string | null>(null);

  if (!category) return null;

  const meta = WORKSHEET_SECTION_META[category.id];
  const theme = SECTION_HEADER[category.id] ?? NEUTRAL_HEADER;
  const total = category.questions.length;
  const answeredCount = category.questions.filter((q) => isQuestionAnswered(q)).length;
  const categoryNum = String(categoryIndex + 1).padStart(2, "0");
  const canGenerateAxisSummary = (rankings["priority-ranking"] ?? []).length > 0;

  const writtenChips = deriveWrittenChips(
    category.questions
      .filter((q) => q.kind === "freeText")
      .map((q) => (answers[q.id] ?? "").trim())
      .filter((t) => t.length > 0),
  );

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

  function toggleExamples(id: string) {
    setOpenExamples((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div>
      {/* ページ上部: ラベル + タイトル（左） / completion（右） */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div>
          <p className="text-sm font-medium tracking-wide text-[#5f7050]">
            {categoryNum} <span className="text-[#b7b1a6]">/</span> {meta.enName}
          </p>
          <h1 className="mt-1.5 text-[34px] font-bold leading-[1.15] tracking-tight text-[#151515] sm:text-[42px]">
            {category.title}
          </h1>
        </div>
        <span className="shrink-0 whitespace-nowrap rounded-full bg-[#eef2e8] px-3 py-1 text-xs font-medium text-[#4b5b3e] sm:mt-2">
          {answeredCount} / {total} 回答済み
        </span>
      </div>

      {/* 自動保存の状態 + AI相談導線（カテゴリ内で1回だけ） */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#8a8578]">
        <span className="inline-flex items-center gap-1.5">
          <CheckIcon className="h-3.5 w-3.5 text-[#5f7050]" />
          {hasRestored && answeredCount > 0 ? "下書き保存済み" : "回答は自動保存されます"}
        </span>
        <Link
          href="/widget"
          className="inline-flex items-center gap-1.5 text-[#3f3a34] transition-colors hover:text-[#111]"
        >
          <ChatIcon className="h-4 w-4 text-[#6f6a64]" />
          AIと話しながら整理する
        </Link>
      </div>

      {/* 2カラム: 左=設問カードの縦並び, 右=sticky サマリー */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8">
        <div className="min-w-0 space-y-8">
          {category.questions.map((q, i) => {
            const num = String(i + 1).padStart(2, "0");
            return (
              <article
                key={q.id}
                className="overflow-hidden rounded-[22px] border border-[#e5dfd6] bg-white shadow-[0_1px_3px_rgba(30,28,24,0.05)]"
              >
                {/* header 帯（縦に並ぶので少しコンパクトに。デザインは維持） */}
                <div
                  className="relative overflow-hidden px-6 py-5 sm:px-7"
                  style={{ backgroundColor: theme.bg }}
                >
                  <svg
                    aria-hidden
                    viewBox="0 0 200 110"
                    preserveAspectRatio="none"
                    className="pointer-events-none absolute right-0 top-0 h-full w-1/2"
                  >
                    <path d="M40 120 C 120 110, 150 35, 210 -10" fill="none" stroke="rgba(255,255,255,0.26)" strokeWidth="1.4" />
                    <circle cx="196" cy="13" r="2.6" fill="rgba(255,255,255,0.45)" />
                  </svg>
                  <div className="relative flex items-center gap-4">
                    <span
                      aria-hidden
                      className="select-none font-serif text-[40px] font-semibold leading-none sm:text-[48px]"
                      style={{ color: theme.numeral }}
                    >
                      {num}
                    </span>
                    <h2 className="text-base font-bold leading-snug text-white sm:text-lg">
                      {q.heading}
                    </h2>
                  </div>
                </div>

                {/* 本文: supplement + 既存の回答UI（記入例トグル・textarea・kind別body） */}
                <div className="px-6 py-6 sm:px-7">
                  <p className="whitespace-pre-line text-sm leading-relaxed text-[#6f6a64]">
                    {q.supplement}
                  </p>
                  <div className="mt-4">
                    <QuestionCard
                      layout="bare"
                      question={q}
                      index={i}
                      isOpen
                      hasAnswer={isQuestionAnswered(q)}
                      examplesOpen={openExamples[q.id] ?? false}
                      onToggle={() => {}}
                      onToggleExamples={() => toggleExamples(q.id)}
                      cardRef={() => {}}
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
                </div>
              </article>
            );
          })}

          {/* priorities 専用「判断軸を確認する」（ロジック不変・全設問の下） */}
          {category.id === "priorities" && (
            <div className="rounded-[18px] border border-[#e5dfd6] bg-white p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleGenerateAxisSummary}
                  disabled={!canGenerateAxisSummary || axisLoading}
                  className="inline-flex items-center gap-2 rounded-full bg-[#161616] px-4 py-2 text-xs font-medium text-white transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                >
                  {axisSummary ? "もう一度整理する" : "判断軸を確認する"}
                </button>
                {axisLoading && <span className="text-xs text-[#8a8578]">整理しています…</span>}
              </div>

              {!canGenerateAxisSummary && (
                <p className="mt-2 text-xs text-[#8a8578]">
                  「特に大事にしたいものを3つ選ぶ」で1つ以上順位をつけると、判断軸を整理できます。
                </p>
              )}

              {axisError && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{axisError}</p>}

              {axisSummary && (
                <div className="mt-4 whitespace-pre-wrap rounded-[16px] border border-[#e5dfd6] bg-[#fcfbf8] p-5 text-sm leading-relaxed text-[#3f3a34]">
                  {axisSummary}
                </div>
              )}
            </div>
          )}

          {/* カテゴリ最下部の CTA（最後の設問の下だけ）。遷移のみ・保存処理は持たない */}
          <div className="pt-1">
            <Link
              href={nextCategory ? `/plans/${planId}/worksheet/${nextCategory.id}` : `/plans/${planId}/worksheet`}
              className="inline-flex items-center gap-2 rounded-full bg-[#161616] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#000]"
            >
              {nextCategory ? "次のテーマへ" : "Worksheetを終える"}
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* 右サマリーカード（カテゴリ内すべての回答から機械的に抽出） */}
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <div className="rounded-[18px] border border-[#e5dfd6] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eef2e8]">
                <LightbulbIcon className="h-4 w-4 text-[#5f7050]" />
              </span>
              <p className="text-[15px] font-semibold text-[#1c1c1c]">このテーマで見えてきたこと</p>
            </div>

            <div className="mt-3 border-t border-[#e5dfd6]" />

            {writtenChips.length > 0 ? (
              <>
                <p className="mt-3 text-xs font-medium text-[#8a8578]">あなたが書いたこと</p>
                <ul className="mt-2 flex flex-col gap-2">
                  {writtenChips.map((chip) => (
                    <li
                      key={chip}
                      className="rounded-lg bg-[#eef2e8] px-3 py-1.5 text-[13px] leading-snug text-[#3f3a34]"
                    >
                      {chip}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-3 text-[13px] leading-6 text-[#8a8578]">
                書き進めると、ここにあなたの言葉が整理されていきます。
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
