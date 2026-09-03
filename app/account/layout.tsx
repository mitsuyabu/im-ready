import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadPlanNavData } from "@/lib/planNavData";
import AppNav from "@/components/AppNav";

/**
 * Account も他のログイン後ページ（/mypage, /my-plans, /chats 等）と同じ AppNav シェルに乗せる。
 * auth は既存パターンをそのまま踏襲（getUser → 無ければ /login）。navData は AppNav の
 * Context Panel 用で、React cache() により page 側と重複クエリにならない。
 */
export default async function AccountLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const navData = await loadPlanNavData(user.id);

  return <AppNav navData={navData}>{children}</AppNav>;
}
