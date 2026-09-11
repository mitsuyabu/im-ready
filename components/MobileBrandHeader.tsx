import BrandLogo from "@/components/BrandLogo";

/**
 * lg 未満のページ上部に出すブランド行（ロゴ ＋ 小さなタグライン）。
 *
 * PC（lg 以上）は AppNav 左 sidebar のロゴを使うため、この行は `lg:hidden` な header の中だけで使う。
 * ロゴは既定サイズ（h-10 / sm:h-12）より一段小さい h-7 / sm:h-8 で、主張しすぎないブランド表示にする。
 * タグラインはロゴより明確に弱い muted warm gray。1 行前提（whitespace-nowrap）。
 * 各ページの header 枠・背景・border・padding には手を入れない（この行を差し込むだけ）。
 */
export default function MobileBrandHeader() {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <BrandLogo href="/mypage" className="h-7 w-auto shrink-0 sm:h-8" />
      <span className="whitespace-nowrap text-[10px] font-medium leading-tight text-[#8a857d] sm:text-[11px]">
        さあ、留学の準備を始めよう
      </span>
    </div>
  );
}
