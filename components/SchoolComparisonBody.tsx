import Image from "next/image";
import Link from "next/link";
import {
  parseSchoolComparisonBodyView,
  type SchoolComparisonBodySchool,
} from "@/lib/schoolComparisonBodyView";
import { SCHOOL_COMPARISON_DEFAULT_TITLE } from "@/lib/schoolComparisonFormatter";
import DocumentPlainText from "@/components/DocumentPlainText";

/**
 * School Comparison 本文の表示。共有デザインの「候補校の比較ダッシュボード」に寄せて、
 * 上部に候補校カード（01〜03）＋「あなたが大切にしている条件」チップ、下部を
 * 2 カラム（左＝比較テーブル / 右＝確認したいこと）で見せる。
 *
 * 本文そのものは一切加工しない:
 *  - lib/schoolComparisonBodyView.ts（parseSchoolComparisonBodyView）で構造化するだけ
 *    （要約・言い換え・並べ替え・補完・ranking・score・○△× は一切しない）
 *  - parser が null なら元 body 全文を DocumentPlainText で完全 fallback（部分 table 化しない）
 *  - schools master / 最新 Karte は読まない。保存済み本文の値だけで組む（snapshot）
 *  - 「条件に合っている」バッジは、fit の verdict とテーブル項目ラベルが完全一致したときだけ出す
 *    （データに無い match 判定は作らない）
 *
 * 候補校カード（01〜03）は共有画像（public/school-comparison-cards/*.webp）を背景に使い、
 * 番号・学校アイコン・波線・背景色・texture は画像側が持つ（コードでは描かない）。
 * フォントは他画面と統一して基本 sans。hooks を持たない純粋表示コンポーネント。
 */

const TABLE_ANCHOR = "school-comparison-table";

function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? value.trim() : null;
  } catch {
    return null;
  }
}

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
const YenIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <path d="M7 5l5 7 5-7M12 12v7M8.5 14h7M8.5 17h7" />
  </svg>
);
const ChevronRightIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);
const ArrowRightIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
/* ---- 条件チップ用の内容別アイコン（decorative・aria-hidden。意味の推測は表示時の選択のみ） ---- */
const WaveIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <path d="M3 8c1.8 0 1.8 2 3.6 2S8.4 8 10.2 8 12 10 13.8 10 15.6 8 17.4 8 19.2 10 21 10M3 14c1.8 0 1.8 2 3.6 2s1.8-2 3.6-2 1.8 2 3.6 2 1.8-2 3.6-2 1.8 2 3.6 2" />
  </svg>
);
const GroupIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3.5 19c.6-3 2.9-4.5 5.5-4.5S13.9 16 14.5 19" />
    <path d="M16 8.2A2.6 2.6 0 0 1 16 14M17 14.6c2 .4 3.4 1.7 3.9 4" />
  </svg>
);
const SpeechIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v8a1.5 1.5 0 0 1-1.5 1.5H9l-4 3.5V15H5.5A1.5 1.5 0 0 1 4 13.5Z" />
  </svg>
);
const ShieldIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <path d="M12 3.5 5 6v5c0 4.5 3 7.5 7 9.5 4-2 7-5 7-9.5V6Z" />
  </svg>
);
const BriefcaseIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <rect x="3.5" y="7.5" width="17" height="12" rx="2" />
    <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3.5 12.5h17" />
  </svg>
);
const TagIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <path d="M4 12V5a1 1 0 0 1 1-1h7l8 8-8 8-8-8Z" />
    <circle cx="8.5" cy="8.5" r="1.3" />
  </svg>
);
const CheckIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
const HelpIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7M12 17h.01" />
  </svg>
);

/**
 * 候補校カードの背景ビジュアル。共有された3枚のデザインカード画像をそのまま使う
 * （背景色・大きな 01〜03・学校アイコン・波線・texture・角丸はすべて画像側が持つ）。
 * index（＝候補校の並び順）で sage / blue / sand を割り当てるだけで、色に意味は持たせない。
 * 画像はいずれも 1676×938（同一比率）。
 */
const SCHOOL_CARD_IMAGE = [
  "/school-comparison-cards/school-01-sage.webp",
  "/school-comparison-cards/school-02-blue.webp",
  "/school-comparison-cards/school-03-sand.webp",
];

const TargetIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3.2" />
  </svg>
);

/**
 * verdict の見た目のみ（判定ロジック・文言は無変更）。色だけに依存させず必ずテキストを出す。
 * 強い赤・緑は使わず、落ち着いたトーンで差だけ付ける。
 */
function VerdictChip({ verdict }: { verdict: string }) {
  const base =
    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium";
  if (verdict === "条件に合っている") {
    return (
      <span className={`${base} border-[#d7e2cc] bg-[#eef3e8] text-[#526549]`}>
        <CheckIcon className="h-3 w-3" />
        {verdict}
      </span>
    );
  }
  if (verdict === "確認が必要") {
    return <span className={`${base} border-[#e5dac7] bg-[#f6f1e8] text-[#75644b]`}>{verdict}</span>;
  }
  return <span className={`${base} border-[#deddd8] bg-[#f2f2ef] text-[#77746d]`}>{verdict}</span>;
}

function FactValue({ value }: { value: string }) {
  const url = safeHttpUrl(value);
  if (url !== null) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="break-all text-[#1e2b3d] underline decoration-[#8a8578]/40 underline-offset-2 transition-colors hover:decoration-[#1e2b3d]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e2b3d]/40"
      >
        {value}
      </a>
    );
  }
  return <span className="whitespace-pre-wrap">{value}</span>;
}

function CardHeading({ children, accent }: { children: string; accent?: string }) {
  return (
    <h2 className="flex items-baseline gap-2 text-lg font-semibold text-[#172033]">
      {children}
      {accent && (
        <span aria-hidden className="text-xs font-medium tracking-wide text-[#b7b1a6]">
          / {accent}
        </span>
      )}
    </h2>
  );
}

/** 条件チップのニュアンス配色（sage / pale blue / beige / ivory）を順番に割り当てる。 */
const CRITERIA_CHIP = [
  { bg: "#eef2e8", border: "#dbe3d0" },
  { bg: "#e9eef3", border: "#d5dfe8" },
  { bg: "#f4efe4", border: "#e6dcc7" },
  { bg: "#faf8f2", border: "#e8e2d5" },
];

/** テーブル行の強弱づけ用（値の意味は解釈しない。行ラベルの見出し語だけで判定）。 */
const MONEY_LABEL_RE = /授業料|料金|費用|学費|入学金|コスト/;
const SOURCE_LABEL_RE = /参照|出典|ソース|source/i;

/**
 * 条件チップの「表示だけ」の整形（元データ view.criteria は変更しない）。
 * 文章調に見える末尾表現を機械的に削り、名詞句・条件語として見せる。AI 要約はしない。
 * 削れなかった / 短くなりすぎる場合は元の値のまま返す（verbatim フォールバック）。
 */
const CONDITION_TAIL_PHRASES = [
  "で暮らしてみたい",
  "で暮らしたい",
  "で学んでみたい",
  "で学びたい",
  "を大事にしたい",
  "を重視したい",
  "を伸ばしたい",
  "を身につけたい",
  "してみたい",
  "が気になる",
  "が希望です",
  "が希望",
  "が理想です",
  "が理想",
  "暮らしてみたい",
  "暮らしたい",
  "働いてみたい",
  "働きたい",
  "住んでみたい",
  "住みたい",
  "伸ばしたい",
  "学びたい",
  "したいです",
  "したい",
  "できたら",
  "ぐらい",
  "くらい",
  "程度",
];

function toConditionLabel(rawValue: string): string {
  const orig = rawValue.trim();
  let s = orig;
  let stripped = false;
  let keepGoing = true;
  while (keepGoing) {
    keepGoing = false;
    for (const tail of CONDITION_TAIL_PHRASES) {
      if (s.length > tail.length && s.endsWith(tail)) {
        s = s.slice(0, -tail.length);
        stripped = true;
        keepGoing = true;
        break;
      }
    }
  }
  if (stripped) {
    s = s.replace(/[、。，．・\s]+$/u, "");
    s = s.replace(/(を|が|で|に|へ|と|の|は)$/u, "");
    s = s.replace(/[、。，．・\s]+$/u, "");
  }
  s = s.trim();
  return s.length >= 2 ? s : orig;
}

/**
 * 金額系条件を「予算 100万円」のように、一目で何の金額か分かる簡潔表記へ（表示だけ）。
 * 数値が拾えなければ末尾表現だけ整える（toConditionLabel にフォールバック）。
 */
function toBudgetLabel(rawValue: string): string {
  const s = rawValue.trim();

  const manMatch = s.match(/(\d+(?:\.\d+)?)\s*万\s*円?/);
  if (manMatch) {
    const n = Number(manMatch[1]);
    if (Number.isFinite(n)) return `予算 ${Number.isInteger(n) ? n : manMatch[1]}万円`;
  }

  const yenMatch = s.match(/[¥￥]?\s*([\d,]{4,})\s*円?/);
  if (yenMatch) {
    const n = Number(yenMatch[1].replace(/,/g, ""));
    if (Number.isFinite(n) && n >= 10000) {
      return `予算 ${Math.round(n / 10000).toLocaleString("ja-JP")}万円`;
    }
  }

  return toConditionLabel(s);
}

/** ラベル or 値が金額系かどうか（表示整形の分岐用。判定基準は語のみ）。 */
function isBudgetCriteria(label: string, value: string): boolean {
  return (
    /予算|金額|費用|コスト|学費/.test(label) ||
    /[¥￥]|万円|\d{4,}\s*円|\d+\s*万/.test(value)
  );
}

/** 単語だけでは意味が閉じない曖昧トークン（「あり」だけ等）。 */
const VAGUE_TOKENS = new Set([
  "あり",
  "なし",
  "ある",
  "いる",
  "有",
  "無",
  "はい",
  "いいえ",
  "希望",
  "重視",
  "検討中",
  "可",
  "不可",
  "必要",
  "不要",
  "○",
  "×",
]);

/** 「X がある / X がいる …」→「Xあり」。既に「〜あり」で終わる値はそのまま。取れなければ null。 */
function extractHasNoun(value: string): string | null {
  const m = value
    .trim()
    .match(/^(.{1,14}?)(?:が(?:ある|いる|欲し|ほし)|があ|がい)/u);
  if (m && m[1] && !VAGUE_TOKENS.has(m[1])) return `${m[1]}あり`;
  const ends = value.trim().match(/^(.{2,15})(?:あり|なし)$/u);
  if (ends) return value.trim();
  return null;
}

/**
 * 条件チップの表示文言（表示だけ・保存値/parser は無変更・AI 要約なし）。
 * - 「X がある…」系 → 「Xあり」
 * - 文章調の末尾表現は toConditionLabel で機械的に削る
 * - 「あり」だけ等の曖昧トークンになったら、ラベルで補って「◯◯あり」/「◯◯」にする
 * - それでも意味が作れない、または長すぎる場合は null（＝チップに出さない）
 */
function toConditionChipText(label: string, value: string): string | null {
  const raw = value.trim();

  const hasNoun = extractHasNoun(raw);
  if (hasNoun && hasNoun.length <= 16) return hasNoun;

  let text = toConditionLabel(raw).trim();

  if (VAGUE_TOKENS.has(text) || text.length < 2) {
    const shortLabel = toConditionLabel(label).trim();
    if (shortLabel.length >= 2 && !VAGUE_TOKENS.has(shortLabel)) {
      text = /あり|ある|いる|はい|希望|重視/.test(raw) ? `${shortLabel}あり` : shortLabel;
    } else {
      return null;
    }
  }

  if (text.length < 2 || text.length > 18) return null;
  return text;
}

/** 条件の内容に応じたアイコンを選ぶ（表示時の選択のみ。ロジック・保存値は無変更）。 */
function pickCriteriaIcon(label: string, value: string) {
  const s = `${label} ${value}`;
  if (/予算|金額|費用|コスト|学費|万円|円/.test(s)) return YenIcon;
  if (/海|ビーチ|沿岸|暮らし|生活|住|自然|のんびり|落ち着/.test(s)) return WaveIcon;
  if (/多国籍|国際|いろんな国|色んな国|様々な国|グローバル|国籍|多様/.test(s)) return GroupIcon;
  if (/会話|英語力|話す|スピーキング|語学|リスニング|コミュ/.test(s)) return SpeechIcon;
  if (/治安|安心|安全|セキュリティ/.test(s)) return ShieldIcon;
  if (/仕事|就労|働|アルバイト|バイト|ワーホリ|ワーキングホリデー|インターン/.test(s))
    return BriefcaseIcon;
  if (/寮|ホームステイ|滞在|住まい|シェアハウス/.test(s)) return ShieldIcon;
  if (/日本人|サポート|支援/.test(s)) return GroupIcon;
  return TagIcon;
}

/** facts に出現するラベルを「最初に body に現れた順」で集める（sort しない）。 */
function orderedFactLabels(facts: SchoolComparisonBodySchool[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const school of facts) {
    for (const item of school.items) {
      if (!seen.has(item.label)) {
        seen.add(item.label);
        labels.push(item.label);
      }
    }
  }
  return labels;
}

function factValue(school: SchoolComparisonBodySchool, label: string): string | null {
  const item = school.items.find((i) => i.label === label);
  return item ? item.value : null;
}

export default function SchoolComparisonBody({ body, planId }: { body: string; planId: string }) {
  const view = parseSchoolComparisonBodyView(body);
  if (view === null) return <DocumentPlainText body={body} />;

  const preambleNotes = view.preamble.filter(
    (line) => line.trim().length > 0 && line.trim() !== SCHOOL_COMPARISON_DEFAULT_TITLE,
  );
  const factLabels = orderedFactLabels(view.facts);
  const topSchools = view.schools.slice(0, 3);

  // 条件チップ: 表示だけ整形（保存値・parser は無変更・AI 要約なし）。
  // - 金額系 → 「予算 100万円」
  // - 「X がある…」→「Xあり」、文章調の末尾表現は機械的に削る
  // - 「あり」だけ等の曖昧表示はラベルで補う／作れなければ除外
  // - 意味の通る短い文言（<=18文字）だけを、内容に応じたアイコン付きで最大4件表示
  const CRITERIA_MAX_LEN = 18;
  const criteriaChips = view.criteria
    .map((c) => {
      const isBudget = isBudgetCriteria(c.label, c.value);
      const text = isBudget ? toBudgetLabel(c.value) : toConditionChipText(c.label, c.value);
      const Icon = isBudget ? YenIcon : pickCriteriaIcon(c.label, c.value);
      return { text, Icon, raw: c.value };
    })
    .filter(
      (c): c is { text: string; Icon: typeof YenIcon; raw: string } =>
        typeof c.text === "string" && c.text.length >= 2 && c.text.length <= CRITERIA_MAX_LEN,
    )
    .slice(0, 4);

  // fit verdict をテーブルセルの淡緑バッジに使うための、学校名 → (ラベル → verdict) の完全一致マップ。
  const fitVerdictBySchool = new Map<string, Map<string, string>>();
  for (const school of view.fits) {
    const m = new Map<string, string>();
    for (const f of school.fits) m.set(f.label, f.verdict);
    fitVerdictBySchool.set(school.name, m);
  }
  const hasMatchBadge = (schoolName: string, label: string) =>
    fitVerdictBySchool.get(schoolName)?.get(label) === "条件に合っている";

  return (
    <div className="mt-8 space-y-10">
      {preambleNotes.length > 0 && (
        <div className="space-y-1 text-xs leading-relaxed text-[#8a8578]">
          {preambleNotes.map((line, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {line}
            </p>
          ))}
        </div>
      )}

      {/* 候補校カード 01〜03: 共有画像を背景ビジュアルとして使い、学校情報だけを上に重ねる */}
      {topSchools.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {topSchools.map((school, i) => {
            const cardImage = SCHOOL_CARD_IMAGE[i] ?? SCHOOL_CARD_IMAGE[0];
            const meta = [school.city, school.category].filter((v): v is string => Boolean(v));
            return (
              <a
                key={i}
                href={`#${TABLE_ANCHOR}`}
                className="group relative block aspect-[1676/938] overflow-hidden rounded-[20px] shadow-[0_1px_2px_rgba(30,28,24,0.06)] transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e2b3d]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fcfbf8]"
              >
                <Image
                  src={cardImage}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 92vw"
                  className="object-cover"
                  priority={i < 3}
                />
                {/* 学校名・英語名・都市名は動的データ（view.schools）で、背景画像には含めない。
                    番号（01/02/03）は背景画像の左上のまま。以下は画像の空きスペースへ重ねる:
                    - 学校名/英語名/都市名: カード左端の約30%から。左中央の学校アイコン(縦40〜54%)の上の帯に置き重ねない
                    - CTA: 学校アイコンの左端（約20%）に揃え、下部に配置 */}
                <div className="absolute inset-0">
                  {/* 学校名・日本語名・都市名は背景画像の学校イラスト（左端〜約36%）・番号・右の波線に
                      重ならないよう、テキストブロック全体を右へ寄せる（アイコン右端との間に明確な余白）。 */}
                  <div className="absolute left-[38%] right-[6%] top-[11%] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)] sm:left-[40%] sm:right-[8%]">
                    <p className="line-clamp-2 text-base font-semibold leading-snug sm:text-lg">
                      {school.name}
                    </p>
                    {school.nameJa && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-white/85">{school.nameJa}</p>
                    )}
                    {meta.length > 0 && (
                      <p className="mt-1 line-clamp-1 text-sm text-white/85">{meta.join(" ・ ")}</p>
                    )}
                  </div>
                  <span className="absolute bottom-[12%] left-[20%] inline-flex items-center gap-1 text-sm font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                    詳細を見る
                    <ArrowRightIcon className="h-3.5 w-3.5" />
                  </span>
                </div>
              </a>
            );
          })}
        </div>
      )}

      {/* あなたが大切にしている条件（内容別アイコン付きの、コンパクトな丸角カードチップ） */}
      {criteriaChips.length > 0 && (
        <div className="sm:flex sm:items-center sm:gap-4">
          <p className="shrink-0 text-xs font-semibold tracking-[0.12em] text-[#5f7050]">
            あなたが大切にしている条件
          </p>
          <div className="mt-3 flex flex-wrap gap-2.5 sm:mt-0">
            {criteriaChips.map((c, i) => {
              const chip = CRITERIA_CHIP[i % CRITERIA_CHIP.length];
              const Icon = c.Icon;
              return (
                <span
                  key={i}
                  style={{ backgroundColor: chip.bg, borderColor: chip.border }}
                  className="inline-flex items-center gap-2 rounded-[16px] border px-4 py-2.5 text-sm font-medium text-[#3a362f]"
                  title={c.raw}
                >
                  <Icon className="h-4 w-4 shrink-0 text-[#7d7767]" />
                  {c.text}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* 2カラム: 左=比較テーブル（主役・広め） / 右=確認したいこと（細め） */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8">
        <div className="min-w-0 space-y-6">
          {/* 学校ごとの比較 */}
          <section
            id={TABLE_ANCHOR}
            className="scroll-mt-6 rounded-[24px] border border-[#ece7dd] bg-white p-4 shadow-[0_1px_3px_rgba(30,28,24,0.04)] sm:p-5 lg:p-6"
          >
            <CardHeading accent="02">学校ごとの比較</CardHeading>

            {view.facts.length > 0 && factLabels.length > 0 ? (
              <>
                <div className="mt-5 hidden overflow-x-auto rounded-2xl border border-[#f0ebe0] md:block lg:overflow-x-visible">
                  <table className="w-full table-fixed border-collapse text-sm">
                    <thead>
                      <tr className="bg-[#faf8f2]">
                        <th
                          scope="col"
                          className="w-[18%] border-b border-[#f0ebe0] px-3 py-3 text-left text-xs font-semibold text-[#8a8578]"
                        >
                          比べること
                        </th>
                        {view.facts.map((school, i) => (
                          <th
                            key={i}
                            scope="col"
                            className="border-b border-l border-[#f0ebe0] px-3 py-3 text-center text-sm font-semibold leading-snug text-[#172033]"
                          >
                            {school.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {factLabels.map((label, ri) => {
                        const isMoney = MONEY_LABEL_RE.test(label);
                        const isSource = SOURCE_LABEL_RE.test(label);
                        return (
                          <tr key={ri} className="last:[&>*]:border-b-0">
                            <th
                              scope="row"
                              className="border-b border-[#f0ebe0] bg-[#fcfbf8] px-3 py-3 text-left align-top text-sm font-medium leading-relaxed text-[#4a4640]"
                            >
                              {label}
                            </th>
                            {view.facts.map((school, ci) => {
                              const value = factValue(school, label);
                              return (
                                <td
                                  key={ci}
                                  className="border-b border-l border-[#f0ebe0] px-3 py-3 align-top leading-relaxed text-[#2f2c26]"
                                >
                                  {value === null ? (
                                    <span className="text-[#c9c4b8]" aria-hidden>
                                      —
                                    </span>
                                  ) : (
                                    <span className="flex flex-col gap-1.5">
                                      <span
                                        className={
                                          isMoney
                                            ? "text-sm font-semibold text-[#172033]"
                                            : isSource
                                              ? "text-[11px] text-[#a09a8c]"
                                              : "text-sm leading-relaxed"
                                        }
                                      >
                                        <FactValue value={value} />
                                      </span>
                                      {hasMatchBadge(school.name, label) && (
                                        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-[#d7e2cc] bg-[#eef2e8] px-2 py-0.5 text-[10px] font-medium text-[#4a5b3e]">
                                          <CheckIcon className="h-2.5 w-2.5" />
                                          条件に合っている
                                        </span>
                                      )}
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-5 space-y-4 md:hidden">
                  {view.facts.map((school, i) => (
                    <div key={i} className="rounded-2xl border border-[#f0ebe0] bg-[#fcfbf8] p-4">
                      <p className="text-sm font-semibold text-[#172033]">{school.name}</p>
                      <dl className="mt-3 space-y-2.5">
                        {school.items.map((item, j) => {
                          const isMoney = MONEY_LABEL_RE.test(item.label);
                          const isSource = SOURCE_LABEL_RE.test(item.label);
                          return (
                            <div key={j} className="flex flex-col gap-0.5">
                              <dt className="text-xs font-medium text-[#8a8578]">{item.label}</dt>
                              <dd
                                className={
                                  isMoney
                                    ? "text-[15px] font-semibold leading-relaxed text-[#172033]"
                                    : isSource
                                      ? "text-xs leading-relaxed text-[#a09a8c]"
                                      : "text-sm leading-relaxed text-[#2f2c26]"
                                }
                              >
                                <FactValue value={item.value} />
                                {hasMatchBadge(school.name, item.label) && (
                                  <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-[#d7e2cc] bg-[#eef2e8] px-2 py-0.5 text-[10px] font-medium text-[#4a5b3e]">
                                    <CheckIcon className="h-2.5 w-2.5" />
                                    条件に合っている
                                  </span>
                                )}
                              </dd>
                            </div>
                          );
                        })}
                      </dl>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-5 text-sm text-[#8a8578]">
                比較できる項目は、まだ十分に整理されていません。
              </p>
            )}
          </section>

          {/* 比較結果を読むための補助カード（Desktop 広幅時は 2 列）。 */}
          {(view.fits.length > 0 || view.reasonMemoText.length > 0) && (
            <div
              className={`grid grid-cols-1 gap-5 ${
                view.fits.length > 0 && view.reasonMemoText.length > 0 ? "xl:grid-cols-2" : ""
              }`}
            >
              {/* A. 条件との合い方 */}
              {view.fits.length > 0 && (
                <section className="rounded-[20px] border border-[#e5e0d5] bg-[#fbfaf6] p-5 shadow-[0_1px_2px_rgba(30,28,24,0.03)] sm:p-6">
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-[#172033]">
                    <TargetIcon aria-hidden className="h-4 w-4 shrink-0 text-[#7a8a6d]" />
                    条件との合い方
                  </h2>
                  <p className="mt-1 text-sm text-[#7a756c]">
                    あなたが大切にしている条件との関係を確認できます。
                  </p>

                  <div className="mt-4 space-y-6">
                    {view.fits.map((school, i) => (
                      <div key={i}>
                        <p className="text-[13px] font-semibold tracking-wide text-[#8a8578]">
                          {school.name}
                        </p>
                        <div className="mt-2 space-y-3">
                          {school.fits.map((fit, j) => (
                            <div
                              key={j}
                              className="space-y-2 rounded-xl border border-[#ebe6dc] bg-white px-4 py-4"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-[#2f3a4a]">
                                  {fit.label}
                                </span>
                                <VerdictChip verdict={fit.verdict} />
                              </div>
                              {fit.basis && (
                                <p className="text-sm leading-6 text-[#5e5a53]">
                                  <span className="text-[#9b958a]">根拠　</span>
                                  {fit.basis}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* B. 候補として提示された理由・メモ */}
              {view.reasonMemoText.length > 0 && (
                <section className="rounded-[20px] border border-[#e4e0d8] bg-white p-5 shadow-[0_1px_2px_rgba(30,28,24,0.03)] sm:p-6">
                  <div className="border-l-4 border-[#9aac8d] pl-3">
                    <h2 className="text-lg font-semibold text-[#172033]">
                      候補として提示された理由・メモ
                    </h2>
                  </div>
                  <div className="mt-4 space-y-3 text-[15px] leading-7 text-[#3f3c37] sm:text-base">
                    {view.reasonMemoText.map((line, i) => (
                      <p key={i} className="whitespace-pre-wrap">
                        {line}
                      </p>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {/* 認識対象外の「■ 」セクション（テキストを捨てない） */}
          {view.otherSections.map((section, i) => (
            <section
              key={i}
              className="rounded-[24px] border border-[#ece7dd] bg-white p-4 shadow-[0_1px_3px_rgba(30,28,24,0.04)] sm:p-5 lg:p-6"
            >
              <CardHeading>{section.heading}</CardHeading>
              <div className="mt-3 space-y-1.5 text-sm leading-relaxed text-[#6f6a64]">
                {section.lines
                  .filter((line) => line.trim().length > 0)
                  .map((line, j) => (
                    <p key={j} className="whitespace-pre-wrap">
                      {line}
                    </p>
                  ))}
              </div>
            </section>
          ))}
        </div>

        {/* 右: 確認したいこと（外側カードの中に小カードを積む。細めのカラム） */}
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <div className="rounded-[20px] border border-[#ece7dd] bg-white p-5 shadow-[0_1px_3px_rgba(30,28,24,0.04)]">
            <CardHeading accent="03">確認したいこと</CardHeading>

            {view.unresolvedText.length > 0 ? (
              <ul className="mt-5 space-y-3">
                {view.unresolvedText.map((line, i) => {
                  // 1行を「見出し。補足」へ機械的に分ける（AI 要約はしない。分けられなければ全文を見出しに）。
                  const trimmed = line.trim();
                  const splitAt = trimmed.search(/[。！？]/);
                  const heading =
                    splitAt >= 0 ? trimmed.slice(0, splitAt + 1) : trimmed;
                  const supplement =
                    splitAt >= 0 ? trimmed.slice(splitAt + 1).trim() : "";
                  return (
                    <li
                      key={i}
                      className="flex items-start gap-3 rounded-xl border border-[#f0ebe0] bg-white p-4 transition-colors hover:border-[#dcd4c4]"
                    >
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#eef2f4] text-[#5a6b7d]">
                        <HelpIcon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block whitespace-pre-wrap text-[13px] font-semibold leading-relaxed text-[#172033]">
                          {heading}
                        </span>
                        {supplement && (
                          <span className="mt-0.5 block whitespace-pre-wrap text-xs leading-relaxed text-[#8a8578]">
                            {supplement}
                          </span>
                        )}
                      </span>
                      <ChevronRightIcon className="mt-1 h-3.5 w-3.5 shrink-0 text-[#c9c4b8]" />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-5 rounded-xl border border-[#f0ebe0] bg-[#fcfbf8] p-4 text-[13px] leading-6 text-[#8a8578]">
                いま追加で確認したいことは、本文にはありません。
              </p>
            )}

            <Link
              href={`/plans/${planId}/worksheet/conditions`}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-[#b8b2a6] bg-white px-5 py-3 text-sm font-semibold text-[#172033] transition-colors hover:border-[#8a8578] hover:bg-[#f2efe7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e2b3d]/40"
            >
              条件を見直す
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
