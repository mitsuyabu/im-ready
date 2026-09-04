/**
 * AI Timeline（My Plan 期間プラン提案）の prompt / tool schema / AI raw 合成。
 *
 * 2 段階思考:
 *   My Plan（blueprint） + Karte
 *        ↓  buildPlanningBrief（server 側でコードで決定的に分類）
 *   PLANNING_BRIEF（fixed / goals / flexible / constraints / openQuestions / considerations）
 *        ↓  1 回の AI call（tool-use）
 *   Timeline Proposal
 *
 * 方針:
 *   - 最優先は「ユーザーが My Plan に採用した内容」（FIXED_DECISIONS）。Karte と矛盾したら My Plan。
 *   - Karte は「ユーザーが過去に相談で話し、整理された理解」＝相談履歴の圧縮 context として stated のみ使う。
 *     chat_messages / worksheet の raw 本文は送らない（token / 古い発言との矛盾 / latency / cost を避ける）。
 *   - inferred（trueGoalHypothesis 含む）と conflict 中の field は planning の確定情報にしない。
 *   - AI は新しい学校・都市・目的・施設の固有名詞を追加しない。ビザ資格・就労日数・入学・就職を断定/保証しない。
 *   - unknown は埋めず openQuestions へ。期間が無ければ 1 年等を勝手に決めない。具体日付を生成しない。
 *   - structured output（tool-use）必須。period の id は AI に作らせず server 付与、generatedAt も server。
 *   - Planning Brief 生成のために別 AI call は増やさない（コードで組み立てる）。
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
    "PLANNING_BRIEF（ユーザーが決めたこと・目標・希望・条件・未定事項・観点）をもとに、" +
    "留学・ワーホリ期間全体の過ごし方を、順序と時期を考えて『提案』として返す。" +
    "新しい学校・都市・目的・施設は追加しない。ビザや就職・入学は保証・断定しない。" +
    "決まっていないことは openQuestions に入れる（勝手に埋めない）。",
  input_schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "この期間プラン全体の要点を 2〜3 文で。断定・保証をしない。長文にしない。",
      },
      durationLabel: {
        type: "string",
        description:
          "対象期間の表示ラベル（例: 約12ヶ月 / 約6ヶ月 / 約8週間）。期間が未定なら『未定』とだけ書く。",
      },
      periods: {
        type: "array",
        description:
          "期間ごとのフェーズ。期間の長さに応じた数にする（1〜3ヶ月→2〜4 / 6ヶ月→3〜5 / 1年→4〜6 / 18ヶ月→5〜7 が目安）。",
        items: {
          type: "object",
          properties: {
            label: {
              type: "string",
              description: "例: Month 1–2 / Week 1–4 / Phase 2。具体的な日付（年月日）は書かない。",
            },
            title: {
              type: "string",
              description: "そのフェーズのテーマが一目で分かる短い見出し（例: 生活と英語の土台をつくる）。",
            },
            activities: {
              type: "array",
              items: { type: "string" },
              description: "そのフェーズの具体的な行動。最大 4 件。1 件は短く。",
            },
            reason: {
              type: "string",
              description:
                "なぜこの順番・この時期にこれをするのか、を短く説明する（単なる説明ではなく、順序・準備・優先順位の理由）。",
            },
          },
          required: ["label", "title", "activities", "reason"],
        },
      },
      openQuestions: {
        type: "array",
        items: { type: "string" },
        description:
          "プランを具体化するために、まだ決める必要があること。1 つの大きな未定事項でプランが大きく変わる場合はここで示す。最大 3 件。無ければ空配列。",
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
    "あなたは留学・ワーキングホリデーのプランナーです。",
    "ユーザーが決めたこと（FIXED_DECISIONS）を尊重しながら、目標（GOALS）の達成に向けて、",
    "順序・準備期間・優先順位・新しい環境に慣れる時間を考え、現実的で分かりやすい期間プランを提案します。",
    "",
    "【HARD / SOFT】",
    "- FIXED_DECISIONS と CONSTRAINTS は HARD。壊さない・打ち消さない。",
    "- FLEXIBLE_PREFERENCES は SOFT。可能な範囲で組み込むが、必須スケジュールにはしない。",
    "- FIXED_DECISIONS と Karte 由来の情報が矛盾する場合は、必ず FIXED_DECISIONS を優先する。",
    "",
    "【単純な並べ替えにしない】",
    "保存された項目をただ均等に時系列へ置くだけにしない。次を考える:",
    "- 前提（prerequisite）と準備（preparation）",
    "- 新しい環境・生活に慣れる時間",
    "- 学校（英語学習）と仕事さがしの関係・順序",
    "- 都市移動のタイミング（学校や仕事の区切りに合わせる）",
    "- Milestone を確認・準備するタイミング",
    "- 複数の目標がある場合の優先順位・両立",
    "- 与えられた期間の長さ",
    "",
    "【複数の GOALS】",
    "どれが一番重要かを勝手に決めない。すべて考慮する。両立が難しい場合は openQuestions か、",
    "period の reason の中で trade-off を短く説明する。",
    "",
    "【新しい事実を作らない】",
    "計画の質を上げても、fake precision は禁止。",
    "- ユーザーが My Plan に保存していない学校・都市・仕事先・観光地・施設の固有名詞を追加しない",
    "- ビザ／セカンドビザの取得可否・eligibility・必要就労日数・制度条件を断定または保証しない",
    "- 就職・アルバイト獲得、学校の入学・席確保を保証しない",
    "- 予算が足りる／足りないと断定しない",
    "- 推測（inferred）を事実として扱わない",
    "- 決まっていないこと（滞在期間・出発時期など）を勝手に埋める。具体的な日付（年月日）を作る",
    "",
    "【期間】",
    "- 期間が与えられていればそれに従う（8週間・3ヶ月・6ヶ月・12ヶ月・18ヶ月 など）。1年に固定しない。",
    "- 期間が未定なら durationLabel を『未定』にし、openQuestions に『留学の期間がまだ決まっていません。』を入れる。",
    "",
    "【学校の扱い】",
    "- [決定] の学校 → 学校に通う期間として組み込んでよい（ただし授業開始日が無ければ具体日付は作らない）",
    "- [第一候補] → 強い希望として扱う",
    "- [検討中] のみ → どこかに通うと断定しない。『候補校を比較して決める』フェーズを入れる",
    "",
    "【仕事 / やりたいこと】",
    "- 仕事は希望であり、その仕事に就ける保証はしない。Timeline では『仕事さがしを始める』『候補を探す』等にする。",
    "- Things to Do・行ってみたい都市は願望であり、すべて実行必須ではない。無理に全部詰め込まない。",
    "",
    "【Milestone / ビザ】",
    "ユーザーが設定した目標。制度条件は別。特にビザは『条件を確認する』を含める。",
    "OK例: 「セカンドビザ取得を目標にする場合は、対象条件を公式情報で確認しながら時期を検討します。」",
    "NG例: 「6〜8月にファームで88日働けば必ずセカンドビザを取得できます。」",
    "",
    "出力は propose_plan_timeline ツールで返す。日本語。レポートのように長くしない（My Plan 画面で読みやすい量）。",
    "各 period には『なぜこの順番・時期か』の reason を必ず短く付ける。activities は period あたり最大 4 件。",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Planning Brief（server 側でコードで決定的に分類）                                      */
/* ------------------------------------------------------------------ */

export type PlanningBrief = {
  fixedDecisions: string[];
  goals: string[];
  flexiblePreferences: string[];
  constraints: string[];
  openQuestions: string[];
  planningConsiderations: string[];
};

const STATUS_JA: Record<string, string> = {
  selected: "決定",
  preferred: "第一候補",
  considering: "検討中",
};

const CONSULT_NOTE = "（相談で整理された内容）";

function schoolLine(name: string, city: string | null): string {
  return `${name}${city ? `（${city}）` : ""}`;
}

export function buildPlanningBrief(data: BlueprintData, karte: Karte): PlanningBrief {
  const summary = new Map(getKarteSummaryItems(karte).map((it) => [`${it.block}.${it.key}`, it]));
  const conflictKeys = new Set(karte.handoff.conflicts.map((c) => `${c.block}.${c.key}`));
  /** stated かつ conflict 中でない SummaryItem の整形済み値。無ければ null。 */
  const stated = (id: string): string | null => {
    const it = summary.get(id);
    return it && it.certainty === "stated" && !conflictKeys.has(id) ? it.value : null;
  };

  const goalNorms = new Set(data.goals.map((g) => g.label.trim().toLowerCase()));
  const hasBlueprintDestination =
    data.destinations.primary !== null || data.destinations.interested.length > 0;

  const selectedSchools = data.schools.filter((s) => s.status === "selected");
  const preferredSchools = data.schools.filter((s) => s.status === "preferred");
  const consideringSchools = data.schools.filter((s) => s.status === "considering");

  /* ---- fixedDecisions ---- */
  const fixedDecisions: string[] = [];
  if (data.destinations.primary) {
    fixedDecisions.push(`第一候補の行き先: ${data.destinations.primary.label}`);
  }
  selectedSchools.forEach((s) =>
    fixedDecisions.push(`決定した学校: ${schoolLine(s.name, s.city)}`),
  );
  preferredSchools.forEach((s) =>
    fixedDecisions.push(`第一候補の学校: ${schoolLine(s.name, s.city)}`),
  );
  data.workInterests.forEach((w) => fixedDecisions.push(`やってみたい仕事（種類）: ${w.label}`));
  data.milestones.forEach((m) => fixedDecisions.push(`目標にしている節目: ${m.label}`));

  /* ---- goals ---- */
  const goals: string[] = [];
  data.goals.forEach((g) => goals.push(g.label));
  for (const id of ["motivation.statedGoal", "motivation.desiredOutcome"]) {
    const v = stated(id);
    if (v && !goalNorms.has(v.trim().toLowerCase())) goals.push(`${CONSULT_NOTE}${v}`);
  }
  const career = stated("work.postReturnCareer");
  if (career) goals.push(`${CONSULT_NOTE}帰国後の希望: ${career}`);

  /* ---- flexiblePreferences ---- */
  const flexiblePreferences: string[] = [];
  if (data.destinations.interested.length > 0) {
    flexiblePreferences.push(
      `行ってみたい都市: ${data.destinations.interested.map((d) => d.label).join(" / ")}`,
    );
  }
  consideringSchools.forEach((s) =>
    flexiblePreferences.push(`検討中の学校: ${schoolLine(s.name, s.city)}`),
  );
  data.thingsToDo.forEach((t) => flexiblePreferences.push(`やってみたいこと: ${t.label}`));
  if (!hasBlueprintDestination) {
    const city = stated("schoolPrefs.preferredCity");
    if (city) flexiblePreferences.push(`${CONSULT_NOTE}希望する都市: ${city}`);
  }
  for (const [id, label] of [
    ["lifestyle.cityVsNature", "暮らしの好み"],
    ["lifestyle.climate", "気候の好み"],
    ["schoolPrefs.accommodation", "滞在スタイルの希望"],
    ["schoolPrefs.courseType", "コースの希望"],
    ["schoolPrefs.sizeNationality", "学校の規模・国籍構成の希望"],
    ["language.weakSkills", "英語で伸ばしたいこと"],
    ["language.pathwayIntent", "進学の意向"],
  ] as const) {
    const v = stated(id);
    if (v) flexiblePreferences.push(`${label}: ${v}`);
  }

  /* ---- constraints ---- */
  const constraints: string[] = [];
  const durationWeeks = karte.timing.durationWeeks;
  const hasDuration =
    durationWeeks.certainty === "stated" &&
    typeof durationWeeks.value === "number" &&
    !conflictKeys.has("timing.durationWeeks");
  if (hasDuration) constraints.push(`滞在期間: ${durationWeeks.value}週間`);

  const departure = stated("timing.departureTiming");
  if (departure) constraints.push(`出発時期: ${departure}`);

  const totalCap = karte.budget.totalCap;
  const hasBudget =
    totalCap.certainty === "stated" &&
    typeof totalCap.value === "number" &&
    !conflictKeys.has("budget.totalCap");
  if (hasBudget) constraints.push(`総予算のめやす: ${Math.round(totalCap.value! / 10000)}万円`);

  for (const [id, label] of [
    ["timing.deadline", "締め切り"],
    ["constraints.nonNegotiables", "譲れない条件"],
    ["constraints.visaConstraints", "ビザ上の制約"],
    ["constraints.avoidCountries", "避けたい国"],
    ["constraints.health", "健康上の配慮"],
    ["language.selfLevel", "現在の英語レベル（自己申告）"],
  ] as const) {
    const v = stated(id);
    if (v) constraints.push(`${label}: ${v}`);
  }

  /* ---- openQuestions（最大 4）---- */
  const openQuestions: string[] = [];
  if (!hasDuration) openQuestions.push("留学の期間がまだ決まっていません。");
  if (!departure) openQuestions.push("出発の時期がまだ決まっていません。");
  if (data.schools.length > 0 && selectedSchools.length === 0 && preferredSchools.length === 0) {
    openQuestions.push("どの学校に通うか、まだ決まっていません。");
  }
  if (
    data.milestones.some((m) => /セカンド|second|ワーホリ|ワーキングホリデー/i.test(m.label)) &&
    openQuestions.length < 4
  ) {
    openQuestions.push("セカンドビザ取得を優先するかどうか、条件を確認しながら検討が必要です。");
  }
  const openQuestionsCapped = openQuestions.slice(0, 4);

  /* ---- planningConsiderations（一般的な観点。事実は新規生成しない）---- */
  const planningConsiderations: string[] = [
    "新しい環境・生活に慣れる時間を、はじめの時期に見込む",
  ];
  const goalsMentionEnglish = [...goals, ...data.goals.map((g) => g.label)].some((g) =>
    /英語|english|ielts|toeic/i.test(g),
  );
  if (goalsMentionEnglish || stated("language.selfLevel") || stated("language.weakSkills")) {
    planningConsiderations.push("英語の土台づくりと、そのあとの目標（仕事・進学など）の順序を考える");
  }
  if (data.schools.length > 0 || stated("schoolPrefs.courseType")) {
    planningConsiderations.push(
      "学校に通う期間と、そのあとの動き（仕事さがし・都市移動）のつながりを見る",
    );
  }
  if (
    data.workInterests.length > 0 ||
    (karte.work.wantsToWork.certainty === "stated" && karte.work.wantsToWork.value === true)
  ) {
    planningConsiderations.push("仕事さがしは、生活と英語がある程度整ってから始める前提で時期を置く");
  }
  if (data.destinations.interested.length > 0 && data.destinations.primary) {
    planningConsiderations.push("都市の移動は、学校や仕事の区切りに合わせてまとめる");
  }
  if (data.milestones.length > 0) {
    planningConsiderations.push(
      "Milestone（資格・ビザ目標など）は、必要な条件を確認する時期を先に入れる",
    );
  }
  if (data.thingsToDo.length > 0) {
    planningConsiderations.push("やってみたいことは、無理のない時期に少しずつ入れる");
  }

  return {
    fixedDecisions,
    goals,
    flexiblePreferences,
    constraints,
    openQuestions: openQuestionsCapped,
    planningConsiderations,
  };
}

/* ------------------------------------------------------------------ */
/* user message（PLANNING_BRIEF を中心に。raw blueprint の全文再掲はしない）              */
/* ------------------------------------------------------------------ */

function section(title: string, items: string[], emptyText: string): string {
  const lines = [`## ${title}`];
  if (items.length === 0) lines.push(`- ${emptyText}`);
  else items.forEach((it) => lines.push(`- ${it}`));
  return lines.join("\n");
}

export function buildPlanTimelineUserMessage(data: BlueprintData, karte: Karte): string {
  const brief = buildPlanningBrief(data, karte);

  const savedSchoolLines =
    data.schools.length > 0
      ? data.schools.map(
          (s) => `- [${STATUS_JA[s.status] ?? s.status}] ${schoolLine(s.name, s.city)}`,
        )
      : ["- （まだ保存された学校はありません）"];

  return [
    "# PLANNING_BRIEF",
    "これは、ユーザーが My Plan に採用した内容と、これまでの相談（Chat / Worksheet）から整理された理解の両方から",
    "コードで組み立てた計画メモです。矛盾する場合は FIXED_DECISIONS（ユーザーが My Plan で決めたこと）を優先してください。",
    "",
    section("FIXED_DECISIONS（ユーザーが決めたこと・壊さない）", brief.fixedDecisions, "（まだありません）"),
    "",
    section("GOALS（この留学・ワーホリで目指すこと）", brief.goals, "（まだありません）"),
    "",
    section(
      "FLEXIBLE_PREFERENCES（できれば叶えたい。必須スケジュールではない）",
      brief.flexiblePreferences,
      "（特にありません）",
    ),
    "",
    section("CONSTRAINTS（事実として確認できる条件）", brief.constraints, "（まだ整理されていません）"),
    "",
    section("OPEN_QUESTIONS（計画を大きく左右する未定事項）", brief.openQuestions, "（特にありません）"),
    "",
    section("PLANNING_CONSIDERATIONS（時間軸を考えるときの観点）", brief.planningConsiderations, "（なし）"),
    "",
    "## SAVED_SCHOOLS（status 付き）",
    ...savedSchoolLines,
    "",
    "# 指示",
    "上の PLANNING_BRIEF をもとに、propose_plan_timeline ツールで期間プランを提案してください。",
    "- FIXED_DECISIONS と CONSTRAINTS は必ず守る（HARD）。",
    "- FLEXIBLE_PREFERENCES は可能な範囲で組み込む（SOFT・必須ではない）。",
    "- 保存されていない学校・都市・目的・施設の固有名詞は追加しない。",
    "- 項目をただ均等に並べるのではなく、順序・準備期間・慣れる時間・優先順位を考える。",
    "- 決まっていないことは openQuestions に入れ、勝手に埋めない。",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* generate 可否ゲート                                                                  */
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

/** Karte stated だけでも十分な文脈があるか（blueprint が空でも生成可）。 */
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
    isStated("motivation.desiredOutcome") ||
    isStated("motivation.statedGoal")
  );
}

/* ------------------------------------------------------------------ */
/* AI raw → PlanTimeline（server で id / generatedAt 付与 → 既存 sanitize）              */
/* ------------------------------------------------------------------ */

/**
 * tool_use.input（AI raw）を PlanTimeline に合成する。
 *   - 各 period に server 生成の id を付ける（AI に UUID を作らせない）
 *   - generatedAt は server 時刻
 *   - 最終判定は Step 2-1 の sanitizePlanTimeline（壊れていたら null）。schema は変更しない（後方互換）。
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
