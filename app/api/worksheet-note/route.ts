import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODEL } from "@/lib/anthropic";
import { stripMarkdownBold } from "@/lib/markdown";
import { PRIORITY_ITEMS, COMPROMISE_NONE_ID } from "@/lib/worksheetPriorities";
import { READINESS_OPTIONS, NEXT_TOPICS } from "@/lib/worksheetNextStep";
import {
  buildWorksheetNoteSystemPrompt,
  type WorksheetNoteFreeTextCategory,
  type WorksheetNotePriorities,
  type WorksheetNoteNextStep,
} from "@/lib/worksheetNotePrompt";

// 優先順位カテゴリと同じ発想の id 検証。/api/worksheet-summary の実装とは独立させ、
// あちらのコードには触れない（小さな重複を許容する）。
const VALID_PRIORITY_ITEM_IDS = new Set(PRIORITY_ITEMS.map((item) => item.id));
const VALID_RATING_VALUES = new Set([1, 2, 3, 4, 5]);
const VALID_READINESS_IDS = new Set(READINESS_OPTIONS.map((option) => option.id));
const VALID_TOPIC_IDS = new Set(NEXT_TOPICS.map((option) => option.id));

function priorityLabelOf(itemId: string): string {
  return PRIORITY_ITEMS.find((item) => item.id === itemId)?.label ?? itemId;
}

function readinessLabelOf(optionId: string): string {
  return READINESS_OPTIONS.find((option) => option.id === optionId)?.label ?? optionId;
}

function topicLabelOf(optionId: string): string {
  return NEXT_TOPICS.find((option) => option.id === optionId)?.label ?? optionId;
}

function sanitizeRatings(value: unknown): Record<string, 1 | 2 | 3 | 4 | 5> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, 1 | 2 | 3 | 4 | 5> = {};
  for (const [itemId, rating] of Object.entries(value as Record<string, unknown>)) {
    if (
      VALID_PRIORITY_ITEM_IDS.has(itemId) &&
      typeof rating === "number" &&
      VALID_RATING_VALUES.has(rating)
    ) {
      result[itemId] = rating as 1 | 2 | 3 | 4 | 5;
    }
  }
  return result;
}

function sanitizePriorityIdList(value: unknown, allowNone: boolean): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string" || seen.has(raw)) continue;
    if (VALID_PRIORITY_ITEM_IDS.has(raw) || (allowNone && raw === COMPROMISE_NONE_ID)) {
      seen.add(raw);
      result.push(raw);
    }
  }
  return result;
}

function sanitizeTopicIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of value) {
    if (typeof raw === "string" && VALID_TOPIC_IDS.has(raw) && !seen.has(raw)) {
      seen.add(raw);
      result.push(raw);
    }
  }
  return result;
}

/**
 * 自由記述部分は id カタログを持たないため（案B）、文字列・長さの軽いバリデーションのみ行う。
 * 不正な形のエントリ・カテゴリは黙って除外する（フェイルソフト）。
 */
function sanitizeFreeTextByCategory(value: unknown): WorksheetNoteFreeTextCategory[] {
  if (!Array.isArray(value)) return [];
  const result: WorksheetNoteFreeTextCategory[] = [];
  for (const rawCategory of value.slice(0, 10)) {
    if (!rawCategory || typeof rawCategory !== "object") continue;
    const { categoryTitle, entries } = rawCategory as Record<string, unknown>;
    if (typeof categoryTitle !== "string" || categoryTitle.trim().length === 0) continue;
    if (categoryTitle.length > 50 || !Array.isArray(entries)) continue;

    const cleanedEntries: { heading: string; text: string }[] = [];
    for (const rawEntry of entries.slice(0, 20)) {
      if (!rawEntry || typeof rawEntry !== "object") continue;
      const { heading, text } = rawEntry as Record<string, unknown>;
      if (typeof heading !== "string" || typeof text !== "string") continue;
      const trimmedHeading = heading.trim();
      const trimmedText = text.trim();
      if (!trimmedHeading || !trimmedText) continue;
      if (trimmedHeading.length > 200 || trimmedText.length > 3000) continue;
      cleanedEntries.push({ heading: trimmedHeading, text: trimmedText });
    }

    if (cleanedEntries.length > 0) {
      result.push({ categoryTitle: categoryTitle.trim(), entries: cleanedEntries });
    }
  }
  return result;
}

/**
 * ワークシート全6カテゴリの回答を統合し、5部構成の「my note」を生成する単発エンドポイント。
 * 既存の /api/worksheet-summary（優先順位専用）・優先順位カテゴリの入力・チャット・提案・
 * カルテ・localStorage保存には一切依存しない、独立した機能。結果はその場表示のみで保存しない。
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "リクエストの形式が不正です" }, { status: 400 });
  }

  const raw = (body ?? {}) as {
    freeTextByCategory?: unknown;
    priorities?: unknown;
    nextStep?: unknown;
  };

  const freeTextByCategory = sanitizeFreeTextByCategory(raw.freeTextByCategory);

  const rawPriorities = (raw.priorities ?? {}) as {
    ratings?: unknown;
    rankings?: unknown;
    compromises?: unknown;
  };
  const ratings = sanitizeRatings(rawPriorities.ratings);
  const rankings = sanitizePriorityIdList(rawPriorities.rankings, false);
  const compromises = sanitizePriorityIdList(rawPriorities.compromises, true);
  const hasPriorities = Object.keys(ratings).length > 0 || rankings.length > 0 || compromises.length > 0;

  const priorities: WorksheetNotePriorities | null = hasPriorities
    ? {
        ratings: Object.entries(ratings).map(([itemId, value]) => ({
          label: priorityLabelOf(itemId),
          value,
        })),
        rankings: rankings.map((itemId, i) => ({ rank: i + 1, label: priorityLabelOf(itemId) })),
        compromises: compromises.includes(COMPROMISE_NONE_ID)
          ? ({ none: true } as const)
          : ({ none: false, items: compromises.map(priorityLabelOf) } as const),
      }
    : null;

  const rawNextStep = (raw.nextStep ?? {}) as { readiness?: unknown; topics?: unknown };
  const readinessId =
    typeof rawNextStep.readiness === "string" && VALID_READINESS_IDS.has(rawNextStep.readiness)
      ? rawNextStep.readiness
      : null;
  const topics = sanitizeTopicIdList(rawNextStep.topics);
  const hasNextStep = readinessId !== null || topics.length > 0;

  const nextStep: WorksheetNoteNextStep | null = hasNextStep
    ? {
        readiness: readinessId ? readinessLabelOf(readinessId) : null,
        topics: topics.map(topicLabelOf),
      }
    : null;

  if (freeTextByCategory.length === 0 && !priorities && !nextStep) {
    return Response.json({ error: "回答が1件もありません" }, { status: 400 });
  }

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: buildWorksheetNoteSystemPrompt({ freeTextByCategory, priorities, nextStep }),
      messages: [
        {
          role: "user",
          content: "上記のデータを踏まえ、my noteを5部構成で書いてください。",
        },
      ],
    });

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );
    const note = textBlock ? stripMarkdownBold(textBlock.text.trim()) : "";

    if (!note) {
      return Response.json({ error: "my noteを生成できませんでした" }, { status: 502 });
    }

    return Response.json({ note });
  } catch (err) {
    const isApiError = err instanceof Anthropic.APIError;
    console.error("worksheet note error:", isApiError ? err.message : err);
    return Response.json(
      {
        error: isApiError
          ? "AIサービスへの接続でエラーが発生しました。しばらくしてから再度お試しください。"
          : "予期しないエラーが発生しました。",
      },
      { status: isApiError && err.status ? err.status : 500 },
    );
  }
}
