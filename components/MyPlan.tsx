import Link from "next/link";
import type { Karte } from "@/lib/karte";
import { buildMyPlanSections, buildPlanSummary, type MyPlanSection } from "@/lib/myPlanSections";

/** PCで短いlabel/valueが多いセクションだけ2列にする（長文valueが多いセクションは対象外） */
const TWO_COLUMN_SECTION_IDS = new Set(["studyPlan", "work"]);

/**
 * My Plan本体。Karteを直接編集するUIは持たない（閲覧専用）。
 * stated/inferred/unknownという内部用語はユーザーには一切出さず、
 * unknownのfieldとitemsが0件のセクションはそもそも描画しない。
 */
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
  const conflictCount = karte.handoff.conflicts.length;
  const proposalCount = karte.proposals.presented.length;

  if (!hasAnyContent) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-24">
        <h1 className="text-2xl font-bold text-worksheet-primary sm:text-3xl">My Plan</h1>
        <p className="mt-6 text-base font-medium text-worksheet-primary">まだ整理されていません。</p>
        <p className="mt-3 text-sm leading-relaxed text-worksheet-secondary">
          AIに相談したり、I&apos;m ready!に答えると
          <br className="hidden sm:block" />
          My Planが少しずつ育っていきます。
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link
            href={`/plans/${planId}/chat`}
            className="inline-flex items-center rounded-full bg-worksheet-accent px-5 py-2.5 text-sm font-medium text-worksheet-accent-contrast transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
          >
            AIに相談する
          </Link>
          <Link
            href={`/plans/${planId}/worksheet`}
            className="inline-flex items-center rounded-full border border-worksheet-border px-5 py-2.5 text-sm font-medium text-worksheet-primary transition-colors duration-150 hover:bg-worksheet-sage"
          >
            テーマから整理する
          </Link>
        </div>
      </div>
    );
  }

  const visibleSections = sections.filter(
    (section) => section.items.length > 0 || (section.id === "why" && trueGoalHypothesis),
  );
  const planSummary = buildPlanSummary(karte);
  const hasSummary = planSummary.chips.length > 0 || planSummary.leaningSentence !== null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-2xl font-bold text-worksheet-primary sm:text-3xl">My Plan</h1>
      <p className="mt-1 text-sm text-worksheet-secondary">{planTitle}</p>

      {hasSummary && (
        <div className="mt-6 rounded-2xl bg-worksheet-sage/25 p-5 sm:mt-8 sm:p-6">
          <p className="text-xs font-medium text-worksheet-secondary">Your Plan at a glance</p>

          {planSummary.chips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 sm:gap-x-6">
              {planSummary.chips.map((chip) => (
                <span key={chip.key} className="text-base font-semibold text-worksheet-primary sm:text-lg">
                  {chip.text}
                </span>
              ))}
            </div>
          )}

          {planSummary.leaningSentence && (
            <p className="mt-3 text-sm leading-relaxed text-worksheet-primary sm:text-base">
              {planSummary.leaningSentence}
            </p>
          )}
        </div>
      )}

      <div className={`divide-y divide-worksheet-border ${hasSummary ? "mt-8 sm:mt-10" : "mt-10"}`}>
        {visibleSections.map((section, index) => (
          <SectionBlock
            key={section.id}
            number={index + 1}
            section={section}
            trueGoalHypothesis={section.id === "why" ? trueGoalHypothesis : null}
            proposalCount={section.id === "decision" ? proposalCount : 0}
            conflictCount={section.id === "decision" ? conflictCount : 0}
            planId={planId}
          />
        ))}
      </div>
    </div>
  );
}

function SectionBlock({
  number,
  section,
  trueGoalHypothesis,
  proposalCount,
  conflictCount,
  planId,
}: {
  number: number;
  section: MyPlanSection;
  trueGoalHypothesis: string | null;
  proposalCount: number;
  conflictCount: number;
  planId: string;
}) {
  // Why?はサービスの中心なので本文を少し大きく・幅を狭めて読みやすくする。My Goalはそれに次ぐ程度。
  // それ以外のnarrativeセクション（Worries）は既存のまま。
  const narrativeBodyClassName =
    section.id === "why"
      ? "mt-2 max-w-xl text-base leading-loose text-worksheet-primary sm:text-lg"
      : section.id === "goal"
        ? "mt-1.5 max-w-2xl text-sm leading-relaxed text-worksheet-primary sm:text-base"
        : "mt-1.5 text-sm leading-relaxed text-worksheet-primary sm:text-base";

  const isTwoColumn = TWO_COLUMN_SECTION_IDS.has(section.id);
  const hasExtras = proposalCount > 0 || conflictCount > 0;

  return (
    <section className="py-8 first:pt-0 sm:py-10">
      <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-worksheet-sage px-1.5 text-[11px] font-semibold text-worksheet-primary">
        {String(number).padStart(2, "0")}
      </span>
      <h2 className="mt-2 text-xl font-bold text-worksheet-primary sm:text-2xl">{section.enName}</h2>
      <p className="mt-1 text-sm text-worksheet-secondary">{section.subtitle}</p>

      {section.mode === "facts" ? (
        isTwoColumn ? (
          // 短いlabel/valueが多いセクションだけ、PCでは2列gridにする（区切り線は使わず余白だけで揃える）
          <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            {section.items.map((item, i) => (
              <div key={i} className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
                <dt className="text-xs text-worksheet-secondary sm:w-28 sm:shrink-0 sm:text-sm">
                  {item.label}
                </dt>
                <dd
                  className={`text-sm sm:text-base ${
                    item.certainty === "inferred" ? "text-worksheet-secondary" : "text-worksheet-primary"
                  }`}
                >
                  {item.value}
                </dd>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 divide-y divide-worksheet-border/40">
            {section.items.map((item, i) => (
              <div key={i} className="flex flex-col gap-0.5 py-2.5 first:pt-0 sm:flex-row sm:gap-4">
                <dt className="text-xs text-worksheet-secondary sm:w-28 sm:shrink-0 sm:text-sm">
                  {item.label}
                </dt>
                <dd
                  className={`text-sm sm:text-base ${
                    item.certainty === "inferred" ? "text-worksheet-secondary" : "text-worksheet-primary"
                  }`}
                >
                  {item.value}
                </dd>
              </div>
            ))}
          </div>
        )
      ) : (
        <dl className="mt-5 space-y-6">
          {section.items.map((item, i) => (
            <div key={i}>
              <dt className="flex items-center gap-2">
                <span className="text-xs font-medium text-worksheet-secondary">{item.label}</span>
                {item.certainty === "inferred" && (
                  <span className="rounded-full bg-worksheet-sage/40 px-1.5 py-0.5 text-[10px] text-worksheet-secondary">
                    会話から
                  </span>
                )}
              </dt>
              <dd className={narrativeBodyClassName}>{item.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {trueGoalHypothesis && (
        <div className="mt-6 rounded-2xl bg-worksheet-sage/15 p-4 sm:p-5">
          <p className="text-[11px] font-medium text-worksheet-secondary">会話から見えてきたこと</p>
          <p className="mt-2 text-sm leading-relaxed text-worksheet-secondary sm:text-base">
            {trueGoalHypothesis}
          </p>
        </div>
      )}

      {hasExtras && (
        <div className="mt-8 space-y-4">
          {proposalCount > 0 && (
            <p className="text-sm text-worksheet-secondary">学校候補　{proposalCount}件</p>
          )}

          {conflictCount > 0 && (
            <div className="rounded-2xl border border-worksheet-border p-4 sm:p-5">
              <p className="text-sm font-medium text-worksheet-primary">確認したいことがあります</p>
              <p className="mt-1.5 text-sm leading-relaxed text-worksheet-secondary">
                チャットとワークシートで少し違う内容があるようです。AIに相談しながら整理できます。
              </p>
              <Link
                href={`/plans/${planId}/chat`}
                className="mt-3 inline-flex items-center rounded-full bg-worksheet-accent px-4 py-2 text-xs font-medium text-worksheet-accent-contrast transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
              >
                AIに相談する
              </Link>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
