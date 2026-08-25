import Image from "next/image";
import { getPlanCoverImage } from "@/lib/planCover";
import { buildDestinationLine, fallbackGradientForPlan } from "@/components/PlanCard";

/**
 * Plan Home上部のHero。/mypageのPlanCardと同じcover画像決定ロジック（都市→画像）を再利用し、
 * 同じPlanなら一覧のカードとHeroで同じ画像・同じgradient fallbackになるようにする
 * （「同じPlanへ入った」という視覚的連続性のため）。
 *
 * 意図的にdecision.stageのpillは出さない。Heroの主役はPlan名・都市・出発予定・cover画像のみとし、
 * 検討段階はこの下の「このPlanについて」セクションでstated原文のまま扱う。
 */
export default function PlanHero({
  planId,
  title,
  city,
  departureTiming,
}: {
  planId: string;
  title: string;
  city: string | null;
  departureTiming: string | null;
}) {
  const cover = getPlanCoverImage(city);
  const destination = buildDestinationLine(city, departureTiming);

  return (
    <div
      className={`relative aspect-[16/9] w-full overflow-hidden rounded-[24px] bg-linear-to-br sm:aspect-[3/1] ${fallbackGradientForPlan(planId)}`}
    >
      {cover.imageSrc && (
        <Image
          src={cover.imageSrc}
          alt=""
          fill
          sizes="(min-width: 640px) 100vw, 100vw"
          priority
          className="object-cover"
        />
      )}

      <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
        <h1 className="text-2xl font-bold leading-snug text-white drop-shadow-sm sm:text-3xl">
          {title}
        </h1>
        <p className="mt-1.5 text-sm text-white/90 drop-shadow-sm sm:text-base">
          {destination.showPin && <span aria-hidden>📍 </span>}
          {destination.text}
        </p>
      </div>
    </div>
  );
}
