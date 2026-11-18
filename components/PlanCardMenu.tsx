"use client";

import { useEffect, useRef, useState } from "react";
import DeletePlanDialog from "@/components/DeletePlanDialog";

/**
 * 一覧（マイページ）の Plan カードに重ねる操作メニュー。今は「削除」だけ。
 *
 * カード本体（components/HomePlanCard.tsx）はカード全面が 1 つの `Link` で、hooks を持たない
 * 純粋表示コンポーネントのため**変更しない**。このメニューはカードの外側（grid のセル）に
 * absolute で重ね、クリックがカードのリンクへ伝播しないようにする。
 *
 * Escape とカード外クリックで閉じ、閉じたら「…」ボタンへフォーカスを戻す。
 * 削除ダイアログを開くときはメニューを閉じ、ダイアログのフォーカス復帰先も「…」にする。
 */
export default function PlanCardMenu({
  planId,
  planTitle,
  userId,
}: {
  planId: string;
  planTitle: string;
  userId: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRef = useRef<HTMLButtonElement>(null);

  // メニューを開いたら最初の項目へフォーカス。
  useEffect(() => {
    if (menuOpen) itemRef.current?.focus();
  }, [menuOpen]);

  // Escape で閉じて「…」へ戻す。外側クリックでも閉じる。
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenuOpen(false);
      triggerRef.current?.focus();
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [menuOpen]);

  return (
    <div className="absolute right-3 top-3 z-20">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`「${planTitle}」の操作`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenuOpen((v) => !v);
        }}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-white/85 text-[#4f4a43] shadow-[0_1px_2px_rgba(0,0,0,0.08)] backdrop-blur transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-worksheet-accent"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>

      {menuOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`「${planTitle}」の操作`}
          className="absolute right-0 mt-1.5 w-40 overflow-hidden rounded-[12px] border border-black/[0.08] bg-white py-1 shadow-[0_6px_20px_rgba(0,0,0,0.12)]"
        >
          <button
            ref={itemRef}
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(false);
              setDialogOpen(true);
            }}
            className="block w-full px-4 py-2.5 text-left text-sm font-medium text-[#8a3a2f] transition-colors hover:bg-[#fbeeea]"
          >
            このPlanを削除
          </button>
        </div>
      )}

      <DeletePlanDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        planId={planId}
        planTitle={planTitle}
        userId={userId}
        after="refresh"
        returnFocusRef={triggerRef}
      />
    </div>
  );
}
