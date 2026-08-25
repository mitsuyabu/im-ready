import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LoginButton from "@/components/LoginButton";
import BrandLogo from "@/components/BrandLogo";
import BrandTagline from "@/components/BrandTagline";

export const metadata: Metadata = {
  title: "ログイン",
};

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/mypage");
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-worksheet-surface px-4">
      <div className="w-full max-w-[400px] text-center">
        <div className="mb-8 flex justify-center">
          <BrandLogo href="/login" />
        </div>

        <BrandTagline />

        <div className="mt-8">
          <LoginButton />
        </div>
      </div>
    </div>
  );
}
