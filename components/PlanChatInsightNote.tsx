import { firstPhrase, firstSentence } from "@/lib/planHeroImage";
import type { BlockName, Karte } from "@/lib/karte";

/**
 * Plan Chat（/plans/[planId]/chat）右側の付箋メモ「会話から見えてきたこと」（presentation のみ）。
 *
 * 重要: 要約を新しく作らない・新しい API を叩かない。既存の Karte から **本人が明言した事実
 * （certainty === "stated"）だけ** を拾い、機械的に短くして最大 3 つの付箋チップにするだけ。
 * - inferred / unknown は使わない
 * - motivation.trueGoalHypothesis は使わない（常に仮説）
 * - handoff.conflicts に載っている項目（Chat と Worksheet で食い違い）は使わない
 * 拾える stated 事実が 1 つも無ければ、desktop では空状態メッセージ、mobile/tablet の inline では
 * 何も描かない（会話の邪魔をしない）。
 */

/** 小さな葉のアイコン。ヘッダーのピル・フッター文・付箋の装飾で共用する。 */
export function LeafIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M20 4c0 8-4.5 13-11 13a7 7 0 0 1-1-.07C8.6 12 12.2 8.2 17 6.7 12.9 7.6 8.9 10 6.6 14.3 4.4 12.2 4 7.9 5 4c3 .9 6 .5 9-.3S18 3.1 20 4Z" />
      <path d="M4 20c1.5-4 3.4-6.6 6-8.4" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" fill="none" />
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

/** 付箋の下の芽（装飾）。 */
function SproutDoodleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 20v-7" />
      <path d="M12 13c0-3 2-5 6-5 0 3-2 5-6 5Z" />
      <path d="M12 15c0-2.6-1.7-4.5-5-4.5 0 2.6 1.7 4.5 5 4.5Z" />
    </svg>
  );
}

/**
 * 会話の区切りの装飾行。参考デザインの「ひとつずつ、言葉にしよう」＋両側の点線＋鉛筆。
 * 固定の UI コピーで、手書きフォントは使わず serif italic のみ。装飾なので aria-hidden。
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

/** チップ 1 つの元になる stated 事実の探索順と、機械的な短縮の仕方。 */
const FACT_SOURCES: { block: BlockName; key: string; shorten: (v: string) => string }[] = [
  { block: "schoolPrefs", key: "preferredCity", shorten: (v) => clip(firstPhrase(v), 18) },
  { block: "motivation", key: "statedGoal", shorten: (v) => clip(firstSentence(v), 28) },
  { block: "timing", key: "departureTiming", shorten: (v) => clip(firstPhrase(v), 20) },
  { block: "decision", key: "topConcern", shorten: (v) => clip(firstSentence(v), 26) },
  { block: "lifestyle", key: "cityVsNature", shorten: (v) => clip(firstSentence(v), 22) },
  { block: "decision", key: "stage", shorten: (v) => clip(firstSentence(v), 22) },
];

/** 末尾を機械的に詰めるだけ（AI 要約はしない）。 */
function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function statedFacts(karte: Karte): string[] {
  const conflicts = karte.handoff?.conflicts ?? [];
  const out: string[] = [];
  for (const src of FACT_SOURCES) {
    if (out.length >= 3) break;
    const block = karte[src.block] as Record<string, { value: unknown; certainty: string }> | undefined;
    const field = block?.[src.key];
    if (!field || field.certainty !== "stated") continue;
    if (typeof field.value !== "string" || field.value.trim().length === 0) continue;
    if (conflicts.some((c) => c.block === src.block && c.key === src.key)) continue;
    const text = src.shorten(field.value);
    if (text.length > 0 && !out.includes(text)) out.push(text);
  }
  return out;
}

export default function PlanChatInsightNote({
  karte,
  variant = "sticky",
}: {
  karte: Karte;
  /** "sticky": desktop 右カラム（少し傾ける・空でも空状態を出す）。"inline": tablet/mobile（傾けない・空なら描かない）。 */
  variant?: "sticky" | "inline";
}) {
  const facts = statedFacts(karte);

  if (variant === "inline" && facts.length === 0) return null;

  return (
    <div
      className={`relative rounded-[4px] border border-[#e7dccb] bg-[#fbf3da] px-5 pb-6 pt-7 shadow-[0_6px_18px_rgba(60,50,25,0.12)] ${
        variant === "sticky" ? "-rotate-[1.4deg]" : ""
      }`}
      style={{
        backgroundImage:
          "repeating-linear-gradient(0deg, transparent, transparent 25px, rgba(120,95,45,0.05) 26px)",
      }}
    >
      {/* 上のマスキングテープ（青）。装飾。 */}
      <span
        aria-hidden
        className="absolute -top-3 left-1/2 h-6 w-24 -translate-x-1/2 -rotate-3 rounded-[1px] bg-[#9db9d8]/70 shadow-[0_1px_2px_rgba(40,60,90,0.15)]"
      />

      <p className="text-center text-[15px] font-bold text-[#25324a]">会話から見えてきたこと</p>
      <svg
        aria-hidden
        viewBox="0 0 120 8"
        className="mx-auto mt-1 h-2 w-28 text-[#8ba086]"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      >
        <path d="M2 5c14-5 28-5 42 0s28 5 42 0 24-3 32-1" />
      </svg>

      {facts.length === 0 ? (
        <p className="mt-4 text-[13px] leading-6 text-[#7c745f]">
          会話を続けると、ここに考えが整理されていきます。
        </p>
      ) : (
        <>
          <p className="mt-4 text-[12px] font-medium text-[#8a7f66]">あなたが話したこと</p>
          <ul className="mt-2 flex flex-col gap-2">
            {facts.map((fact, i) => (
              <li
                key={fact}
                className={`self-start rounded-[3px] border border-[#c6d4e6] bg-[#e9f0f8] px-2.5 py-1.5 text-[12.5px] leading-snug text-[#33465f] shadow-[0_1px_2px_rgba(45,60,85,0.08)] ${
                  i % 2 === 0 ? "-rotate-1" : "rotate-1"
                }`}
              >
                {fact}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* 下の芽（装飾）。 */}
      <SproutDoodleIcon className="absolute bottom-2 right-3 h-5 w-5 text-[#9bb28c]" />
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
