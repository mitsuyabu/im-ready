import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODEL } from "@/lib/anthropic";
import {
  UPDATE_KARTE_TOOL,
  buildKarteExtractionSystemPrompt,
  buildKarteExtractionUserContent,
} from "@/lib/prompt";
import {
  createEmptyKarte,
  sanitizeKartePatch,
  type Karte,
  type KartePatch,
} from "@/lib/karte";
import { isValidMessages } from "@/lib/chat";

function isValidKarte(value: unknown): value is Karte {
  if (!value || typeof value !== "object") return false;
  const meta = (value as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object") return false;
  const karteId = (meta as { karteId?: unknown }).karteId;
  return typeof karteId === "string" && karteId.length > 0;
}

/**
 * 直近のやり取りからカルテの差分を抽出する軽量な非ストリーミング呼び出し。
 * ユーザーに見せるチャット応答（/api/chat）とは独立しており、
 * このエンドポイントが失敗しても会話体験自体は壊れない（フェイルソフト）。
 *
 * ここではマージしない。返すのは生の差分（KartePatch）のみ。
 * マージ（適用してよいか・sourceの裁定）は呼び出し側が行う:
 * - /widget: クライアント側で mergeKarte(karte, patch) をそのまま適用
 * - Plan Chat: kartePatchToFieldPatches(patch, "chat") でField単位に平坦化し、
 *   DB側の apply_karte_patch RPCで（他sourceとの競合も含めて）atomicに適用する
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "リクエストの形式が不正です" }, { status: 400 });
  }

  const { messages, karte: incomingKarte } = (body ?? {}) as {
    messages?: unknown;
    karte?: unknown;
  };

  if (!isValidMessages(messages)) {
    return Response.json({ error: "messages が不正です" }, { status: 400 });
  }

  const currentKarte = isValidKarte(incomingKarte)
    ? incomingKarte
    : createEmptyKarte(crypto.randomUUID());

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: buildKarteExtractionSystemPrompt(currentKarte),
      tools: [UPDATE_KARTE_TOOL],
      tool_choice: { type: "tool", name: "update_karte" },
      messages: [
        {
          role: "user",
          content: buildKarteExtractionUserContent(messages),
        },
      ],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock =>
        block.type === "tool_use" && block.name === "update_karte",
    );

    if (!toolUse) {
      return Response.json({ patch: {} satisfies KartePatch });
    }

    const patch = sanitizeKartePatch(toolUse.input);
    return Response.json({ patch });
  } catch (err) {
    console.error(
      "karte extraction error:",
      err instanceof Error ? err.message : err,
    );
    return Response.json({ patch: {} satisfies KartePatch });
  }
}
