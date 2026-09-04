import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODEL } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import { loadPlanKarte } from "@/lib/planChat";
import { loadPlanBlueprint } from "@/lib/planBlueprint";
import {
  blueprintHasTimelineMaterial,
  buildPlanTimelineSystemPrompt,
  buildPlanTimelineUserMessage,
  composePlanTimelineFromDraft,
  karteHasTimelineMaterial,
  PLAN_TIMELINE_TOOL,
} from "@/lib/planTimelinePrompt";

/**
 * My Plan の AI Timeline「提案」エンドポイント（Step 2-5 / 2-7）。
 *
 * - 認証 → planId 検証 → plans.user_id owner 確認（他人の Plan を AI に渡さない）
 * - loadPlanBlueprint + loadPlanKarte。blueprint unavailable なら生成しない
 * - My Plan（blueprint）に材料が無く、Karte stated にも十分な文脈が無ければ 422（生成しない）
 * - Anthropic tool-use（PLAN_TIMELINE_TOOL）で structured output → server で period id / generatedAt
 *   を付与 → sanitizePlanTimeline（Step 2-1）で最終判定
 * - **保存はしない**（このルートは提案を返すだけ。plan_blueprint.timeline へは書かない）
 *
 * privacy: My Plan / Karte 本文・prompt を console / error に出さない。Client へは generic error のみ。
 */

export function parsePlanId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "認証が必要です" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "リクエストの形式が不正です" }, { status: 400 });
  }
  const planId = parsePlanId((body as { planId?: unknown })?.planId);
  if (!planId) {
    return Response.json({ error: "planId が不正です" }, { status: 400 });
  }

  const { data: plan } = await supabase
    .from("plans")
    .select("id")
    .eq("id", planId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!plan) {
    return Response.json({ error: "対象のPlanが見つかりません" }, { status: 404 });
  }

  const [karte, blueprint] = await Promise.all([
    loadPlanKarte(supabase, planId),
    loadPlanBlueprint(supabase, planId),
  ]);

  if (!blueprint.available) {
    return Response.json({ error: "blueprint_unavailable" }, { status: 409 });
  }

  if (!blueprintHasTimelineMaterial(blueprint.data) && !karteHasTimelineMaterial(karte)) {
    return Response.json({ error: "not_enough_context" }, { status: 422 });
  }

  let timeline;
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: buildPlanTimelineSystemPrompt(),
      tools: [PLAN_TIMELINE_TOOL],
      tool_choice: { type: "tool", name: "propose_plan_timeline" },
      messages: [
        { role: "user", content: buildPlanTimelineUserMessage(blueprint.data, karte) },
      ],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock =>
        block.type === "tool_use" && block.name === "propose_plan_timeline",
    );

    timeline = toolUse
      ? composePlanTimelineFromDraft(toolUse.input, new Date().toISOString(), randomUUID)
      : null;
  } catch (err) {
    const isApiError = err instanceof Anthropic.APIError;
    // 内部 message のみログ。My Plan 内容・prompt・生成本文はログしない。
    console.error("plan-timeline generation error:", isApiError ? err.message : "unexpected");
    return Response.json(
      { error: "ai_service_error" },
      { status: isApiError && err.status ? err.status : 500 },
    );
  }

  if (!timeline) {
    return Response.json({ error: "generation_failed" }, { status: 502 });
  }

  return Response.json({ timeline });
}
