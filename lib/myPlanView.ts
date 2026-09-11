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
import { accommodationLabel, guessAccommodationType } from "@/lib/planBlueprint";
import type {
  BlueprintAccommodation,
  BlueprintDestinations,
  BlueprintItem,
  BlueprintSchool,
  BlueprintSchoolStatus,
  BlueprintStay,
  LoadedPlanBlueprint,
  PlanTimeline,
} from "@/lib/planBlueprint";

export type MyPlanSectionId =
  | "goals"
  | "destination"
  | "accommodation"
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

/** 固定セクション（順序も固定）。「どこにいるか → どう住むか → 何を学ぶか → どう働くか」の流れ（§17）。 */
export const MY_PLAN_SECTIONS: MyPlanSectionMeta[] = [
  { id: "goals", enName: "Goals", subtitle: "この留学で実現したいこと" },
  { id: "destination", enName: "Destination", subtitle: "暮らしたい場所、行ってみたい場所" },
  { id: "accommodation", enName: "Accommodation", subtitle: "どこで、どんなふうに暮らすか" },
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
  budget: string | null;
};

/** Plan 全体期間の由来（UI の source 表示 / AI の HARD 判定に使う・§1 / §23）。 */
export type PlanDurationSource = "blueprint" | "karte" | "unknown";

/* ---- YOUR PLAN TIMELINE（YOUR PLAN AT A GLANCE 直下の横図） ----
 * Plan 全体期間（planSettings.durationMonths > Karte 由来）を軸にした「実時間スケール」の
 * タイムライン。activity は実際の startMonth / durationMonths の位置へ配置する。
 * 全体期間が不明なときだけ従来の「順序だけ」の summary モードにフォールバックする。
 * 期間未設定の保存済み activity も消さず「時期未定」領域に出す。fake な月レンジは作らない。 */
export type MyPlanTimelinePhaseStatus = "saved" | "ai-suggested" | "considering";

export type MyPlanTimelinePhase = {
  key: string;
  /** 期間 or 順序のラベル（例: "1〜2ヶ月目" / "はじめ"）。根拠の無い月数は入れない。 */
  rangeLabel: string;
  title: string;
  note: string | null;
  status: MyPlanTimelinePhaseStatus;
};

/** month-scale 上に「幅」を持って配置される activity（startMonth ＋ durationMonths 両方あり・§13）。 */
export type MyPlanTimedPhase = {
  key: string;
  title: string;
  note: string | null;
  status: MyPlanTimelinePhaseStatus;
  startMonth: number;
  durationMonths: number;
  /** 視覚に依存しない range text（例: "1〜2ヶ月目"・§32）。 */
  rangeLabel: string;
  /** 時期を編集するセクション（"時期を設定" リンク先）。 */
  section: "school" | "work";
};

/** startMonth のみ判明（durationMonths 不明）。月位置に point marker として置く（§14）。終了月は作らない。 */
export type MyPlanPointPhase = {
  key: string;
  title: string;
  /** タイトルの下に小さく出す補足（School なら学校名）。 */
  note: string | null;
  status: MyPlanTimelinePhaseStatus;
  startMonth: number;
  /** 例: "4ヶ月目〜"。 */
  label: string;
  section: "school" | "work";
};

/** 時期を決めていない保存済み activity（§15 / §16 / §19 / §55）。Timeline から消さず別領域に出す。 */
export type MyPlanUnscheduledPhase = {
  key: string;
  title: string;
  status: MyPlanTimelinePhaseStatus;
  /** "時期を設定" リンク先セクション。 */
  section: "school" | "work" | "destination" | "accommodation";
  /** durationMonths だけ / range だけ設定されている場合の補足。位置は作らない（§15）。 */
  durationNote: string | null;
};

/** month-scale の DESTINATIONS lane に配置する滞在都市（§25-§29）。Destination だけ startMonth 0 を許可。 */
export type MyPlanDestPhase = {
  key: string;
  city: string;
  /** 0 = 到着時（§4）。 */
  startMonth: number;
  /** null = 開始のみ判明（point）。 */
  durationMonths: number | null;
  /** 例: "到着〜2ヶ月目" / "6〜8ヶ月目" / "3ヶ月目〜"。 */
  rangeLabel: string;
  isPrimary: boolean;
};

/** month-scale の ACCOMMODATION lane（滞在方法）。startMonth 0 = 到着時 を許可。 */
export type MyPlanAccPhase = {
  key: string;
  label: string;
  startMonth: number;
  /** null = 開始のみ判明（point）。 */
  durationMonths: number | null;
  rangeLabel: string;
};

export type MyPlanMonthlyTimeline = {
  /**
   * 図の出どころ:
   *   "month-scale"    = Plan 全体期間を軸にした実スケール表示（timedPhases / pointPhases を配置）
   *   "saved-timeline" = 保存済み詳細 Timeline の要約（AI 提案として表示・§36）
   *   "summary"        = My Plan + Karte から順序だけ組成（全体期間が不明なとき等）
   */
  source: "month-scale" | "saved-timeline" | "summary";
  /** month-scale モードの軸の全長（月）。null なら summary モード。 */
  totalMonths: number | null;
  durationLabel: string | null;

  /** month-scale モードで軸に配置する activity。 */
  timedPhases: MyPlanTimedPhase[];
  pointPhases: MyPlanPointPhase[];

  /** summary モードで並べる順序フェーズ。 */
  summaryPhases: MyPlanTimelinePhase[];

  /** month-scale モードの DESTINATIONS lane（滞在都市）。他モードでは空。 */
  destinationPhases: MyPlanDestPhase[];
  /** month-scale モードの ACCOMMODATION lane（滞在方法・§25）。他モードでは空。 */
  accommodationPhases: MyPlanAccPhase[];
  /** Month 0 の到着アンカー。primary city があれば表示。hasBar = 到着 stay あり。 */
  arrival: { city: string; hasBar: boolean } | null;

  /**
   * 時期未設定の保存済み activity。timeline は「時期が決まっている予定」だけを載せる場所に
   * したため、現在 UI では描画しない（データは plan_blueprint に残り、各セクションで編集できる）。
   */
  unscheduledPhases: MyPlanUnscheduledPhase[];
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
    savedStays: BlueprintStay[];
    candidates: MyPlanCandidate[];
    hints: MyPlanCandidate[];
  };
  accommodation: {
    saved: BlueprintAccommodation[];
    /** Karte stated（schoolPrefs.accommodation）由来の候補。未採用。1 件だけ。 */
    candidate: { type: string; label: string } | null;
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
  /**
   * 留学全体の期間（月）。優先度: My Plan user-saved（planSettings） > Karte stated 由来 > null（§1 / §22）。
   * School / Work timing の選択肢範囲・超過 warning・YEARLY PLAN の durationLabel・AI の HARD 条件に使う。
   */
  planDurationMonths: number | null;
  /** 上の値の由来。 */
  planDurationSource: PlanDurationSource;
  /** My Plan override とは別に、Karte から機械変換した期間（月）。override 解除時の即時 fallback 表示用。 */
  planDurationKarteMonths: number | null;
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

/** 「Nヶ月目」/「N〜Mヶ月目」の月区間ラベル（School / Work。start >= 1・§35 / §36 で不変）。 */
function monthRangeLabel(startMonth: number, durationMonths: number): string {
  const end = startMonth + durationMonths - 1;
  return durationMonths <= 1 ? `${startMonth}ヶ月目` : `${startMonth}〜${end}ヶ月目`;
}

/**
 * Destination の月区間ラベル（startMonth 0 = 到着時 を許容・§15-§17）。
 *   start=0 duration=3 → end 2 → "到着〜2ヶ月目"（0,1,2 の 3ヶ月相当）
 *   start=6 duration=2 → "6〜7ヶ月目"
 *   duration 未設定（開始のみ）→ "到着〜" / "Nヶ月目〜"
 */
function destRangeLabel(startMonth: number, durationMonths: number | null): string {
  if (durationMonths == null) {
    return startMonth === 0 ? "到着〜" : `${startMonth}ヶ月目〜`;
  }
  const end = startMonth + durationMonths - 1;
  if (startMonth === 0) return end <= 0 ? "到着時" : `到着〜${end}ヶ月目`;
  return monthRangeLabel(startMonth, durationMonths);
}

/**
 * Yearly Plan で扱う activity（§20-§23）:
 *   - School は実行 Plan に入る selected / preferred のみ（considering は比較候補・§22）
 *   - Work は saved workInterests すべて（§23）
 * を timing の埋まり方で 3 分類する。設定していない項目に fake な月を割り当てない（§15 / §37）。
 */
type ActivityCandidate = {
  key: string;
  /** Timeline カードのタイトル。School は行動カテゴリ「語学学校」（校名ではない・§1）。 */
  title: string;
  /** タイトルの下に小さく出す補足（School の校名など・§1）。 */
  subtitle: string | null;
  section: "school" | "work";
  startMonth: number | undefined;
  durationMonths: number | undefined;
};

function collectYearlyActivities(
  schools: BlueprintSchool[],
  workInterests: BlueprintItem[],
): {
  timed: MyPlanTimedPhase[];
  point: MyPlanPointPhase[];
  unscheduled: MyPlanUnscheduledPhase[];
} {
  const cands: ActivityCandidate[] = [];
  schools.forEach((s, i) => {
    if (s.status !== "selected" && s.status !== "preferred") return;
    cands.push({
      key: `sch-${s.id || i}`,
      title: "語学学校",
      subtitle: firstLine(s.name, 28),
      section: "school",
      startMonth: typeof s.startMonth === "number" ? s.startMonth : undefined,
      durationMonths: typeof s.durationMonths === "number" ? s.durationMonths : undefined,
    });
  });
  workInterests.forEach((w, i) => {
    cands.push({
      key: `wrk-${w.id || i}`,
      title: firstLine(w.label, 24),
      subtitle: null,
      section: "work",
      startMonth: typeof w.startMonth === "number" ? w.startMonth : undefined,
      durationMonths: typeof w.durationMonths === "number" ? w.durationMonths : undefined,
    });
  });

  const timed: MyPlanTimedPhase[] = [];
  const point: MyPlanPointPhase[] = [];
  const unscheduled: MyPlanUnscheduledPhase[] = [];
  for (const c of cands) {
    const hasStart = c.startMonth != null;
    const hasDur = c.durationMonths != null;
    if (hasStart && hasDur) {
      timed.push({
        key: c.key,
        title: c.title,
        note: c.subtitle,
        status: "saved",
        startMonth: c.startMonth as number,
        durationMonths: c.durationMonths as number,
        rangeLabel: monthRangeLabel(c.startMonth as number, c.durationMonths as number),
        section: c.section,
      });
    } else if (hasStart) {
      point.push({
        key: c.key,
        title: c.title,
        note: c.subtitle,
        status: "saved",
        startMonth: c.startMonth as number,
        label: `${c.startMonth}ヶ月目〜`,
        section: c.section,
      });
    } else {
      unscheduled.push({
        key: c.key,
        title: c.subtitle ? `${c.title}（${c.subtitle}）` : c.title,
        status: "saved",
        section: c.section,
        durationNote: hasDur ? `約${c.durationMonths}ヶ月` : null,
      });
    }
  }
  timed.sort((a, b) => a.startMonth - b.startMonth || a.durationMonths - b.durationMonths);
  point.sort((a, b) => a.startMonth - b.startMonth);
  return { timed: timed.slice(0, 8), point: point.slice(0, 8), unscheduled: unscheduled.slice(0, 8) };
}

/**
 * ACTIVITIES の lane packing（§9-§13）。時間範囲が重ならない timed activity（School / Work）を
 * 同じ lane にまとめる。startMonth 昇順（同着は短い方が先）で処理し、各 phase を
 * 「startMonth > その lane 末尾の endMonth」を満たす最初の lane へ配置。無ければ新 lane。
 * endMonth = startMonth + durationMonths - 1（§13）。Destination / Accommodation は対象外（§15）。
 */
export function packActivityLanes(phases: MyPlanTimedPhase[]): MyPlanTimedPhase[][] {
  const sorted = [...phases].sort(
    (a, b) => a.startMonth - b.startMonth || a.durationMonths - b.durationMonths,
  );
  const lanes: { items: MyPlanTimedPhase[]; lastEnd: number }[] = [];
  for (const p of sorted) {
    const end = p.startMonth + p.durationMonths - 1;
    const lane = lanes.find((l) => p.startMonth > l.lastEnd);
    if (lane) {
      lane.items.push(p);
      lane.lastEnd = end;
    } else {
      lanes.push({ items: [p], lastEnd: end });
    }
  }
  return lanes.map((l) => l.items);
}

/**
 * Destination（stays ＋ interests）を DESTINATIONS lane 用に整理する。
 *   - stays: startMonth あり（0 含む）→ dest phase（軸に配置。durationMonths 無しは point）
 *            startMonth なし → 時期未定（section "destination"）
 *   - interested（wishlist）で対応する stay が無い都市 → 時期未定に残す（§5）
 * 同じ都市が複数 stay あっても別バーで表示（key = stay id）。
 * 到着アンカー: startMonth 0 か isArrival の stay があればその都市、無ければ primary の都市。
 */
function collectDestinationPhases(dest: BlueprintDestinations): {
  phases: MyPlanDestPhase[];
  unscheduled: MyPlanUnscheduledPhase[];
  arrival: { city: string; hasTiming: boolean } | null;
} {
  const phases: MyPlanDestPhase[] = [];
  const unscheduled: MyPlanUnscheduledPhase[] = [];
  const placedCities = new Set<string>();

  for (const s of dest.stays) {
    const hasStart = typeof s.startMonth === "number";
    const hasDur = typeof s.durationMonths === "number";
    placedCities.add(norm(s.city));
    if (hasStart) {
      const start = s.startMonth as number;
      const dur = hasDur ? (s.durationMonths as number) : null;
      phases.push({
        key: `stay-${s.id}`,
        city: firstLine(s.city, 24),
        startMonth: start,
        durationMonths: dur,
        rangeLabel: destRangeLabel(start, dur),
        isPrimary: s.isArrival === true || start === 0,
      });
    } else {
      unscheduled.push({
        key: `stay-${s.id}`,
        title: firstLine(s.city, 24),
        status: "saved",
        section: "destination",
        durationNote: hasDur ? `約${s.durationMonths}ヶ月` : null,
      });
    }
  }
  phases.sort((a, b) => a.startMonth - b.startMonth || (b.durationMonths ?? 0) - (a.durationMonths ?? 0));

  // 行ってみたい都市（wishlist）で対応する stay が無いものは「時期未定」に残す（§5）。
  const primaryNorm = dest.primary ? norm(dest.primary.label) : null;
  for (const c of dest.interested) {
    if (placedCities.has(norm(c.label))) continue;
    if (primaryNorm === norm(c.label)) continue;
    unscheduled.push({
      key: `int-${c.id}`,
      title: firstLine(c.label, 24),
      status: "saved",
      section: "destination",
      durationNote: null,
    });
  }

  // 到着アンカー: 到着 stay（startMonth 0 or isArrival）の都市 → 無ければ primary。
  const arrivalStay =
    dest.stays.find((s) => s.isArrival === true) ??
    dest.stays.find((s) => s.startMonth === 0) ??
    null;
  const arrival = arrivalStay
    ? { city: firstLine(arrivalStay.city, 24), hasTiming: typeof arrivalStay.startMonth === "number" }
    : dest.primary
      ? { city: firstLine(dest.primary.label, 24), hasTiming: false }
      : null;

  return { phases: phases.slice(0, 10), unscheduled: unscheduled.slice(0, 10), arrival };
}

/**
 * Accommodation（滞在方法）を ACCOMMODATION lane 用に整理する（§22-§28）。
 *   - startMonth あり（0 含む）→ acc phase（durationMonths 無しは point・§23）
 *   - startMonth なし → 時期未定（section "accommodation"・§24 / §49）
 * 同じ type が複数あってもそれぞれ別バー（key = record id・§21）。
 */
function collectAccommodationPhases(accs: BlueprintAccommodation[]): {
  phases: MyPlanAccPhase[];
  unscheduled: MyPlanUnscheduledPhase[];
} {
  const phases: MyPlanAccPhase[] = [];
  const unscheduled: MyPlanUnscheduledPhase[] = [];
  for (const a of accs) {
    const label = accommodationLabel(a);
    const hasStart = typeof a.startMonth === "number";
    const hasDur = typeof a.durationMonths === "number";
    if (hasStart) {
      const start = a.startMonth as number;
      const dur = hasDur ? (a.durationMonths as number) : null;
      phases.push({
        key: `acc-${a.id}`,
        label: firstLine(label, 24),
        startMonth: start,
        durationMonths: dur,
        rangeLabel: destRangeLabel(start, dur),
      });
    } else {
      unscheduled.push({
        key: `acc-${a.id}`,
        title: firstLine(label, 24),
        status: "saved",
        section: "accommodation",
        durationNote: hasDur ? `約${a.durationMonths}ヶ月` : null,
      });
    }
  }
  phases.sort((x, y) => x.startMonth - y.startMonth || (y.durationMonths ?? 0) - (x.durationMonths ?? 0));
  return { phases: phases.slice(0, 10), unscheduled: unscheduled.slice(0, 10) };
}

/** dest phase を（軸が作れないとき）unscheduled として扱う。range だけ note に残す（§55）。 */
function destPhaseToUnscheduled(p: MyPlanDestPhase): MyPlanUnscheduledPhase {
  return {
    key: p.key,
    title: p.city,
    status: "saved",
    section: "destination",
    durationNote: p.rangeLabel,
  };
}

/** acc phase を（軸が作れないとき）unscheduled として扱う。range だけ note に残す。 */
function accPhaseToUnscheduled(p: MyPlanAccPhase): MyPlanUnscheduledPhase {
  return {
    key: p.key,
    title: p.label,
    status: "saved",
    section: "accommodation",
    durationNote: p.rangeLabel,
  };
}

/** point phase を（軸が作れないとき）unscheduled として扱う。開始月だけは note に残す。 */
function pointToUnscheduled(p: MyPlanPointPhase): MyPlanUnscheduledPhase {
  return {
    key: p.key,
    title: p.title,
    status: p.status,
    section: p.section,
    durationNote: p.label,
  };
}

/**
 * YOUR PLAN TIMELINE 用データ。
 *   0) Plan 全体期間（planDurationMonths）があり、軸に載る activity（timed / point）が 1 件以上
 *      → month-scale モード（実時間スケール・§1-§7）。未設定の保存済み activity は unscheduled へ。
 *   1) 軸は作れないが保存済み詳細 Timeline がある → その period を要約（AI 提案として・§36）
 *   2) それ以外 → My Plan 保存内容（＋ Karte hint）から順序だけの summary phase
 * 全体期間が無くても user timing があれば、その month レンジで順序表示する（§25 / §33）。
 * 何も出せない（軸なし / summary < 2）なら null。時期未定項目しか無いときも null（timeline には出さない）。
 */
function buildMonthlyTimeline(input: {
  timeline: PlanTimeline | null;
  goals: BlueprintItem[];
  workInterests: BlueprintItem[];
  milestones: BlueprintItem[];
  schools: BlueprintSchool[];
  destinations: BlueprintDestinations;
  accommodations: BlueprintAccommodation[];
  englishRef: MyPlanCandidate[];
  schoolCandidates: MyPlanSchoolCandidate[];
  workHints: MyPlanCandidate[];
  milestoneHints: MyPlanCandidate[];
  goalCandidates: MyPlanCandidate[];
  /** 解決済みの Plan 全体期間（月・My Plan user-saved > Karte 由来）。null なら軸を作れない（§24 / §25）。 */
  planDurationMonths: number | null;
  /** 上の値のラベル（"約12ヶ月"）。図の右上に出す。 */
  planDurationLabel: string | null;
}): MyPlanMonthlyTimeline | null {
  const { timeline, planDurationMonths, planDurationLabel } = input;

  const { timed, point, unscheduled } = collectYearlyActivities(
    input.schools,
    input.workInterests,
  );
  const dst = collectDestinationPhases(input.destinations);
  const acc = collectAccommodationPhases(input.accommodations);

  // 軸に載せられる中身: School/Work、滞在都市、滞在方法、または到着都市。
  const hasScaleContent =
    timed.length > 0 ||
    point.length > 0 ||
    dst.phases.length > 0 ||
    acc.phases.length > 0 ||
    dst.arrival != null;

  /** 軸が無いモードでは滞在都市・滞在方法もすべて「時期未定」に回す（fake placement しない）。 */
  const noAxisUnscheduled = () =>
    [
      ...point.map(pointToUnscheduled),
      ...unscheduled,
      ...dst.phases.map(destPhaseToUnscheduled),
      ...dst.unscheduled,
      ...acc.phases.map(accPhaseToUnscheduled),
      ...acc.unscheduled,
    ].slice(0, 12);

  /* 0-a) month-scale モード: 全体期間あり ＋ 軸に載る中身あり */
  if (planDurationMonths != null && hasScaleContent) {
    return {
      source: "month-scale",
      totalMonths: planDurationMonths,
      durationLabel: planDurationLabel,
      timedPhases: timed,
      pointPhases: point,
      summaryPhases: [],
      destinationPhases: dst.phases,
      accommodationPhases: acc.phases,
      arrival: dst.arrival ? { city: dst.arrival.city, hasBar: dst.arrival.hasTiming } : null,
      unscheduledPhases: [...unscheduled, ...dst.unscheduled, ...acc.unscheduled].slice(0, 12),
    };
  }

  /* 0-b) 全体期間は不明だが user timing はある → その month レンジで順序表示（軸なし・§25） */
  if (planDurationMonths == null && timed.length > 0) {
    return {
      source: "summary",
      totalMonths: null,
      durationLabel: planDurationLabel,
      timedPhases: [],
      pointPhases: [],
      summaryPhases: timed.map((t) => ({
        key: t.key,
        rangeLabel: t.rangeLabel,
        title: t.title,
        note: null,
        status: t.status,
      })),
      destinationPhases: [],
      accommodationPhases: [],
      arrival: null,
      unscheduledPhases: noAxisUnscheduled(),
    };
  }

  /* 1) 保存済みの詳細 Timeline を要約（AI 提案として・§36） */
  if (timeline && timeline.periods.length > 0) {
    const summaryPhases: MyPlanTimelinePhase[] = timeline.periods.slice(0, 6).map((p, i) => {
      const rawNote =
        p.activities.find((a) => a.trim().length > 0)?.trim() ??
        (p.reason.trim() ? p.reason.trim() : null);
      return {
        key: p.id || `tl-${i}`,
        rangeLabel: p.label.trim().slice(0, 16) || `${i + 1}`,
        title: p.title.trim() || "—",
        note: rawNote ? firstLine(rawNote) : null,
        status: "ai-suggested" as const,
      };
    });
    return {
      source: "saved-timeline",
      totalMonths: null,
      durationLabel: planDurationLabel ?? (timeline.durationLabel.trim() || null),
      timedPhases: [],
      pointPhases: [],
      summaryPhases,
      destinationPhases: [],
      accommodationPhases: [],
      arrival: null,
      unscheduledPhases: noAxisUnscheduled(),
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

  // 時期未定項目は timeline に出さないため、順序フェーズが 2 件未満ならセクション自体を出さない
  // （＝時期確定項目が無いときの空状態は「TIMELINE セクションを表示しない」という既存挙動）。
  if (phases.length < 2) return null;

  const unscheduledAll = noAxisUnscheduled();

  const trimmed = phases.slice(0, 5);
  trimmed.forEach((p, i) => {
    p.rangeLabel = PHASE_SEQ_LABELS[i] ?? `${i + 1}`;
  });

  return {
    source: "summary",
    totalMonths: null,
    durationLabel: planDurationLabel,
    timedPhases: [],
    pointPhases: [],
    summaryPhases: trimmed,
    destinationPhases: [],
    accommodationPhases: [],
    arrival: null,
    unscheduledPhases: unscheduledAll,
  };
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
  // Plan 全体期間: My Plan user-saved（planSettings.durationMonths） > Karte stated（週→月概算） > null（§1）。
  const planDurationKarteMonths =
    durationField.certainty === "stated" && typeof durationField.value === "number"
      ? Math.max(1, Math.round(durationField.value / 4.345))
      : null;
  const blueprintDurationMonths =
    typeof data.planSettings.durationMonths === "number" ? data.planSettings.durationMonths : null;
  const planDurationMonths = blueprintDurationMonths ?? planDurationKarteMonths;
  const planDurationSource: PlanDurationSource =
    blueprintDurationMonths != null ? "blueprint" : planDurationKarteMonths != null ? "karte" : "unknown";
  const planDurationLabel = planDurationMonths != null ? `約${planDurationMonths}ヶ月` : null;
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
    budget: heroBudget,
  };

  /* ---- 月ベースの要約タイムライン（図） ---- */
  const monthlyTimeline = buildMonthlyTimeline({
    timeline,
    goals: data.goals,
    workInterests: data.workInterests,
    milestones: data.milestones,
    schools: data.schools,
    destinations: data.destinations,
    accommodations: data.accommodations,
    englishRef,
    schoolCandidates,
    workHints,
    milestoneHints,
    goalCandidates,
    planDurationMonths,
    planDurationLabel,
  });

  /* ---- hasAnyContent（§50） ---- */
  const savedHasContent =
    data.goals.length > 0 ||
    data.destinations.primary !== null ||
    data.destinations.interested.length > 0 ||
    data.destinations.stays.length > 0 ||
    data.accommodations.length > 0 ||
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
      savedStays: data.destinations.stays,
      candidates: destinationCandidates,
      hints: destinationHints,
    },
    accommodation: {
      saved: data.accommodations,
      candidate: (() => {
        const it = stated("schoolPrefs", "accommodation");
        if (!it) return null;
        return { type: guessAccommodationType(it.value), label: it.value };
      })(),
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
    planDurationMonths,
    planDurationSource,
    planDurationKarteMonths,
  };
}
