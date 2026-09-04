import Image from "next/image";
import type { BlueprintSchool, BlueprintSchoolStatus } from "@/lib/planBlueprint";

/**
 * My Plan「School & English」の保存済み学校メインカード。
 * このプランで軸にしている 1 校を、School Comparison と同じ背景画像資産で前面表示する（表示専用）。
 *
 * サイズは School Comparison の候補校カード（01〜03）1 枚分と同じ:
 *   - aspect ratio  : aspect-[1676/938]（画像の実比率。My Plan 独自の固定高さは持たない）
 *   - 角丸 / 影      : rounded-[20px] / shadow-[0_1px_2px_rgba(30,28,24,0.06)]
 *   - 幅の制御       : 呼び出し側（MyPlan.tsx）の grid（sm:2 列 / lg:3 列相当）で 1 枚分に絞る
 * 保存済みが 1 校でもカード自体は大きくしない。status 変更 / 外すは下の EditableSchools が担う。
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
    <div className="relative block aspect-[1676/938] overflow-hidden rounded-[20px] shadow-[0_1px_2px_rgba(30,28,24,0.06)]">
      <Image
        src={CARD_IMAGE}
        alt=""
        fill
        sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 92vw"
        className="object-cover"
        priority
      />
      {/* 学校情報は背景画像の学校イラスト・番号・波線に重ならないよう右へ寄せる
       * （School Comparison カードと同じ配置）。カードが小さいので文字は一段小さめに。 */}
      <div className="absolute left-[38%] right-[6%] top-[11%] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)] sm:left-[40%] sm:right-[8%]">
        <span className="inline-flex rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm">
          {STATUS_JA[school.status]}
        </span>
        <p className="mt-1 line-clamp-2 text-sm font-semibold leading-snug sm:text-[15px]">
          {school.name}
        </p>
        {meta.length > 0 && (
          <p className="mt-0.5 line-clamp-1 text-[11px] text-white/85">{meta.join(" ・ ")}</p>
        )}
        <p className="mt-0.5 line-clamp-1 text-[10px] text-white/75">{SOURCE_JA[school.source]}</p>
        {englishNote && (
          <p className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-white/80">{englishNote}</p>
        )}
      </div>
    </div>
  );
}
