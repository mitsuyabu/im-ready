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

/**
 * activity timing（「何ヶ月目から・何ヶ月間」）の緩いガード。
 *   - startMonth      : 留学開始からの月（1 = 1ヶ月目）。calendar 日付ではない。
 *   - durationMonths  : 月単位の長さ。
 * どちらもユーザーが My Plan で設定する値。未設定は field 省略（null 相当）。fake default は作らない。
 */
export const BLUEPRINT_START_MONTH_MAX = 60;
export const BLUEPRINT_DURATION_MONTHS_MAX = 24;
/** 留学全体の期間（My Plan user-saved）。1..36 ヶ月。未設定は field 省略（Karte fallback へ）。 */
export const BLUEPRINT_PLAN_DURATION_MONTHS_MAX = 36;

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

/**
 * activity timing。duration activity（School / Work / Accommodation / Farm 等）が
 * 「何ヶ月目から・何ヶ月間」を持つ。未設定なら field ごと省略（＝null 相当）。
 */
export type BlueprintTiming = {
  /** 留学開始からの月（1 = 1ヶ月目）。calendar 日付ではない。 */
  startMonth?: number;
  /** 月単位の長さ。 */
  durationMonths?: number;
};

export type BlueprintItem = {
  id: string;
  label: string;
  note?: string;
  createdAt: string;
} & BlueprintTiming;

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
} & BlueprintTiming;

/**
 * 実際の滞在スケジュールの 1 レコード（同じ都市を複数回・戻るケースも別 record で表現）。
 * Destination だけ startMonth 0（＝到着時）を許可。timing 未設定なら field 省略（fake を作らない）。
 */
export type BlueprintStay = {
  id: string;
  city: string;
  startMonth?: number;
  durationMonths?: number;
  /** この stay が到着地点か（任意）。 */
  isArrival?: boolean;
  note?: string;
  createdAt: string;
};

export type BlueprintDestinations = {
  /** 最初の滞在都市（従来どおり）。 */
  primary: BlueprintItem | null;
  /** 行ってみたい都市の一覧（wishlist・従来どおり）。 */
  interested: BlueprintItem[];
  /** 実際の滞在スケジュール。Timeline の都市バーはこれを参照する。 */
  stays: BlueprintStay[];
};

/**
 * 滞在方法（Accommodation）1 レコード。「その期間どう住むか」。Destination（どこにいるか）とは別。
 * Destination stay と同様、startMonth 0（＝到着時）を許可。同じ type を複数回可（戻る等）。
 */
export type BlueprintAccommodation = {
  id: string;
  /** preset key（"homestay" | "sharehouse" | "student_residence" | "hostel_hotel" | "other"）。 */
  type: string;
  /** type="other" のときの自由入力ラベル。 */
  label?: string;
  startMonth?: number;
  durationMonths?: number;
  /** 都市の紐付け（任意・§9）。今回は必須にしない。 */
  city?: string;
  note?: string;
  createdAt: string;
};

export const ACCOMMODATION_PRESET_KEYS = [
  "homestay",
  "sharehouse",
  "student_residence",
  "hostel_hotel",
] as const;

/** UI の preset（日本語ラベル）。AI 内部 key は英語。"other" は自由入力。 */
export const ACCOMMODATION_PRESETS: { key: string; label: string }[] = [
  { key: "homestay", label: "ホームステイ" },
  { key: "sharehouse", label: "シェアハウス" },
  { key: "student_residence", label: "学生寮" },
  { key: "hostel_hotel", label: "ホステル / ホテル" },
  { key: "other", label: "その他" },
];

/** accommodation record の表示ラベル（type→日本語、other は自由入力）。 */
export function accommodationLabel(a: Pick<BlueprintAccommodation, "type" | "label">): string {
  if (a.type === "other") return a.label && a.label.trim().length > 0 ? a.label : "その他";
  return ACCOMMODATION_PRESETS.find((p) => p.key === a.type)?.label ?? a.type;
}

/**
 * My Plan 全体の設定（ユーザーが My Plan で直接管理する。Karte は書き換えない）。
 * 将来 departure timing 等を足せる。未設定のキーは持たない（fake を書き込まない）。
 */
export type BlueprintPlanSettings = {
  /** 留学全体の期間（月）。My Plan user-saved。無ければ Karte fallback。 */
  durationMonths?: number;
};

export type BlueprintData = {
  planSettings: BlueprintPlanSettings;
  goals: BlueprintItem[];
  destinations: BlueprintDestinations;
  accommodations: BlueprintAccommodation[];
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
  /**
   * そのフェーズで滞在・訪問する都市（AI 提案。後方互換のため optional）。
   * server 側で「ユーザー保存済み / 相談で述べた都市」の allowlist と照合し、一致しないものは drop。
   */
  locations?: string[];
  /**
   * そのフェーズの滞在方法（AI 提案。optional）。preset / user-saved / Karte 由来のみ許可、一致しないものは drop。
   */
  accommodations?: string[];
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
    planSettings: {},
    goals: [],
    destinations: { primary: null, interested: [], stays: [] },
    accommodations: [],
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

/**
 * timing 月数の緩いガード。min..max の整数のみ通す（min 既定 1）。
 * 非数値 / 小数 / 範囲外 → undefined（＝field 省略。default 値は作らない・§39 / §52）。
 * Destination の startMonth だけ min=0（＝到着時）を許可する（§4）。
 */
function sanitizeMonthValue(v: unknown, max: number, min = 1): number | undefined {
  if (typeof v !== "number" || !Number.isInteger(v)) return undefined;
  if (v < min || v > max) return undefined;
  return v;
}

/**
 * BlueprintTiming（startMonth / durationMonths）を sanitize して attach する。
 * startMin=0 で startMonth の 0（到着時）を許可（Destination 用・§4）。School / Work は 1 のまま（§3）。
 */
function attachTiming<T extends BlueprintTiming>(
  target: T,
  value: Record<string, unknown>,
  startMin = 1,
): T {
  const startMonth = sanitizeMonthValue(value.startMonth, BLUEPRINT_START_MONTH_MAX, startMin);
  if (startMonth !== undefined) target.startMonth = startMonth;
  const durationMonths = sanitizeMonthValue(value.durationMonths, BLUEPRINT_DURATION_MONTHS_MAX);
  if (durationMonths !== undefined) target.durationMonths = durationMonths;
  return target;
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

  return attachTiming(item, value);
}

function sanitizeBlueprintItemArray(value: unknown): BlueprintItem[] {
  if (!Array.isArray(value)) return [];
  const items = value
    .map(sanitizeBlueprintItem)
    .filter((it): it is BlueprintItem => it !== null);
  return dedupeById(items);
}

/**
 * Destination 1 件を sanitize（都市 = label）。
 *   - 旧データが素の文字列（primary: "Gold Coast" 等）でも壊さず object へ normalize（§8 / §67）。
 *   - startMonth は 0（到着時）を許可（§4）。fake timing は付けない（§11）。
 */
export function sanitizeDestinationItem(value: unknown): BlueprintItem | null {
  if (typeof value === "string") {
    const label = value.trim();
    if (label.length === 0) return null;
    return {
      id: `legacy:${label.toLowerCase()}`,
      label: clampString(label, BLUEPRINT_LABEL_MAX),
      createdAt: "1970-01-01T00:00:00.000Z",
    };
  }
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
  return attachTiming(item, value, 0);
}

function sanitizeDestinationArray(value: unknown): BlueprintItem[] {
  if (!Array.isArray(value)) return [];
  return dedupeById(
    value.map(sanitizeDestinationItem).filter((it): it is BlueprintItem => it !== null),
  );
}

/** 滞在レコード 1 件。startMonth は 0（到着時）を許可。壊れた field は落とす（fake を作らない）。 */
export function sanitizeBlueprintStay(value: unknown): BlueprintStay | null {
  if (!isRecord(value)) return null;
  const id = rawNonEmptyString(value.id);
  const city = trimmedNonEmpty(value.city);
  const createdAt = rawNonEmptyString(value.createdAt);
  if (!id || !city || !createdAt) return null;

  const stay: BlueprintStay = { id, city: clampString(city, BLUEPRINT_LABEL_MAX), createdAt };
  const startMonth = sanitizeMonthValue(value.startMonth, BLUEPRINT_START_MONTH_MAX, 0);
  if (startMonth !== undefined) stay.startMonth = startMonth;
  const durationMonths = sanitizeMonthValue(value.durationMonths, BLUEPRINT_DURATION_MONTHS_MAX);
  if (durationMonths !== undefined) stay.durationMonths = durationMonths;
  if (value.isArrival === true) stay.isArrival = true;
  const note = trimmedNonEmpty(value.note);
  if (note) stay.note = clampString(note, BLUEPRINT_NOTE_MAX);
  return stay;
}

function sanitizeStayArray(value: unknown): BlueprintStay[] {
  if (!Array.isArray(value)) return [];
  return dedupeById(
    value.map(sanitizeBlueprintStay).filter((s): s is BlueprintStay => s !== null),
  );
}

/** 自由テキスト（Karte 由来等）から滞在方法 preset key を推測。判定できなければ "other"。 */
export function guessAccommodationType(raw: string): string {
  return normalizeAccommodationType(raw).type;
}

/** 滞在方法 type の正規化。英語 key / 日本語ラベルどちらでも canonical key へ。未知は "other"。 */
function normalizeAccommodationType(raw: string): { type: string; label?: string } {
  const t = raw.trim();
  const k = t.toLowerCase().replace(/\s+/g, "");
  if ((ACCOMMODATION_PRESET_KEYS as readonly string[]).includes(k)) return { type: k };
  if (k === "other" || t === "その他") return { type: "other" };
  if (/ホームステイ|homestay/i.test(t)) return { type: "homestay" };
  if (/シェアハウス|share ?house|flatshare/i.test(t)) return { type: "sharehouse" };
  if (/学生寮|学校寮|student ?residence|dorm/i.test(t)) return { type: "student_residence" };
  if (/ホステル|ホテル|hostel|hotel/i.test(t)) return { type: "hostel_hotel" };
  // 未知の値はユーザー入力として保持（"その他" ＋ 元の文字列を label に）。fake は作らない。
  return { type: "other", label: t };
}

/** 滞在方法 1 件。startMonth 0（到着時）を許可。type 必須（空なら record ごと除外）。 */
export function sanitizeBlueprintAccommodation(value: unknown): BlueprintAccommodation | null {
  if (!isRecord(value)) return null;
  const id = rawNonEmptyString(value.id);
  const createdAt = rawNonEmptyString(value.createdAt);
  const rawType = trimmedNonEmpty(value.type);
  if (!id || !createdAt || !rawType) return null;

  const { type, label: derivedLabel } = normalizeAccommodationType(rawType);
  const acc: BlueprintAccommodation = { id, type, createdAt };

  const explicitLabel = trimmedNonEmpty(value.label);
  const label = derivedLabel ?? (type === "other" ? explicitLabel : null);
  if (label) acc.label = clampString(label, BLUEPRINT_LABEL_MAX);

  const startMonth = sanitizeMonthValue(value.startMonth, BLUEPRINT_START_MONTH_MAX, 0);
  if (startMonth !== undefined) acc.startMonth = startMonth;
  const durationMonths = sanitizeMonthValue(value.durationMonths, BLUEPRINT_DURATION_MONTHS_MAX);
  if (durationMonths !== undefined) acc.durationMonths = durationMonths;

  const city = trimmedNonEmpty(value.city);
  if (city) acc.city = clampString(city, BLUEPRINT_LABEL_MAX);
  const note = trimmedNonEmpty(value.note);
  if (note) acc.note = clampString(note, BLUEPRINT_NOTE_MAX);
  return acc;
}

function sanitizeAccommodationArray(value: unknown): BlueprintAccommodation[] {
  if (!Array.isArray(value)) return [];
  return dedupeById(
    value
      .map(sanitizeBlueprintAccommodation)
      .filter((a): a is BlueprintAccommodation => a !== null),
  );
}

function sanitizeBlueprintDestinations(value: unknown): BlueprintDestinations {
  if (!isRecord(value)) return { primary: null, interested: [], stays: [] };
  return {
    primary: sanitizeDestinationItem(value.primary),
    interested: sanitizeDestinationArray(value.interested),
    stays: sanitizeStayArray(value.stays),
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

  const school: BlueprintSchool = {
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
  return attachTiming(school, value);
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

/** planSettings jsonb → BlueprintPlanSettings。不正な値は field ごと落とす（§29 / §30）。 */
export function sanitizeBlueprintPlanSettings(value: unknown): BlueprintPlanSettings {
  if (!isRecord(value)) return {};
  const out: BlueprintPlanSettings = {};
  const durationMonths = sanitizeMonthValue(value.durationMonths, BLUEPRINT_PLAN_DURATION_MONTHS_MAX);
  if (durationMonths !== undefined) out.durationMonths = durationMonths;
  return out;
}

/** DB jsonb → BlueprintData。どんな入力でも throw せず、必ず完全な BlueprintData を返す。 */
export function sanitizeBlueprintData(value: unknown): BlueprintData {
  const empty = createEmptyBlueprintData();
  if (!isRecord(value)) return empty;

  return {
    planSettings: sanitizeBlueprintPlanSettings(value.planSettings),
    goals: sanitizeBlueprintItemArray(value.goals),
    destinations: sanitizeBlueprintDestinations(value.destinations),
    accommodations: sanitizeAccommodationArray(value.accommodations),
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

  const period: PlanTimelinePeriod = {
    id,
    label: clampString(label, TIMELINE_PERIOD_LABEL_MAX),
    title: clampString(title, TIMELINE_PERIOD_TITLE_MAX),
    activities,
    reason: clampString(value.reason.trim(), TIMELINE_PERIOD_REASON_MAX),
  };

  // locations / accommodations は optional。壊れていても period ごと無効化はせず field だけ落とす。
  const parseStrArray = (v: unknown): string[] => {
    if (!Array.isArray(v)) return [];
    const out: string[] = [];
    for (const raw of v) {
      if (typeof raw !== "string") continue;
      const t = raw.trim();
      if (t.length > 0 && out.length < 6) out.push(clampString(t, BLUEPRINT_LABEL_MAX));
    }
    return out;
  };
  const locations = parseStrArray(value.locations);
  if (locations.length > 0) period.locations = locations;
  const accommodations = parseStrArray(value.accommodations);
  if (accommodations.length > 0) period.accommodations = accommodations;

  return period;
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
