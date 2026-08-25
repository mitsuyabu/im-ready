import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadPlanNavData } from "@/lib/planNavData";
import AppNav from "@/components/AppNav";

export default async function MyPageLayout({ children }: { children: ReactNode }) {
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
