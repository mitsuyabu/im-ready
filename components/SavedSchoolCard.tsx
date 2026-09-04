import Image from "next/image";
import type { BlueprintSchool, BlueprintSchoolStatus } from "@/lib/planBlueprint";

/**
 * My Plan「School & English」の保存済み学校メインカード。
 * このプランで軸にしている 1 校を、School Comparison と同じ背景画像資産で前面表示する（表示専用）。
 * ただし School Comparison の大型カードではなく、My Plan の中で確認する compact な summary card。
 * status 変更 / 外すは下の EditableSchools が担う。候補校はここには出さない（School Comparison の役割）。
 */

const CARD_IMAGE = "/school-comparison-cards/school-01-sage.webp";

const STATUS_JA: Record<BlueprintSchoolStatus, string> = {
  considering: "検討中",
  preferred: "第一候補",
  selected: "決定",
};
const SOURCE_JA: Record<BlueprintSchool["source"], string> = {
  school_comparison: "School Comparison から",
  proposal: "AIの提案から",
};

export default function SavedSchoolMainCard({
  school,
  englishNote,
}: {
  school: BlueprintSchool;
  englishNote: string | null;
}) {
  const meta = [school.city].filter((v): v is string => Boolean(v));
  return (
    <div className="relative h-[176px] overflow-hidden rounded-[16px] shadow-[0_1px_3px_rgba(30,28,24,0.08)] sm:h-[272px]">
      {/* 背景ビジュアルは共有資産をそのまま利用。カードを低くし、やや右寄りに寄せて
       * 装飾番号「01」と校舎イラストの主張を抑える（新規画像は作らない）。 */}
      <Image
        src={CARD_IMAGE}
        alt=""
        fill
        sizes="(min-width: 640px) 60vw, 92vw"
        className="object-cover object-[60%_50%] sm:object-[56%_50%]"
        priority
      />
      {/* 白文字が背景に埋もれないよう、右側だけごく薄い gradient（暗くしすぎない）。 */}
      <div
        aria-hidden
        className="absolute inset-y-0 right-0 w-3/4 bg-gradient-to-l from-black/20 via-black/5 to-transparent"
      />
      <div className="absolute left-[36%] right-[6%] top-1/2 -translate-y-1/2 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)] sm:left-[40%] sm:right-[7%]">
        <span className="inline-flex rounded-full bg-white/25 px-2.5 py-1 text-[11px] font-semibold backdrop-blur-sm">
          {STATUS_JA[school.status]}
        </span>
        <p className="mt-1.5 line-clamp-2 text-[17px] font-semibold leading-snug sm:text-[20px]">
          {school.name}
        </p>
        {meta.length > 0 && (
          <p className="mt-0.5 line-clamp-1 text-[13px] text-white/90">{meta.join(" ・ ")}</p>
        )}
        <p className="mt-1 line-clamp-1 text-xs text-white/80">{SOURCE_JA[school.source]}</p>
        {englishNote && (
          <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-white/85">{englishNote}</p>
        )}
      </div>
    </div>
  );
}
