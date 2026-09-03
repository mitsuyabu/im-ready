import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadPlanNavData } from "@/lib/planNavData";
import { loadAppNavViewer } from "@/lib/appNavViewer";
import AppNav from "@/components/AppNav";

export default async function ChatsLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [navData, viewer] = await Promise.all([
    loadPlanNavData(user.id),
    loadAppNavViewer(user.id),
  ]);

  return (
    <AppNav navData={navData} viewer={viewer}>
      {children}
    </AppNav>
  );
}
