import Image from "next/image";
import Link from "next/link";
import { getPlanCoverImage } from "@/lib/planCover";

/**
 * cover画像を背景にしたPlanカード。画像はkarte.schoolPrefs.preferredCity（stated限定）から
 * lib/planCover.tsが決定的に選ぶ。実画像が無い都市・都市未定のPlanはgradient fallbackになり、
 * 画像の有無に関わらずカードは常に成立する（壊れない）。
 *
 * 表示情報は「Plan名 > 都市・出発予定 > statusピル」の3階層のみに絞る
 * （一覧は詳細を見る場所ではなく、開くPlanを選ぶ場所のため）。
 *
 * アクセシビリティ: 背景画像は装飾（alt=""）とし、Plan情報は必ずテキストとして存在させる。
 * カード全体が1つのLinkであり、内部に別のLink/buttonは置かない（nested interactive element回避）。
 */

const FALLBACK_GRADIENTS = [
  "from-zinc-700 to-zinc-900",
  "from-slate-600 to-slate-800",
  "from-stone-600 to-stone-800",
  "from-sky-700 to-slate-900",
  "from-teal-700 to-zinc-900",
] as const;

/** Plan HomeのHero（PlanHero.tsx）でも同じPlanなら同じfallbackになるよう共有する */
export function fallbackGradientForPlan(planId: string): string {
  let sum = 0;
  for (let i = 0; i < planId.length; i++) sum += planId.charCodeAt(i);
  return FALLBACK_GRADIENTS[sum % FALLBACK_GRADIENTS.length];
}

export type DestinationLine = { text: string; showPin: boolean };

/**
 * 都市・出発予定を1行へまとめる。departureTimingは原文のまま使い、AI要約や
 * 内容を変える整形は行わない（安全に短縮できるルールが無いため）。1行に収まらない場合は
 * 呼び出し側でline-clampする。
 */
export function buildDestinationLine(city: string | null, departureTiming: string | null): DestinationLine {
  if (city && departureTiming) return { text: `${city} · ${departureTiming}`, showPin: true };
  if (city) return { text: city, showPin: true };
  if (departureTiming) return { text: `${departureTiming}に出発予定`, showPin: false };
  return { text: "行き先・時期はまだ検討中", showPin: false };
}

/**
 * decision.stageの原文はカード本文には出さない（長文になりカードが崩れるため）。
 * statedかつ値がある場合だけ、固定文言「検討中」のstatus pillを出す。
 * stageの自由記述をAIで要約する・そのまま流し込む、といった複雑な分類はMVPでは行わない。
 */
export function buildStatusPillText(stage: string | null): string | null {
  return stage ? "検討中" : null;
}

export type PlanCardData = {
  id: string;
  title: string;
  /** certainty==="stated"のときだけ渡すこと。無ければnull */
  city: string | null;
  departureTiming: string | null;
  stage: string | null;
  /** 表示用に整形済みの最終更新（例: "今日"）。呼び出し側でlib/planActivity.tsから作る */
  lastUpdatedText: string | null;
};

export default function PlanCard({ plan }: { plan: PlanCardData }) {
  const cover = getPlanCoverImage(plan.city);
  const destination = buildDestinationLine(plan.city, plan.departureTiming);
  const statusPillText = buildStatusPillText(plan.stage);

  return (
    <Link
      href={`/plans/${plan.id}`}
      className="group relative block overflow-hidden rounded-[24px] shadow-sm transition-shadow duration-150 hover:shadow-md"
    >
      <div
        className={`relative aspect-video w-full overflow-hidden bg-linear-to-br ${fallbackGradientForPlan(plan.id)}`}
      >
        {cover.imageSrc && (
          <Image
            src={cover.imageSrc}
            alt=""
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-150 group-hover:scale-[1.02]"
          />
        )}

        {/* 下部だけを強く暗くするoverlay。上部は写真をそのまま見せる */}
        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/15 to-transparent" />

        {statusPillText && (
          <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
            {statusPillText}
          </span>
        )}

        {/* 最も弱い補助情報。status pillより軽い見た目にし、写真を邪魔しない右上へ配置する */}
        {plan.lastUpdatedText && (
          <span className="absolute right-3 top-3 text-[11px] font-medium text-white/80 drop-shadow-sm">
            更新: {plan.lastUpdatedText}
          </span>
        )}

        <div className="absolute inset-x-0 bottom-0 p-4">
          <h2 className="line-clamp-2 text-base font-bold leading-snug text-white drop-shadow-sm sm:text-lg">
            {plan.title}
          </h2>
          <p className="mt-1 line-clamp-1 text-sm text-white/90 drop-shadow-sm">
            {destination.showPin && <span aria-hidden>📍 </span>}
            {destination.text}
          </p>
        </div>
      </div>
    </Link>
  );
}
