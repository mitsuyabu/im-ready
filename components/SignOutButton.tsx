"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * ログアウト導線。signOut のロジックは既存 MyPageForm の実装をそのまま切り出したもの。
 *   variant="link"（既定）: マイページヘッダー用の控えめな下線リンク（従来どおり）
 *   variant="button"      : Account ページ用の枠付きボタン
 */
export default function SignOutButton({
  variant = "link",
}: {
  variant?: "link" | "button";
}) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (variant === "button") {
    return (
      <button
        type="button"
        onClick={handleSignOut}
        className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-[#1e2b3d] px-6 py-2.5 text-sm font-medium text-[#172033] transition-colors duration-150 hover:bg-[#1e2b3d]/[0.06]"
      >
        ログアウト
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="shrink-0 text-xs text-worksheet-accent underline decoration-worksheet-accent/40 underline-offset-2 transition-colors hover:decoration-worksheet-accent"
    >
      ログアウト
    </button>
  );
}
