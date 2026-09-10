import { firstPhrase, firstSentence } from "@/lib/planHeroImage";
import type { BlockName, Karte } from "@/lib/karte";

/**
 * Plan Chat（/plans/[planId]/chat）右側のカード「いま分かっていること」（presentation のみ）。
 *
 * 役割: 「AI が今この相談から理解している要点を、ユーザーが確認する場所」。
 * 単語の羅列ではなく **ラベル + 値** の相談要約として表示する。
 *
 * 重要: 要約を新しく作らない・新しい API を叩かない。既存の Karte の structured field から
 * deterministic に生成する:
 * - certainty === "stated" だけ（inferred / unknown は使わない＝AI の推測に見せない）
 * - motivation.trueGoalHypothesis は使わない（常に仮説）
 * - handoff.conflicts に載っている field（Chat と Worksheet で食い違い中）は使わない
 * - 値は firstPhrase / firstSentence で機械的に短くするだけ（AI 要約なし）
 * - 意味のある項目が 2 件未満なら **カード自体を描画しない**（会話の邪魔をしない）。
 *   呼び出し側（Chat.tsx）は hasPlanChatInsights() で aside ごと出し分ける。
 */

/** 小さな葉のアイコン。ヘッダーのピル・サジェストチップ・フッター文で共用する。 */
export function LeafIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M20 4c0 8-4.5 13-11 13a7 7 0 0 1-1-.07C8.6 12 12.2 8.2 17 6.7 12.9 7.6 8.9 10 6.6 14.3 4.4 12.2 4 7.9 5 4c3 .9 6 .5 9-.3S18 3.1 20 4Z" />
      <path d="M4 20c1.5-4 3.4-6.6 6-8.4" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** 吹き出しのアウトラインアイコン（サマリーカードのタイトル左）。 */
function SpeechBubbleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-4 3.5V16H5.5A1.5 1.5 0 0 1 4 14.5Z" />
    </svg>
  );
}

/** 鉛筆の走り書き（会話の区切りの装飾）。 */
function PencilDoodleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 20l3.5-1 10-10a2 2 0 0 0-3-3l-10 10L4 20Z" />
      <path d="M13.5 6.5l3 3" />
    </svg>
  );
}

/**
 * 会話の区切りの装飾行。参考デザインの「ひとつずつ、言葉にしよう」＋両側の点線＋鉛筆。
 * 固定の UI コピーで、手書きフォントは使わず serif italic のみ。装飾なので aria-hidden。
 * （最新画像でも一致しているため変更しない。）
 */
export function PlanChatDivider() {
  return (
    <div aria-hidden className="flex items-center gap-3 py-1 text-[#b3a98f]">
      <span className="h-px flex-1 border-t border-dotted border-[#cabfa7]" />
      <span className="shrink-0 font-serif text-[15px] italic text-[#9a8f75]">
        ひとつずつ、言葉にしよう
      </span>
      <PencilDoodleIcon className="h-4 w-4 shrink-0 text-[#a89e84]" />
      <span className="h-px flex-1 border-t border-dotted border-[#cabfa7]" />
    </div>
  );
}

export type PlanChatInsightItem = { label: string; value: string };

/**
 * ラベル ＋ 値 1 行の元になる stated field。上から優先順位（§11）。
 * candidates は「同じ意味の field を上から順に探し、最初に stated なものを 1 行にする」。
 * 意味が明確に対応するものだけ（曖昧なら入れない・§10）。
 */
const INSIGHT_SOURCES: {
  label: string;
  candidates: { block: BlockName; key: string }[];
  shorten: (v: string) => string;
}[] = [
  { label: "行き先", candidates: [{ block: "schoolPrefs", key: "preferredCity" }], shorten: (v) => clip(firstPhrase(v), 24) },
  { label: "出発時期", candidates: [{ block: "timing", key: "departureTiming" }], shorten: (v) => clip(firstPhrase(v), 22) },
  {
    label: "留学の目的",
    candidates: [
      { block: "motivation", key: "statedGoal" },
      { block: "motivation", key: "desiredOutcome" },
    ],
    shorten: (v) => clip(firstSentence(v), 44),
  },
  { label: "英語力", candidates: [{ block: "language", key: "selfLevel" }], shorten: (v) => clip(firstSentence(v), 44) },
  { label: "学校の希望", candidates: [{ block: "schoolPrefs", key: "courseType" }], shorten: (v) => clip(firstSentence(v), 40) },
  { label: "滞在方法", candidates: [{ block: "schoolPrefs", key: "accommodation" }], shorten: (v) => clip(firstPhrase(v), 24) },
  { label: "仕事の希望", candidates: [{ block: "work", key: "postReturnCareer" }], shorten: (v) => clip(firstSentence(v), 40) },
  { label: "一番の不安", candidates: [{ block: "decision", key: "topConcern" }], shorten: (v) => clip(firstSentence(v), 44) },
  { label: "今考えている段階", candidates: [{ block: "decision", key: "stage" }], shorten: (v) => clip(firstSentence(v), 40) },
];

const MAX_INSIGHT_ITEMS = 6;

/** 末尾を機械的に詰めるだけ（AI 要約はしない）。 */
function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** Karte の stated・非 conflict field から、ラベル付きの相談要点を優先順位順に最大 6 件。 */
export function statedInsights(karte: Karte): PlanChatInsightItem[] {
  const conflicts = karte.handoff?.conflicts ?? [];
  const out: PlanChatInsightItem[] = [];
  for (const src of INSIGHT_SOURCES) {
    if (out.length >= MAX_INSIGHT_ITEMS) break;
    for (const c of src.candidates) {
      const block = karte[c.block] as
        | Record<string, { value: unknown; certainty: string }>
        | undefined;
      const field = block?.[c.key];
      if (!field || field.certainty !== "stated") continue;
      if (typeof field.value !== "string" || field.value.trim().length < 2) continue;
      if (conflicts.some((cf) => cf.block === c.block && cf.key === c.key)) continue;
      const value = src.shorten(field.value);
      if (value.trim().length < 2) continue;
      out.push({ label: src.label, value });
      break; // 1 source = 1 行
    }
  }
  return out;
}

/** 2 件以上の意味ある要点があるか（§13: 0〜1 件ならパネルごと非表示）。 */
export function hasPlanChatInsights(karte: Karte): boolean {
  return statedInsights(karte).length >= 2;
}

export default function PlanChatInsightNote({
  karte,
}: {
  karte: Karte;
  /** 呼び出し側の互換のため受け取るだけ（sticky / inline で描画は同一）。 */
  variant?: "sticky" | "inline";
}) {
  const items = statedInsights(karte);

  // 2 件未満なら "確認パネル" として弱いので描かない（§13）。呼び出し側も aside ごと出し分ける。
  if (items.length < 2) return null;

  return (
    <div className="rounded-[16px] border border-[#8f8b84] bg-[#fffdf9] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="flex items-center gap-2">
        <SpeechBubbleIcon className="h-5 w-5 shrink-0 text-[#57544e]" />
        <p className="text-base font-medium text-[#3c3a36]">いま分かっていること</p>
      </div>
      <p className="mt-1 text-[12px] leading-5 text-[#8a857d]">
        会話の内容から、今の希望や条件を整理しています。
      </p>

      <div className="mt-3 border-t border-[#cfcac2]" />

      {/* ラベル ＋ 値。大 pill の羅列ではなく、divider 区切りの compact な相談要約（§14 / §15）。 */}
      <dl className="mt-1 divide-y divide-[#eae4d9]">
        {items.map((it) => (
          <div key={it.label} className="py-2.5">
            <dt className="text-[11px] font-medium tracking-wide text-[#8a857d]">{it.label}</dt>
            <dd className="mt-0.5 text-[15px] font-medium leading-snug text-[#3c3a36]">{it.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * composer 上のサジェストチップの固定 UI コピー（既存のサジェスト機能は無いため、この 3 つを使う）。
 * 押すと handleQuickStart 相当で入力欄に文言を入れるだけ。API 挙動は変えない。
 */
export const PLAN_CHAT_SUGGESTIONS = [
  "気持ちを整理する",
  "不安を話す",
  "留学以外の選択肢も考える",
] as const;
