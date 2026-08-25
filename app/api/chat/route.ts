import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODEL } from "@/lib/anthropic";
import { buildConflictsText, buildDecisionContextText, buildKnownFactsText, buildSystemPrompt } from "@/lib/prompt";
import { isValidMessages } from "@/lib/chat";
import type { Karte } from "@/lib/karte";

function isValidKarte(value: unknown): value is Karte {
  if (!value || typeof value !== "object") return false;
  const meta = (value as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object") return false;
  const karteId = (meta as { karteId?: unknown }).karteId;
  return typeof karteId === "string" && karteId.length > 0;
}

/**
 * 本人が明言した（certainty: "stated"）場合のみ都市を返す。
 * inferred（AIの仮説段階）では学校情報を注入しない。
 */
function extractStatedPreferredCity(karte: Karte): string | null {
  const preferredCity = karte.schoolPrefs.preferredCity;
  if (preferredCity.certainty !== "stated" || !preferredCity.value) return null;
  return preferredCity.value;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "リクエストの形式が不正です" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { messages, karte, includeKnownFacts } = (body ?? {}) as {
    messages?: unknown;
    karte?: unknown;
    includeKnownFacts?: unknown;
  };
  if (!isValidMessages(messages)) {
    return new Response(JSON.stringify({ error: "messages が不正です" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // karte は補助情報（都市確定時の学校知識注入用）。無い・不正でもチャット自体は継続する。
  const validKarte = isValidKarte(karte) ? karte : null;
  const preferredCity = validKarte ? extractStatedPreferredCity(validKarte) : null;

  // 既知情報・矛盾の注入はPlan Chat（includeKnownFacts:true）でのみ行う。/widgetは常にnullのまま
  // （空カルテのうちは実質差が出ないが、意図を明示するため常にフラグで判定する）。
  const usePlanKarteContext = includeKnownFacts === true && validKarte !== null;
  const knownFactsText = usePlanKarteContext ? buildKnownFactsText(validKarte) : null;
  const conflictsText = usePlanKarteContext ? buildConflictsText(validKarte) : null;
  const decisionContextText = usePlanKarteContext ? buildDecisionContextText(validKarte) : null;

  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: 4096,
    system: buildSystemPrompt(preferredCity, knownFactsText, conflictsText, decisionContextText),
    messages,
  });
  const iterator = stream[Symbol.asyncIterator]();

  // 最初のイベントを先に取得し、認証・残高不足などの即時エラーは
  // ストリーミングを開始する前に通常のJSONエラーとして返す。
  let first: IteratorResult<Anthropic.Messages.RawMessageStreamEvent>;
  try {
    first = await iterator.next();
  } catch (err) {
    const isApiError = err instanceof Anthropic.APIError;
    console.error("chat request error:", isApiError ? err.message : err);
    return new Response(
      JSON.stringify({
        error: isApiError
          ? "AIサービスへの接続でエラーが発生しました。しばらくしてから再度お試しください。"
          : "予期しないエラーが発生しました。",
      }),
      {
        status: isApiError && err.status ? err.status : 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const encoder = new TextEncoder();

  function extractText(event: Anthropic.Messages.RawMessageStreamEvent): string | null {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      return event.delta.text;
    }
    return null;
  }

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (!first.done) {
          const text = extractText(first.value);
          if (text) controller.enqueue(encoder.encode(text));
        }
        while (true) {
          const { done, value } = await iterator.next();
          if (done) break;
          const text = extractText(value);
          if (text) controller.enqueue(encoder.encode(text));
        }
        controller.close();
      } catch (err) {
        console.error("chat stream error:", err instanceof Error ? err.message : err);
        controller.error(err);
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
