import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODEL } from "@/lib/anthropic";
import { stripMarkdownBold } from "@/lib/markdown";
import { PRIORITY_ITEMS, COMPROMISE_NONE_ID } from "@/lib/worksheetPriorities";
import { buildWorksheetSummarySystemPrompt } from "@/lib/worksheetSummaryPrompt";

const VALID_ITEM_IDS = new Set(PRIORITY_ITEMS.map((item) => item.id));
const VALID_RATING_VALUES = new Set([1, 2, 3, 4, 5]);

function sanitizeRatings(value: unknown): Record<string, 1 | 2 | 3 | 4 | 5> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, 1 | 2 | 3 | 4 | 5> = {};
  for (const [itemId, rating] of Object.entries(value as Record<string, unknown>)) {
    if (VALID_ITEM_IDS.has(itemId) && typeof rating === "number" && VALID_RATING_VALUES.has(rating)) {
      result[itemId] = rating as 1 | 2 | 3 | 4 | 5;
    }
  }
  return result;
}

/** 不正なidは黙って弾く（フェイルソフト。存在しないitemId・重複は無視する） */
function sanitizeIdList(value: unknown, allowNone: boolean): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string" || seen.has(raw)) continue;
    if (VALID_ITEM_IDS.has(raw) || (allowNone && raw === COMPROMISE_NONE_ID)) {
      seen.add(raw);
      result.push(raw);
    }
  }
  return result;
}

function labelOf(itemId: string): string {
  return PRIORITY_ITEMS.find((item) => item.id === itemId)?.label ?? itemId;
}

/**
 * ワークシート「優先順位」カテゴリの回答（評価・順位・妥協）を、本人の判断軸として
 * 自然な日本語に映し返す単発エンドポイント。/api/karte と同様、非ストリーミング・tool不要。
 * 既存のチャット・提案・カルテ・優先順位の入力UIには一切依存しない、独立した機能。
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "リクエストの形式が不正です" }, { status: 400 });
  }

  const raw = (body ?? {}) as { ratings?: unknown; rankings?: unknown; compromises?: unknown };
  const ratings = sanitizeRatings(raw.ratings);
  const rankings = sanitizeIdList(raw.rankings, false);
  const compromises = sanitizeIdList(raw.compromises, true);

  if (rankings.length === 0) {
    return Response.json(
      { error: "順位づけ（問2）が最低1件必要です" },
      { status: 400 },
    );
  }

  const data = {
    ratings: Object.entries(ratings).map(([itemId, value]) => ({ label: labelOf(itemId), value })),
    rankings: rankings.map((itemId, i) => ({ rank: i + 1, label: labelOf(itemId) })),
    compromises: compromises.includes(COMPROMISE_NONE_ID)
      ? ({ none: true } as const)
      : ({ none: false, items: compromises.map(labelOf) } as const),
  };

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: buildWorksheetSummarySystemPrompt(data),
      messages: [
        {
          role: "user",
          content: "上記のデータを踏まえ、あなたの判断軸を整理して書いてください。",
        },
      ],
    });

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );
    const summary = textBlock ? stripMarkdownBold(textBlock.text.trim()) : "";

    if (!summary) {
      return Response.json({ error: "整理結果を生成できませんでした" }, { status: 502 });
    }

    return Response.json({ summary });
  } catch (err) {
    const isApiError = err instanceof Anthropic.APIError;
    console.error("worksheet summary error:", isApiError ? err.message : err);
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
