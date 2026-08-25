import BrandLogo from "@/components/BrandLogo";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3">
      <BrandLogo />
      <p className="text-zinc-600 dark:text-zinc-400">準備中</p>
      <div className="flex gap-4 text-xs text-zinc-400 dark:text-zinc-500">
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
