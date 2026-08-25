"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** マイページヘッダー用の最小限のログアウト導線。既存MyPageFormの実装をそのまま切り出したもの */
export default function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
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
