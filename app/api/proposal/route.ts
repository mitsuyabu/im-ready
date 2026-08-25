import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODEL } from "@/lib/anthropic";
import type { Karte } from "@/lib/karte";
import { AUSTRALIA_SCHOOLS } from "@/lib/data/schools";
import {
  applyProposalResult,
  buildCandidateBundles,
  buildFitHints,
  buildSelectProposalsSystemPrompt,
  deriveSituation,
  hardFilter,
  pickReferenceCandidates,
  readyForSchoolProposal,
  sanitizeIntroNote,
  sanitizeProposalEntries,
  SELECT_PROPOSALS_TOOL,
  toDisplayProposals,
  type ProposalResult,
} from "@/lib/proposal";

function isValidKarte(value: unknown): value is Karte {
  if (!value || typeof value !== "object") return false;
  const meta = (value as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object") return false;
  const karteId = (meta as { karteId?: unknown }).karteId;
  return typeof karteId === "string" && karteId.length > 0;
}

/**
 * 提案パイプライン第3層のエンドポイント。
 * ゲート(readyForSchoolProposal)未充足なら、LLMを呼ばずに不足項目を返すだけにする。
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "リクエストの形式が不正です" }, { status: 400 });
  }

  const { karte, provisional } = (body ?? {}) as { karte?: unknown; provisional?: unknown };
  if (!isValidKarte(karte)) {
    return Response.json({ error: "karte が不正です" }, { status: 400 });
  }

  const isProvisional = provisional === true;
  const gate = readyForSchoolProposal(karte);

  if (isProvisional) {
    // 暫定モードの最小ガード: 都市・コースのどちらの手がかりも無い状態では、
    // 無差別に全校を候補として渡すことになってしまうため、提案を出さず1つだけ聞き返す。
    const missingCity = !karte.schoolPrefs.preferredCity.value;
    const missingCourse = !karte.schoolPrefs.courseType.value;
    if (missingCity && missingCourse) {
      const askedKarte: Karte = {
        ...karte,
        handoff: { ...karte.handoff, immediateProposalRequested: false },
      };
      return Response.json({
        ready: false,
        provisional: true,
        guardMessage:
          "せめてどの国・都市に興味があるか、またはどんなコースを考えているか、どちらか一つだけ教えていただけますか？",
        karte: askedKarte,
      });
    }
  } else if (!gate.ready) {
    return Response.json({ ready: false, missing: gate.missing });
  }

  const filtered = hardFilter(karte, AUSTRALIA_SCHOOLS);
  const situation = deriveSituation(filtered.survivors.length);

  const matchFitHints = buildFitHints(karte, filtered.survivors);
  const matchBundlesInput = filtered.survivors.map((survivor, i) => ({
    school: survivor.school,
    fitHints: matchFitHints[i],
  }));

  const referenceLimit = situation === "none" ? 3 : situation === "partial" ? 2 : 0;
  const referenceSchools =
    referenceLimit > 0 ? pickReferenceCandidates(filtered, referenceLimit) : [];
  const referenceFitHints = buildFitHints(
    karte,
    referenceSchools.map((school) => ({ school, budgetStatus: "unknown" as const })),
  );
  const referenceBundlesInput = referenceSchools.map((school, i) => ({
    school,
    fitHints: referenceFitHints[i],
  }));

  const candidates = buildCandidateBundles(karte, matchBundlesInput, referenceBundlesInput);
  const validSlugs = new Set(candidates.map((c) => c.schoolSlug));

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: buildSelectProposalsSystemPrompt(
        karte,
        situation,
        candidates,
        isProvisional ? gate.missing : [],
      ),
      tools: [SELECT_PROPOSALS_TOOL],
      tool_choice: { type: "tool", name: "select_proposals" },
      messages: [
        {
          role: "user",
          content: "上記を踏まえ、select_proposals ツールを呼び出してください。",
        },
      ],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock =>
        block.type === "tool_use" && block.name === "select_proposals",
    );

    const proposals = toolUse ? sanitizeProposalEntries(toolUse.input, validSlugs) : [];
    const introNote = toolUse ? sanitizeIntroNote(toolUse.input) : null;

    const result: ProposalResult = { situation, introNote, proposals };
    const updatedKarte = applyProposalResult(karte, result, AUSTRALIA_SCHOOLS);
    const displayProposals = toDisplayProposals(result, AUSTRALIA_SCHOOLS);

    return Response.json({
      ready: true,
      situation,
      introNote,
      proposals: displayProposals,
      karte: updatedKarte,
    });
  } catch (err) {
    const isApiError = err instanceof Anthropic.APIError;
    console.error("proposal selection error:", isApiError ? err.message : err);
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
