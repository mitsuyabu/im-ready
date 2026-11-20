"use client";

import { useState } from "react";
import Link from "next/link";
import { QuestionCard, QuestionExamples, useWorksheetAnswers } from "@/components/Worksheet";
import { CATEGORIES } from "@/lib/worksheetQuestions";
import { WORKSHEET_SECTION_META } from "@/lib/worksheetSectionMeta";
import type { Karte } from "@/lib/karte";
import {
  buildWorksheetKarteCandidates,
  type WorksheetKarteCandidate,
} from "@/lib/worksheetKarteCandidates";
import PlanContextLabel from "@/components/PlanContextLabel";
import type { LoadedPlanWorksheet } from "@/lib/planWorksheet";

/**
 * 「I'm ready!」のテーマ詳細画面（presentation のみ）。
 *
 * カテゴリ内の設問を1問ずつ切り替えるのではなく、共有デザインどおり **全設問を縦に並べ**、
 * 最後の設問の下にだけ「次のテーマへ」CTA を置く。
 *
 * 設問ごとの表示は「質問」と「回答」を別カードに分けた 4 層構成（C案）:
 *   ① 質問カード（深緑ヘッダー・装飾番号・質問文 / 補足説明 / 記入例）
 *   ② 回答カードの「回答の要点」（**正式な生成・保存の仕組みが入るまで非表示**。
 *      SHOW_ANSWER_SUMMARY を true に戻すだけで再表示できる形でマークアップだけ残している）
 *   ③ 回答カードの「回答全文」（既存の回答UI = QuestionCard の answerBody をそのまま使う）
 *   ④ 回答カードの「AIと整理する」（既存の /widget 導線と同じ action）
 *
 * 回答 state・localStorage 保存・Karte 同期・completion 判定・ルーティングは
 * useWorksheetAnswers（既存ロジック）のまま一切変更していない。
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

/** 回答カードの見出しに添える鉛筆（components/EditablePlanTitle.tsx と同じ形）。 */
function PencilIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
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

/**
 * 「回答の要点」ブロックを表示するか。
 *
 * 要点を**生成・保存する正式な仕組みがまだ無い**ため、現時点では表示しない
 * （空の状態だけを出す意味が薄い）。回答本文からクライアント側で要約を作ることはしないので、
 * 正式な要点データが入ったときに true へ戻すだけで再表示できるよう、ブロックは残してある。
 */
const SHOW_ANSWER_SUMMARY: boolean = false;

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

/* ---------- AI相談からの回答候補カード（§9 / §16） ----------
 * My Plan の「Karteからの候補」と近い思想だが別 UI。warm ivory / dusty-blue の控えめな見た目で、
 * 「AIが回答した」ではなく「AI相談で話した内容が、この設問に使える」ことを伝える。light-only。 */
function CandidateCard({
  text,
  onAdopt,
}: {
  text: string;
  onAdopt: () => void;
}) {
  return (
    <div className="mt-3 rounded-[14px] border border-dashed border-[#c7d3dd] bg-[#f3f6f8] p-3.5">
      <p className="text-[11px] font-semibold tracking-wide text-[#5a7186]">AI相談からの候補</p>
      <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-[#3f3a34]">{text}</p>
      <button
        type="button"
        onClick={onAdopt}
        className="mt-2.5 inline-flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-full bg-[#3f5a72] px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-[#334a5e] sm:w-auto"
      >
        この内容を使う
      </button>
    </div>
  );
}

export default function WorksheetSectionDetail({
  planId,
  sectionId,
  karte,
  planTitle,
  serverWorksheet,
}: {
  planId: string;
  sectionId: string;
  /** その Plan の Worksheet 回答（server 取得の plan_worksheet）。回答の正本。未適用・失敗時は available=false。 */
  serverWorksheet?: LoadedPlanWorksheet;
  /** いま見ている Plan 名（ページタイトル上の小さなコンテキスト表示に使う）。 */
  planTitle: string;
  /** その Plan の Karte（server 取得・normalizeKarte 済み）。AI相談からの回答候補の生成にだけ使う。 */
  karte: Karte | null;
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
    saveStatus,
    isQuestionAnswered,
    handleChange,
    handleRate,
    handleToggleRank,
    handleToggleCompromise,
    handleSelectSingle,
    handleToggleMulti,
  } = useWorksheetAnswers(planId, karte, serverWorksheet);

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

  // 自由記述に加え、選択式に添えた自由記入欄（現実条件）も「書いたこと」として拾う。
  const writtenChips = deriveWrittenChips(
    category.questions
      .filter(
        (q) =>
          q.kind === "freeText" ||
          ((q.kind === "singleSelect" || q.kind === "multiSelect") && q.freeText != null),
      )
      .map((q) => (answers[q.id] ?? "").trim())
      .filter((t) => t.length > 0),
  );

  // AI相談からの回答候補（deterministic・現在の回答 state で毎回再計算 → 採用や手入力で即消える）。
  const candidateByQuestionId = new Map(
    buildWorksheetKarteCandidates(karte, {
      answers,
      ratings,
      rankings,
      compromises,
      singleSelections,
      multiSelections,
    }).map((c) => [c.questionId, c]),
  );

  /**
   * 「この内容を使う」。候補専用の保存経路は作らず、通常の回答操作と同じ handler に流す
   * （localStorage 保存・progress・Karte 同期・completion 判定がすべて通常回答と同じに動く）。
   * 複数選択は「追加」だけ行い、既に選ばれている選択肢をトグルで外さない。
   */
  function adoptCandidate(candidate: WorksheetKarteCandidate) {
    const { questionId, adoption } = candidate;
    if (adoption.kind === "text") {
      handleChange(questionId, adoption.value);
    } else if (adoption.kind === "singleOption") {
      if (singleSelections[questionId] !== adoption.optionId) {
        handleSelectSingle(questionId, adoption.optionId);
      }
    } else {
      const current = multiSelections[questionId] ?? [];
      for (const optionId of adoption.optionIds) {
        if (!current.includes(optionId)) handleToggleMulti(questionId, optionId);
      }
    }
  }

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
          <PlanContextLabel planTitle={planTitle} />
          <p className="text-sm font-medium tracking-wide text-[#5f7050]">
            {categoryNum} <span className="text-[#b7b1a6]">/</span> {meta.enName}
          </p>
          <h1 className="mt-1.5 text-[27px] font-bold leading-[1.2] tracking-tight text-[#151515] sm:text-[42px]">
            {category.title}
          </h1>
        </div>
        <span className="shrink-0 whitespace-nowrap rounded-full bg-[#eef2e8] px-3 py-1 text-[13px] font-medium text-[#4b5b3e] sm:mt-2">
          {answeredCount} / {total} 回答済み
        </span>
      </div>

      {/* 自動保存の状態 + AI相談導線（カテゴリ内で1回だけ） */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#8a8578]">
        <span className="inline-flex items-center gap-1.5">
          <CheckIcon className="h-3.5 w-3.5 text-[#5f7050]" />
          {saveStatus === "saving"
            ? "保存中…"
            : hasRestored && answeredCount > 0
              ? "保存済み"
              : "回答は自動保存されます"}
        </span>
        {saveStatus === "error" && (
          <span className="text-[#9a5b4a]" role="status">
            保存できませんでした。この端末には残っているので、自動でもう一度保存します。
          </span>
        )}
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
        <div className="min-w-0 space-y-6 sm:space-y-8">
          {category.questions.map((q, i) => {
            const num = String(i + 1).padStart(2, "0");
            const answered = isQuestionAnswered(q);
            const candidate = candidateByQuestionId.get(q.id);
            // 自由記述（選択式に添えた記入欄も含む）のときだけ「回答全文」の見出しを出す。
            // rating / ranking などは UI 自体が答え方を示しているため、見出しを足さない。
            const hasWrittenAnswer =
              q.kind === "freeText" ||
              ((q.kind === "singleSelect" || q.kind === "multiSelect") && q.freeText != null);
            return (
              <div key={q.id} className="space-y-3 sm:space-y-4">
              {/* ① 質問（深緑カード。質問であることが一目で分かるようにする） */}
              <article
                className="overflow-hidden rounded-[22px] border border-[#e5dfd6] bg-white shadow-[0_1px_3px_rgba(30,28,24,0.05)]"
              >
                {/* header 帯（縦に並ぶので少しコンパクトに。デザインは維持） */}
                <div
                  className="relative overflow-hidden px-5 py-4 sm:px-7 sm:py-5"
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
                      className="select-none font-serif text-[30px] font-semibold leading-none sm:text-[48px]"
                      style={{ color: theme.numeral }}
                    >
                      {num}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold tracking-wide text-white/70">質問</p>
                      <h2 className="mt-0.5 text-[18px] font-bold leading-snug text-white sm:text-xl">
                        {q.heading}
                      </h2>
                    </div>
                  </div>
                </div>

                {/* 質問の補足説明 ＋ 記入例（記入例は「質問の補足情報」なので回答カードには入れない） */}
                <div className="px-5 py-5 sm:px-7 sm:py-6">
                  <p className="whitespace-pre-line text-[17px] leading-[1.75] text-[#6f6a64]">
                    {q.supplement}
                  </p>
                  {q.kind === "freeText" && (
                    <QuestionExamples
                      examples={q.examples}
                      open={openExamples[q.id] ?? false}
                      onToggle={() => toggleExamples(q.id)}
                    />
                  )}
                </div>
              </article>

              {/* ②③④ 回答カード（質問とは別の視覚ブロック。白系・同じ角丸と枠） */}
              <section className="overflow-hidden rounded-[22px] border border-[#e5dfd6] bg-white shadow-[0_1px_3px_rgba(30,28,24,0.05)]">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-[#efeae1] px-5 py-3.5 sm:px-7">
                  <p className="inline-flex items-center gap-2 text-[14px] font-semibold text-[#1c1c1c]">
                    <PencilIcon className="h-4 w-4 text-[#5f7050]" />
                    あなたの回答
                  </p>
                  {/* 既存の AI 相談導線（/widget）と同じ action・同じ route。新しい API は作らない。 */}
                  <Link
                    href="/widget"
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#eef2e8] px-3 py-1.5 text-xs font-medium text-[#4b5b3e] transition-colors hover:bg-[#e3ead9]"
                  >
                    <ChatIcon className="h-3.5 w-3.5" />
                    AIと整理する
                  </Link>
                </div>

                <div className="px-5 py-5 sm:px-7 sm:py-6">
                  {/* ② 回答の要点。**この回答から要点を生成する仕組みはまだ無い**ため、
                      既存データから出せる値が無い状態では文章を作らず、空の状態だけを示す
                      （回答本文からクライアント側で要約を作ることはしない）。 */}
                  {SHOW_ANSWER_SUMMARY && answered && (
                    <div className="rounded-[14px] bg-[#f3f6ef] px-4 py-3">
                      <p className="text-[11px] font-semibold tracking-wide text-[#5f7050]">回答の要点</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-[#8a8578]">
                        回答を整理すると、ここに要点が表示されます。
                      </p>
                    </div>
                  )}

                  {/* ③ 回答全文（既存の回答UI。1文字ごとの自動保存をそのまま使う） */}
                  <div className={SHOW_ANSWER_SUMMARY && answered ? "mt-4" : ""}>
                    {hasWrittenAnswer && (
                      <p className="text-[11px] font-semibold tracking-wide text-[#8a8578]">回答全文</p>
                    )}
                    <QuestionCard
                      layout="bare"
                      showExamples={false}
                      question={q}
                      index={i}
                      isOpen
                      hasAnswer={answered}
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

                  {/* AI相談からの回答候補（既存機能。採用経路・保存経路は変更なし） */}
                  {candidate && (
                    <CandidateCard
                      text={candidate.displayText}
                      onAdopt={() => adoptCandidate(candidate)}
                    />
                  )}
                </div>
              </section>
              </div>
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

              {axisError && <p className="mt-3 text-xs text-red-600">{axisError}</p>}

              {axisSummary && (
                <div className="mt-4 whitespace-pre-wrap rounded-[16px] border border-[#e5dfd6] bg-[#fcfbf8] p-5 text-[16px] leading-[1.75] text-[#3f3a34]">
                  {axisSummary}
                </div>
              )}
            </div>
          )}

        </div>

        {/* 右サマリーカード（カテゴリ内すべての回答から機械的に抽出）。
            mobile は設問群 → このカード → CTA の順。desktop は左カラム下に CTA・右に sticky サマリー。 */}
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

        {/* カテゴリ最下部の CTA（遷移のみ・保存処理なし）。3 つめの grid child なので
            mobile はサマリーの後、desktop は左カラム(col 1)の下段に入る。 */}
        <div className="lg:col-start-1">
          <Link
            href={nextCategory ? `/plans/${planId}/worksheet/${nextCategory.id}` : `/plans/${planId}/worksheet`}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-[#161616] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#000] sm:w-auto"
          >
            {nextCategory ? "次のテーマへ" : "Worksheetを終える"}
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
