"use client";

/**
 * My Plan 編集の client 側 write helper（Step 2-3）。
 *
 * data 全体を client から upsert しない。update_plan_blueprint_section RPC に「当該セクションの
 * 新しい値だけ」を渡し、サーバー側で jsonb_set により 1 セクションだけ書き換える。
 * 返ってきた data / updated_at をサーバー正として state 更新する（sanitize を通す）。
 *
 * RPC が存在しない / plan_blueprint 未適用の環境では error。呼び出し側は blueprint が
 * available のときだけ編集 UI を出すため、通常ここには到達しない（保険として error を返す）。
 */

import { createClient } from "@/lib/supabase/client";
import {
  sanitizeBlueprintData,
  type BlueprintData,
  type BlueprintItem,
  type BlueprintSchool,
  type BlueprintSchoolSource,
  type BlueprintSchoolStatus,
} from "@/lib/planBlueprint";

export type BlueprintSectionKey =
  | "goals"
  | "destinations"
  | "workInterests"
  | "thingsToDo"
  | "milestones"
  | "schools";

export type PatchOk = { ok: true; data: BlueprintData; updatedAt: string };
export type PatchErr = { ok: false; reason: "stale" | "not_owner" | "error" };
export type PatchResult = PatchOk | PatchErr;

/** BlueprintItem を DB JSON 形へ（余計なキーを送らない）。 */
export function itemToJson(item: BlueprintItem): Record<string, string> {
  const json: Record<string, string> = {
    id: item.id,
    label: item.label,
    createdAt: item.createdAt,
  };
  if (item.note) json.note = item.note;
  return json;
}

async function callPatch(
  section: BlueprintSectionKey,
  planId: string,
  value: unknown,
  expectedUpdatedAt: string | null,
): Promise<PatchResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("update_plan_blueprint_section", {
    p_plan_id: planId,
    p_section: section,
    p_value: value,
    p_expected_updated_at: expectedUpdatedAt,
  });

  if (error) {
    const msg = error.message || "";
    if (msg.includes("stale_update")) return { ok: false, reason: "stale" };
    if (msg.includes("not_owner")) return { ok: false, reason: "not_owner" };
    return { ok: false, reason: "error" };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object" || !("data" in row)) {
    return { ok: false, reason: "error" };
  }
  const updatedAtRaw = (row as { updated_at?: unknown }).updated_at;
  return {
    ok: true,
    data: sanitizeBlueprintData((row as { data?: unknown }).data),
    updatedAt: typeof updatedAtRaw === "string" ? updatedAtRaw : new Date().toISOString(),
  };
}

/** BlueprintItem[] セクション（goals / workInterests / thingsToDo / milestones）。 */
export type ItemSectionKey = Exclude<BlueprintSectionKey, "destinations" | "schools">;

/** goals / workInterests / thingsToDo / milestones（BlueprintItem[] セクション）を丸ごと差し替える。 */
export function patchItemsSection(
  section: ItemSectionKey,
  planId: string,
  items: BlueprintItem[],
  expectedUpdatedAt: string | null,
): Promise<PatchResult> {
  return callPatch(section, planId, items.map(itemToJson), expectedUpdatedAt);
}

/** BlueprintSchool を DB JSON 形へ（余計なキーを送らない・sanitize contract に合わせる）。 */
export function schoolToJson(s: BlueprintSchool): Record<string, unknown> {
  const snapshot: { reason?: string; caveat?: string } = {};
  if (s.snapshot.reason) snapshot.reason = s.snapshot.reason;
  if (s.snapshot.caveat) snapshot.caveat = s.snapshot.caveat;
  return {
    id: s.id,
    name: s.name,
    city: s.city,
    schoolSlug: s.schoolSlug,
    placeId: s.placeId,
    source: s.source,
    status: s.status,
    snapshot,
    savedAt: s.savedAt,
  };
}

/** schools セクションを丸ごと差し替える（追加 / status 変更 / 削除いずれも最新 state から作って渡す）。 */
export function patchSchoolsSection(
  planId: string,
  schools: BlueprintSchool[],
  expectedUpdatedAt: string | null,
): Promise<PatchResult> {
  return callPatch("schools", planId, schools.map(schoolToJson), expectedUpdatedAt);
}

/** destinations（{ primary, interested }）を丸ごと差し替える。 */
export function patchDestinationsSection(
  planId: string,
  primary: BlueprintItem | null,
  interested: BlueprintItem[],
  expectedUpdatedAt: string | null,
): Promise<PatchResult> {
  return callPatch(
    "destinations",
    planId,
    {
      primary: primary ? itemToJson(primary) : null,
      interested: interested.map(itemToJson),
    },
    expectedUpdatedAt,
  );
}

/* ------------------------------------------------------------------ */
/* client 側の item 生成・検証（sanitize contract に合わせる）                          */
/* ------------------------------------------------------------------ */

export const BLUEPRINT_LABEL_MAX = 120;

export function makeBlueprintItem(label: string): BlueprintItem {
  return {
    id: crypto.randomUUID(),
    label: label.trim().slice(0, BLUEPRINT_LABEL_MAX),
    createdAt: new Date().toISOString(),
  };
}

/** 追加可否。空 / 長すぎ / 同一セクション内 duplicate（trim + 大文字小文字無視）を弾く。 */
export function canAddLabel(label: string, existing: { label: string }[]): boolean {
  const t = label.trim();
  if (t.length === 0 || t.length > BLUEPRINT_LABEL_MAX) return false;
  const norm = t.toLowerCase();
  return !existing.some((e) => e.label.trim().toLowerCase() === norm);
}

/* ------------------------------------------------------------------ */
/* School 保存（School Comparison → My Plan）                                          */
/* ------------------------------------------------------------------ */

export type BlueprintSchoolInput = {
  name: string;
  city: string | null;
  schoolSlug: string | null;
  placeId: string | null;
  source: BlueprintSchoolSource;
  status: BlueprintSchoolStatus;
  snapshot: { reason?: string; caveat?: string };
};

export function makeBlueprintSchool(input: BlueprintSchoolInput): BlueprintSchool {
  return {
    id: crypto.randomUUID(),
    name: input.name.trim().slice(0, BLUEPRINT_LABEL_MAX),
    city: input.city,
    schoolSlug: input.schoolSlug && input.schoolSlug.length > 0 ? input.schoolSlug : null,
    placeId: input.placeId && input.placeId.length > 0 ? input.placeId : null,
    source: input.source,
    status: input.status,
    snapshot: input.snapshot,
    savedAt: new Date().toISOString(),
  };
}

type SchoolIdentity = { name: string; city: string | null; schoolSlug: string | null };

/** 同じ学校か。schoolSlug が両方あれば slug 一致、無ければ trim+lowerCase の name+city 一致（§16）。 */
export function isSameBlueprintSchool(a: SchoolIdentity, b: SchoolIdentity): boolean {
  if (a.schoolSlug && b.schoolSlug) return a.schoolSlug === b.schoolSlug;
  const n = (s: string | null) => (s ?? "").trim().toLowerCase();
  return n(a.name) === n(b.name) && n(a.city) === n(b.city);
}

/** 未保存の学校か（duplicate 防止・§16）。 */
export function canSaveSchool(candidate: SchoolIdentity, existing: SchoolIdentity[]): boolean {
  return !existing.some((e) => isSameBlueprintSchool(e, candidate));
}

/**
 * 学校 id の status を next にしつつ、application-level invariant を保つ:
 *   - preferred は最大 1 校（別を preferred にしたら旧 preferred は considering へ）
 *   - selected も最大 1 校（同上）
 *   - preferred と selected は別の学校でも可
 */
export function applySchoolStatus(
  schools: BlueprintSchool[],
  id: string,
  next: BlueprintSchoolStatus,
): BlueprintSchool[] {
  return schools.map((s) => {
    if (s.id === id) return { ...s, status: next };
    if (
      (next === "preferred" && s.status === "preferred") ||
      (next === "selected" && s.status === "selected")
    ) {
      return { ...s, status: "considering" as BlueprintSchoolStatus };
    }
    return s;
  });
}
