/**
 * Plan の削除（物理削除）の、画面から独立した判断部分。
 *
 * ここに置くのは「削除できたと言ってよいか」「この端末のどのキーを消してよいか」「何を本人に伝えるか」
 * だけで、DB アクセスと UI は呼び出し側（components/DeletePlanDialog.tsx）が行う。
 *
 * 方針:
 *   - 削除は **本人の権限のまま**（通常の Supabase client ＋ RLS）行う。service role は使わない。
 *   - 条件は `id` と `user_id` の **両方**。RLS に加えて、クエリ自体でも他人の Plan を対象にしない。
 *   - **エラーが無いことは成功ではない**。RLS で対象外だった場合、Postgres はエラーを返さず
 *     「0 行削除」になる。削除された行の id が1件返ったことまで確認してから、
 *     成功表示・画面遷移・localStorage の後片付けを行う（interpretPlanDeleteResult）。
 *   - localStorage は、キーを持っているモジュール自身に列挙させる（前方一致で広く消さない）。
 */

import { planConsultationStorageKeys } from "@/lib/consultationSheetSync";
import { planWorksheetStorageKeys } from "@/lib/worksheetStorage";

/**
 * Plan を削除したときに、DB 側で一緒に消えるもの（すべて `references plans(id) on delete cascade`）。
 * ダイアログの文言と、連動削除のテストはこの一覧を共有する。
 */
export const PLAN_DELETE_CASCADE_TABLES = [
  "plan_karte",
  "chat_sessions",
  "chat_messages",
  "plan_documents",
  "document_shares",
  "plan_blueprint",
  "plan_worksheet",
  "plan_consultation_sheet",
  "consultation_sheet_shares",
] as const;

/** ダイアログで本人に見せる「消えるもの」。DB の table 名ではなく、画面での呼び方で書く。 */
export const PLAN_DELETE_ITEMS = [
  "AIとの相談（チャット）の履歴",
  "カルテ（整理された情報）",
  "My Plan の内容",
  "ワークシートの回答",
  "My Karte の資料（My Note・留学計画書・学校比較・親向け説明・相談シート）",
] as const;

/** 取り消せないことの明示。 */
export const PLAN_DELETE_IRREVERSIBLE_NOTE = "この操作は取り消せません。";

/**
 * 共有リンクについての説明。
 *
 * 「リンクが開けなくなる」ことだけを言う。**相手がすでに保存・印刷・スクリーンショットした内容まで
 * 取り消せる、とは書かない**（こちらから消せないため）。
 */
export const PLAN_DELETE_SHARE_NOTE =
  "作成済みの共有リンクは開けなくなります。ただし、相手がすでに保存・印刷した内容を取り消すことはできません。";

export type PlanDeleteFailureReason =
  /** 0 行削除。RLS の対象外（他人の Plan・ログインが切れた）か、すでに削除済み。 */
  | "not_deleted"
  /** DB がエラーを返した（権限不足・接続不良など）。 */
  | "error"
  /** 想定外の結果（複数行・別 id）。安全側に倒して失敗として扱う。 */
  | "unexpected";

export type PlanDeleteOutcome =
  | { ok: true; deletedId: string }
  | { ok: false; reason: PlanDeleteFailureReason; message: string };

/** 失敗時に本人へ見せる文言（原因を推測して断定しない）。 */
export const PLAN_DELETE_FAILURE_MESSAGES: Record<PlanDeleteFailureReason, string> = {
  not_deleted:
    "削除できませんでした。すでに削除されているか、ログインの状態が変わっている可能性があります。画面を再読み込みして、もう一度お試しください。",
  error: "削除できませんでした。しばらくしてから、もう一度お試しください。",
  unexpected: "削除の結果を確認できませんでした。画面を再読み込みして、状態をご確認ください。",
};

/**
 * `delete().eq("id").eq("user_id").select("id")` の結果を判定する。
 *
 * - error があれば失敗
 * - 0 行なら失敗（**ここを成功にしない**。RLS で弾かれた場合がこれになる）
 * - 1 行かつ id が対象と一致したときだけ成功
 */
export function interpretPlanDeleteResult(input: {
  planId: string;
  error: { message?: string } | null;
  rows: { id: string }[] | null;
}): PlanDeleteOutcome {
  if (input.error) {
    return { ok: false, reason: "error", message: PLAN_DELETE_FAILURE_MESSAGES.error };
  }
  const rows = input.rows ?? [];
  if (rows.length === 0) {
    return { ok: false, reason: "not_deleted", message: PLAN_DELETE_FAILURE_MESSAGES.not_deleted };
  }
  if (rows.length !== 1 || rows[0]?.id !== input.planId) {
    return { ok: false, reason: "unexpected", message: PLAN_DELETE_FAILURE_MESSAGES.unexpected };
  }
  return { ok: true, deletedId: rows[0].id };
}

/**
 * この Plan に属すると**確認できる** localStorage キーだけを返す。
 *
 * キーを組み立てている各モジュールに列挙させる。ここで前方一致（`startsWith("ryugaku-")` など）を
 * 使わないのは、匿名 Worksheet の保存（`ryugaku-worksheet-answers`）・他の Plan の控え・
 * ログイン情報（Supabase の auth token）を巻き込まないため。
 */
export function planLocalStorageKeys(planId: string): string[] {
  const trimmed = planId.trim();
  if (!trimmed) return [];
  const keys = [...planWorksheetStorageKeys(trimmed), ...planConsultationStorageKeys(trimmed)];
  // すべてのキーが planId を含むことを最後に確認する（将来キーの形が変わっても、
  // Plan に属さないキーがここへ混ざらないようにする安全弁）。
  return Array.from(new Set(keys.filter((key) => key.includes(trimmed))));
}

/**
 * 削除が成功したあとに、この端末の控えだけを消す。
 *
 * 他の Plan のキー・匿名 Worksheet の保存・ログイン情報は触らない。
 * localStorage が使えない環境（プライベートブラウジング等）では静かに諦める
 * （削除自体はサーバー側で完了しているため、ここで失敗扱いにしない）。
 * @returns 実際に removeItem を呼んだキー
 */
export function clearPlanLocalStorage(
  planId: string,
  storage?: Pick<Storage, "removeItem">,
): string[] {
  const keys = planLocalStorageKeys(planId);
  const store =
    storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!store) return [];
  const removed: string[] = [];
  for (const key of keys) {
    try {
      store.removeItem(key);
      removed.push(key);
    } catch {
      // この端末の控えが残るだけで、Plan 自体は削除済み。握りつぶす。
    }
  }
  return removed;
}
