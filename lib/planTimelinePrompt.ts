/**
 * AI Timeline（My Plan 期間プラン提案）の prompt / tool schema / AI raw 合成（Step 2-5 / 2-7）。
 *
 * 方針:
 *   - 入力の主材料は「ユーザーが My Plan に保存した内容」（USER_SAVED_PLAN）。最優先。
 *   - Karte は stated のみを補助として使う（KARTE_STATED_CONTEXT）。inferred / conflict 中は渡さない。
 *   - AI は新しい目的・学校・都市を追加しない。ビザ資格・就労日数・制度条件・入学・就職を断定/保証しない。
 *   - unknown は埋めず openQuestions へ。期間が無ければ 1 年等を勝手に決めない。具体日付を生成しない。
 *   - structured output（tool-use）必須。id は AI に作らせず server で付与、generatedAt も server。
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { Karte } from "@/lib/karte";
import { getKarteSummaryItems } from "@/lib/karte";
import { sanitizePlanTimeline, type BlueprintData, type PlanTimeline } from "@/lib/planBlueprint";

/* ------------------------------------------------------------------ */
/* tool schema（period の id / timeline の generatedAt は含めない＝server 付与）           */
/* ------------------------------------------------------------------ */

export const PLAN_TIMELINE_TOOL: Anthropic.Tool = {
  name: "propose_plan_timeline",
  description:
    "ユーザーが My Plan に保存した内容（目標・行き先・学校・仕事・やりたいこと・Milestones）を" +
    "時間軸に並べ、留学・ワーホリ期間全体の過ごし方を『提案』として返す。" +
    "新しい学校・都市・目的は追加しない。ビザや就職・入学は保証・断定しない。" +
    "決まっていないことは openQuestions に入れる（勝手に埋めない）。",
  input_schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "この期間プラン全体の要点を 1〜2 文で。断定・保証をしない。",
      },
      durationLabel: {
        type: "string",
        description:
          "対象期間の表示ラベル（例: 約12ヶ月 / 約6ヶ月 / 約8週間）。期間が未定なら『未定』とだけ書く。",
      },
      periods: {
        type: "array",
        description: "期間ごとのフェーズ。期間の長さに応じた数にする（1年で 4〜6 が目安）。",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "例: Month 1–2 / Week 1–4。具体的な日付は書かない。" },
            title: { type: "string", description: "そのフェーズで主にやることの短い見出し。" },
            activities: {
              type: "array",
              items: { type: "string" },
              description: "そのフェーズの具体的な行動。最大 4 件。長文にしない。",
            },
            reason: {
              type: "string",
              description: "なぜこの時期にこれをするのか、を短く（この提案の価値）。",
            },
          },
          required: ["label", "title", "activities", "reason"],
        },
      },
      openQuestions: {
        type: "array",
        items: { type: "string" },
        description:
          "プランを具体化するために、まだ決める必要があること（期間・出発時期・ビザ条件の確認 等）。最大 3 件。無ければ空配列。",
      },
      disclaimer: {
        type: ["string", "null"],
        description:
          "ビザ・制度に触れる場合の注意（例: ビザや制度の条件は最新の公式情報を確認してください）。不要なら null。",
      },
    },
    required: ["summary", "durationLabel", "periods", "openQuestions"],
  },
};

/* ------------------------------------------------------------------ */
/* system prompt                                                      */
/* ------------------------------------------------------------------ */

export function buildPlanTimelineSystemPrompt(): string {
  return [
    "あなたは留学・ワーキングホリデーの計画整理を支援するアシスタントです。",
    "ユーザーが自分で決めた My Plan の内容を尊重し、時間軸に並べるサポートだけを行います。",
    "",
    "【最優先】USER_SAVED_PLAN（ユーザーが保存した内容）を主材料にする。",
    "KARTE_STATED_CONTEXT は補助。両者が矛盾する場合は USER_SAVED_PLAN を優先する。",
    "",
    "【してはいけないこと】",
    "- 新しい学校・都市・目的・仕事を勝手に追加・推薦する",
    "- 行き先をユーザーの指定と別の場所に変える",
    "- ビザ／セカンドビザの取得可否・eligibility・必要就労日数・制度条件を断定または保証する",
    "- 就職・アルバイト獲得、学校の入学・席確保を保証する",
    "- 予算が足りる／足りないと断定する",
    "- 推測（inferred）を事実として扱う",
    "- 決まっていないこと（滞在期間・出発時期など）を勝手に埋める。具体的な日付を作る",
    "",
    "【してよいこと（あくまで提案）】",
    "- 学校・英語学習を先にする等の順序の提案",
    "- 仕事探しの時期、都市移動のタイミングの提案",
    "- やりたいこと（Things to Do）を入れる時期の提案",
    "- Milestone（資格・ビザ目標など）を確認・準備するタイミングの提案",
    "- 学校が『検討中』しかない場合は『候補校を比較・決定する』フェーズを入れる",
    "",
    "【期間】",
    "- 期間が与えられていればそれに従う（8週間・3ヶ月・6ヶ月・12ヶ月・18ヶ月 など）。1年に固定しない。",
    "- 期間が未定なら durationLabel を『未定』にし、openQuestions に『滞在期間がまだ決まっていません。』を入れる。",
    "- period 数の目安: 1〜3ヶ月→2〜4 / 6ヶ月→3〜5 / 12ヶ月→4〜6 / 18ヶ月→5〜7。",
    "",
    "【ビザ関連の言い方】",
    "OK例: 「セカンドビザ取得を目標にする場合は、対象条件を公式情報で確認しながら時期を検討します。」",
    "NG例: 「6〜8月にファームで88日働けば必ずセカンドビザを取得できます。」",
    "",
    "出力は propose_plan_timeline ツールで返す。日本語。レポートのように長くしない（My Plan 画面で読みやすい量）。",
    "各 period には『なぜこの時期か』の reason を必ず短く付ける。activities は period あたり最大 4 件。",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* user message（USER_SAVED_PLAN ＋ KARTE_STATED_CONTEXT）                              */
/* ------------------------------------------------------------------ */

const STATUS_JA: Record<string, string> = {
  selected: "決定",
  preferred: "第一候補",
  considering: "検討中",
};

/** blueprint 由来の USER_SAVED_PLAN セクション。 */
function buildSavedPlanSection(data: BlueprintData): string {
  const lines: string[] = ["# USER_SAVED_PLAN（最優先。KARTE と矛盾したらこちらを採用）"];

  lines.push("## Goals");
  if (data.goals.length > 0) data.goals.forEach((g) => lines.push(`- ${g.label}`));
  else lines.push("- （未設定）");

  lines.push("## Destination");
  if (data.destinations.primary) lines.push(`第一候補: ${data.destinations.primary.label}`);
  if (data.destinations.interested.length > 0) {
    lines.push(`行ってみたい: ${data.destinations.interested.map((d) => d.label).join(" / ")}`);
  }
  if (!data.destinations.primary && data.destinations.interested.length === 0) {
    lines.push("（未設定）");
  }

  lines.push("## Schools");
  if (data.schools.length > 0) {
    data.schools.forEach((s) => {
      const st = STATUS_JA[s.status] ?? s.status;
      lines.push(`- [${st}] ${s.name}${s.city ? `（${s.city}）` : ""}`);
    });
  } else {
    lines.push("- （未設定）");
  }

  lines.push("## Work（現地でやってみたい仕事）");
  if (data.workInterests.length > 0) data.workInterests.forEach((w) => lines.push(`- ${w.label}`));
  else lines.push("- （未設定）");

  lines.push("## Things to Do");
  if (data.thingsToDo.length > 0) data.thingsToDo.forEach((t) => lines.push(`- ${t.label}`));
  else lines.push("- （未設定）");

  lines.push("## Visa & Milestones");
  if (data.milestones.length > 0) data.milestones.forEach((m) => lines.push(`- ${m.label}`));
  else lines.push("- （未設定）");

  return lines.join("\n");
}

/**
 * Karte の stated のみ（conflict 中は除外）。USER_SAVED_PLAN に無い条件を補助として渡す。
 * preferredCity は blueprint に primary destination が無いときだけ含める（§4-5）。
 */
function buildKarteStatedSection(karte: Karte, data: BlueprintData): string {
  const summary = new Map(getKarteSummaryItems(karte).map((it) => [`${it.block}.${it.key}`, it]));
  const conflictKeys = new Set(karte.handoff.conflicts.map((c) => `${c.block}.${c.key}`));
  const stated = (id: string) => {
    const it = summary.get(id);
    return it && it.certainty === "stated" && !conflictKeys.has(id) ? it.value : null;
  };

  const lines: string[] = ["# KARTE_STATED_CONTEXT（補助。stated のみ。USER_SAVED_PLAN に無い条件用）"];

  const departure = stated("timing.departureTiming");
  lines.push(`出発時期: ${departure ?? "未定"}`);

  const durationWeeks = karte.timing.durationWeeks;
  const duration =
    durationWeeks.certainty === "stated" && typeof durationWeeks.value === "number"
      ? `${durationWeeks.value}週間`
      : null;
  lines.push(`滞在期間: ${duration ?? "未定"}`);

  const totalCap = karte.budget.totalCap;
  const budget =
    totalCap.certainty === "stated" && typeof totalCap.value === "number"
      ? `${Math.round(totalCap.value / 10000)}万円`
      : null;
  lines.push(`総予算: ${budget ?? "未定"}`);

  const hasBlueprintDestination =
    data.destinations.primary !== null || data.destinations.interested.length > 0;
  if (!hasBlueprintDestination) {
    const city = stated("schoolPrefs.preferredCity");
    if (city) lines.push(`（Karte 由来）希望する都市: ${city}`);
  }

  const accommodation = stated("schoolPrefs.accommodation");
  if (accommodation) lines.push(`滞在スタイル: ${accommodation}`);
  const selfLevel = stated("language.selfLevel");
  if (selfLevel) lines.push(`英語レベル（自己申告）: ${selfLevel}`);

  return lines.join("\n");
}

export function buildPlanTimelineUserMessage(data: BlueprintData, karte: Karte): string {
  return [
    buildSavedPlanSection(data),
    "",
    buildKarteStatedSection(karte, data),
    "",
    "# 指示",
    "上記の My Plan をもとに、留学・ワーキングホリデー期間全体の過ごし方を propose_plan_timeline ツールで提案してください。",
    "USER_SAVED_PLAN にある内容だけを並べ替え・時期付けし、新しい要素は足さないでください。",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* generate 可否ゲート（§56 / §58）                                                     */
/* ------------------------------------------------------------------ */

/** My Plan（blueprint）に何か 1 つでもあれば true。 */
export function blueprintHasTimelineMaterial(data: BlueprintData): boolean {
  return (
    data.goals.length > 0 ||
    data.destinations.primary !== null ||
    data.destinations.interested.length > 0 ||
    data.schools.length > 0 ||
    data.workInterests.length > 0 ||
    data.thingsToDo.length > 0 ||
    data.milestones.length > 0
  );
}

/** Karte stated だけでも十分な文脈があるか（blueprint が空でも生成可・§58）。 */
export function karteHasTimelineMaterial(karte: Karte): boolean {
  const summary = new Map(getKarteSummaryItems(karte).map((it) => [`${it.block}.${it.key}`, it]));
  const conflictKeys = new Set(karte.handoff.conflicts.map((c) => `${c.block}.${c.key}`));
  const isStated = (id: string) => {
    const it = summary.get(id);
    return Boolean(it && it.certainty === "stated" && !conflictKeys.has(id));
  };
  return (
    isStated("schoolPrefs.preferredCity") ||
    isStated("timing.departureTiming") ||
    isStated("timing.durationWeeks") ||
    isStated("budget.totalCap") ||
    isStated("motivation.desiredOutcome")
  );
}

/* ------------------------------------------------------------------ */
/* AI raw → PlanTimeline（server で id / generatedAt 付与 → 既存 sanitize）              */
/* ------------------------------------------------------------------ */

/**
 * tool_use.input（AI raw）を PlanTimeline に合成する。
 *   - 各 period に server 生成の id を付ける（AI に UUID を作らせない・§22）
 *   - generatedAt は server 時刻（§23）
 *   - 最終判定は Step 2-1 の sanitizePlanTimeline（壊れていたら null）（§24）
 */
export function composePlanTimelineFromDraft(
  raw: unknown,
  generatedAtIso: string,
  makeId: () => string,
): PlanTimeline | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const periodsWithId = Array.isArray(r.periods)
    ? r.periods.map((p) =>
        p && typeof p === "object" ? { ...(p as Record<string, unknown>), id: makeId() } : p,
      )
    : r.periods;

  return sanitizePlanTimeline({
    summary: r.summary,
    durationLabel: r.durationLabel,
    periods: periodsWithId,
    openQuestions: r.openQuestions,
    disclaimer: r.disclaimer ?? null,
    generatedAt: generatedAtIso,
  });
}
