"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  PLAN_DELETE_IRREVERSIBLE_NOTE,
  PLAN_DELETE_ITEMS,
  PLAN_DELETE_SHARE_NOTE,
  clearPlanLocalStorage,
  interpretPlanDeleteResult,
} from "@/lib/planDelete";

/**
 * Plan の削除の確認ダイアログ（物理削除）。
 *
 * 呼び出し側が open / onClose を持つ **controlled** component。trigger は持たない
 * （一覧のカードメニュー・Plan Home のボタンなど、置く場所ごとに見た目が違うため）。
 *
 * 削除:
 *   本人の権限のまま（通常の Supabase client ＋ RLS）、`id` と `user_id` の両方を条件にして delete。
 *   service role は使わない。**エラーが無いことを成功としない**。削除された id が1件返ったことを
 *   確認してから、成功表示・localStorage の後片付け・画面更新を行う（lib/planDelete.ts）。
 *   RLS で 0 行だった場合は、何も消さず・遷移せず、その旨を表示する。
 *
 * アクセシビリティ:
 *   - role="dialog" / aria-modal / aria-labelledby / aria-describedby
 *   - 開いたら「キャンセル」へフォーカス（破壊的な操作を初期フォーカスにしない）
 *   - Tab / Shift+Tab はダイアログ内で循環
 *   - Escape で閉じる（削除中は閉じない）
 *   - 閉じたら呼び出し元（trigger）へフォーカスを戻す
 *   - 削除中はボタンを無効化し、ref でも二重実行を防ぐ
 */

type Props = {
  open: boolean;
  onClose: () => void;
  planId: string;
  planTitle: string;
  /** 本人の user id。クエリ条件にも使う（RLS 任せにしない）。 */
  userId: string;
  /** 削除後の挙動。"refresh" は今の画面を更新（一覧）、"mypage" はマイページへ戻る。 */
  after: "refresh" | "mypage";
  /** 閉じたときにフォーカスを戻す先（trigger）。 */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
};

const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export default function DeletePlanDialog({
  open,
  onClose,
  planId,
  planTitle,
  userId,
  after,
  returnFocusRef,
}: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  /** state の更新を待たずに二重実行を止めるための同期フラグ。 */
  const runningRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    if (runningRef.current) return;
    setError(null);
    onClose();
  }, [onClose]);

  // 開いたら「キャンセル」へフォーカス。閉じたら trigger へ戻す。
  useEffect(() => {
    if (!open) return;
    const previous = (returnFocusRef?.current ?? document.activeElement) as HTMLElement | null;
    cancelRef.current?.focus();
    return () => {
      previous?.focus?.();
    };
  }, [open, returnFocusRef]);

  // Escape で閉じる / Tab はダイアログ内で循環させる。
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, close]);

  async function handleDelete() {
    if (runningRef.current) return;
    runningRef.current = true;
    setBusy(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error: deleteError } = await supabase
        .from("plans")
        .delete()
        .eq("id", planId)
        .eq("user_id", userId)
        .select("id");

      const outcome = interpretPlanDeleteResult({
        planId,
        error: deleteError,
        rows: (data as { id: string }[] | null) ?? null,
      });

      if (!outcome.ok) {
        // 0 行（RLS 対象外・既に削除済み）やエラーのときは、何も消さず・遷移しない。
        setError(outcome.message);
        runningRef.current = false;
        setBusy(false);
        return;
      }

      // ここから先は削除が確定したあとの後片付け。
      clearPlanLocalStorage(planId);

      if (after === "mypage") {
        // Plan Home からの削除。その Plan のページは存在しなくなるため一覧へ戻す。
        router.push("/mypage");
        router.refresh();
        return; // busy のままにして、遷移中の再クリックを防ぐ
      }

      onClose();
      router.refresh();
      runningRef.current = false;
      setBusy(false);
    } catch {
      setError("削除できませんでした。通信の状態をご確認のうえ、もう一度お試しください。");
      runningRef.current = false;
      setBusy(false);
    }
  }

  // 呼び出し元（一覧のカードメニュー）は `absolute … z-20` の中にあり、z-index を持つ
  // 位置指定要素は**独自の重なり文脈（stacking context）**を作る。そのままこの中で描画すると、
  // ダイアログの z-index はカード内部での順序にしかならず、
  //   - DOM 上で後ろにある別カードの「…」ボタン（同じ z-20）
  //   - mobile の AppNav（z-30）
  // がモーダルより前面に出てしまう（実機で「…」がダイアログの上に浮いて見えた）。
  // モーダルは body 直下へ portal して、アプリ内で最も高い z-index で描画する。
  // open の初期値は false なので、SSR 時にここへ来ることはない（hydration mismatch は起きない）。
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-plan-title"
        aria-describedby="delete-plan-description"
        aria-busy={busy}
        className="w-full max-w-md rounded-t-[22px] border border-black/[0.08] bg-[#fffdf8] p-6 shadow-[0_8px_30px_rgba(0,0,0,0.18)] sm:rounded-[22px] sm:p-7"
      >
        <h2 id="delete-plan-title" className="font-serif text-xl font-normal text-worksheet-primary">
          「{planTitle}」を削除しますか？
        </h2>

        <div id="delete-plan-description" className="mt-3 space-y-3 text-sm leading-relaxed text-[#5f5a52]">
          <p>
            次のものがすべて消えます。<strong className="font-semibold text-[#8a3a2f]">{PLAN_DELETE_IRREVERSIBLE_NOTE}</strong>
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {PLAN_DELETE_ITEMS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>{PLAN_DELETE_SHARE_NOTE}</p>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-[12px] bg-[#fbeeea] px-3 py-2 text-sm text-[#8a3a2f]">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={close}
            disabled={busy}
            className="rounded-full border border-black/15 bg-white px-5 py-2.5 text-sm font-medium text-worksheet-primary transition-colors hover:bg-black/[0.03] disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="rounded-full bg-[#8a3a2f] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#753027] disabled:opacity-60"
          >
            {busy ? "削除中…" : "削除する"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
