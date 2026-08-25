import BrandLogo from "@/components/BrandLogo";
import BrandTagline from "@/components/BrandTagline";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4">
      <BrandLogo />
      <BrandTagline />
      <div className="mt-2 flex gap-4 text-xs text-zinc-400 dark:text-zinc-500">
        <a href="/terms" className="underline underline-offset-2">
          利用規約
        </a>
        <a href="/privacy" className="underline underline-offset-2">
          プライバシーポリシー
        </a>
      </div>
    </div>
  );
}
