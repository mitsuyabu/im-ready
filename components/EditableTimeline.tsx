"use client";

import { useState } from "react";
import type { PlanTimeline } from "@/lib/planBlueprint";
import { requestPlanTimeline, savePlanTimeline } from "@/lib/planBlueprintClient";

/**
 * My Plan「Timeline」セクション（Step 2-5 / 2-7）。
 *
 *   1. 未採用            : 空状態 ＋「AIにプランを提案してもらう」
 *   2. AI 提案 preview   : 「AIからの提案」「まだMy Planには保存されていません」＋
 *                          [このスケジュールを採用] [もう一度提案する] [提案を閉じる]
 *   3. 採用済み Timeline : 通常の Timeline 表示 ＋ 小さく「AIに別のプランを提案してもらう」
 *
 * AI は My Plan を勝手に書き換えない。採用（保存）は save_plan_blueprint_timeline RPC のみで、
 * data セクションには一切触れない。採用済みがある状態で新提案を採用するときは置き換え確認を挟む。
 */

/* ---- 縦 Timeline の共通表示（採用済み / preview で使い回す） ---- */
function TimelineView({ timeline }: { timeline: PlanTimeline }) {
  return (
    <div>
      {timeline.summary && (
        <p className="text-sm leading-relaxed text-[#3f3a34]">{timeline.summary}</p>
      )}
      {timeline.durationLabel && (
        <p className="mt-1 text-xs text-[#8a8578]">{timeline.durationLabel}</p>
      )}
      <ol className="mt-4 space-y-4 border-l border-[#d7dde6] pl-4">
        {timeline.periods.map((p) => (
          <li key={p.id} className="relative">
            <span
              aria-hidden
              className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-[#3a5266] bg-white"
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
            {p.reason && (
              <p className="mt-1 text-xs leading-relaxed text-[#6b7686]">
                <span className="text-[#98a1ac]">なぜこの時期か：</span>
                {p.reason}
              </p>
            )}
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

const CTA_BASE =
  "inline-flex min-h-[40px] w-full items-center justify-center rounded-full px-5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto";

export default function EditableTimeline({
  planId,
  initialTimeline,
  canGenerate,
}: {
  planId: string;
  initialTimeline: PlanTimeline | null;
  /** blueprint available ＋ 材料あり。false のとき生成 CTA は disabled ＋ 誘導文（§57）。 */
  canGenerate: boolean;
}) {
  const [timeline, setTimeline] = useState<PlanTimeline | null>(initialTimeline);
  const [preview, setPreview] = useState<PlanTimeline | null>(null);
  const [busy, setBusy] = useState<"generate" | "adopt" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  async function generate() {
    setBusy("generate");
    setError(null);
    setHint(null);
    const res = await requestPlanTimeline(planId);
    setBusy(null);
    if (res.ok) {
      setPreview(res.timeline);
      setConfirming(false);
      return;
    }
    if (res.reason === "empty") {
      setHint(
        "まずGoalsや行き先などを少し追加すると、より具体的なプランを提案できます。",
      );
    } else if (res.reason === "unavailable") {
      setError("いまはプランを作成できません。しばらくしてから再度お試しください。");
    } else {
      setError("プランを作成できませんでした。もう一度お試しください。");
    }
  }

  async function adopt() {
    if (!preview) return;
    if (timeline && !confirming) {
      setConfirming(true);
      return;
    }
    setBusy("adopt");
    setError(null);
    const res = await savePlanTimeline(planId, preview, null);
    setBusy(null);
    if (!res.ok) {
      setError(
        res.reason === "stale"
          ? "ほかで更新があったようです。ページを再読み込みしてください。"
          : "保存できませんでした。もう一度お試しください。",
      );
      return;
    }
    setTimeline(res.timeline ?? preview);
    setPreview(null);
    setConfirming(false);
  }

  /* -------------------- AI 提案 preview -------------------- */
  if (preview) {
    return (
      <div className="mt-4">
        <div className="rounded-xl border border-[#cdd6e2] bg-[#eef2f7] p-4 sm:p-5">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-[#4a5c72]">AIからの提案</p>
          <p className="mt-0.5 text-[11px] text-[#8a949f]">まだMy Planには保存されていません</p>
          <div className="mt-4">
            <TimelineView timeline={preview} />
          </div>
        </div>

        {confirming && (
          <div className="mt-3 rounded-xl border border-[#e0d9ca] bg-[#faf7f0] p-3">
            <p className="text-sm text-[#172033]">
              現在のスケジュールを、この提案に置き換えますか？
            </p>
            <p className="mt-1 text-xs text-[#8a8578]">前のスケジュールは残りません。</p>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={adopt}
            disabled={busy !== null}
            className={`${CTA_BASE} bg-[#1e2b3d] text-white hover:bg-[#172033]`}
          >
            {busy === "adopt"
              ? "保存しています…"
              : confirming
                ? "置き換える"
                : "このスケジュールを採用"}
          </button>
          {confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy !== null}
              className={`${CTA_BASE} border border-[#c9c2b4] bg-white text-[#3f3a34] hover:bg-[#f2efe7]`}
            >
              キャンセル
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={generate}
                disabled={busy !== null}
                className={`${CTA_BASE} border border-[#bcd0e0] bg-white text-[#33506a] hover:bg-[#e3eef5]`}
              >
                {busy === "generate" ? "プランを考えています…" : "もう一度提案する"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreview(null);
                  setError(null);
                }}
                disabled={busy !== null}
                className={`${CTA_BASE} text-[#6f6a64] hover:bg-[#f0ece2]`}
              >
                提案を閉じる
              </button>
            </>
          )}
        </div>
        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  /* -------------------- 採用済み Timeline -------------------- */
  if (timeline) {
    return (
      <div className="mt-4">
        <TimelineView timeline={timeline} />
        <div className="mt-5">
          <button
            type="button"
            onClick={generate}
            disabled={busy !== null || !canGenerate}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#bcd0e0] bg-[#eef3f7] px-3.5 py-1.5 text-[13px] font-medium text-[#33506a] transition-colors hover:bg-[#e3eef5] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "generate" ? "プランを考えています…" : "AIに別のプランを提案してもらう"}
          </button>
        </div>
        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
        {hint && <p className="mt-3 text-xs text-[#8a8578]">{hint}</p>}
      </div>
    );
  }

  /* -------------------- 空状態 -------------------- */
  return (
    <div className="mt-4">
      <p className="text-sm font-medium text-[#3f3a34]">まだスケジュールはありません。</p>
      <p className="mt-2 text-sm leading-relaxed text-[#6f6a64]">
        今のMy Planをもとに、AIが留学期間全体の過ごし方を提案できます。
      </p>
      <div className="mt-4">
        <button
          type="button"
          onClick={generate}
          disabled={busy !== null || !canGenerate}
          className={`${CTA_BASE} bg-[#1e2b3d] text-white hover:bg-[#172033]`}
        >
          {busy === "generate" ? "プランを考えています…" : "AIにプランを提案してもらう"}
        </button>
      </div>
      {!canGenerate && !hint && (
        <p className="mt-3 text-xs leading-relaxed text-[#8a8578]">
          まずGoalsや行き先などを少し追加すると、AIがプランを提案できます。
        </p>
      )}
      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      {hint && <p className="mt-3 text-xs text-[#8a8578]">{hint}</p>}
    </div>
  );
}
