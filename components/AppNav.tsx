"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import PlanListRow from "@/components/PlanListRow";
import WorksheetRowProgress from "@/components/WorksheetRowProgress";
import { createClient } from "@/lib/supabase/client";
import { formatLastUpdated } from "@/lib/planActivity";
import type { PlanNavData, PlanNavPlan } from "@/lib/planNavData";
import type { AppNavViewer } from "@/lib/appNavViewer";

type Tab = "home" | "chat" | "worksheet" | "myPlan";
/** Context Panelとして開ける対象。Menuはpathnameに対応するrouteが無く、手動選択でのみ開く */
type PanelKey = "chat" | "worksheet" | "myPlan" | "menu";

type IconProps = { className?: string };

/**
 * AppNav 共通のラインアイコン設定。Mindtrip 参考の「大きめ・太め・均一ストローク」に合わせ、
 * strokeWidth は全アイコン 2.25（round cap / join）で統一する。1.5 系の細い線は使わない。
 * サイズは呼び出し側の className（h-6 w-6 等）で決める。
 */
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

/** Home: 屋根＋本体＋入口が一目で分かる house outline。 */
function HomeIcon({ className }: IconProps) {
  return (
    <svg {...iconBaseProps(className)}>
      <path d="M3.5 11.5 12 4l8.5 7.5" />
      <path d="M5.75 10v8.75A1.25 1.25 0 0 0 7 20h10a1.25 1.25 0 0 0 1.25-1.25V10" />
      <path d="M9.75 20v-4.75A1.25 1.25 0 0 1 11 14h2a1.25 1.25 0 0 1 1.25 1.25V20" />
    </svg>
  );
}

/** Chat: 角丸の吹き出し＋しっぽ＋中に3点。 */
function ChatIcon({ className }: IconProps) {
  return (
    <svg {...iconBaseProps(className)}>
      <path d="M4 11.7C4 7.9 7.5 5 12 5s8 2.9 8 6.7-3.5 6.7-8 6.7c-.9 0-1.8-.1-2.6-.3L4 20l1.1-3.7C4.4 15 4 13.4 4 11.7Z" />
      <path d="M9 11.9h.01M12 11.9h.01M15 11.9h.01" />
    </svg>
  );
}

/** Worksheet: クリップ付き clipboard ＋ 箇条書き（「書く・整理する」）。My Plan の書類とは別形。 */
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

/** My Plan: 角折れのある1枚の計画書＋本文行。Worksheet の clipboard とは明確に別形。 */
function MyPlanIcon({ className }: IconProps) {
  return (
    <svg {...iconBaseProps(className)}>
      <path d="M13 3.5H7.5A1.5 1.5 0 0 0 6 5v14a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V8.5Z" />
      <path d="M13 3.5V8.5H18" />
      <path d="M9 12.5h6M9 16h4" />
    </svg>
  );
}

/** Menu / Account fallback 用。少し太めの profile outline（頭＋肩）。 */
function UserIcon({ className }: IconProps) {
  return (
    <svg {...iconBaseProps(className)}>
      <circle cx="12" cy="8.5" r="3.75" />
      <path d="M5.5 19.5c1-3.6 3.5-5.6 6.5-5.6s5.5 2 6.5 5.6" />
    </svg>
  );
}

/** Sign out: 扉＋外向き矢印（意味は変えず visual language だけ統一）。 */
function LogOutIcon({ className }: IconProps) {
  return (
    <svg {...iconBaseProps(className)}>
      <path d="M14 4.5H7A1.5 1.5 0 0 0 5.5 6v12A1.5 1.5 0 0 0 7 19.5h7" />
      <path d="M10.5 12h10M17 8.5l3.5 3.5-3.5 3.5" />
    </svg>
  );
}

/**
 * Menu（Sidebar / Mobile bottom nav）のアイコン枠。
 * Account で設定済みの avatar（署名付き URL）があれば丸画像、無ければ既存の UserIcon。
 * privacy 上 AppNav へ渡すのは avatarUrl だけ。画像は装飾（隣に "Menu" の text label あり）
 * のため alt=""。private bucket の署名付き URL なので next/image は使わず <img>。
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

function CloseIcon({ className }: IconProps) {
  return (
    <svg {...iconBaseProps(className)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** My Karte（＝Documents一覧）用。2枚重なった書類（資料がまとまっている場所）。My Plan の1枚とは別形。 */
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

const NAV_ITEMS: { tab: Tab; label: string; href: string; icon: (props: IconProps) => React.JSX.Element }[] = [
  { tab: "home", label: "Home", href: "/mypage", icon: HomeIcon },
  { tab: "chat", label: "Chat", href: "/chats", icon: ChatIcon },
  { tab: "worksheet", label: "Worksheet", href: "/worksheets", icon: WorksheetIcon },
  { tab: "myPlan", label: "My Plan", href: "/my-plans", icon: MyPlanIcon },
];

/**
 * active判定。Plan配下のroute（/plans/[id]/...）も対応するタブをactiveにする。
 * Plan Home（/plans/[id]単体、サブパス無し）はHome扱い（ご指示通り）。
 * この値はSidebarのハイライト表示にのみ使う。Context Panelの開閉とは完全に独立させ、
 * 「activeなのにPanelは閉じている」という状態を正常系として扱う。
 */
function getActiveTab(pathname: string): Tab | null {
  if (pathname === "/mypage" || /^\/plans\/[^/]+\/?$/.test(pathname)) return "home";
  if (pathname.startsWith("/chats") || /^\/plans\/[^/]+\/chat(\/|$)/.test(pathname)) return "chat";
  if (pathname.startsWith("/worksheets") || /^\/plans\/[^/]+\/worksheet(\/|$)/.test(pathname)) return "worksheet";
  if (pathname.startsWith("/my-plans") || /^\/plans\/[^/]+\/my-plan(\/|$)/.test(pathname)) return "myPlan";
  return null;
}

/** Plan Chatのときだけmobile bottom navを隠す。pathname判定のみで、Chat側のレイアウトには一切触れない */
function isPlanChatRoute(pathname: string): boolean {
  return /^\/plans\/[^/]+\/chat(\/|$)/.test(pathname);
}

/** 現在の pathname が /plans/[id]/... のとき、その id を返す（URL context 由来の「現在のPlan」）。 */
function planIdFromPathname(pathname: string): string | null {
  const m = pathname.match(/^\/plans\/([^/]+)(?:\/|$)/);
  return m ? m[1] : null;
}

/**
 * Menu の「My Karte」の遷移先を決める。
 *   1) いま /plans/[id]/... を見ていて、その id が本人の Plan → その Plan の Documents
 *   2) Plan がちょうど 1 件 → その Plan の Documents（唯一なので曖昧さは無い）
 *   3) それ以外（複数 Plan で文脈が無い / Plan 0 件） → /mypage（Plan 一覧・作成へ）
 * 既存の暗黙的な first-plan fallback（複数ある中で plans[0] を勝手に採用）は増やさない。
 */
function resolveMyKarteHref(pathname: string, plans: PlanNavPlan[]): string {
  const current = planIdFromPathname(pathname);
  if (current && plans.some((p) => p.id === current)) return `/plans/${current}/documents`;
  if (plans.length === 1) return `/plans/${plans[0].id}/documents`;
  return "/mypage";
}

const PANEL_TITLES: Record<PanelKey, string> = {
  chat: "Chat",
  worksheet: "Worksheet",
  myPlan: "My Plan",
  menu: "Menu",
};

/**
 * PC: [Sidebar（文字付き、常時表示）][Context Panel（Sidebar項目クリック時だけ）][Main Content]。
 * mobile: 下部5タブ（従来どおり、変更なし）。
 *
 * Context PanelはPlanを選ぶための一時的な補助Panelという位置づけで、常時は開かない。
 * openPanelは完全にユーザー操作だけで管理し（Sidebar項目クリックでset、Home/Plan選択/×で
 * null）、pathname変化から自動で開閉することはしない。Sidebarのactive表示（route基準）と
 * Panelの開閉状態は別々のstateで、意図的に連動させていない。
 *
 * data取得はlib/planNavData.ts（Server Component側、5つのlayout.tsxから呼ばれる）に委譲しており、
 * このコンポーネント自身は新たなSupabase queryを発行しない。
 */
export default function AppNav({
  children,
  navData,
  viewer,
}: {
  children: ReactNode;
  navData: PlanNavData;
  /** ログインユーザー本人の最小情報（今は avatar のみ）。未指定なら generic icon 表示。 */
  viewer?: AppNavViewer;
}) {
  const pathname = usePathname();
  const routeTab = getActiveTab(pathname);
  const hideMobileBottomNav = isPlanChatRoute(pathname);

  const [openPanel, setOpenPanel] = useState<PanelKey | null>(null);
  const closePanel = () => setOpenPanel(null);

  const myKarteHref = resolveMyKarteHref(pathname, navData.plans);
  const hasNoPlans = navData.plans.length === 0;
  const avatarUrl = viewer?.avatarUrl ?? null;

  return (
    <div className="lg:flex">
      <Sidebar
        activeTab={routeTab}
        avatarUrl={avatarUrl}
        onSelectPanel={setOpenPanel}
        onClosePanel={closePanel}
      />
      {openPanel && (
        <ContextPanel
          panel={openPanel}
          navData={navData}
          myKarteHref={myKarteHref}
          hasNoPlans={hasNoPlans}
          onClose={closePanel}
          onNavigate={closePanel}
        />
      )}
      <main className={`min-w-0 flex-1 ${hideMobileBottomNav ? "" : "pb-16 lg:pb-0"}`}>{children}</main>
      {!hideMobileBottomNav && (
        <MobileBottomNav
          activeTab={routeTab}
          avatarUrl={avatarUrl}
          myKarteHref={myKarteHref}
          hasNoPlans={hasNoPlans}
        />
      )}
    </div>
  );
}

function sidebarItemClass(active: boolean) {
  // ラベルは基本 font-weight 600、選択中は 700（文字サイズ・行間・余白・レイアウトは不変）。
  return `flex min-h-[48px] items-center gap-3.5 rounded-full px-3 py-2.5 text-sm transition-colors duration-150 ${
    active
      ? "bg-worksheet-sage font-bold text-[#172033]"
      : "font-semibold text-[#73757d] hover:bg-worksheet-sage/40 hover:text-[#172033]"
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
  icon: (props: IconProps) => React.JSX.Element;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Link href={href} onClick={onClick} className={sidebarItemClass(active)}>
      <Icon className="h-6 w-6 shrink-0" />
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
  icon: (props: IconProps) => React.JSX.Element;
  /** 指定時はこの要素をアイコン枠に描画する（Menu の avatar 表示用）。 */
  iconOverride?: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`w-full ${sidebarItemClass(active)}`}>
      {iconOverride ?? <Icon className="h-6 w-6 shrink-0" />}
      {label}
    </button>
  );
}

function Sidebar({
  activeTab,
  avatarUrl,
  onSelectPanel,
  onClosePanel,
}: {
  activeTab: Tab | null;
  avatarUrl: string | null;
  onSelectPanel: (panel: PanelKey) => void;
  onClosePanel: () => void;
}) {
  const [homeItem, ...panelItems] = NAV_ITEMS;

  return (
    <aside className="hidden shrink-0 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-60 lg:flex-col lg:border-r lg:border-worksheet-border lg:bg-worksheet-surface lg:px-4 lg:py-6">
      {/* nav項目・画面タイトルよりロゴが目立ちすぎないよう、PC sidebarのロゴだけ既定より少し小さくする（このasideはlg以上のみ表示）。
          mx-auto: 全幅にstretchするflex item（Linkの<a>）の中でロゴ画像をsidebar横幅の左右中央に置く。縦位置・padding・navのmt-8は不変。 */}
      <BrandLogo href="/mypage" className="mx-auto h-[42px] w-auto" />

      <nav className="mt-8 flex flex-col gap-1">
        <SidebarLink
          href={homeItem.href}
          label={homeItem.label}
          icon={homeItem.icon}
          active={activeTab === "home"}
          onClick={onClosePanel}
        />
        {panelItems.map((item) => (
          <SidebarButton
            key={item.tab}
            label={item.label}
            icon={item.icon}
            active={activeTab === item.tab}
            onClick={() => onSelectPanel(item.tab as PanelKey)}
          />
        ))}
      </nav>

      <div className="mt-auto">
        {/* Menuに対応するrouteは無いため、Sidebar内で常にactive=falseのまま（activeとPanel開閉を混同しない）。
            avatar設定済みなら丸画像、未設定/取得失敗なら UserIcon（MenuAvatar が内部で分岐）。 */}
        <SidebarButton
          label="Menu"
          icon={UserIcon}
          iconOverride={
            <MenuAvatar
              avatarUrl={avatarUrl}
              avatarClassName="h-7 w-7"
              iconClassName="h-6 w-6 shrink-0"
            />
          }
          active={false}
          onClick={() => onSelectPanel("menu")}
        />
      </div>
    </aside>
  );
}

/**
 * PC専用のContext Panel。Sidebar項目クリックでのみ表示される一時的な補助Panel。
 * 幅はlg:272px、xl:300pxのresponsive。Mindtripのような縦list（大きなカードは使わない）。
 * 既存のPlanListRow/WorksheetRowProgressをdensity="panel"などでそのまま再利用し、
 * Chat/Worksheet/My Planのソート・表示ロジックは対応する既存一覧ページと完全に同じ基準を使う。
 */
function ContextPanel({
  panel,
  navData,
  myKarteHref,
  hasNoPlans,
  onClose,
  onNavigate,
}: {
  panel: PanelKey;
  navData: PlanNavData;
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
        <div className="mt-4 divide-y divide-worksheet-border">
          {panel === "menu" ? (
            <MenuPanelList
              myKarteHref={myKarteHref}
              hasNoPlans={hasNoPlans}
              onSignOut={handleSignOut}
              onNavigate={onNavigate}
            />
          ) : panel === "chat" ? (
            <ChatPanelList navData={navData} onNavigate={onNavigate} />
          ) : panel === "worksheet" ? (
            <WorksheetPanelList navData={navData} onNavigate={onNavigate} />
          ) : (
            <MyPlanPanelList navData={navData} onNavigate={onNavigate} />
          )}
        </div>
      </div>
    </aside>
  );
}

function EmptyPanelState() {
  return <p className="py-3 text-xs text-worksheet-secondary">まだPlanがありません</p>;
}

/** /chatsと完全に同じソート基準（開始済みは最終メッセージDESC、未開始はPlan更新DESC） */
function ChatPanelList({ navData, onNavigate }: { navData: PlanNavData; onNavigate: () => void }) {
  const { plans, chatSummaries } = navData;

  const started = plans
    .filter((p) => chatSummaries[p.id]?.lastMessageAt)
    .sort((a, b) => chatSummaries[b.id]!.lastMessageAt!.localeCompare(chatSummaries[a.id]!.lastMessageAt!));
  const notStarted = plans
    .filter((p) => !chatSummaries[p.id]?.lastMessageAt)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const ordered = [...started, ...notStarted];

  if (ordered.length === 0) return <EmptyPanelState />;

  return (
    <>
      {ordered.map((plan) => {
        const lastMessageAt = chatSummaries[plan.id]?.lastMessageAt ?? null;
        return (
          <PlanListRow
            key={plan.id}
            planId={plan.id}
            href={`/plans/${plan.id}/chat`}
            city={plan.city}
            title={plan.title}
            density="panel"
            onClick={onNavigate}
          >
            <p className="mt-0.5 truncate text-xs text-worksheet-secondary">
              {lastMessageAt ? formatLastUpdated(lastMessageAt) : "＋ Chatを始める"}
            </p>
          </PlanListRow>
        );
      })}
    </>
  );
}

/** /worksheetsと完全に同じソート基準（Plan activityの新しい順） */
function WorksheetPanelList({ navData, onNavigate }: { navData: PlanNavData; onNavigate: () => void }) {
  const { plans, activityMap } = navData;

  const ordered = [...plans].sort((a, b) => {
    const activityA = activityMap[a.id] ?? a.updatedAt;
    const activityB = activityMap[b.id] ?? b.updatedAt;
    return activityB.localeCompare(activityA);
  });

  if (ordered.length === 0) return <EmptyPanelState />;

  return (
    <>
      {ordered.map((plan) => (
        <PlanListRow
          key={plan.id}
          planId={plan.id}
          href={`/plans/${plan.id}/worksheet`}
          city={plan.city}
          title={plan.title}
          density="panel"
          onClick={onNavigate}
        >
          <div className="mt-0.5">
            <WorksheetRowProgress planId={plan.id} />
          </div>
        </PlanListRow>
      ))}
    </>
  );
}

/** /my-plansと完全に同じソート基準（Plan activityの新しい順） */
function MyPlanPanelList({ navData, onNavigate }: { navData: PlanNavData; onNavigate: () => void }) {
  const { plans, activityMap } = navData;

  const ordered = [...plans].sort((a, b) => {
    const activityA = activityMap[a.id] ?? a.updatedAt;
    const activityB = activityMap[b.id] ?? b.updatedAt;
    return activityB.localeCompare(activityA);
  });

  if (ordered.length === 0) return <EmptyPanelState />;

  return (
    <>
      {ordered.map((plan) => {
        const activityIso = activityMap[plan.id] ?? plan.updatedAt;
        return (
          <PlanListRow
            key={plan.id}
            planId={plan.id}
            href={`/plans/${plan.id}/my-plan`}
            city={plan.city}
            title={plan.title}
            density="panel"
            onClick={onNavigate}
          >
            <p className="mt-0.5 truncate text-xs text-worksheet-secondary">
              {plan.city ? `${plan.city}　` : ""}
              {formatLastUpdated(activityIso)}
            </p>
          </PlanListRow>
        );
      })}
    </>
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
  const rowClass =
    "flex items-center gap-3.5 py-3 transition-colors duration-150 hover:opacity-80";
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

function MobileBottomNav({
  activeTab,
  avatarUrl,
  myKarteHref,
  hasNoPlans,
}: {
  activeTab: Tab | null;
  avatarUrl: string | null;
  myKarteHref: string;
  hasNoPlans: boolean;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-worksheet-border bg-worksheet-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = activeTab === item.tab;
        return (
          <Link
            key={item.tab}
            href={item.href}
            className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px]"
          >
            <Icon
              className={`h-[22px] w-[22px] shrink-0 ${active ? "text-[#172033]" : "text-[#73757d]"}`}
            />
            <span className={active ? "font-semibold text-[#172033]" : "text-[#73757d]"}>
              {item.label}
            </span>
          </Link>
        );
      })}
      <MobileMenuButton avatarUrl={avatarUrl} myKarteHref={myKarteHref} hasNoPlans={hasNoPlans} />
    </nav>
  );
}

/**
 * mobileのMenu popover。NewPlanButton.tsx（/mypage既存）と同じ「押すと絶対配置パネルを展開」
 * パターンを踏襲。PCはContext Panelへ統合したためこのpopoverはmobileのみ使う。
 * My Karte（Documents一覧）と Account へ遷移でき、Sign out も実動作する。
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
    <div className="relative flex flex-1 flex-col items-center justify-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex flex-col items-center justify-center gap-1 py-2 text-[10px]"
      >
        {/* avatar設定済みなら丸画像（active表示は下の label 側で担う。画像は変色しない）、
            未設定/取得失敗なら既存の UserIcon（色トグルも従来どおり）。 */}
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
