"use client";

import { useState } from "react";
import CreatePlanForm from "./CreatePlanForm";

/**
 * 見出し右側に置くコンパクトな新規作成トリガー。押すと直下に小さなパネルとして
 * 既存CreatePlanFormをそのまま展開する（モーダル・ドロップダウンライブラリは使わない）。
 * 作成に成功するとCreatePlanForm側が /plans/[planId] へ遷移するため、
 * このパネルを閉じる特別な処理は不要（画面遷移で自然に消える）。
 */
export default function NewPlanButton({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-worksheet-accent px-4 py-2 text-sm font-medium text-worksheet-accent-contrast transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-worksheet-accent"
      >
        ＋ 新規作成
      </button>

      {open && (
        <div className="absolute right-0 top-full z-10 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-[20px] border-[0.5px] border-worksheet-border bg-worksheet-surface p-1 shadow-lg">
          <CreatePlanForm userId={userId} />
        </div>
      )}
    </div>
  );
}
