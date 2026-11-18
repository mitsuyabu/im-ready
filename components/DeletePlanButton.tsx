"use client";

import { useRef, useState } from "react";
import DeletePlanDialog from "@/components/DeletePlanDialog";

/**
 * Plan Home（/plans/[planId]）の「このPlanを削除」。
 *
 * 一覧のカードメニュー（components/PlanCardMenu.tsx）と同じダイアログを使い、
 * 削除後はマイページへ戻る（削除した Plan のページは存在しなくなるため）。
 * 目立たせすぎないよう、フッターの控えめなテキストボタンにしている。
 */
export default function DeletePlanButton({
  planId,
  planTitle,
  userId,
}: {
  planId: string;
  planTitle: string;
  userId: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-xs font-medium text-[#8a3a2f] transition-colors hover:bg-[#fbeeea] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-worksheet-accent"
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 7h16" />
          <path d="M9 7V5h6v2" />
          <path d="M6 7l1 13h10l1-13" />
          <path d="M10 11v6M14 11v6" />
        </svg>
        このPlanを削除
      </button>

      <DeletePlanDialog
        open={open}
        onClose={() => setOpen(false)}
        planId={planId}
        planTitle={planTitle}
        userId={userId}
        after="mypage"
        returnFocusRef={triggerRef}
      />
    </>
  );
}
