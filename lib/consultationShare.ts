/**
 * Consultation Sheet の共有（/share/consultation/[token]）で使う、環境に依存しない型と純粋関数。
 *
 * - share_config（どの section を共有するか）の型・既定値・sanitize
 * - 所有者側の共有行の読み取り（RLS 経由。token は所有者だけが読める）
 * - 公開ページ用: SECURITY DEFINER 関数 get_public_consultation_sheet の戻り値の検証と、
 *   基本情報サマリーの組み立て（既存 lib/consultationSummary.ts を再利用）
 *
 * token の生成・hash 化は既存の lib/documentShareToken.ts をそのまま使う（新しい方式は作らない）。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeKarte } from "@/lib/karte";
import { createEmptyBlueprintData, type BlueprintData } from "@/lib/planBlueprint";
import { buildConsultationSummary, type ConsultationSummaryRow } from "@/lib/consultationSummary";

/* ------------------------------------------------------------------ */
/* share_config                                                        */
/* ------------------------------------------------------------------ */

export type ConsultationShareConfig = {
  showSummary: boolean;
  showTopics: boolean;
  showTodos: boolean;
  /** 相談後の個人的なメモが入り得るので既定は非公開。 */
  showFindings: boolean;
  /** 同上。 */
  showNextActions: boolean;
};

export const DEFAULT_CONSULTATION_SHARE_CONFIG: ConsultationShareConfig = {
  showSummary: true,
  showTopics: true,
  showTodos: true,
  showFindings: false,
  showNextActions: false,
};

export const CONSULTATION_SHARE_SECTIONS: {
  key: keyof ConsultationShareConfig;
  label: string;
  note?: string;
}[] = [
  { key: "showSummary", label: "相談時に共有する基本情報" },
  { key: "showTopics", label: "相談したいこと" },
  { key: "showTodos", label: "確認したいこと / To Do" },
  { key: "showFindings", label: "相談して分かったこと", note: "相談後のメモ。既定では共有しません" },
  { key: "showNextActions", label: "次にやること", note: "相談後のメモ。既定では共有しません" },
];

/** unknown（request body / DB の jsonb）を安全な config へ。真偽値以外は既定値を使う。 */
export function sanitizeConsultationShareConfig(raw: unknown): ConsultationShareConfig {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const pick = (key: keyof ConsultationShareConfig): boolean =>
    typeof src[key] === "boolean" ? (src[key] as boolean) : DEFAULT_CONSULTATION_SHARE_CONFIG[key];
  return {
    showSummary: pick("showSummary"),
    showTopics: pick("showTopics"),
    showTodos: pick("showTodos"),
    showFindings: pick("showFindings"),
    showNextActions: pick("showNextActions"),
  };
}

/* ------------------------------------------------------------------ */
/* 所有者側                                                            */
/* ------------------------------------------------------------------ */

/** 所有者の画面に渡す、現在有効な共有。token から URL を組み立てるのは Client（origin が必要なため）。 */
export type ActiveConsultationShare = { token: string; config: ConsultationShareConfig; createdAt: string | null };

export type LoadedConsultationShare = { available: false } | { available: true; share: ActiveConsultationShare | null };

/** その Plan の「有効な共有」を1件読む（RLS により所有者のみ）。停止済み・期限切れは対象外。 */
export async function loadActiveConsultationShare(
  supabase: SupabaseClient,
  planId: string,
): Promise<LoadedConsultationShare> {
  const { data, error } = await supabase
    .from("consultation_sheet_shares")
    .select("token, share_config, created_at, expires_at")
    .eq("plan_id", planId)
    .is("revoked_at", null)
    .maybeSingle();

  if (error) {
    // token・共有内容はログに出さない。
    console.error("consultation_sheet_shares load error:", error.message);
    return { available: false };
  }
  if (!data) return { available: true, share: null };

  const row = data as { token: unknown; share_config: unknown; created_at: unknown; expires_at: unknown };
  if (typeof row.token !== "string" || row.token.length === 0) return { available: true, share: null };
  if (typeof row.expires_at === "string" && new Date(row.expires_at).getTime() <= Date.now()) {
    return { available: true, share: null };
  }
  return {
    available: true,
    share: {
      token: row.token,
      config: sanitizeConsultationShareConfig(row.share_config),
      createdAt: typeof row.created_at === "string" ? row.created_at : null,
    },
  };
}

/** 共有 URL（表示・コピー・QR 用）。origin は呼び出し側が渡す（Client は window.location.origin）。 */
export function consultationShareUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/share/consultation/${token}`;
}

/* ------------------------------------------------------------------ */
/* 公開ページ側                                                        */
/* ------------------------------------------------------------------ */

export type PublicConsultationItem = { text: string; completed: boolean };

export type PublicConsultationSheet = {
  planTitle: string;
  updatedAt: string | null;
  summary: ConsultationSummaryRow[] | null;
  topics: PublicConsultationItem[];
  todos: PublicConsultationItem[];
  findings: PublicConsultationItem[];
  nextActions: PublicConsultationItem[];
};

function parseItems(raw: unknown): PublicConsultationItem[] {
  if (!Array.isArray(raw)) return [];
  const out: PublicConsultationItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const text = typeof record.text === "string" ? record.text.trim() : "";
    if (text.length === 0) continue;
    out.push({ text, completed: record.completed === true });
    if (out.length >= 100) break;
  }
  return out;
}

/** 公開関数が返した最小データから、既存のサマリー組み立てをそのまま使って行を作る。 */
function parseSummary(raw: unknown): ConsultationSummaryRow[] | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const karteSrc = (src.karte && typeof src.karte === "object" ? src.karte : {}) as Record<string, unknown>;
  const conflicts = Array.isArray(src.conflicts) ? src.conflicts : [];
  const myPlan = (src.myPlan && typeof src.myPlan === "object" ? src.myPlan : {}) as Record<string, unknown>;

  const field = (key: string) =>
    karteSrc[key] !== undefined && karteSrc[key] !== null
      ? { value: karteSrc[key], certainty: "stated" as const }
      : undefined;

  // 返ってきた値だけを持つ最小の Karte を作る（normalizeKarte が残りを unknown で埋める）。
  const karte = normalizeKarte(
    {
      schoolPrefs: {
        preferredCountries: field("preferredCountries"),
        preferredCity: field("preferredCity"),
        courseType: field("courseType"),
        accommodation: field("accommodation"),
      },
      timing: {
        departureTiming: field("departureTiming"),
        durationLabel: field("durationLabel"),
        durationWeeks: field("durationWeeks"),
      },
      budget: { rangeLabel: field("rangeLabel"), totalCap: field("totalCap") },
      language: { selfLevel: field("selfLevel") },
      work: { wantsToWork: field("wantsToWork") },
      handoff: { conflicts },
    },
    "share",
  );

  const blueprint: BlueprintData = createEmptyBlueprintData();
  if (typeof myPlan.primaryCity === "string" && myPlan.primaryCity.trim().length > 0) {
    blueprint.destinations.primary = {
      id: "share-primary",
      label: myPlan.primaryCity,
      note: undefined,
      createdAt: new Date(0).toISOString(),
    };
  }
  if (typeof myPlan.durationMonths === "number" && Number.isFinite(myPlan.durationMonths)) {
    blueprint.planSettings.durationMonths = myPlan.durationMonths;
  }
  if (Array.isArray(myPlan.accommodations)) {
    for (const a of myPlan.accommodations) {
      if (!a || typeof a !== "object") continue;
      const record = a as Record<string, unknown>;
      if (typeof record.type !== "string") continue;
      blueprint.accommodations.push({
        id: `share-${blueprint.accommodations.length}`,
        type: record.type,
        label: typeof record.label === "string" ? record.label : undefined,
        createdAt: new Date(0).toISOString(),
      });
    }
  }
  if (Array.isArray(myPlan.workInterests)) {
    for (const label of myPlan.workInterests) {
      if (typeof label !== "string" || label.trim().length === 0) continue;
      blueprint.workInterests.push({
        id: `share-w-${blueprint.workInterests.length}`,
        label,
        createdAt: new Date(0).toISOString(),
      });
    }
  }

  return buildConsultationSummary(karte, blueprint);
}

/**
 * get_public_consultation_sheet の戻り値（unknown）を検証する。RPC 自体が狭い値しか返さない設計だが、
 * ここでも型を確認してから表示する。不正なら null（呼び出し側は汎用の「表示できません」に fallback）。
 */
export function parsePublicConsultationSheet(raw: unknown): PublicConsultationSheet | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const planTitle = typeof row.plan_title === "string" ? row.plan_title.trim() : "";
  if (planTitle.length === 0) return null;

  const updatedAt =
    typeof row.sheet_updated_at === "string" && !Number.isNaN(new Date(row.sheet_updated_at).getTime())
      ? row.sheet_updated_at
      : null;

  return {
    planTitle,
    updatedAt,
    summary: row.show_summary === true ? parseSummary(row.summary_source) : null,
    topics: row.show_topics === true ? parseItems(row.topics) : [],
    todos: row.show_todos === true ? parseItems(row.todos) : [],
    findings: row.show_findings === true ? parseItems(row.findings) : [],
    nextActions: row.show_next_actions === true ? parseItems(row.next_actions) : [],
  };
}

/** 共有ページに出すものが何も無いか（全 section OFF・中身が空）。 */
export function isEmptyPublicConsultationSheet(sheet: PublicConsultationSheet): boolean {
  return (
    (sheet.summary === null || sheet.summary.length === 0) &&
    sheet.topics.length === 0 &&
    sheet.todos.length === 0 &&
    sheet.findings.length === 0 &&
    sheet.nextActions.length === 0
  );
}
