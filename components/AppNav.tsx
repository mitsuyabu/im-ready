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
import type { PlanNavData } from "@/lib/planNavData";

type Tab = "home" | "chat" | "worksheet" | "myPlan";
/** Context Panelとして開ける対象。Menuはpathnameに対応するrouteが無く、手動選択でのみ開く */
type PanelKey = "chat" | "worksheet" | "myPlan" | "menu";

type IconProps = { className?: string };

function iconBaseProps(className?: string) {
  return {
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
}

function HomeIcon({ className }: IconProps) {
  return (
    <svg {...iconBaseProps(className)}>
      <path d="M4 11.5 12 4l8 7.5M6 9.5V20h12V9.5" />
    </svg>
  );
}

function ChatIcon({ className }: IconProps) {
  return (
    <svg {...iconBaseProps(className)}>
      <path d="M4 5h16v11H8l-4 4V5Z" />
    </svg>
  );
}

function WorksheetIcon({ className }: IconProps) {
  return (
    <svg {...iconBaseProps(className)}>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 9h6M9 13h6M9 17h3" />
    </svg>
  );
}

function MyPlanIcon({ className }: IconProps) {
  return (
    <svg {...iconBaseProps(className)}>
      <path d="M7 3h7l4 4v14H7V3Z" />
      <path d="M14 3v4h4" />
    </svg>
  );
}

/** Menu（Documents/Account/Sign out等の入口）用。ユーザー/Profileを連想できる頭＋肩のoutline */
function UserIcon({ className }: IconProps) {
  return (
    <svg {...iconBaseProps(className)}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.6 3.1-6.5 7-6.5s7 2.9 7 6.5" />
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
export default function AppNav({ children, navData }: { children: ReactNode; navData: PlanNavData }) {
  const pathname = usePathname();
  const routeTab = getActiveTab(pathname);
  const hideMobileBottomNav = isPlanChatRoute(pathname);

  const [openPanel, setOpenPanel] = useState<PanelKey | null>(null);
  const closePanel = () => setOpenPanel(null);

  return (
    <div className="lg:flex">
      <Sidebar activeTab={routeTab} onSelectPanel={setOpenPanel} onClosePanel={closePanel} />
      {openPanel && <ContextPanel panel={openPanel} navData={navData} onClose={closePanel} onNavigate={closePanel} />}
      <main className={`min-w-0 flex-1 ${hideMobileBottomNav ? "" : "pb-16 lg:pb-0"}`}>{children}</main>
      {!hideMobileBottomNav && <MobileBottomNav activeTab={routeTab} />}
    </div>
  );
}

function sidebarItemClass(active: boolean) {
  return `flex items-center gap-3 rounded-full px-3 py-2.5 text-sm transition-colors duration-150 ${
    active
      ? "bg-worksheet-sage font-medium text-worksheet-primary"
      : "text-worksheet-secondary hover:bg-worksheet-sage/40 hover:text-worksheet-primary"
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
      <Icon className="h-5 w-5 shrink-0" />
      {label}
    </Link>
  );
}

function SidebarButton({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: (props: IconProps) => React.JSX.Element;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`w-full ${sidebarItemClass(active)}`}>
      <Icon className="h-5 w-5 shrink-0" />
      {label}
    </button>
  );
}

function Sidebar({
  activeTab,
  onSelectPanel,
  onClosePanel,
}: {
  activeTab: Tab | null;
  onSelectPanel: (panel: PanelKey) => void;
  onClosePanel: () => void;
}) {
  const [homeItem, ...panelItems] = NAV_ITEMS;

  return (
    <aside className="hidden shrink-0 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-60 lg:flex-col lg:border-r lg:border-worksheet-border lg:bg-worksheet-surface lg:px-4 lg:py-6">
      <BrandLogo href="/mypage" className="h-7 w-auto sm:h-8" />

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
        {/* Menuに対応するrouteは無いため、Sidebar内で常にactive=falseのまま（activeとPanel開閉を混同しない） */}
        <SidebarButton label="Menu" icon={UserIcon} active={false} onClick={() => onSelectPanel("menu")} />
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
  onClose,
  onNavigate,
}: {
  panel: PanelKey;
  navData: PlanNavData;
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
            <MenuPanelList onSignOut={handleSignOut} />
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

function MenuPanelList({ onSignOut }: { onSignOut: () => void }) {
  return (
    <>
      <div className="flex items-center justify-between py-3 text-sm text-worksheet-secondary/60">
        <span>Documents</span>
        <span className="text-[10px]">近日公開</span>
      </div>
      <div className="flex items-center justify-between py-3 text-sm text-worksheet-secondary/60">
        <span>Account</span>
        <span className="text-[10px]">近日公開</span>
      </div>
      <div className="py-3">
        <button
          type="button"
          onClick={onSignOut}
          className="text-sm text-worksheet-primary transition-colors duration-150 hover:text-worksheet-accent"
        >
          Sign out
        </button>
      </div>
    </>
  );
}

function MobileBottomNav({ activeTab }: { activeTab: Tab | null }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-worksheet-border bg-worksheet-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = activeTab === item.tab;
        return (
          <Link
            key={item.tab}
            href={item.href}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px]"
          >
            <Icon className={`h-5 w-5 ${active ? "text-worksheet-primary" : "text-worksheet-secondary"}`} />
            <span className={active ? "font-medium text-worksheet-primary" : "text-worksheet-secondary"}>
              {item.label}
            </span>
          </Link>
        );
      })}
      <MobileMenuButton />
    </nav>
  );
}

/**
 * mobileのMenu popover。NewPlanButton.tsx（/mypage既存）と同じ「押すと絶対配置パネルを展開」
 * パターンを踏襲。PCはContext Panelへ統合したためこのpopoverは使わない（mobileのみ、無変更）。
 * Documents/Accountは非活性表示のみで、クリックしても遷移しない。Sign outだけ実動作する。
 */
function MobileMenuButton() {
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
        className="flex flex-col items-center justify-center gap-0.5 py-2 text-[10px]"
      >
        <UserIcon className={`h-5 w-5 ${open ? "text-worksheet-primary" : "text-worksheet-secondary"}`} />
        <span className={open ? "font-medium text-worksheet-primary" : "text-worksheet-secondary"}>Menu</span>
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-30 mb-2 w-56 rounded-[20px] border-[0.5px] border-worksheet-border bg-worksheet-surface p-1 shadow-lg">
          <div className="py-1">
            <div className="flex items-center justify-between px-3 py-2 text-sm text-worksheet-secondary/60">
              <span>Documents</span>
              <span className="text-[10px]">近日公開</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 text-sm text-worksheet-secondary/60">
              <span>Account</span>
              <span className="text-[10px]">近日公開</span>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="mt-1 w-full rounded-xl px-3 py-2 text-left text-sm text-worksheet-primary transition-colors duration-150 hover:bg-worksheet-sage/40"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
