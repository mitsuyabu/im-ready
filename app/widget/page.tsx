import { randomUUID } from "crypto";
import Chat from "@/components/Chat";
import EmbedCloseButton from "@/components/EmbedCloseButton";
import BrandLogo from "@/components/BrandLogo";
import { createEmptyKarte } from "@/lib/karte";

type WidgetPageProps = {
  searchParams: Promise<{ key?: string | string[] }>;
};

export default async function WidgetPage({ searchParams }: WidgetPageProps) {
  const params = await searchParams;
  const tenantKey = typeof params.key === "string" ? params.key : undefined;
  const karteId = tenantKey ? `${tenantKey}:${randomUUID()}` : randomUUID();
  // 初期カルテはサーバー側（ここ）で1回だけ生成する。
  // karteId や createdAt（現在時刻）をクライアント側で生成すると、
  // SSR時とハイドレーション時で値が食い違い hydration mismatch を起こすため。
  const initialKarte = createEmptyKarte(karteId);

  return (
    <div className="flex h-dvh flex-1 flex-col bg-white dark:bg-zinc-950">
      <header className="flex items-start justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div>
          <BrandLogo className="h-5 w-auto sm:h-6" />
          <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            入力内容はAIによる応答生成のため外部サービスに送信されます。個人を特定する情報の入力は必要な範囲にとどめてください。{" "}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              利用規約
            </a>
            {" / "}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              プライバシーポリシー
            </a>
          </p>
        </div>
        <EmbedCloseButton />
      </header>
      <div className="min-h-0 flex-1">
        <Chat initialKarte={initialKarte} />
      </div>
    </div>
  );
}
