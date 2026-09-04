import Link from "next/link";
import type { MyPlanSchoolCandidate, MyPlanSectionId, MyPlanView } from "@/lib/myPlanView";
import { MY_PLAN_SECTIONS } from "@/lib/myPlanView";
import EditablePlanItems from "@/components/EditablePlanItems";
import EditableDestination from "@/components/EditableDestination";
import EditableSchools from "@/components/EditableSchools";
import EditableTimeline from "@/components/EditableTimeline";

/**
 * 新しい My Plan（「ユーザーが自分で育てる実行プラン」）の presentation（Step 2-3）。
 *
 * データは lib/myPlanView.ts の buildMyPlanView が組み立て済み。Server Component のままで、
 * 編集が要るセクション（Goals / Destination / Work / Things / Milestones）だけ client island に委譲する。
 *   - saved（自分の Plan・主役）: 通常の white / navy、追加 / 削除できる
 *   - candidate（Karte 由来・採用可）: 破線・生成り ＋「＋ Planに追加」（Goals / Destination）
 *   - hint（Karte 由来・read-only）: 「意向」だけの情報。採用ボタンなし（Work / Milestones）
 *
 * School & English / Timeline は今回 read-only（Step 2-4 / 2-7）。blueprint unavailable の場合は
 * 編集 UI を出さず（editingEnabled=false）、警告 ＋ Karte 候補中心の表示にする。
 */

/* ------------------------------------------------------------------ */
/* icons                                                              */
/* ------------------------------------------------------------------ */

type IconProps = { className?: string };
function svgProps(className?: string) {
  return {
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
}
const PinIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <path d="M12 21s7-5.6 7-11a7 7 0 0 0-14 0c0 5.4 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);
const ClockIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);
const CalendarIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <rect x="4" y="5" width="16" height="16" rx="2" />
    <path d="M4 9h16M8 3v4M16 3v4" />
  </svg>
);
const WalletIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <path d="M4 7a2 2 0 0 1 2-2h12v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
    <path d="M16 12h3v-3h-3a1.5 1.5 0 0 0 0 3Z" />
  </svg>
);
const SchoolIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <path d="M4 21V9l8-5 8 5v12M4 21h16M9 21v-6h6v6" />
  </svg>
);
const ArrowRightIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

/* ------------------------------------------------------------------ */
/* section accents（既存 palette 内。scoring ではなく装飾のみ）                          */
/* ------------------------------------------------------------------ */

const SECTION_ACCENT: Record<MyPlanSectionId, string> = {
  goals: "#5f7050",
  destination: "#3a5266",
  school: "#4b5b3e",
  work: "#8a5a3c",
  things: "#b5654d",
  milestones: "#4a4640",
  timeline: "#1e2b3d",
};

/* ------------------------------------------------------------------ */
/* card chrome                                                        */
/* ------------------------------------------------------------------ */

function MyPlanCard({
  id,
  num,
  enName,
  subtitle,
  accent,
  span,
  children,
}: {
  id: MyPlanSectionId;
  num: string;
  enName: string;
  subtitle: string;
  accent: string;
  span: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={`myplan-${id}`}
      className={`relative scroll-mt-6 overflow-hidden rounded-[18px] border border-[#e5dfd6] bg-white p-5 shadow-[0_1px_3px_rgba(30,28,24,0.05)] sm:p-6 lg:p-7 ${span}`}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute right-3 top-1 select-none font-serif text-[46px] font-semibold leading-none text-[#efece3] sm:text-[62px]"
      >
        {num}
      </span>
      <h2 className="relative text-lg font-bold sm:text-xl" style={{ color: accent }}>
        {enName}
      </h2>
      <p className="relative mt-0.5 text-xs text-[#8a8578]">{subtitle}</p>
      <div className="relative">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* School & English（保存済み学校は編集可・比較 CTA / 候補 / 英語参考は read-only）        */
/* ------------------------------------------------------------------ */

function SchoolCandidateRow({ c }: { c: MyPlanSchoolCandidate }) {
  return (
    <li className="text-sm leading-snug text-[#6f6a64]">
      <span className="font-medium text-[#5b574f]">{c.name}</span>
      {c.city && <span className="text-[#8a8578]">　{c.city}</span>}
      {c.reason && <span className="mt-0.5 block text-xs text-[#a8a297]">{c.reason}</span>}
    </li>
  );
}

function SchoolBody({ view, planId }: { view: MyPlanView; planId: string }) {
  const { savedSchools, candidates, englishRef } = view.school;
  return (
    <>
      {savedSchools.length > 0 ? (
        <EditableSchools
          planId={planId}
          initialSchools={savedSchools}
          editingEnabled={view.blueprintAvailable}
        />
      ) : (
        <div className="mt-4">
          <p className="text-sm text-[#a8a297]">まだ学校を保存していません。</p>
          <p className="mt-1 text-xs leading-relaxed text-[#b7b1a6]">
            School Comparison で比べた学校を、ここに残せるようにします。
          </p>
        </div>
      )}

      {candidates.length > 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-[#d9d3c8] bg-[#f6f4ec] px-4 py-3">
          <p className="text-[10px] font-semibold tracking-wide text-[#8a8578]">Karteからの候補</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[#a8a297]">Chat で提案された学校です</p>
          <ul className="mt-2.5 space-y-2">
            {candidates.map((c) => (
              <SchoolCandidateRow key={c.key} c={c} />
            ))}
          </ul>
        </div>
      )}

      {englishRef.length > 0 && (
        <div className="mt-4 rounded-xl bg-[#f2f4ee] px-4 py-3">
          <p className="text-[10px] font-medium tracking-wide text-[#8a8578]">英語について</p>
          <ul className="mt-1 space-y-1">
            {englishRef.map((e) => (
              <li key={e.key} className="text-xs leading-relaxed text-[#6f6a64]">
                {e.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link
        href={`/plans/${planId}/documents/school-comparison`}
        className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#c9c2b4] px-4 py-2 text-sm font-medium text-[#3f3a34] transition-colors hover:bg-[#f2efe7]"
      >
        学校を比較する
        <ArrowRightIcon className="h-4 w-4" />
      </Link>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* section dispatch                                                   */
/* ------------------------------------------------------------------ */

function renderSectionBody(id: MyPlanSectionId, view: MyPlanView, planId: string): React.ReactNode {
  const editingEnabled = view.blueprintAvailable;

  switch (id) {
    case "goals":
      return (
        <EditablePlanItems
          planId={planId}
          section="goals"
          initialItems={view.goals.saved}
          candidates={view.goals.candidates}
          addLabel="目標を追加"
          placeholder="例：英語で仕事ができるようになりたい"
          emptyLine="まだ目標がありません。"
          emptyHelper="自分で追加するか、ChatやWorksheetで整理した内容を候補から採用できます。"
          layout="rows"
          editingEnabled={editingEnabled}
        />
      );
    case "destination":
      return (
        <EditableDestination
          planId={planId}
          initialPrimary={view.destination.savedPrimary}
          initialInterested={view.destination.savedInterested}
          candidates={view.destination.candidates}
          hints={view.destination.hints}
          editingEnabled={editingEnabled}
        />
      );
    case "school":
      return <SchoolBody view={view} planId={planId} />;
    case "work":
      return (
        <EditablePlanItems
          planId={planId}
          section="workInterests"
          initialItems={view.work.saved}
          hints={view.work.hints}
          addLabel="興味のある仕事を追加"
          placeholder="例：カフェ、ホテル、ツアー関連"
          emptyLine="興味のある仕事がまだありません。"
          emptyHelper="現地でやってみたい仕事を、ここに残していきます。"
          layout="chips"
          editingEnabled={editingEnabled}
        />
      );
    case "things":
      return (
        <EditablePlanItems
          planId={planId}
          section="thingsToDo"
          initialItems={view.things.saved}
          addLabel="やってみたいことを追加"
          placeholder="例：サーフィンをする"
          emptyLine="まだやってみたいことがありません。"
          emptyHelper="現地で経験したいことを、ここに残していきます。"
          layout="chips"
          editingEnabled={editingEnabled}
        />
      );
    case "milestones":
      return (
        <EditablePlanItems
          planId={planId}
          section="milestones"
          initialItems={view.milestones.saved}
          hints={view.milestones.hints}
          addLabel="目標や節目を追加"
          placeholder="例：セカンドビザ取得を目指す"
          emptyLine="まだ節目や目標がありません。"
          emptyHelper="ビザや資格、学校修了など、達成したいことをここに残していきます。"
          layout="rows"
          editingEnabled={editingEnabled}
          extraFooter={
            view.milestones.showVisaDisclaimer ? (
              <p className="mt-4 rounded-xl bg-[#f6efe4] px-4 py-3 text-[11px] leading-relaxed text-[#8a8578]">
                ビザや制度の条件は最新の公式情報をご確認ください。
              </p>
            ) : undefined
          }
        />
      );
    case "timeline":
      return (
        <EditableTimeline
          planId={planId}
          initialTimeline={view.timeline}
          canGenerate={view.timelineCanGenerate}
        />
      );
  }
}

/* ------------------------------------------------------------------ */
/* page                                                               */
/* ------------------------------------------------------------------ */

const WIDE_SECTIONS = new Set<MyPlanSectionId>(["school", "timeline"]);

export default function MyPlan({
  planId,
  planTitle,
  view,
  lastUpdated,
}: {
  planId: string;
  planTitle: string;
  view: MyPlanView;
  lastUpdated: string | null;
}) {
  // 何も無く、かつ編集もできない（blueprint unavailable）ときだけ onboarding。
  // 編集可能なら空でも各セクションの「＋ 追加」から自分で作り始められる（§74）。
  if (!view.hasAnyContent && !view.blueprintAvailable) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-24">
        <Link
          href={`/plans/${planId}`}
          className="inline-flex items-center gap-1 text-sm text-[#6f6a64] transition-colors hover:text-[#1c1c1c]"
        >
          <span aria-hidden>←</span> Plan Homeに戻る
        </Link>
        <h1 className="mt-8 text-[28px] font-bold text-[#151515] sm:text-3xl">My Plan</h1>
        <p className="mt-6 text-base font-medium text-[#3f3a34]">まだMy Planは空です。</p>
        <p className="mt-3 text-sm leading-relaxed text-[#6f6a64]">
          ChatやWorksheetで考えを整理すると、
          <br className="hidden sm:block" />
          ここにPlanの候補が見えてきます。
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link
            href={`/plans/${planId}/chat`}
            className="inline-flex items-center rounded-full bg-[#161616] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#000]"
          >
            AIに相談する
          </Link>
          <Link
            href={`/plans/${planId}/worksheet`}
            className="inline-flex items-center rounded-full border border-[#d9d3c8] px-5 py-2.5 text-sm font-medium text-[#3f3a34] transition-colors hover:bg-[#f2efe7]"
          >
            Worksheetで整理する
          </Link>
        </div>
      </div>
    );
  }

  const { hero } = view;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 pb-24 sm:px-6 sm:py-14 lg:px-8">
      <Link
        href={`/plans/${planId}`}
        className="inline-flex items-center gap-1 text-sm text-[#6f6a64] transition-colors hover:text-[#1c1c1c]"
      >
        <span aria-hidden>←</span> Plan Homeに戻る
      </Link>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div>
          <h1 className="text-[28px] font-bold leading-[1.18] tracking-tight text-[#151515] sm:text-[42px]">
            My Plan
          </h1>
          <p className="mt-1 text-sm text-[#6f6a64]">留学・ワーホリの実行プラン</p>
          <p className="mt-0.5 text-xs text-[#8a8578]">{planTitle}</p>
        </div>
        {lastUpdated && (
          <p className="shrink-0 text-xs text-[#8a8578] sm:mt-3">最終更新 {lastUpdated}</p>
        )}
      </div>

      {!view.blueprintAvailable && (
        <p className="mt-5 rounded-xl border border-[#e4d8c4] bg-[#faf4e8] px-4 py-3 text-xs leading-relaxed text-[#7a6a4e]">
          保存したMy Planの情報を読み込めませんでした。編集は一時的にできませんが、下の「Karteからの候補」は表示できます。
        </p>
      )}

      {/* ヒーローサマリー（明るいブルーグレー地に CSS だけの淡いグラデーション） */}
      <section
        className="relative mt-6 overflow-hidden rounded-[20px] border border-[#dfe6e3] bg-[#e8eee9] shadow-[0_1px_3px_rgba(30,40,36,0.06)]"
        style={{
          backgroundImage:
            "radial-gradient(120% 80% at 92% 6%, rgba(150,178,155,0.30), transparent 58%), radial-gradient(90% 70% at 4% 98%, rgba(255,255,255,0.92), transparent 55%)",
        }}
      >
        <div className="relative px-5 py-6 sm:px-9 sm:py-8">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-[#68727c]">
            YOUR PLAN AT A GLANCE
          </p>
          <p className="mt-3 text-[22px] font-bold leading-snug text-[#172033] sm:text-[30px]">
            {hero.headline}
          </p>
          {hero.school && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-[#4a5560]">
              <SchoolIcon className="h-4 w-4" />
              {hero.school}
            </p>
          )}
        </div>
        <div className="relative grid grid-cols-2 gap-2 px-4 pb-4 sm:grid-cols-4 sm:px-6 sm:pb-6">
          <HeroItem
            icon={<PinIcon className="h-4 w-4" />}
            label="行き先"
            value={hero.destination?.text ?? null}
            note={hero.destination?.fromKarte ? "Karteから" : null}
          />
          <HeroItem icon={<CalendarIcon className="h-4 w-4" />} label="出発目安" value={hero.departure} />
          <HeroItem icon={<ClockIcon className="h-4 w-4" />} label="期間" value={hero.duration} />
          <HeroItem icon={<WalletIcon className="h-4 w-4" />} label="予算" value={hero.budget} />
        </div>
      </section>

      {/* メイン: 左アウトライン / 右カードグリッド */}
      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-[212px_minmax(0,1fr)] lg:gap-8">
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <div className="rounded-[18px] border border-[#e5dfd6] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <p className="px-1 text-[11px] font-semibold tracking-[0.16em] text-[#5f7050]">
              PLAN OUTLINE
            </p>
            <ol className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 lg:block lg:space-y-0.5">
              {MY_PLAN_SECTIONS.map((s, i) => (
                <li key={s.id}>
                  <a
                    href={`#myplan-${s.id}`}
                    className="flex items-baseline gap-2 rounded-lg px-2 py-2 text-sm text-[#3f3a34] transition-colors hover:bg-[#f2efe7] lg:gap-2.5 lg:py-1.5"
                  >
                    <span className="font-serif text-xs text-[#b7b1a6]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {s.enName}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </aside>

        <div className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2">
          {MY_PLAN_SECTIONS.map((s, index) => (
            <MyPlanCard
              key={s.id}
              id={s.id}
              num={String(index + 1).padStart(2, "0")}
              enName={s.enName}
              subtitle={s.subtitle}
              accent={SECTION_ACCENT[s.id]}
              span={WIDE_SECTIONS.has(s.id) ? "sm:col-span-2" : ""}
            >
              {renderSectionBody(s.id, view, planId)}
            </MyPlanCard>
          ))}
        </div>
      </div>
    </div>
  );
}

function HeroItem({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  note?: string | null;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/70 bg-white/55 px-4 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/70 text-[#5b6b63]">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-medium tracking-wide text-[#68727c]">
          {label}
          {note && <span className="ml-1 text-[#8a949c]">／{note}</span>}
        </p>
        <p
          className={`mt-0.5 truncate text-sm font-semibold ${value ? "text-[#172033]" : "text-[#98a1a8]"}`}
        >
          {value ?? "これから整理"}
        </p>
      </div>
    </div>
  );
}
