"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import PlanListRow from "@/components/PlanListRow";
import CreatePlanForm from "@/components/CreatePlanForm";
import { createClient } from "@/lib/supabase/client";
import { toCityChipText, toDeparturePlanInfoText } from "@/lib/planHeroImage";
import type { PlanNavData, PlanNavPlan } from "@/lib/planNavData";
import type { AppNavViewer } from "@/lib/appNavViewer";

/**
 * ナビゲーションは「Plan 中心」の2階層:
 *   - グローバル階層（/mypage・/account 等、Plan context 無し）: Home / ＋ 新しく始める / Menu
 *   - Plan 階層（/plans/[id]/...）: ← All Plans / Plan Home / Chat / Worksheet / My Plan / My Karte / Menu
 * Chat / Worksheet / My Plan / My Karte はすべて Plan ごとの機能なので、グローバルには常設しない。
 * 「＋ 新しく始める」は「新しい留学Plan / AI相談 / Worksheet」の総合入口（既存 Plan を選んで開くだけ。
 * 新しい chat_session や Worksheet instance は作らない）。
 *
 * data 取得は lib/planNavData.ts（Server 側の layout.tsx から）に委譲し、このコンポーネントは
 * 新たな Supabase query を発行しない（Plan 作成は既存 CreatePlanForm がクライアント insert）。
 */

type PanelKey = "start" | "menu";
type PlanTab = "planHome" | "chat" | "worksheet" | "myPlan" | "myKarte";

type IconProps = { className?: string };

function iconBaseProps(className?: string) {
  return {
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 2.25,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
}

function HomeIcon({ className }: IconProps) {
  return (
    <svg {...iconBaseProps(className)}>
      <path d="M3.5 11.5 12 4l8.5 7.5" />
      <path d="M5.75 10v8.75A1.25 1.25 0 0 0 7 20h10a1.25 1.25 0 0 0 1.25-1.25V10" />
      <path d="M9.75 20v-4.75A1.25 1.25 0 0 1 11 14h2a1.25 1.25 0 0 1 1.25 1.25V20" />
    </svg>
  );
}
function ChatIcon({ className }: IconProps) {
  return (
    <svg {...iconBaseProps(className)}>
      <path d="M4 11.7C4 7.9 7.5 5 12 5s8 2.9 8 6.7-3.5 6.7-8 6.7c-.9 0-1.8-.1-2.6-.3L4 20l1.1-3.7C4.4 15 4 13.4 4 11.7Z" />
      <path d="M9 11.9h.01M12 11.9h.01M15 11.9h.01" />
    </svg>
  );
}
function WorksheetIcon({ className }: IconProps) {
  return (
    <svg {...iconBaseProps(className)}>
      <rect x="5" y="4.5" width="14" height="16" rx="2.5" />
      <path d="M9.5 4.5a2.5 2.5 0 0 1 5 0" />
      <path d="M8.75 11h.01M8.75 15h.01" />
      <path d="M11.5 11h4M11.5 15h4" />
    </svg>
  );
}
function MyPlanIcon({ className }: IconProps) {
  return (
    <svg {...iconBaseProps(className)}>
      <path d="M13 3.5H7.5A1.5 1.5 0 0 0 6 5v14a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V8.5Z" />
      <path d="M13 3.5V8.5H18" />
      <path d="M9 12.5h6M9 16h4" />
    </svg>
  );
}
function UserIcon({ className }: IconProps) {
  return (
    <svg {...iconBaseProps(className)}>
      <circle cx="12" cy="8.5" r="3.75" />
      <path d="M5.5 19.5c1-3.6 3.5-5.6 6.5-5.6s5.5 2 6.5 5.6" />
    </svg>
  );
}
function LogOutIcon({ className }: IconProps) {
  return (
    <svg {...iconBaseProps(className)}>
      <path d="M14 4.5H7A1.5 1.5 0 0 0 5.5 6v12A1.5 1.5 0 0 0 7 19.5h7" />
      <path d="M10.5 12h10M17 8.5l3.5 3.5-3.5 3.5" />
    </svg>
  );
}
function DocStackIcon({ className }: IconProps) {
  return (
    <svg {...iconBaseProps(className)}>
      <path d="M14.5 3.5H9A1.5 1.5 0 0 0 7.5 5v11A1.5 1.5 0 0 0 9 17.5h7A1.5 1.5 0 0 0 17.5 16V6.5Z" />
      <path d="M14.5 3.5V7h3" />
      <path d="M4.5 8v10A1.5 1.5 0 0 0 6 19.5h8.5" />
    </svg>
  );
}
function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg {...iconBaseProps(className)}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
function CloseIcon({ className }: IconProps) {
  return (
    <svg {...iconBaseProps(className)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
/** ＋ 新しく始める の CTA アイコン。 */
function PlusIcon({ className }: IconProps) {
  return (
    <svg {...iconBaseProps(className)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
/** ← All Plans / ← 戻る 用。 */
function ArrowLeftIcon({ className }: IconProps) {
  return (
    <svg {...iconBaseProps(className)}>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}
/** 予算シミュレーション（準備中）。 */
function WalletIcon({ className }: IconProps) {
  return (
    <svg {...iconBaseProps(className)}>
      <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6H18v12H5.5A1.5 1.5 0 0 1 4 16.5Z" />
      <path d="M18 9.5h2.5a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H18Z" />
      <path d="M16.5 12h.01" />
    </svg>
  );
}
/** 準備タイムライン（準備中）。 */
function RouteIcon({ className }: IconProps) {
  return (
    <svg {...iconBaseProps(className)}>
      <circle cx="6" cy="18.5" r="2.5" />
      <circle cx="18" cy="5.5" r="2.5" />
      <path d="M8.5 18.5H14a3.5 3.5 0 0 0 0-7H10a3.5 3.5 0 0 1 0-7h5.5" />
    </svg>
  );
}
/** Q&A（準備中）。 */
function HelpIcon({ className }: IconProps) {
  return (
    <svg {...iconBaseProps(className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.5a2.4 2.4 0 0 1 4.7.7c0 1.6-2.3 2-2.3 3.4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

type IconComponent = (props: IconProps) => React.JSX.Element;

/**
 * Account で設定済みの avatar があれば丸画像、無ければ UserIcon。privacy 上渡すのは avatarUrl のみ。
 * private bucket の署名付き URL なので next/image は使わず <img>、装飾なので alt=""。
 */
function MenuAvatar({
  avatarUrl,
  avatarClassName,
  iconClassName,
}: {
  avatarUrl: string | null;
  avatarClassName: string;
  iconClassName: string;
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- private avatars bucket の署名付き URL のため
      <img
        src={avatarUrl}
        alt=""
        className={`shrink-0 rounded-full object-cover ring-1 ring-[#e6e2d8] ${avatarClassName}`}
      />
    );
  }
  return <UserIcon className={iconClassName} />;
}

/* ------------------------------------------------------------------ */
/* pathname helpers                                                    */
/* ------------------------------------------------------------------ */

/** /plans/[id]/... のとき id を返す（URL context の「現在のPlan」）。 */
export function planIdFromPathname(pathname: string): string | null {
  const m = pathname.match(/^\/plans\/([^/]+)(?:\/|$)/);
  return m ? m[1] : null;
}

/** Plan 階層 sidebar のハイライト判定。 */
export function planTabActive(pathname: string): PlanTab | null {
  if (/^\/plans\/[^/]+\/chat(\/|$)/.test(pathname)) return "chat";
  if (/^\/plans\/[^/]+\/worksheet(\/|$)/.test(pathname)) return "worksheet";
  if (/^\/plans\/[^/]+\/my-plan(\/|$)/.test(pathname)) return "myPlan";
  if (/^\/plans\/[^/]+\/documents(\/|$)/.test(pathname)) return "myKarte";
  if (/^\/plans\/[^/]+\/?$/.test(pathname)) return "planHome";
  return null;
}

/** Plan Chat のときだけ mobile bottom nav を隠す（Chat 側レイアウトには触れない）。 */
function isPlanChatRoute(pathname: string): boolean {
  return /^\/plans\/[^/]+\/chat(\/|$)/.test(pathname);
}

/**
 * Menu の「My Karte」の遷移先（既存の context-aware routing。挙動は変更しない）:
 *   1) いま /plans/[id]/... を見ていて、その id が本人の Plan → その Plan の Documents
 *   2) Plan がちょうど 1 件 → その Plan の Documents
 *   3) それ以外 → /mypage
 */
export function resolveMyKarteHref(pathname: string, plans: PlanNavPlan[]): string {
  const current = planIdFromPathname(pathname);
  if (current && plans.some((p) => p.id === current)) return `/plans/${current}/documents`;
  if (plans.length === 1) return `/plans/${plans[0].id}/documents`;
  return "/mypage";
}

/** Plan 階層 nav の項目（既存 route をそのまま利用。route 変更なし）。 */
export function planNavItems(
  planId: string,
): { key: PlanTab; label: string; href: string; icon: IconComponent }[] {
  return [
    { key: "planHome", label: "Plan Home", href: `/plans/${planId}`, icon: HomeIcon },
    { key: "chat", label: "Chat", href: `/plans/${planId}/chat`, icon: ChatIcon },
    { key: "worksheet", label: "Worksheet", href: `/plans/${planId}/worksheet`, icon: WorksheetIcon },
    { key: "myPlan", label: "My Plan", href: `/plans/${planId}/my-plan`, icon: MyPlanIcon },
    { key: "myKarte", label: "My Karte", href: `/plans/${planId}/documents`, icon: DocStackIcon },
  ];
}

const PANEL_TITLES: Record<PanelKey, string> = {
  start: "新しく始める",
  menu: "Menu",
};

/* ------------------------------------------------------------------ */
/* AppNav shell                                                        */
/* ------------------------------------------------------------------ */

export default function AppNav({
  children,
  navData,
  viewer,
  userId,
}: {
  children: ReactNode;
  navData: PlanNavData;
  /** ログインユーザー本人の最小情報（今は avatar のみ）。未指定なら generic icon 表示。 */
  viewer?: AppNavViewer;
  /** 新規 Plan 作成（CreatePlanForm のクライアント insert）に使う本人の user id。 */
  userId: string;
}) {
  const pathname = usePathname();
  const planId = planIdFromPathname(pathname);
  const inPlan = planId !== null;
  const hideMobileBottomNav = isPlanChatRoute(pathname);

  const [openPanel, setOpenPanel] = useState<PanelKey | null>(null);
  const closePanel = () => setOpenPanel(null);
  // Plan 階層では Start CTA を出さないので Start パネルも描画しない（遷移リンクの onClick が
  // openPanel を null にするため通常ここには来ないが、描画側でも二重に閉じておく）。
  const activePanel: PanelKey | null = inPlan && openPanel === "start" ? null : openPanel;

  // Esc で開いている Context Panel を閉じる（a11y）。
  useEffect(() => {
    if (!activePanel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenPanel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activePanel]);

  const myKarteHref = resolveMyKarteHref(pathname, navData.plans);
  const hasNoPlans = navData.plans.length === 0;
  const avatarUrl = viewer?.avatarUrl ?? null;

  return (
    <div className="lg:flex">
      <Sidebar
        inPlan={inPlan}
        planId={planId}
        pathname={pathname}
        avatarUrl={avatarUrl}
        onSelectPanel={setOpenPanel}
        onClosePanel={closePanel}
      />
      {activePanel && (
        <ContextPanel
          panel={activePanel}
          navData={navData}
          userId={userId}
          myKarteHref={myKarteHref}
          hasNoPlans={hasNoPlans}
          onClose={closePanel}
          onNavigate={closePanel}
        />
      )}
      <main className={`min-w-0 flex-1 ${hideMobileBottomNav ? "" : "pb-16 lg:pb-0"}`}>{children}</main>
      {!hideMobileBottomNav && (
        <MobileBottomNav
          inPlan={inPlan}
          planId={planId}
          pathname={pathname}
          navData={navData}
          userId={userId}
          avatarUrl={avatarUrl}
          myKarteHref={myKarteHref}
          hasNoPlans={hasNoPlans}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sidebar (lg only)                                                   */
/* ------------------------------------------------------------------ */

/**
 * グローバル / Plan 内で共通の nav row。
 * active（現在ページ）でも **背景色は出さない** — 濃いめの文字色・icon 色・font-weight だけで示す。
 * 背景は hover のときだけ、ごく薄い sage（§1 / §43）。
 */
function sidebarItemClass(active: boolean) {
  return `flex min-h-[44px] items-center gap-3 rounded-full px-3 py-2 text-sm transition-colors duration-150 hover:bg-[#eef1ec] ${
    active
      ? "font-semibold text-[#172033]"
      : "font-medium text-[#73757d] hover:text-[#172033]"
  }`;
}

function SidebarLink({
  href,
  label,
  icon: Icon,
  active,
  onClick,
}: {
  href: string;
  label: string;
  icon: IconComponent;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Link href={href} onClick={onClick} className={sidebarItemClass(active)}>
      <Icon className="h-[22px] w-[22px] shrink-0" />
      {label}
    </Link>
  );
}

function SidebarButton({
  label,
  icon: Icon,
  iconOverride,
  active,
  onClick,
}: {
  label: string;
  icon: IconComponent;
  iconOverride?: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`w-full ${sidebarItemClass(active)}`}>
      {iconOverride ?? <Icon className="h-[22px] w-[22px] shrink-0" />}
      {label}
    </button>
  );
}

/** 未実装の将来機能（予算シミュレーション / 準備タイムライン / Q&A）。route は作らず、クリック不可の表示だけ（§2-§3 / §44）。 */
function SidebarComingSoon({ label, icon: Icon }: { label: string; icon: IconComponent }) {
  return (
    <div
      aria-disabled="true"
      className="flex min-h-[44px] cursor-not-allowed items-center gap-3 rounded-full px-3 py-2 text-sm font-medium text-[#b6b3ab]"
    >
      <Icon className="h-[22px] w-[22px] shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 rounded-full bg-[#f0efe9] px-1.5 py-0.5 text-[10px] font-medium text-[#9a978e]">
        準備中
      </span>
    </div>
  );
}

const COMING_SOON_ITEMS: { label: string; icon: IconComponent }[] = [
  { label: "予算シミュレーション", icon: WalletIcon },
  { label: "準備タイムライン", icon: RouteIcon },
  { label: "Q&A", icon: HelpIcon },
];

/**
 * nav row とは別階層の主要 CTA。Mindtrip の "New chat" 的な横長 pill（border / shadow / card 感を
 * 出さない・warm gray・中央寄せ・hover でごく僅かに濃く）。§5 / §7-§11。
 */
function StartCta({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-full bg-[#f2f1ee] px-4 text-sm font-semibold text-[#172033] transition-colors duration-150 hover:bg-[#eceae5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-worksheet-accent"
    >
      <PlusIcon className="h-[18px] w-[18px] shrink-0" />
      新しく始める
    </button>
  );
}

function Sidebar({
  inPlan,
  planId,
  pathname,
  avatarUrl,
  onSelectPanel,
  onClosePanel,
}: {
  inPlan: boolean;
  planId: string | null;
  pathname: string;
  avatarUrl: string | null;
  onSelectPanel: (panel: PanelKey) => void;
  onClosePanel: () => void;
}) {
  const activePlanTab = planTabActive(pathname);

  return (
    <aside className="hidden shrink-0 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-60 lg:flex-col lg:border-r lg:border-worksheet-border lg:bg-worksheet-surface lg:px-4 lg:py-6">
      <BrandLogo href="/mypage" className="mx-auto h-[42px] w-auto" />

      <nav className="mt-11 flex flex-col gap-1.5">
        {inPlan && planId ? (
          <>
            <SidebarLink
              href="/mypage"
              label="All Plans"
              icon={ArrowLeftIcon}
              active={false}
              onClick={onClosePanel}
            />
            {planNavItems(planId).map((item) => (
              <SidebarLink
                key={item.key}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={activePlanTab === item.key}
                onClick={onClosePanel}
              />
            ))}
          </>
        ) : (
          <>
            <SidebarLink
              href="/mypage"
              label="Home"
              icon={HomeIcon}
              active={pathname === "/mypage"}
              onClick={onClosePanel}
            />
            {/* 将来機能。route 未実装なので「準備中」のクリック不可行として見た目だけ（§2-§3 / §44-§45）。 */}
            {COMING_SOON_ITEMS.map((item) => (
              <SidebarComingSoon key={item.label} label={item.label} icon={item.icon} />
            ))}
          </>
        )}
      </nav>

      {/* 上の nav 群と Start CTA / Menu の間に大きな余白（§4 / §46）。 */}
      <div className="mt-auto flex flex-col gap-5 pt-8">
        {!inPlan && <StartCta onClick={() => onSelectPanel("start")} />}
        <SidebarButton
          label="Menu"
          icon={UserIcon}
          iconOverride={
            <MenuAvatar
              avatarUrl={avatarUrl}
              avatarClassName="h-[26px] w-[26px]"
              iconClassName="h-[22px] w-[22px] shrink-0"
            />
          }
          active={false}
          onClick={() => onSelectPanel("menu")}
        />
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Context Panel (lg only): Start actions / Menu                       */
/* ------------------------------------------------------------------ */

function ContextPanel({
  panel,
  navData,
  userId,
  myKarteHref,
  hasNoPlans,
  onClose,
  onNavigate,
}: {
  panel: PanelKey;
  navData: PlanNavData;
  userId: string;
  myKarteHref: string;
  hasNoPlans: boolean;
  onClose: () => void;
  onNavigate: () => void;
}) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="hidden shrink-0 border-r-[0.5px] border-worksheet-border bg-worksheet-surface lg:sticky lg:top-0 lg:block lg:h-dvh lg:w-[272px] lg:overflow-y-auto xl:w-[300px]">
      <div className="px-5 py-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-worksheet-primary">{PANEL_TITLES[panel]}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="rounded-full p-1 text-worksheet-secondary transition-colors duration-150 hover:text-worksheet-primary"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <div className={panel === "menu" ? "mt-4 divide-y divide-worksheet-border" : "mt-3"}>
          {panel === "menu" ? (
            <MenuPanelList
              myKarteHref={myKarteHref}
              hasNoPlans={hasNoPlans}
              onSignOut={handleSignOut}
              onNavigate={onNavigate}
            />
          ) : (
            <StartActions navData={navData} userId={userId} onNavigate={onNavigate} />
          )}
        </div>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Start actions (shared: desktop Context Panel + mobile popover)      */
/* ------------------------------------------------------------------ */

function StartRow({
  title,
  desc,
  icon: Icon,
  onClick,
}: {
  title: string;
  desc: string;
  icon: IconComponent;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition-colors duration-150 hover:bg-worksheet-sage/40"
    >
      <Icon className="h-[22px] w-[22px] shrink-0 text-[#73757d]" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-[#172033]">{title}</span>
        <span className="mt-0.5 block text-xs text-worksheet-secondary">{desc}</span>
      </span>
      <ChevronRightIcon className="h-[18px] w-[18px] shrink-0 text-[#73757d]" />
    </button>
  );
}

function BackRow({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-worksheet-secondary transition-colors duration-150 hover:text-worksheet-primary"
    >
      <ArrowLeftIcon className="h-4 w-4" />
      戻る
    </button>
  );
}

function planSubline(plan: PlanNavPlan): string {
  const parts = [
    plan.city ? toCityChipText(plan.city) : null,
    plan.departureTiming ? toDeparturePlanInfoText(plan.departureTiming) : null,
  ].filter((s): s is string => !!s);
  return parts.length > 0 ? parts.join(" ・ ") : "行き先・時期は未定";
}

/**
 * 「新しく始める」の中身。3 つの入口:
 *   - 新しい留学Plan  … 既存 CreatePlanForm をそのまま展開（新規作成は 1 実装のみ）
 *   - AI相談          … 既存 Plan を選んで /plans/[id]/chat（新しい chat_session は作らない）
 *   - Worksheet       … 既存 Plan を選んで /plans/[id]/worksheet（新しい instance は作らない）
 * Plan 0 件 → 作成へ誘導 / 1 件 → 直接遷移 / 複数 → Plan 選択（§10/§11/§12）。
 */
function StartActions({
  navData,
  userId,
  onNavigate,
}: {
  navData: PlanNavData;
  userId: string;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const { plans } = navData;
  const [mode, setMode] = useState<"root" | "newPlan" | "chat" | "worksheet">("root");
  const [notice, setNotice] = useState<string | null>(null);

  function pick(kind: "chat" | "worksheet") {
    if (plans.length === 0) {
      setNotice(
        kind === "chat"
          ? "AI相談を始めるには、まず留学Planを作成してください。"
          : "Worksheetを始めるには、まず留学Planを作成してください。",
      );
      setMode("newPlan");
      return;
    }
    if (plans.length === 1) {
      router.push(`/plans/${plans[0].id}/${kind === "chat" ? "chat" : "worksheet"}`);
      onNavigate();
      return;
    }
    setMode(kind);
  }

  if (mode === "newPlan") {
    return (
      <div>
        <BackRow
          onBack={() => {
            setMode("root");
            setNotice(null);
          }}
        />
        {notice && <p className="mb-2 text-xs text-worksheet-secondary">{notice}</p>}
        <CreatePlanForm userId={userId} />
      </div>
    );
  }

  if (mode === "chat" || mode === "worksheet") {
    const kind = mode;
    const ordered = [...plans].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return (
      <div>
        <BackRow onBack={() => setMode("root")} />
        <p className="mb-1 text-xs text-worksheet-secondary">
          {kind === "chat" ? "相談するPlanを選ぶ" : "整理するPlanを選ぶ"}
        </p>
        <div className="divide-y divide-worksheet-border">
          {ordered.map((plan) => (
            <PlanListRow
              key={plan.id}
              planId={plan.id}
              href={`/plans/${plan.id}/${kind === "chat" ? "chat" : "worksheet"}`}
              city={plan.city}
              title={plan.title}
              density="panel"
              onClick={onNavigate}
            >
              <p className="mt-0.5 truncate text-xs text-worksheet-secondary">{planSubline(plan)}</p>
            </PlanListRow>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <StartRow
        title="新しい留学Plan"
        desc="新しい計画を作成"
        icon={PlusIcon}
        onClick={() => {
          setNotice(null);
          setMode("newPlan");
        }}
      />
      <StartRow title="AI相談" desc="既存Planを選んで相談" icon={ChatIcon} onClick={() => pick("chat")} />
      <StartRow
        title="Worksheet"
        desc="既存Planを選んで整理"
        icon={WorksheetIcon}
        onClick={() => pick("worksheet")}
      />
    </div>
  );
}

function MenuPanelList({
  myKarteHref,
  hasNoPlans,
  onSignOut,
  onNavigate,
}: {
  myKarteHref: string;
  hasNoPlans: boolean;
  onSignOut: () => void;
  onNavigate: () => void;
}) {
  const rowClass = "flex items-center gap-3.5 py-3 transition-colors duration-150 hover:opacity-80";
  return (
    <>
      <Link href={myKarteHref} onClick={onNavigate} className={rowClass}>
        <DocStackIcon className="h-[22px] w-[22px] shrink-0 text-[#73757d]" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-[#172033]">My Karte</span>
          <span className="mt-0.5 block text-xs text-worksheet-secondary">
            {hasNoPlans ? "Planを作成すると使えます" : "留学について整理した内容や資料"}
          </span>
        </span>
        <ChevronRightIcon className="h-[18px] w-[18px] shrink-0 text-[#73757d]" />
      </Link>
      <Link href="/account" onClick={onNavigate} className={rowClass}>
        <UserIcon className="h-[22px] w-[22px] shrink-0 text-[#73757d]" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-[#172033]">Account</span>
          <span className="mt-0.5 block text-xs text-worksheet-secondary">登録情報とアカウント設定</span>
        </span>
        <ChevronRightIcon className="h-[18px] w-[18px] shrink-0 text-[#73757d]" />
      </Link>
      <button
        type="button"
        onClick={onSignOut}
        className="flex w-full items-center gap-3.5 py-3 text-left text-sm text-[#172033] transition-colors duration-150 hover:opacity-80"
      >
        <LogOutIcon className="h-[22px] w-[22px] shrink-0 text-[#73757d]" />
        Sign out
      </button>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile bottom nav                                                   */
/* ------------------------------------------------------------------ */

function MobileNavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: IconComponent;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px]"
    >
      <Icon className={`h-[22px] w-[22px] shrink-0 ${active ? "text-[#172033]" : "text-[#73757d]"}`} />
      <span className={active ? "font-semibold text-[#172033]" : "text-[#73757d]"}>{label}</span>
    </Link>
  );
}

function MobileBottomNav({
  inPlan,
  planId,
  pathname,
  navData,
  userId,
  avatarUrl,
  myKarteHref,
  hasNoPlans,
}: {
  inPlan: boolean;
  planId: string | null;
  pathname: string;
  navData: PlanNavData;
  userId: string;
  avatarUrl: string | null;
  myKarteHref: string;
  hasNoPlans: boolean;
}) {
  const activePlanTab = planTabActive(pathname);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-worksheet-border bg-worksheet-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
      {inPlan && planId ? (
        // Plan 階層: Plan Home / Chat / Worksheet / My Plan（My Karte は Menu 内へ・§22）
        planNavItems(planId)
          .slice(0, 4)
          .map((item) => (
            <MobileNavLink
              key={item.key}
              href={item.href}
              label={item.key === "planHome" ? "Home" : item.label}
              icon={item.icon}
              active={activePlanTab === item.key}
            />
          ))
      ) : (
        // グローバル階層: Home / Start
        <>
          <MobileNavLink href="/mypage" label="Home" icon={HomeIcon} active={pathname === "/mypage"} />
          <MobileStartTrigger navData={navData} userId={userId} />
        </>
      )}
      <MobileMenuButton avatarUrl={avatarUrl} myKarteHref={myKarteHref} hasNoPlans={hasNoPlans} />
    </nav>
  );
}

/** mobile の「Start」タブ。押すと下から action popover を開く（NewPlanButton と同じ絶対配置パターン）。 */
function MobileStartTrigger({ navData, userId }: { navData: PlanNavData; userId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative flex flex-1 flex-col items-center justify-center"
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex flex-col items-center justify-center gap-1 py-2 text-[10px]"
      >
        <PlusIcon
          className={`h-[22px] w-[22px] shrink-0 ${open ? "text-[#172033]" : "text-[#73757d]"}`}
        />
        <span className={open ? "font-semibold text-[#172033]" : "text-[#73757d]"}>Start</span>
      </button>
      {open && (
        <div className="absolute bottom-full left-1/2 z-30 mb-2 w-[min(20rem,calc(100vw-1.5rem))] -translate-x-1/2 rounded-[20px] border-[0.5px] border-worksheet-border bg-worksheet-surface p-3 shadow-lg">
          <p className="px-1 pb-2 text-sm font-semibold text-worksheet-primary">新しく始める</p>
          <StartActions navData={navData} userId={userId} onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

/**
 * mobile の Menu popover（既存パターンのまま。My Karte / Account / Sign out）。
 */
function MobileMenuButton({
  avatarUrl,
  myKarteHref,
  hasNoPlans,
}: {
  avatarUrl: string | null;
  myKarteHref: string;
  hasNoPlans: boolean;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div
      className="relative flex flex-1 flex-col items-center justify-center"
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex flex-col items-center justify-center gap-1 py-2 text-[10px]"
      >
        <MenuAvatar
          avatarUrl={avatarUrl}
          avatarClassName="h-6 w-6"
          iconClassName={`h-[22px] w-[22px] shrink-0 ${open ? "text-[#172033]" : "text-[#73757d]"}`}
        />
        <span className={open ? "font-semibold text-[#172033]" : "text-[#73757d]"}>Menu</span>
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-30 mb-2 w-60 rounded-[20px] border-[0.5px] border-worksheet-border bg-worksheet-surface p-1 shadow-lg">
          <div className="py-1">
            <Link
              href={myKarteHref}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[#172033] transition-colors duration-150 hover:bg-worksheet-sage/40"
            >
              <DocStackIcon className="h-[18px] w-[18px] shrink-0 text-[#73757d]" />
              <span className="min-w-0 flex-1">
                <span className="block">My Karte</span>
                {hasNoPlans && (
                  <span className="block text-[10px] text-worksheet-secondary">
                    Planを作成すると使えます
                  </span>
                )}
              </span>
              <ChevronRightIcon className="h-4 w-4 shrink-0 text-[#73757d]" />
            </Link>
            <Link
              href="/account"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[#172033] transition-colors duration-150 hover:bg-worksheet-sage/40"
            >
              <UserIcon className="h-[18px] w-[18px] shrink-0 text-[#73757d]" />
              <span className="flex-1">Account</span>
              <ChevronRightIcon className="h-4 w-4 shrink-0 text-[#73757d]" />
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[#172033] transition-colors duration-150 hover:bg-worksheet-sage/40"
            >
              <LogOutIcon className="h-[18px] w-[18px] shrink-0 text-[#73757d]" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
