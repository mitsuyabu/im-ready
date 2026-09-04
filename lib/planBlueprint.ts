/**
 * My Plan 再設計の domain model（Step 2-1）。
 *
 * 3 階層のうち **My Plan = ユーザーが採用した編集可能な実行計画** を表す層。
 *   - Karte      : Chat / Worksheet からの shared understanding（lib/karte.ts）
 *   - My Plan    : この plan_blueprint（ユーザー採用値）              ← 本ファイル
 *   - My Karte   : 生成済み Document snapshot（plan_documents）
 *
 * DB の jsonb（plan_blueprint.data / .timeline）は「型として信用しない」。読み出しは必ず
 * sanitizeBlueprintData / sanitizePlanTimeline を通し、壊れた値は保守的に空へ落とす
 * （fake value を作らない・部分的に誤った内容を表示しない）。
 *
 * 今回 write（upsert / RPC / section-level update）は未実装。CRUD の書き込み方式は
 * Step 2-3 で競合安全性まで含めて設計する。
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/* ------------------------------------------------------------------ */
/* limits（将来の CRUD UI で暴走しないための sanitize / creation contract）           */
/* ------------------------------------------------------------------ */

export const BLUEPRINT_LABEL_MAX = 120;
export const BLUEPRINT_NOTE_MAX = 500;

// timeline 側の緩いガード（AI 出力の異常な長さを弾くだけ。意味は解釈しない）
const TIMELINE_SUMMARY_MAX = 1000;
const TIMELINE_DURATION_LABEL_MAX = 120;
const TIMELINE_DISCLAIMER_MAX = 500;
const TIMELINE_PERIOD_LABEL_MAX = 120;
const TIMELINE_PERIOD_TITLE_MAX = 200;
const TIMELINE_PERIOD_REASON_MAX = 1000;
const TIMELINE_ACTIVITY_MAX = 300;
const TIMELINE_OPEN_QUESTION_MAX = 300;

/* ------------------------------------------------------------------ */
/* domain types                                                       */
/* ------------------------------------------------------------------ */

export type BlueprintItem = {
  id: string;
  label: string;
  note?: string;
  createdAt: string;
};

export type BlueprintSchoolStatus = "considering" | "preferred" | "selected";
export type BlueprintSchoolSource = "school_comparison" | "proposal";

export type BlueprintSchool = {
  id: string;
  name: string;
  city: string | null;
  /** proposals / 学校マスタと紐付く場合のみ。無ければ null（マスタに無い候補もあり得る）。 */
  schoolSlug: string | null;
  placeId: string | null;
  source: BlueprintSchoolSource;
  status: BlueprintSchoolStatus;
  /** 保存時点の proposal 由来情報のスナップショットのみ。学校マスタ全体はコピーしない。 */
  snapshot: { reason?: string; caveat?: string };
  savedAt: string;
};

export type BlueprintDestinations = {
  primary: BlueprintItem | null;
  interested: BlueprintItem[];
};

export type BlueprintData = {
  goals: BlueprintItem[];
  destinations: BlueprintDestinations;
  schools: BlueprintSchool[];
  workInterests: BlueprintItem[];
  thingsToDo: BlueprintItem[];
  milestones: BlueprintItem[];
};

/* ---- adopted AI Timeline（未採用の preview は DB に入れない contract） ---- */

export type PlanTimelinePeriod = {
  id: string;
  label: string;
  title: string;
  activities: string[];
  reason: string;
};

export type PlanTimeline = {
  summary: string;
  durationLabel: string;
  periods: PlanTimelinePeriod[];
  openQuestions: string[];
  generatedAt: string;
  disclaimer: string | null;
};

/* ------------------------------------------------------------------ */
/* DB row 境界                                                         */
/* ------------------------------------------------------------------ */

/** plan_blueprint の行。data / timeline は jsonb のため unknown で受ける（parse は下の helper）。 */
export type PlanBlueprintRow = {
  plan_id: string;
  data: unknown;
  timeline: unknown;
  timeline_generated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ParsedPlanBlueprint = {
  data: BlueprintData;
  timeline: PlanTimeline | null;
  timelineGeneratedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

/**
 * loadPlanBlueprint の返り値。「行が無い（正常な空）」と「blueprint ストレージへ
 * アクセスできない（table 未適用 / DB error）」を必ず区別する。
 *   - 行なし        : exists=false, available=true
 *   - DB error 等   : exists=false, available=false（保存済みが空に見える事故を防ぐ）
 */
export type LoadedPlanBlueprint = ParsedPlanBlueprint & {
  exists: boolean;
  available: boolean;
};

/* ------------------------------------------------------------------ */
/* empty state（1 箇所に集約・呼ぶたびに新しい object を返す）                          */
/* ------------------------------------------------------------------ */

export function createEmptyBlueprintData(): BlueprintData {
  return {
    goals: [],
    destinations: { primary: null, interested: [] },
    schools: [],
    workInterests: [],
    thingsToDo: [],
    milestones: [],
  };
}

/* ------------------------------------------------------------------ */
/* primitives                                                         */
/* ------------------------------------------------------------------ */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** trim 前提で「空でない文字列か」。空・非文字列は null。 */
function trimmedNonEmpty(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/** identifier / timestamp 用。値を書き換えず「空でない文字列か」だけ見る。 */
function rawNonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function clampString(v: string, max: number): string {
  return v.length > max ? v.slice(0, max) : v;
}

/** 同一 id の重複は最初の 1 件だけ残す（順序維持）。 */
function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* BlueprintItem                                                      */
/* ------------------------------------------------------------------ */

export function sanitizeBlueprintItem(value: unknown): BlueprintItem | null {
  if (!isRecord(value)) return null;

  const id = rawNonEmptyString(value.id);
  const label = trimmedNonEmpty(value.label);
  const createdAt = rawNonEmptyString(value.createdAt);
  if (!id || !label || !createdAt) return null;

  const item: BlueprintItem = {
    id,
    label: clampString(label, BLUEPRINT_LABEL_MAX),
    createdAt,
  };

  const note = trimmedNonEmpty(value.note);
  if (note) item.note = clampString(note, BLUEPRINT_NOTE_MAX);

  return item;
}

function sanitizeBlueprintItemArray(value: unknown): BlueprintItem[] {
  if (!Array.isArray(value)) return [];
  const items = value
    .map(sanitizeBlueprintItem)
    .filter((it): it is BlueprintItem => it !== null);
  return dedupeById(items);
}

function sanitizeBlueprintDestinations(value: unknown): BlueprintDestinations {
  if (!isRecord(value)) return { primary: null, interested: [] };
  return {
    primary: sanitizeBlueprintItem(value.primary),
    interested: sanitizeBlueprintItemArray(value.interested),
  };
}

/* ------------------------------------------------------------------ */
/* BlueprintSchool                                                    */
/* ------------------------------------------------------------------ */

const SCHOOL_STATUSES: readonly BlueprintSchoolStatus[] = [
  "considering",
  "preferred",
  "selected",
];
const SCHOOL_SOURCES: readonly BlueprintSchoolSource[] = ["school_comparison", "proposal"];

function sanitizeSchoolSnapshot(value: unknown): { reason?: string; caveat?: string } {
  if (!isRecord(value)) return {};
  const snapshot: { reason?: string; caveat?: string } = {};
  if (typeof value.reason === "string" && value.reason.trim().length > 0) {
    snapshot.reason = clampString(value.reason, BLUEPRINT_NOTE_MAX);
  }
  if (typeof value.caveat === "string" && value.caveat.trim().length > 0) {
    snapshot.caveat = clampString(value.caveat, BLUEPRINT_NOTE_MAX);
  }
  return snapshot;
}

export function sanitizeBlueprintSchool(value: unknown): BlueprintSchool | null {
  if (!isRecord(value)) return null;

  const id = rawNonEmptyString(value.id);
  const name = trimmedNonEmpty(value.name);
  const savedAt = rawNonEmptyString(value.savedAt);
  if (!id || !name || !savedAt) return null;

  // source / status は不正なら「その学校 record 自体を除外」する（default へ変換しない）。
  const source = SCHOOL_SOURCES.find((s) => s === value.source) ?? null;
  const status = SCHOOL_STATUSES.find((s) => s === value.status) ?? null;
  if (!source || !status) return null;

  return {
    id,
    name: clampString(name, BLUEPRINT_LABEL_MAX),
    city: typeof value.city === "string" ? clampString(value.city, BLUEPRINT_LABEL_MAX) : null,
    schoolSlug: typeof value.schoolSlug === "string" && value.schoolSlug.length > 0 ? value.schoolSlug : null,
    placeId: typeof value.placeId === "string" && value.placeId.length > 0 ? value.placeId : null,
    source,
    status,
    snapshot: sanitizeSchoolSnapshot(value.snapshot),
    savedAt,
  };
}

function sanitizeBlueprintSchoolArray(value: unknown): BlueprintSchool[] {
  if (!Array.isArray(value)) return [];
  const schools = value
    .map(sanitizeBlueprintSchool)
    .filter((s): s is BlueprintSchool => s !== null);
  return dedupeById(schools);
}

/* ------------------------------------------------------------------ */
/* BlueprintData                                                      */
/* ------------------------------------------------------------------ */

/** DB jsonb → BlueprintData。どんな入力でも throw せず、必ず完全な BlueprintData を返す。 */
export function sanitizeBlueprintData(value: unknown): BlueprintData {
  const empty = createEmptyBlueprintData();
  if (!isRecord(value)) return empty;

  return {
    goals: sanitizeBlueprintItemArray(value.goals),
    destinations: sanitizeBlueprintDestinations(value.destinations),
    schools: sanitizeBlueprintSchoolArray(value.schools),
    workInterests: sanitizeBlueprintItemArray(value.workInterests),
    thingsToDo: sanitizeBlueprintItemArray(value.thingsToDo),
    milestones: sanitizeBlueprintItemArray(value.milestones),
  };
}

/* ------------------------------------------------------------------ */
/* PlanTimeline                                                       */
/* ------------------------------------------------------------------ */

function sanitizePlanTimelinePeriod(value: unknown): PlanTimelinePeriod | null {
  if (!isRecord(value)) return null;

  const id = rawNonEmptyString(value.id);
  const label = trimmedNonEmpty(value.label);
  const title = trimmedNonEmpty(value.title);
  if (!id || !label || !title) return null;

  if (typeof value.reason !== "string") return null;
  if (!Array.isArray(value.activities)) return null;

  const activities: string[] = [];
  for (const raw of value.activities) {
    if (typeof raw !== "string") return null; // 部分的に壊れた activities は period ごと無効化
    const t = raw.trim();
    if (t.length > 0) activities.push(clampString(t, TIMELINE_ACTIVITY_MAX));
  }

  return {
    id,
    label: clampString(label, TIMELINE_PERIOD_LABEL_MAX),
    title: clampString(title, TIMELINE_PERIOD_TITLE_MAX),
    activities,
    reason: clampString(value.reason.trim(), TIMELINE_PERIOD_REASON_MAX),
  };
}

/**
 * DB jsonb → PlanTimeline。少しでも構造が壊れていたら timeline 全体を null にする
 * （部分的に誤った AI Timeline を表示するより「未設定」を優先）。
 */
export function sanitizePlanTimeline(value: unknown): PlanTimeline | null {
  if (!isRecord(value)) return null;

  if (typeof value.summary !== "string") return null;
  if (typeof value.durationLabel !== "string") return null;

  const generatedAt = rawNonEmptyString(value.generatedAt);
  if (!generatedAt) return null;

  // disclaimer は string | null のみ許可（undefined は null 扱い）。それ以外は timeline 全体を無効化。
  let disclaimer: string | null;
  if (value.disclaimer == null) {
    disclaimer = null;
  } else if (typeof value.disclaimer === "string") {
    const t = value.disclaimer.trim();
    disclaimer = t.length > 0 ? clampString(t, TIMELINE_DISCLAIMER_MAX) : null;
  } else {
    return null;
  }

  if (!Array.isArray(value.periods)) return null;
  const periods: PlanTimelinePeriod[] = [];
  for (const raw of value.periods) {
    const period = sanitizePlanTimelinePeriod(raw);
    if (!period) return null; // malformed period → timeline 全体を null
    periods.push(period);
  }

  if (!Array.isArray(value.openQuestions)) return null;
  const openQuestions: string[] = [];
  for (const raw of value.openQuestions) {
    if (typeof raw !== "string") return null;
    const t = raw.trim();
    if (t.length > 0) openQuestions.push(clampString(t, TIMELINE_OPEN_QUESTION_MAX));
  }

  return {
    summary: clampString(value.summary.trim(), TIMELINE_SUMMARY_MAX),
    durationLabel: clampString(value.durationLabel.trim(), TIMELINE_DURATION_LABEL_MAX),
    periods,
    openQuestions,
    generatedAt,
    disclaimer,
  };
}

/* ------------------------------------------------------------------ */
/* row → domain                                                       */
/* ------------------------------------------------------------------ */

export function parsePlanBlueprintRow(row: PlanBlueprintRow): ParsedPlanBlueprint {
  return {
    data: sanitizeBlueprintData(row.data),
    timeline: sanitizePlanTimeline(row.timeline),
    timelineGeneratedAt:
      typeof row.timeline_generated_at === "string" ? row.timeline_generated_at : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

/* ------------------------------------------------------------------ */
/* read helper（Plan 所有者確認済みの Server 呼び出しから使う）                          */
/* ------------------------------------------------------------------ */

function emptyLoaded(available: boolean, exists: boolean): LoadedPlanBlueprint {
  return {
    data: createEmptyBlueprintData(),
    timeline: null,
    timelineGeneratedAt: null,
    createdAt: null,
    updatedAt: null,
    exists,
    available,
  };
}

/**
 * plan_blueprint を 1 行読む。呼び出し側は plan 所有者確認済みであること（RLS も二重で守る）。
 *
 *   - 行あり            : sanitize して返す（exists=true, available=true）
 *   - 行なし            : 空 BlueprintData（exists=false, available=true）
 *   - table 未適用 / DB error : 空 BlueprintData（exists=false, available=false）
 *     → UI 側は available=false のとき「保存済みが空」と誤表示しないよう扱える。
 */
export async function loadPlanBlueprint(
  supabase: SupabaseClient,
  planId: string,
): Promise<LoadedPlanBlueprint> {
  const { data, error } = await supabase
    .from("plan_blueprint")
    .select("plan_id, data, timeline, timeline_generated_at, created_at, updated_at")
    .eq("plan_id", planId)
    .maybeSingle();

  if (error) {
    // table 未適用（20260904 未 apply）や一時的な DB error。内部 message のみログ。
    console.error("plan_blueprint load error:", error.message);
    return emptyLoaded(false, false);
  }

  if (!data) {
    return emptyLoaded(true, false);
  }

  const parsed = parsePlanBlueprintRow(data as PlanBlueprintRow);
  return { ...parsed, exists: true, available: true };
}
