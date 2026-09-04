"use client";

import { useState } from "react";
import type { BlueprintSchool, BlueprintSchoolStatus } from "@/lib/planBlueprint";
import { applySchoolStatus, patchSchoolsSection } from "@/lib/planBlueprintClient";

/**
 * My Plan「School & English」の保存済み学校の編集 island（Step 2-4）。
 *
 *   - status 変更（検討中 / 第一候補 / 決定）
 *   - My Plan から外す（学校マスタ / proposal は消さない。blueprint.schools 配列から外すだけ）
 *
 * application-level invariant:
 *   - preferred は最大 1 校（別の学校を preferred にしたら旧 preferred は considering へ）
 *   - selected も最大 1 校（同上）
 *   - preferred と selected は別の学校でも可
 * ranking / おすすめ / Best 表示は一切しない（status は必ずユーザー操作）。
 *
 * write は update_plan_blueprint_section RPC に schools 配列だけを渡す（他セクション保持）。
 * optimistic ＋ 失敗時 rollback。editingEnabled=false（blueprint unavailable）では read-only。
 */

const STATUSES: BlueprintSchoolStatus[] = ["considering", "preferred", "selected"];
const STATUS_LABEL: Record<BlueprintSchoolStatus, string> = {
  considering: "検討中",
  preferred: "第一候補",
  selected: "決定",
};
const STATUS_ACTIVE: Record<BlueprintSchoolStatus, string> = {
  considering: "border-[#d8cfbe] bg-[#efe9db] text-[#6f6a64]",
  preferred: "border-[#bcd0e0] bg-[#e3eef5] text-[#33506a]",
  selected: "border-[#c3d6b6] bg-[#e6f0dd] text-[#456037]",
};

export default function EditableSchools({
  planId,
  initialSchools,
  editingEnabled,
}: {
  planId: string;
  initialSchools: BlueprintSchool[];
  editingEnabled: boolean;
}) {
  const [schools, setSchools] = useState<BlueprintSchool[]>(initialSchools);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function commit(next: BlueprintSchool[]): Promise<boolean> {
    const prev = schools;
    setSchools(next);
    setError(null);
    const res = await patchSchoolsSection(planId, next, null);
    if (!res.ok) {
      setSchools(prev);
      setError(
        res.reason === "stale"
          ? "ほかで更新があったようです。ページを再読み込みしてください。"
          : "保存できませんでした。もう一度お試しください。",
      );
      return false;
    }
    setSchools(res.data.schools);
    return true;
  }

  async function changeStatus(id: string, next: BlueprintSchoolStatus) {
    const current = schools.find((s) => s.id === id);
    if (!current || current.status === next) return;
    setBusy(`status:${id}`);
    await commit(applySchoolStatus(schools, id, next));
    setBusy(null);
  }

  async function remove(id: string) {
    setBusy(`del:${id}`);
    await commit(schools.filter((s) => s.id !== id));
    setBusy(null);
  }

  const disabled = busy !== null;

  return (
    <div className="mt-4 grid grid-cols-1 gap-2">
      {schools.map((s) => (
        <div key={s.id} className="rounded-xl border border-[#e5dfd6] bg-white px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#2f2c26]">{s.name}</p>
              {s.city && <p className="mt-0.5 text-xs text-[#8a8578]">{s.city}</p>}
            </div>
            {editingEnabled ? (
              <button
                type="button"
                onClick={() => remove(s.id)}
                disabled={disabled}
                aria-label={`「${s.name}」をMy Planから外す`}
                className="shrink-0 rounded-lg px-2 py-1 text-xs text-[#b7b1a6] transition-colors hover:bg-[#f0ece2] hover:text-[#6f6a64] disabled:opacity-40"
              >
                外す
              </button>
            ) : (
              <span
                className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${STATUS_ACTIVE[s.status]}`}
              >
                {STATUS_LABEL[s.status]}
              </span>
            )}
          </div>

          {editingEnabled && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {STATUSES.map((st) => {
                const active = s.status === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => changeStatus(s.id, st)}
                    disabled={disabled}
                    aria-pressed={active}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-40 ${
                      active
                        ? STATUS_ACTIVE[st]
                        : "border-[#e5dfd6] bg-white text-[#8a8578] hover:bg-[#f6f2e8]"
                    }`}
                  >
                    {busy === `status:${s.id}` && active ? "…" : STATUS_LABEL[st]}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
