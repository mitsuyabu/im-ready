import { firstPhrase, firstSentence } from "@/lib/planHeroImage";
import type { BlockName, Karte } from "@/lib/karte";

/**
 * Plan Chat（/plans/[planId]/chat）右側のサマリーカード「会話から見えてきたこと」（presentation のみ）。
 *
 * 最新の共有画像に合わせて、以前の付箋（黄色い紙・青マスキングテープ・傾き・葉の落書き）をやめ、
 * 白〜ごく薄い生成りのシンプルなカードにしている。
 *
 * 重要: 要約を新しく作らない・新しい API を叩かない。既存の Karte から **本人が明言した事実
 * （certainty === "stated"）だけ** を拾い、機械的に短くして最大 3 つのチップにするだけ。
 * - inferred / unknown は使わない
 * - motivation.trueGoalHypothesis は使わない（常に仮説）
 * - handoff.conflicts に載っている項目（Chat と Worksheet で食い違い）は使わない
 * 拾える stated 事実が 1 つも無ければ、desktop（sticky）では空状態メッセージ、
 * mobile/tablet の inline では何も描画しない（会話の邪魔をしない）。
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
  /** "sticky": desktop 右カラム（空でも空状態を出す）。"inline": tablet/mobile（空なら描かない）。見た目は同じシンプルな白カード。 */
  variant?: "sticky" | "inline";
}) {
  const facts = statedFacts(karte);

  if (variant === "inline" && facts.length === 0) return null;

  return (
    <div className="rounded-[16px] border border-[#8f8b84] bg-[#fffdf9] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      {/* title row: 吹き出しアイコン + 見出し（左揃え） */}
      <div className="flex items-center gap-2">
        <SpeechBubbleIcon className="h-5 w-5 shrink-0 text-[#57544e]" />
        <p className="text-base font-medium text-[#3c3a36]">会話から見えてきたこと</p>
      </div>

      {/* title 下の細い divider（以前の手書き風波線は廃止） */}
      <div className="mt-3 border-t border-[#cfcac2]" />

      {facts.length === 0 ? (
        <p className="mt-3 text-sm leading-6 text-[#77736d]">
          会話を続けると、ここに考えが整理されていきます。
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm text-[#77736d]">あなたが話したこと</p>
          <ul className="mt-3 space-y-3">
            {facts.map((fact) => (
              <li
                key={fact}
                className="rounded-xl border border-[#ddd8cf] bg-[#fbfaf6] px-3 py-2 text-sm font-normal leading-snug text-[#403d38]"
              >
                {fact}
              </li>
            ))}
          </ul>
        </>
      )}
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
