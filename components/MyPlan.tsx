import Link from "next/link";
import type { Karte } from "@/lib/karte";
import { formatLastUpdated } from "@/lib/planActivity";
import {
  buildMyPlanSections,
  buildPlanSummary,
  type MyPlanSection,
  type MyPlanSectionId,
} from "@/lib/myPlanSections";

/* ------------------------------------------------------------------ */
/* 表示専用の小さなヘルパー（既存 value を機械的に短くするだけ。新しい要約は作らない）           */
/* ------------------------------------------------------------------ */

const NEUTRAL = "これから整理";

/** 先頭1文だけ（。！？改行で切る）。取れなければ trim 全体。 */
function firstSentence(text: string): string {
  const head = text.trim().split(/[。！？\n]/)[0].trim();
  return head.length > 0 ? head : text.trim();
}

/** 先頭フレーズだけ（。、句読点・改行で切る）。 */
function firstPhrase(text: string): string {
  const head = text.trim().split(/[。、，,.．\n]/)[0].trim();
  return head.length > 0 ? head : text.trim();
}

/** 末尾を機械的に詰めるだけ。 */
function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/* ------------------------------------------------------------------ */
/* icons                                                              */
/* ------------------------------------------------------------------ */

type IconProps = { className?: string };
function svgProps(className?: string) {
  return {
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.7,
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
const ArrowRightIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const HERO_ICON: Record<string, (p: IconProps) => React.JSX.Element> = {
  行き先: PinIcon,
  期間: ClockIcon,
  出発目安: CalendarIcon,
  予算: WalletIcon,
};

/* ------------------------------------------------------------------ */
/* section presentation config（並び順は buildMyPlanSections の定義順＝仕様の 01〜08）        */
/* ------------------------------------------------------------------ */

/** desktop の2列グリッドでの占有幅。narrative と Worries/Decision は横長。 */
const SECTION_SPAN: Record<MyPlanSectionId, string> = {
  why: "sm:col-span-2",
  goal: "sm:col-span-2",
  studyPlan: "",
  schoolEnglish: "",
  lifestyle: "",
  work: "",
  worries: "sm:col-span-2",
  decision: "sm:col-span-2",
};

/* ------------------------------------------------------------------ */

export default function MyPlan({
  planId,
  planTitle,
  karte,
}: {
  planId: string;
  planTitle: string;
  karte: Karte;
}) {
  const { sections, trueGoalHypothesis, hasAnyContent } = buildMyPlanSections(karte);
  const planSummary = buildPlanSummary(karte);
  const conflictCount = karte.handoff.conflicts.length;
  const proposalCount = karte.proposals.presented.length;
  const lastUpdated = karte.meta.updatedAt ? formatLastUpdated(karte.meta.updatedAt) : null;

  if (!hasAnyContent) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-24">
        <Link
          href={`/plans/${planId}`}
          className="inline-flex items-center gap-1 text-sm text-[#6f6a64] transition-colors hover:text-[#1c1c1c]"
        >
          <span aria-hidden>←</span> Plan Homeに戻る
        </Link>
        <h1 className="mt-8 text-3xl font-bold text-[#151515]">My Plan</h1>
        <p className="mt-6 text-base font-medium text-[#3f3a34]">まだ整理されていません。</p>
        <p className="mt-3 text-sm leading-relaxed text-[#6f6a64]">
          AIに相談したり、I&apos;m ready!に答えると
          <br className="hidden sm:block" />
          My Planが少しずつ育っていきます。
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
            テーマから整理する
          </Link>
        </div>
      </div>
    );
  }

  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const itemsOf = (id: MyPlanSectionId): MyPlanSection["items"] => sectionById.get(id)?.items ?? [];

  /* ---- hero copy（既存 stated 値の組み合わせから機械的に。無ければ中立表現） ---- */
  const cityRaw = planSummary.chips.find((c) => c.key === "city")?.text ?? null;
  const cityText = cityRaw ? clip(firstPhrase(cityRaw), 16) : null;
  const durationText = planSummary.chips.find((c) => c.key === "duration")?.text ?? null;
  const departureText = planSummary.chips.find((c) => c.key === "departure")?.text ?? null;
  const budgetText = planSummary.chips.find((c) => c.key === "budget")?.text ?? null;

  const lifestyleHasContent = itemsOf("lifestyle").length > 0;
  const workStated =
    (karte.work.wantsToWork.certainty === "stated" && karte.work.wantsToWork.value === true) ||
    (karte.work.workingHolidayInterest.certainty === "stated" &&
      karte.work.workingHolidayInterest.value === true);
  const heroVerbs: string[] = [];
  if (lifestyleHasContent) heroVerbs.push("暮らす");
  if (workStated) heroVerbs.push("働く");

  const heroCopy =
    cityText && heroVerbs.length > 0
      ? `${cityText}で${heroVerbs.join("、")}。`
      : cityText
        ? `${cityText}での留学プラン`
        : planTitle || "このPlanの全体像";

  const heroItems = [
    { label: "行き先", value: cityText ?? NEUTRAL },
    { label: "期間", value: durationText ?? NEUTRAL },
    { label: "出発目安", value: departureText ? clip(firstPhrase(departureText), 12) : NEUTRAL },
    { label: "予算", value: budgetText ?? NEUTRAL },
  ];

  /* ---- 03 Study Abroad Plan の固定4項目（buildPlanSummary の stated 値のみ） ---- */
  const studyPlanRows = [
    { label: "希望する都市", value: cityText ?? NEUTRAL },
    { label: "滞在期間", value: durationText ?? NEUTRAL },
    { label: "出発時期", value: departureText ? clip(firstPhrase(departureText), 16) : NEUTRAL },
    { label: "総予算", value: budgetText ?? NEUTRAL },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 pb-20 sm:px-6 sm:py-14 lg:px-8">
      <Link
        href={`/plans/${planId}`}
        className="inline-flex items-center gap-1 text-sm text-[#6f6a64] transition-colors hover:text-[#1c1c1c]"
      >
        <span aria-hidden>←</span> Plan Homeに戻る
      </Link>

      {/* ページ上部: タイトル + Plan名 / 最終更新 */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div>
          <h1 className="text-[28px] font-bold leading-[1.18] tracking-tight text-[#151515] sm:text-[42px]">
            My Plan
          </h1>
          <p className="mt-1 text-sm text-[#6f6a64]">{planTitle}</p>
        </div>
        {lastUpdated && (
          <p className="shrink-0 text-xs text-[#8a8578] sm:mt-3">最終更新 {lastUpdated}</p>
        )}
      </div>

      {/* ヒーローサマリー */}
      <section className="mt-6 overflow-hidden rounded-[20px] bg-[#1e2b3d] shadow-[0_2px_10px_rgba(20,28,42,0.12)]">
        <div className="px-5 py-6 sm:px-9 sm:py-8">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-[#8ea3bf]">
            YOUR PLAN AT A GLANCE
          </p>
          <p className="mt-3 text-[19px] font-bold leading-snug text-white sm:text-[28px]">
            {heroCopy}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-px bg-white/10 sm:grid-cols-4">
          {heroItems.map((it) => {
            const Icon = HERO_ICON[it.label] ?? PinIcon;
            return (
              <div key={it.label} className="flex items-center gap-3 bg-[#1e2b3d] px-5 py-4 sm:px-6">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-[#c7d4e4]">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium tracking-wide text-[#8ea3bf]">{it.label}</p>
                  <p className="mt-0.5 truncate text-sm font-semibold text-white">{it.value}</p>
                </div>
              </div>
            );
          })}
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
              {sections.map((s, i) => (
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
          {sections.map((section, index) => {
            const num = String(index + 1).padStart(2, "0");
            return (
              <MyPlanCard
                key={section.id}
                id={section.id}
                num={num}
                enName={section.enName}
                subtitle={section.subtitle}
                span={SECTION_SPAN[section.id]}
              >
                {renderBody(section.id, {
                  sectionById,
                  itemsOf,
                  trueGoalHypothesis,
                  studyPlanRows,
                  proposalCount,
                  conflictCount,
                  planId,
                })}
              </MyPlanCard>
            );
          })}
        </div>
      </div>
    </div>
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
  span,
  children,
}: {
  id: MyPlanSectionId;
  num: string;
  enName: string;
  subtitle: string;
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
      <h2 className="relative text-lg font-bold text-[#151515] sm:text-xl">{enName}</h2>
      <p className="relative mt-0.5 text-xs text-[#8a8578]">{subtitle}</p>
      <div className="relative">{children}</div>
    </section>
  );
}

function Neutral() {
  return <p className="mt-4 text-sm text-[#a8a297]">{NEUTRAL}</p>;
}

/* ------------------------------------------------------------------ */
/* per-section body                                                   */
/* ------------------------------------------------------------------ */

type BodyCtx = {
  sectionById: Map<MyPlanSectionId, MyPlanSection>;
  itemsOf: (id: MyPlanSectionId) => MyPlanSection["items"];
  trueGoalHypothesis: string | null;
  studyPlanRows: { label: string; value: string }[];
  proposalCount: number;
  conflictCount: number;
  planId: string;
};

function renderBody(id: MyPlanSectionId, ctx: BodyCtx): React.ReactNode {
  const items = ctx.itemsOf(id);

  if (id === "why") {
    const lead = items[0]?.value ?? null;
    return (
      <>
        {lead ? (
          <blockquote className="mt-4 border-l-2 border-[#cdddc5] pl-4 text-[15px] leading-loose text-[#2f2c26] sm:text-base">
            {firstSentence(lead)}
          </blockquote>
        ) : (
          <Neutral />
        )}
        {ctx.trueGoalHypothesis && (
          <div className="mt-4 rounded-xl bg-[#f2f4ee] px-4 py-3">
            <p className="text-[10px] font-medium text-[#8a8578]">会話から見えてきたこと</p>
            <p className="mt-1 text-sm leading-relaxed text-[#6f6a64]">
              {firstSentence(ctx.trueGoalHypothesis)}
            </p>
          </div>
        )}
      </>
    );
  }

  if (id === "goal") {
    if (items.length === 0) return <Neutral />;
    return (
      <div className="mt-4 space-y-2">
        {items.slice(0, 2).map((it, i) => (
          <p key={i} className="text-[15px] leading-relaxed text-[#2f2c26] sm:text-base">
            {firstSentence(it.value)}
          </p>
        ))}
      </div>
    );
  }

  if (id === "studyPlan") {
    return (
      <dl className="mt-4 space-y-3">
        {ctx.studyPlanRows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 text-xs text-[#8a8578]">{row.label}</dt>
            <dd
              className={`min-w-0 text-right text-sm font-medium ${
                row.value === NEUTRAL ? "text-[#a8a297]" : "text-[#2f2c26]"
              }`}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  if (id === "schoolEnglish" || id === "work") {
    if (items.length === 0) return <Neutral />;
    return (
      <dl className="mt-4 space-y-2.5">
        {items.slice(0, 5).map((it, i) => (
          <div key={i} className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
            <dt className="shrink-0 text-xs text-[#8a8578] sm:w-24">{it.label}</dt>
            <dd
              className={`text-sm ${
                it.certainty === "inferred" ? "text-[#8a8578]" : "text-[#2f2c26]"
              }`}
            >
              {clip(firstPhrase(it.value), 40)}
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  if (id === "lifestyle") {
    if (items.length === 0) return <Neutral />;
    return (
      <div className="mt-4 flex flex-wrap gap-2">
        {items.slice(0, 6).map((it, i) => (
          <span
            key={i}
            className="rounded-lg bg-[#eef2e8] px-3 py-1.5 text-[13px] leading-snug text-[#3f3a34]"
          >
            {clip(firstPhrase(it.value), 18)}
          </span>
        ))}
      </div>
    );
  }

  if (id === "worries") {
    if (items.length === 0) return <Neutral />;
    return (
      <ul className="mt-4 space-y-2">
        {items.slice(0, 3).map((it, i) => (
          <li
            key={i}
            className="border-l-2 border-[#e0d3b8] pl-3 text-sm leading-relaxed text-[#3f3a34]"
          >
            {clip(firstSentence(it.value), 60)}
          </li>
        ))}
      </ul>
    );
  }

  // decision
  const stageItem = items.find((it) => it.label === "検討段階") ?? items[0] ?? null;
  const otherItems = items.filter((it) => it !== stageItem);
  return (
    <div className="mt-4">
      {stageItem ? (
        <p className="text-[15px] font-medium leading-relaxed text-[#2f2c26] sm:text-base">
          {clip(firstPhrase(stageItem.value), 40)}
        </p>
      ) : (
        <p className="text-sm text-[#a8a297]">{NEUTRAL}</p>
      )}

      {otherItems.length > 0 && (
        <dl className="mt-3 space-y-1.5">
          {otherItems.slice(0, 2).map((it, i) => (
            <div key={i} className="flex items-baseline gap-3 text-xs">
              <dt className="shrink-0 text-[#8a8578]">{it.label}</dt>
              <dd className="text-[#3f3a34]">{clip(firstPhrase(it.value), 30)}</dd>
            </div>
          ))}
        </dl>
      )}

      {ctx.proposalCount > 0 && (
        <p className="mt-3 text-xs text-[#8a8578]">学校候補 {ctx.proposalCount}件</p>
      )}

      {ctx.conflictCount > 0 && (
        <p className="mt-3 rounded-xl bg-[#f6efe4] px-4 py-3 text-xs leading-relaxed text-[#6f6a64]">
          チャットとワークシートで少し違う内容があるようです。AIに相談しながら整理できます。
        </p>
      )}

      <Link
        href={`/plans/${ctx.planId}/chat`}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#161616] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#000]"
      >
        AIに相談する
        <ArrowRightIcon className="h-4 w-4" />
      </Link>
    </div>
  );
}
