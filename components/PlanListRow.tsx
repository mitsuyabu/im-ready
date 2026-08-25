import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { getPlanCoverImage } from "@/lib/planCover";
import { fallbackGradientForPlan } from "@/components/PlanCard";

/**
 * /chats・/worksheets・/my-plans で共通のPlan一覧row。
 * 既存のcover画像ロジック（lib/planCover.ts・PlanCard.tsxのfallback）をそのまま再利用し、
 * 新しいcoverロジックは作らない。写真は小さいthumbnailに留め、一覧が写真だらけにならないようにする。
 */
export default function PlanListRow({
  planId,
  href,
  city,
  title,
  density = "list",
  onClick,
  children,
}: {
  planId: string;
  href: string;
  city: string | null;
  title: string;
  /** "panel" はPC Context Panel（幅272〜300px）向けの縮小版。省略時は既存/chats等の一覧と同じ見た目のまま */
  density?: "list" | "panel";
  /** Context Panel用: 遷移を妨げず、クリックと同時にPanelを閉じるための任意フック */
  onClick?: () => void;
  children?: ReactNode;
}) {
  const cover = getPlanCoverImage(city);
  const isPanel = density === "panel";

  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center transition-colors duration-150 hover:bg-worksheet-sage/10 ${
        isPanel ? "gap-3 py-3" : "gap-4 py-4"
      }`}
    >
      <div
        className={`relative shrink-0 overflow-hidden rounded-lg bg-linear-to-br ${fallbackGradientForPlan(planId)} ${
          isPanel ? "h-9 w-9" : "h-11 w-11"
        }`}
      >
        {cover.imageSrc && (
          <Image src={cover.imageSrc} alt="" fill sizes={isPanel ? "36px" : "44px"} className="object-cover" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p
          className={`truncate font-semibold text-worksheet-primary ${
            isPanel ? "text-sm" : "text-sm sm:text-base"
          }`}
        >
          {title}
        </p>
        {children}
      </div>
    </Link>
  );
}
