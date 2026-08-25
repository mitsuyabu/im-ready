import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LoginButton from "@/components/LoginButton";
import BrandLogo from "@/components/BrandLogo";

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

        <h1 className="text-[26px] font-medium leading-snug text-worksheet-primary">
          マイページへログイン
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-worksheet-secondary">
          留学に関する現実的な情報を、あなたのペースで保存しておける場所です。まだ決めていないことがあっても大丈夫です。
        </p>
        <div className="mt-8">
          <LoginButton />
        </div>
      </div>
    </div>
  );
}
