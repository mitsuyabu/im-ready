import BrandLogo from "@/components/BrandLogo";

/**
 * lg 未満のページ上部に出すブランド行（ロゴ ＋ 小さなタグライン）。
 *
 * PC（lg 以上）は AppNav 左 sidebar のロゴを使うため、この行は `lg:hidden` な header の中だけで使う。
 * ロゴは既定サイズ（h-10 / sm:h-12）より一段小さい h-7 / sm:h-8 で、主張しすぎないブランド表示にする。
 * タグラインはロゴより弱いが読める warm gray。1 行前提（whitespace-nowrap）。
 *
 * 左端の基準線: この行自体は padding を持たず、各ページの header（px-4 sm:px-6）に従う。
 * 同じ px-4 sm:px-6 を本文コンテナも使っているため、ブランド行と本文の左端は自動で揃う。
 * ここに独自の px / ml を足さないこと（足すとページ本文とズレる）。
 */
export default function MobileBrandHeader() {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <BrandLogo href="/mypage" className="h-7 w-auto shrink-0 sm:h-8" />
      <span className="whitespace-nowrap text-[10px] font-medium leading-tight text-[#6f6a61] sm:text-[11px]">
        さあ、留学の準備を始めよう
      </span>
    </div>
  );
}
