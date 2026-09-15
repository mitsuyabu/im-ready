/**
 * Plan Worksheet の「表示用の回答」をブラウザ側で決めるヘルパー（進捗表示・一覧用）。
 * 回答の編集・保存は components/Worksheet.tsx の useWorksheetAnswers が担い、ここでは扱わない。
 *
 * 決まり方（サーバーが正本）:
 *   1. サーバーに行がある           → サーバーの回答（この端末の localStorage は見ない）
 *   2. サーバーに行が無い＋この端末の localStorage に回答がある
 *                                    → サーバーへ 1 回だけ移行（INSERT）して、その回答
 *                                      （別端末が先に作っていたら、そちらを正とする）
 *   3. plan_worksheet が使えない（migration 未適用・読み込み失敗） → 従来どおり localStorage
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { loadWorksheetState, sanitizeWorksheetState, type WorksheetPersistedData } from "@/lib/worksheetStorage";
import {
  WORKSHEET_VALID_IDS,
  hasAnyWorksheetAnswer,
  insertPlanWorksheet,
  loadPlanWorksheet,
  type LoadedPlanWorksheet,
} from "@/lib/planWorksheet";

/** サーバーに行があるときだけ、同期的に表示用の回答を返す（初回描画から正しい進捗を出すため）。 */
export function serverWorksheetStateOrNull(server: LoadedPlanWorksheet | undefined): WorksheetPersistedData | null {
  return server?.available && server.row ? server.row.state : null;
}

function loadLocal(planId: string): WorksheetPersistedData | null {
  const stored = loadWorksheetState(planId);
  return stored ? sanitizeWorksheetState(stored, WORKSHEET_VALID_IDS) : null;
}

export async function resolvePlanWorksheetForDisplay(
  planId: string,
  server: LoadedPlanWorksheet | undefined,
  getClient: () => SupabaseClient = createClient,
): Promise<WorksheetPersistedData | null> {
  const fromServer = serverWorksheetStateOrNull(server);
  if (fromServer) return fromServer;

  const local = loadLocal(planId);
  if (!server?.available) return local;
  if (!local || !hasAnyWorksheetAnswer(local)) return local;

  // サーバーに行が無く、この端末にだけ回答がある → 1回だけ移行する。
  const supabase = getClient();
  const result = await insertPlanWorksheet(supabase, planId, local);
  if (result.status === "conflict") {
    const latest = await loadPlanWorksheet(supabase, planId);
    return latest.available && latest.row ? latest.row.state : local;
  }
  // saved / error どちらでも、この端末の回答はそのまま表示する（error 時は次回また移行を試みる）。
  return local;
}
