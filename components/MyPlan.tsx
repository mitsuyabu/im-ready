import Link from "next/link";
import type {
  MyPlanCandidate,
  MyPlanSchoolCandidate,
  MyPlanSavedSchool,
  MyPlanSectionId,
  MyPlanView,
} from "@/lib/myPlanView";
import { MY_PLAN_SECTIONS } from "@/lib/myPlanView";
import type { BlueprintItem, BlueprintSchoolStatus, PlanTimeline } from "@/lib/planBlueprint";

/**
 * 新しい My Plan（「ユーザーが採用した実行プラン」）の presentation。
 *
 * データは lib/myPlanView.ts の buildMyPlanView が組み立て済み。ここは表示専用で、
 * Karte / blueprint への分岐ロジックは持たない。
 *   - saved（blueprint 由来）  : 通常の white / navy 表示
 *   - candidate（Karte 由来）  : 破線・生成りの弱い表示 ＋「Karteからの候補」ラベル（read-only）
 *
 * CRUD（追加 / 削除 / status 変更 / 保存 / School 保存 / AI Timeline）は Step 2-3 以降。
 * 動かないボタンは置かない。
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
/* section accents（既存 palette 内。scoring 用ではなく装飾のみ）                       */
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

const STATUS_LABEL: Record<BlueprintSchoolStatus, string> = {
  considering: "検討中",
  preferred: "第一候補",
  selected: "決定",
};
const STATUS_CLASS: Record<BlueprintSchoolStatus, string> = {
  considering: "border-[#e4ddcf] bg-[#f6f2e8] text-[#6f6a64]",
  preferred: "border-[#cfdbe6] bg-[#eef3f7] text-[#3a5266]",
  selected: "border-[#cfdcc4] bg-[#eef3e8] text-[#4b5b3e]",
};

/* ------------------------------------------------------------------ */
/* small presentational pieces                                        */
/* ------------------------------------------------------------------ */

function SavedItemRow({ item }: { item: BlueprintItem }) {
  return (
    <li className="rounded-xl border border-[#e5dfd6] bg-white px-4 py-3">
      <p className="text-sm font-medium leading-snug text-[#2f2c26]">{item.label}</p>
      {item.note && <p className="mt-0.5 text-xs leading-relaxed text-[#8a8578]">{item.note}</p>}
    </li>
  );
}

function EmptySection({ line, helper }: { line: string; helper: string }) {
  return (
    <div className="mt-4">
      <p className="text-sm text-[#a8a297]">{line}</p>
      <p className="mt-1 text-xs leading-relaxed text-[#b7b1a6]">{helper}</p>
    </div>
  );
}

/** Karte 由来の候補ブロック（read-only・保存済みより一段弱い）。 */
function CandidateBlock({
  children,
  helper = "会話やWorksheetから見えている内容",
}: {
  children: React.ReactNode;
  helper?: string;
}) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-[#d9d3c8] bg-[#f6f4ec] px-4 py-3">
      <p className="text-[10px] font-semibold tracking-wide text-[#8a8578]">Karteからの候補</p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-[#a8a297]">{helper}</p>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

function CandidateList({ candidates }: { candidates: MyPlanCandidate[] }) {
  return (
    <ul className="space-y-1.5">
      {candidates.map((c) => (
        <li key={c.key} className="text-sm leading-snug text-[#6f6a64]">
          {c.label}
        </li>
      ))}
    </ul>
  );
}

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
      <h2 className="relative text-lg font-bold text-[#151515] sm:text-xl" style={{ color: accent }}>
        {enName}
      </h2>
      <p className="relative mt-0.5 text-xs text-[#8a8578]">{subtitle}</p>
      <div className="relative">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* per-section bodies                                                 */
/* ------------------------------------------------------------------ */

function GoalsBody({ view }: { view: MyPlanView }) {
  const { saved, candidates } = view.goals;
  if (saved.length === 0 && candidates.length === 0) {
    return (
      <EmptySection
        line="まだ目標がありません。"
        helper="ChatやWorksheetで整理した内容が、ここに候補として出てきます。"
      />
    );
  }
  return (
    <>
      {saved.length > 0 && (
        <ul className="mt-4 space-y-2">
          {saved.map((g) => (
            <SavedItemRow key={g.id} item={g} />
          ))}
        </ul>
      )}
      {candidates.length > 0 && (
        <CandidateBlock>
          <CandidateList candidates={candidates} />
        </CandidateBlock>
      )}
    </>
  );
}

function DestinationBody({ view }: { view: MyPlanView }) {
  const { savedPrimary, savedInterested, candidates, hints } = view.destination;
  const empty =
    !savedPrimary && savedInterested.length === 0 && candidates.length === 0 && hints.length === 0;
  if (empty) {
    return (
      <EmptySection
        line="行ってみたい都市がまだありません。"
        helper="暮らしたい場所や旅してみたい場所を、ここに残していきます。"
      />
    );
  }
  return (
    <>
      {savedPrimary && (
        <div className="mt-4">
          <p className="text-[10px] font-medium tracking-wide text-[#8a8578]">第一候補</p>
          <p className="mt-1 inline-flex rounded-xl border border-[#cfdbe6] bg-[#eef3f7] px-4 py-2 text-base font-semibold text-[#2f3a4a]">
            {savedPrimary.label}
          </p>
        </div>
      )}
      {savedInterested.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] font-medium tracking-wide text-[#8a8578]">行ってみたい都市</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {savedInterested.map((d) => (
              <span
                key={d.id}
                className="rounded-lg border border-[#e5dfd6] bg-white px-3 py-1.5 text-[13px] text-[#3f3a34]"
              >
                {d.label}
              </span>
            ))}
          </div>
        </div>
      )}
      {candidates.length > 0 && (
        <CandidateBlock>
          <CandidateList candidates={candidates} />
        </CandidateBlock>
      )}
      {hints.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-medium tracking-wide text-[#b7b1a6]">都市選びのヒント</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {hints.map((h) => (
              <span key={h.key} className="text-xs text-[#8a8578]">
                {h.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function SavedSchoolCard({ school }: { school: MyPlanSavedSchool }) {
  return (
    <div className="rounded-xl border border-[#e5dfd6] bg-white px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#2f2c26]">{school.name}</p>
          {school.city && <p className="mt-0.5 text-xs text-[#8a8578]">{school.city}</p>}
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${STATUS_CLASS[school.status]}`}
        >
          {STATUS_LABEL[school.status]}
        </span>
      </div>
    </div>
  );
}

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
        <div className="mt-4 grid grid-cols-1 gap-2">
          {savedSchools.map((s) => (
            <SavedSchoolCard key={s.id} school={s} />
          ))}
        </div>
      ) : (
        <EmptySection
          line="まだ学校を保存していません。"
          helper="School Comparison で比べた学校を、ここに残せるようにします。"
        />
      )}

      {candidates.length > 0 && (
        <CandidateBlock helper="Chat で提案された学校です">
          <ul className="space-y-2">
            {candidates.map((c) => (
              <SchoolCandidateRow key={c.key} c={c} />
            ))}
          </ul>
        </CandidateBlock>
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

function ChipsAndCandidates({
  saved,
  candidates,
  emptyLine,
  emptyHelper,
}: {
  saved: BlueprintItem[];
  candidates: MyPlanCandidate[];
  emptyLine: string;
  emptyHelper: string;
}) {
  if (saved.length === 0 && candidates.length === 0) {
    return <EmptySection line={emptyLine} helper={emptyHelper} />;
  }
  return (
    <>
      {saved.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {saved.map((it) => (
            <span
              key={it.id}
              className="rounded-lg border border-[#e5dfd6] bg-white px-3 py-1.5 text-[13px] text-[#3f3a34]"
              title={it.note ?? undefined}
            >
              {it.label}
            </span>
          ))}
        </div>
      )}
      {candidates.length > 0 && (
        <CandidateBlock>
          <CandidateList candidates={candidates} />
        </CandidateBlock>
      )}
    </>
  );
}

function MilestonesBody({ view }: { view: MyPlanView }) {
  const { saved, candidates, showVisaDisclaimer } = view.milestones;
  return (
    <>
      <ChipsAndCandidates
        saved={saved}
        candidates={candidates}
        emptyLine="まだ節目や目標がありません。"
        emptyHelper="ビザや資格、学校修了など、達成したいことをここに残していきます。"
      />
      {showVisaDisclaimer && (
        <p className="mt-4 rounded-xl bg-[#f6efe4] px-4 py-3 text-[11px] leading-relaxed text-[#8a8578]">
          ビザや制度の条件は最新の公式情報をご確認ください。
        </p>
      )}
    </>
  );
}

function TimelineBody({ timeline }: { timeline: PlanTimeline | null }) {
  if (!timeline) {
    return (
      <div className="mt-4">
        <p className="text-sm font-medium text-[#3f3a34]">まだスケジュールはありません。</p>
        <p className="mt-2 text-sm leading-relaxed text-[#6f6a64]">
          Goalsや学校、やりたいことをもとに、留学期間全体のプランを組み立てていきます。
        </p>
      </div>
    );
  }
  return (
    <div className="mt-4">
      {timeline.summary && (
        <p className="text-sm leading-relaxed text-[#3f3a34]">{timeline.summary}</p>
      )}
      {timeline.durationLabel && (
        <p className="mt-1 text-xs text-[#8a8578]">{timeline.durationLabel}</p>
      )}
      <ol className="mt-4 space-y-4 border-l border-[#e5dfd6] pl-4">
        {timeline.periods.map((p) => (
          <li key={p.id} className="relative">
            <span
              aria-hidden
              className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-[#1e2b3d] bg-white"
            />
            <p className="text-[11px] font-semibold tracking-wide text-[#8a8578]">{p.label}</p>
            <p className="mt-0.5 text-sm font-semibold text-[#2f2c26]">{p.title}</p>
            {p.activities.length > 0 && (
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[13px] leading-relaxed text-[#3f3a34]">
                {p.activities.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            )}
            {p.reason && <p className="mt-1 text-xs leading-relaxed text-[#8a8578]">{p.reason}</p>}
          </li>
        ))}
      </ol>
      {timeline.openQuestions.length > 0 && (
        <div className="mt-5 rounded-xl bg-[#f6efe4] px-4 py-3">
          <p className="text-[10px] font-medium tracking-wide text-[#8a8578]">まだ確認したいこと</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs leading-relaxed text-[#6f6a64]">
            {timeline.openQuestions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}
      {timeline.disclaimer && (
        <p className="mt-4 text-[11px] leading-relaxed text-[#a8a297]">{timeline.disclaimer}</p>
      )}
    </div>
  );
}

function renderSectionBody(id: MyPlanSectionId, view: MyPlanView, planId: string): React.ReactNode {
  switch (id) {
    case "goals":
      return <GoalsBody view={view} />;
    case "destination":
      return <DestinationBody view={view} />;
    case "school":
      return <SchoolBody view={view} planId={planId} />;
    case "work":
      return (
        <ChipsAndCandidates
          saved={view.work.saved}
          candidates={view.work.candidates}
          emptyLine="興味のある仕事がまだありません。"
          emptyHelper="現地でやってみたい仕事を、ここに残していきます。"
        />
      );
    case "things":
      return (
        <ChipsAndCandidates
          saved={view.things.saved}
          candidates={view.things.candidates}
          emptyLine="まだやってみたいことがありません。"
          emptyHelper="現地で経験したいことを、ここに残していきます。"
        />
      );
    case "milestones":
      return <MilestonesBody view={view} />;
    case "timeline":
      return <TimelineBody timeline={view.timeline} />;
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
  if (!view.hasAnyContent) {
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
          保存したMy Planの情報を読み込めませんでした。下の「Karteからの候補」は表示できます。
        </p>
      )}

      {/* ヒーローサマリー */}
      <section className="mt-6 overflow-hidden rounded-[20px] bg-[#1e2b3d] shadow-[0_2px_10px_rgba(20,28,42,0.12)]">
        <div className="px-5 py-6 sm:px-9 sm:py-8">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-[#8ea3bf]">
            YOUR PLAN AT A GLANCE
          </p>
          <p className="mt-3 text-[19px] font-bold leading-snug text-white sm:text-[28px]">
            {hero.headline}
          </p>
          {hero.school && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-[#c7d4e4]">
              <SchoolIcon className="h-4 w-4" />
              {hero.school}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-px bg-white/10 sm:grid-cols-4">
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
    <div className="flex items-center gap-3 bg-[#1e2b3d] px-5 py-4 sm:px-6">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-[#c7d4e4]">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-medium tracking-wide text-[#8ea3bf]">
          {label}
          {note && <span className="ml-1 text-[#7f93af]">／{note}</span>}
        </p>
        <p
          className={`mt-0.5 truncate text-sm font-semibold ${value ? "text-white" : "text-[#8ea3bf]"}`}
        >
          {value ?? "これから整理"}
        </p>
      </div>
    </div>
  );
}
