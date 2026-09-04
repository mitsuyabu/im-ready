/**
 * 新しい My Plan（「ユーザーが採用した実行プラン」）の pure view builder（Step 2-2）。
 *
 * source の扱い（最重要）:
 *   - saved       : plan_blueprint の値（＝ユーザーが採用済み）。primary display。
 *   - candidate   : まだ blueprint に無い Karte 由来の「候補」。saved と同じ見た目にしない。
 *
 * 原則:
 *   - Karte 候補は stated のみ（inferred は原則出さない・§56）。
 *   - conflict 中（karte.handoff.conflicts）の field は候補に出さない（§57）。
 *   - 値は Karte の既存フォーマット（getKarteSummaryItems）をそのまま使う。AI 要約はしない。
 *   - 具体職種・都市・体験を Karte に無いのに生成しない（§35 / §38 / §66）。
 *   - CRUD は無い。候補は read-only。
 *
 * components/MyPlan.tsx はこの view を presentation するだけにする（条件分岐を持たせない）。
 */

import type { Karte } from "@/lib/karte";
import { getKarteSummaryItems } from "@/lib/karte";
import type { School } from "@/lib/data/schools";
import type {
  BlueprintItem,
  BlueprintSchool,
  BlueprintSchoolStatus,
  LoadedPlanBlueprint,
  PlanTimeline,
} from "@/lib/planBlueprint";

export type MyPlanSectionId =
  | "goals"
  | "destination"
  | "school"
  | "work"
  | "things"
  | "milestones"
  | "timeline";

export type MyPlanSectionMeta = {
  id: MyPlanSectionId;
  enName: string;
  subtitle: string;
};

/** 固定 7 セクション（順序も固定）。 */
export const MY_PLAN_SECTIONS: MyPlanSectionMeta[] = [
  { id: "goals", enName: "Goals", subtitle: "この留学で実現したいこと" },
  { id: "destination", enName: "Destination", subtitle: "暮らしたい場所、行ってみたい場所" },
  { id: "school", enName: "School & English", subtitle: "学校と英語についての計画" },
  { id: "work", enName: "Work", subtitle: "現地で興味のある仕事" },
  { id: "things", enName: "Things to Do", subtitle: "この留学で経験したいこと" },
  { id: "milestones", enName: "Visa & Milestones", subtitle: "達成したい節目や手続き" },
  { id: "timeline", enName: "Timeline", subtitle: "留学期間全体の流れ" },
];

/** Karte 由来の候補（テキスト1件）。kind でヒント/参考として弱める。 */
export type MyPlanCandidate = {
  key: string;
  label: string;
  note?: string;
  /** "hint" = 都市選びのヒント・英語の参考情報など（さらに弱い表示）。 */
  kind?: "hint";
};

export type MyPlanSchoolCandidate = {
  key: string;
  name: string;
  nameJa: string | null;
  city: string | null;
  /** 提案区分（reference のときだけ「参考候補」。fake は入れない）。 */
  category: string | null;
  reason: string | null;
};

export type MyPlanHero = {
  headline: string;
  destination: { text: string; fromKarte: boolean } | null;
  school: string | null;
  departure: string | null;
  duration: string | null;
  budget: string | null;
};

/* ---- 月ベースの要約タイムライン（YOUR PLAN AT A GLANCE 直下の横図・§配置） ----
 * 役割は「1年の流れをひと目で」。詳細な activities / 理由は既存の詳細 Timeline セクションが担う。
 * fake は入れない。作れる範囲だけ（無理に 12 ヶ月を埋めない）。 */
export type MyPlanTimelinePhaseStatus = "saved" | "ai-suggested" | "considering";

export type MyPlanTimelinePhase = {
  key: string;
  /** 期間 or 順序のラベル（例: "1〜2ヶ月目" / "はじめ"）。根拠の無い月数は入れない。 */
  rangeLabel: string;
  title: string;
  note: string | null;
  status: MyPlanTimelinePhaseStatus;
};

export type MyPlanMonthlyTimeline = {
  /** 2〜6 フェーズ。 */
  phases: MyPlanTimelinePhase[];
  durationLabel: string | null;
  /** "saved-timeline" = 保存済み詳細 Timeline の要約 / "summary" = My Plan + Karte から順序だけ組成。 */
  source: "saved-timeline" | "summary";
};

export type MyPlanView = {
  hero: MyPlanHero;
  /** YOUR PLAN AT A GLANCE 直下の横タイムライン図。材料が無ければ null（セクション自体を出さない）。 */
  monthlyTimeline: MyPlanMonthlyTimeline | null;
  blueprintAvailable: boolean;
  blueprintExists: boolean;
  hasAnyContent: boolean;

  goals: { saved: BlueprintItem[]; candidates: MyPlanCandidate[] };
  destination: {
    savedPrimary: BlueprintItem | null;
    savedInterested: BlueprintItem[];
    candidates: MyPlanCandidate[];
    hints: MyPlanCandidate[];
  };
  school: {
    /** 保存済み学校（raw BlueprintSchool）。My Plan 側で status 変更 / 削除するため丸ごと持つ。 */
    savedSchools: BlueprintSchool[];
    candidates: MyPlanSchoolCandidate[];
    englishRef: MyPlanCandidate[];
  };
  /**
   * Work / Milestones の Karte 由来は「意向」だけで具体項目ではないため、採用（Planに追加）は
   * させず read-only の hint として表示する（§39 / §46）。
   */
  work: { saved: BlueprintItem[]; hints: MyPlanCandidate[] };
  things: { saved: BlueprintItem[]; candidates: MyPlanCandidate[] };
  milestones: { saved: BlueprintItem[]; hints: MyPlanCandidate[]; showVisaDisclaimer: boolean };
  timeline: PlanTimeline | null;
  /** AI 期間プランを生成してよいか（blueprint available ＋ 材料が最低限ある・§56-58）。 */
  timelineCanGenerate: boolean;
};

const KARTE_NOTE = "会話やWorksheetから";

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function formatMan(yen: number): string {
  return `${Math.round(yen / 10000).toLocaleString("ja-JP")}万円`;
}

/** 1 行の短い補足へ（改行 / 句点で切って、長すぎれば省略）。AI 要約はしない・機械的に切るだけ。 */
function firstLine(s: string, max = 46): string {
  const t = (s.split(/[\n。！？]/)[0] ?? s).trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** fallback（summary）モードの順序ラベル。根拠の無い月数は使わない。 */
const PHASE_SEQ_LABELS = ["はじめ", "中盤", "後半", "仕上げ", "その先"];

/**
 * 月ベースの要約タイムライン（横図）用データ。
 *   1) 保存済みの詳細 Timeline があれば、その period をそのまま要約図にする（最優先・§優先順位）
 *   2) 無ければ My Plan 保存内容（＋ Karte hint）から「順序」だけの summary phase を組成する
 *      （根拠のある phase だけ。month 数は AI Timeline を作るまで入れない）
 * どちらも作れない（phase < 2）なら null。
 */
function buildMonthlyTimeline(input: {
  timeline: PlanTimeline | null;
  goals: BlueprintItem[];
  workInterests: BlueprintItem[];
  milestones: BlueprintItem[];
  schools: BlueprintSchool[];
  englishRef: MyPlanCandidate[];
  schoolCandidates: MyPlanSchoolCandidate[];
  workHints: MyPlanCandidate[];
  milestoneHints: MyPlanCandidate[];
  goalCandidates: MyPlanCandidate[];
  durationLabelFromKarte: string | null;
}): MyPlanMonthlyTimeline | null {
  const { timeline } = input;

  /* 1) 保存済みの詳細 Timeline を図に要約 */
  if (timeline && timeline.periods.length > 0) {
    const phases: MyPlanTimelinePhase[] = timeline.periods.slice(0, 6).map((p, i) => {
      const rawNote =
        p.activities.find((a) => a.trim().length > 0)?.trim() ??
        (p.reason.trim() ? p.reason.trim() : null);
      return {
        key: p.id || `tl-${i}`,
        rangeLabel: p.label.trim().slice(0, 16) || `${i + 1}`,
        title: p.title.trim() || "—",
        note: rawNote ? firstLine(rawNote) : null,
        status: "saved" as const,
      };
    });
    return {
      phases,
      durationLabel: timeline.durationLabel.trim() || input.durationLabelFromKarte,
      source: "saved-timeline",
    };
  }

  /* 2) fallback: My Plan 保存内容 ＋ Karte hint から順序だけの summary phase */
  const phases: MyPlanTimelinePhase[] = [];
  const add = (title: string, note: string | null, status: MyPlanTimelinePhaseStatus) => {
    phases.push({ key: `sum-${phases.length}`, rangeLabel: "", title, note, status });
  };

  if (input.schools.length > 0) {
    add("語学学校に通う", input.englishRef[0]?.label ?? input.schools[0].name, "saved");
  } else if (input.englishRef.length > 0 || input.schoolCandidates.length > 0) {
    add(
      "語学学校を検討する",
      input.englishRef[0]?.label ?? input.schoolCandidates[0]?.name ?? null,
      "considering",
    );
  }

  if (input.workInterests.length > 0) {
    add(
      "現地で仕事を探す",
      input.workInterests
        .slice(0, 2)
        .map((w) => w.label)
        .join(" / ") || null,
      "saved",
    );
  } else if (input.workHints.length > 0) {
    add("働くことを考える", input.workHints[0].label, "considering");
  }

  if (input.milestones.length > 0) {
    add(
      input.milestones.length === 1
        ? firstLine(input.milestones[0].label, 22)
        : "ビザ・節目に取り組む",
      input.milestones.length === 1
        ? null
        : input.milestones
            .slice(0, 2)
            .map((m) => m.label)
            .join(" / "),
      "saved",
    );
  } else if (input.milestoneHints.length > 0) {
    add("ビザ・進路を判断する", input.milestoneHints[0].label, "considering");
  }

  const careerGoal = input.goals.find((g) => /仕事|キャリア|就職|転職|将来|進路|帰国/.test(g.label));
  if (careerGoal) {
    add("進路を整理する", firstLine(careerGoal.label, 30), "saved");
  } else if (input.goalCandidates.some((c) => c.key === "work.postReturnCareer")) {
    const c = input.goalCandidates.find((x) => x.key === "work.postReturnCareer");
    if (c) add("進路を整理する", firstLine(c.label, 30), "considering");
  }

  if (phases.length < 2) return null;

  const trimmed = phases.slice(0, 5);
  trimmed.forEach((p, i) => {
    p.rangeLabel = PHASE_SEQ_LABELS[i] ?? `${i + 1}`;
  });

  return { phases: trimmed, durationLabel: input.durationLabelFromKarte, source: "summary" };
}

/**
 * Hero headline / Hero metric に「都市名」として使ってよい文字列か。長文の preferredCity を
 * そのまま Hero へ流さないための機械的ガード（§64）。意味解析で「Gold Coast」だけ抜くことはしない。
 */
function isUsableCityLabel(s: string): boolean {
  const t = s.trim();
  if (t.length === 0 || t.length > 40) return false;
  if (/[\n\r]/.test(t)) return false;
  const punct = (t.match(/[。．.!！?？、，,]/g) ?? []).length;
  return punct < 2;
}

export function buildMyPlanView(
  karte: Karte,
  blueprint: LoadedPlanBlueprint,
  schools: School[],
  planTitle: string,
): MyPlanView {
  const data = blueprint.data;

  /* ---- Karte の安全なアクセサ ---- */
  const summary = new Map(
    getKarteSummaryItems(karte).map((it) => [`${it.block}.${it.key}`, it]),
  );
  const conflictKeys = new Set(
    karte.handoff.conflicts.map((c) => `${c.block}.${c.key}`),
  );
  /** stated かつ conflict 中でない SummaryItem のみ返す。 */
  const stated = (block: string, key: string) => {
    const id = `${block}.${key}`;
    const it = summary.get(id);
    if (!it || it.certainty !== "stated" || conflictKeys.has(id)) return null;
    return it;
  };

  /* ---- Goals ---- */
  const savedGoalLabels = new Set(data.goals.map((g) => norm(g.label)));
  const goalCandidates: MyPlanCandidate[] = [];
  for (const [block, key] of [
    ["motivation", "desiredOutcome"],
    ["work", "postReturnCareer"],
  ] as const) {
    const it = stated(block, key);
    if (it && !savedGoalLabels.has(norm(it.value))) {
      goalCandidates.push({ key: `${block}.${key}`, label: it.value, note: KARTE_NOTE });
    }
  }

  /* ---- Destination ---- */
  const savedCityLabels = new Set(
    [data.destinations.primary, ...data.destinations.interested]
      .filter((x): x is BlueprintItem => x !== null)
      .map((x) => norm(x.label)),
  );
  const destinationCandidates: MyPlanCandidate[] = [];
  const preferredCity = stated("schoolPrefs", "preferredCity");
  if (preferredCity && !savedCityLabels.has(norm(preferredCity.value))) {
    destinationCandidates.push({
      key: "schoolPrefs.preferredCity",
      label: preferredCity.value,
      note: "Karteから",
    });
  }
  const destinationHints: MyPlanCandidate[] = [];
  for (const [block, key] of [
    ["lifestyle", "cityVsNature"],
    ["lifestyle", "climate"],
  ] as const) {
    const it = stated(block, key);
    if (it) destinationHints.push({ key: `${block}.${key}`, label: it.value, kind: "hint" });
  }

  /* ---- School & English ---- */
  const schoolBySlug = new Map(schools.map((s) => [s.schoolSlug, s]));
  const savedSchoolSlugs = new Set(
    data.schools.map((s) => s.schoolSlug).filter((x): x is string => x !== null),
  );
  const savedSchoolNameCity = new Set(
    data.schools.map((s) => `${norm(s.name)}|${norm(s.city ?? "")}`),
  );

  const savedSchools: BlueprintSchool[] = data.schools;

  const schoolCandidates: MyPlanSchoolCandidate[] = [];
  for (const p of karte.proposals.presented) {
    if (p.type !== "school") continue;
    const master = schoolBySlug.get(p.id);
    if (!master) continue; // 名前が出せない候補は出さない（fake しない）
    if (savedSchoolSlugs.has(p.id)) continue; // 保存済みは候補に出さない
    if (savedSchoolNameCity.has(`${norm(master.name)}|${norm(master.city)}`)) continue;
    if (schoolCandidates.some((c) => c.key === p.id)) continue;
    schoolCandidates.push({
      key: p.id,
      name: master.name,
      nameJa: master.nameJa ?? null,
      city: master.city,
      category: p.category === "reference" ? "参考候補" : null,
      reason: p.reason ? p.reason.trim() || null : null,
    });
    if (schoolCandidates.length >= 3) break;
  }

  const englishRef: MyPlanCandidate[] = [];
  for (const [block, key] of [
    ["language", "selfLevel"],
    ["language", "weakSkills"],
  ] as const) {
    const it = stated(block, key);
    if (it) englishRef.push({ key: `${block}.${key}`, label: `${it.label}: ${it.value}`, kind: "hint" });
  }

  /* ---- Work ---- Karte 由来は「意向」だけなので read-only hint（採用ボタンは付けない・§39） ---- */
  const workHints: MyPlanCandidate[] = [];
  if (
    karte.work.wantsToWork.certainty === "stated" &&
    karte.work.wantsToWork.value === true &&
    !conflictKeys.has("work.wantsToWork")
  ) {
    workHints.push({ key: "work.wantsToWork", label: "現地で働くことに関心がある", note: KARTE_NOTE });
  }
  if (
    karte.work.workingHolidayInterest.certainty === "stated" &&
    karte.work.workingHolidayInterest.value === true &&
    !conflictKeys.has("work.workingHolidayInterest")
  ) {
    workHints.push({
      key: "work.workingHolidayInterest",
      label: "ワーキングホリデーに関心がある",
      note: KARTE_NOTE,
    });
  }

  /* ---- Things to Do ---- Karte に安全に対応する field が無いため候補は出さない（§38） ---- */
  const thingsCandidates: MyPlanCandidate[] = [];

  /* ---- Visa & Milestones ---- Karte 由来（WH への関心）は「取得目標」ではないため read-only hint（§45 / §46） ---- */
  const milestoneHints: MyPlanCandidate[] = [];
  if (
    karte.work.workingHolidayInterest.certainty === "stated" &&
    karte.work.workingHolidayInterest.value === true &&
    !conflictKeys.has("work.workingHolidayInterest")
  ) {
    milestoneHints.push({
      key: "work.workingHolidayInterest",
      label: "ワーキングホリデーに関心がある",
      note: KARTE_NOTE,
    });
  }
  const visaRe = /ビザ|visa|ワーホリ|ワーキングホリデー|セカンド/i;
  const showVisaDisclaimer = [...data.milestones, ...milestoneHints].some((x) =>
    visaRe.test(x.label),
  );

  /* ---- Timeline ---- */
  const timeline = blueprint.timeline;

  /* ---- Hero ---- */
  // Hero に出す都市ラベルは isUsableCityLabel を満たすものだけ（長文はここへ流さない・§63-65）。
  const blueprintPrimaryCity =
    data.destinations.primary && isUsableCityLabel(data.destinations.primary.label)
      ? data.destinations.primary.label
      : null;
  const usableKarteCity =
    preferredCity && isUsableCityLabel(preferredCity.value) ? preferredCity.value : null;

  let heroDestination: MyPlanHero["destination"] = null;
  if (blueprintPrimaryCity) {
    heroDestination = { text: blueprintPrimaryCity, fromKarte: false };
  } else if (usableKarteCity) {
    heroDestination = { text: usableKarteCity, fromKarte: true };
  }

  let heroSchool: string | null = null;
  if (savedSchools.length > 0) {
    const byStatus = (st: BlueprintSchoolStatus) => savedSchools.filter((s) => s.status === st);
    const selected = byStatus("selected");
    const preferred = byStatus("preferred");
    const considering = byStatus("considering");
    if (selected.length >= 1) heroSchool = selected[0].name;
    else if (preferred.length === 1) heroSchool = preferred[0].name;
    else if (preferred.length > 1) heroSchool = `第一候補 ${preferred.length}校`;
    else if (considering.length === 1) heroSchool = considering[0].name;
    else heroSchool = `候補校 ${savedSchools.length}校`;
  }

  const durationField = karte.timing.durationWeeks;
  const heroDuration =
    durationField.certainty === "stated" && typeof durationField.value === "number"
      ? `${durationField.value}週間`
      : null;
  // 要約タイムラインの全体ラベル用（週→月の概算。根拠が無ければ null）。
  const durationLabelFromKarte =
    durationField.certainty === "stated" && typeof durationField.value === "number"
      ? `約${Math.max(1, Math.round(durationField.value / 4.345))}ヶ月`
      : null;
  const budgetField = karte.budget.totalCap;
  const heroBudget =
    budgetField.certainty === "stated" && typeof budgetField.value === "number"
      ? formatMan(budgetField.value)
      : null;
  const departureItem = stated("timing", "departureTiming");
  const heroDeparture = departureItem ? departureItem.value : null;

  // headline は説明文ではなく Plan の短いタイトル（AI 生成しない・§61-62）。
  let headline: string;
  if (blueprintPrimaryCity) headline = `${blueprintPrimaryCity}でつくるMy Plan`;
  else if (usableKarteCity) headline = `${usableKarteCity}で考えているMy Plan`;
  else headline = planTitle || "My Plan";

  const hero: MyPlanHero = {
    headline,
    destination: heroDestination,
    school: heroSchool,
    departure: heroDeparture,
    duration: heroDuration,
    budget: heroBudget,
  };

  /* ---- 月ベースの要約タイムライン（図） ---- */
  const monthlyTimeline = buildMonthlyTimeline({
    timeline,
    goals: data.goals,
    workInterests: data.workInterests,
    milestones: data.milestones,
    schools: data.schools,
    englishRef,
    schoolCandidates,
    workHints,
    milestoneHints,
    goalCandidates,
    durationLabelFromKarte,
  });

  /* ---- hasAnyContent（§50） ---- */
  const savedHasContent =
    data.goals.length > 0 ||
    data.destinations.primary !== null ||
    data.destinations.interested.length > 0 ||
    data.schools.length > 0 ||
    data.workInterests.length > 0 ||
    data.thingsToDo.length > 0 ||
    data.milestones.length > 0;
  const candidatesHaveContent =
    goalCandidates.length > 0 ||
    destinationCandidates.length > 0 ||
    destinationHints.length > 0 ||
    schoolCandidates.length > 0 ||
    englishRef.length > 0 ||
    workHints.length > 0 ||
    milestoneHints.length > 0;
  const hasAnyContent = savedHasContent || timeline !== null || candidatesHaveContent;

  const timelineCanGenerate =
    blueprint.available &&
    (savedHasContent ||
      stated("timing", "departureTiming") !== null ||
      stated("schoolPrefs", "preferredCity") !== null ||
      stated("motivation", "desiredOutcome") !== null ||
      (karte.timing.durationWeeks.certainty === "stated" &&
        karte.timing.durationWeeks.value != null) ||
      (karte.budget.totalCap.certainty === "stated" && karte.budget.totalCap.value != null));

  return {
    hero,
    monthlyTimeline,
    blueprintAvailable: blueprint.available,
    blueprintExists: blueprint.exists,
    hasAnyContent,
    goals: { saved: data.goals, candidates: goalCandidates },
    destination: {
      savedPrimary: data.destinations.primary,
      savedInterested: data.destinations.interested,
      candidates: destinationCandidates,
      hints: destinationHints,
    },
    school: { savedSchools, candidates: schoolCandidates, englishRef },
    work: { saved: data.workInterests, hints: workHints },
    things: { saved: data.thingsToDo, candidates: thingsCandidates },
    milestones: {
      saved: data.milestones,
      hints: milestoneHints,
      showVisaDisclaimer,
    },
    timeline,
    timelineCanGenerate,
  };
}
