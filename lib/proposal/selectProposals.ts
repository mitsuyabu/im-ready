/**
 * 提案パイプライン 第3層: LLMによる選定・説明。
 *
 * 第1層(hardFilter)・第2層(buildFitHints)の結果を受け取り、LLMに
 * 「軸の違う2〜3校を、理由と見送り理由/外れる点つきで選ばせる」ための
 * ツール定義とプロンプトを組み立てる（実際の anthropic.messages.create 呼び出しは
 * app/api/proposal/route.ts 側で行う。/api/karte と同じ役割分担）。
 *
 * 【厳守事項（プロンプトで縛る）】
 * - 点数化・合計・パーセント表示はさせない。
 * - fitHints が "unknown" の項目を、推薦理由・見送り理由の根拠に使わせない。
 * - 合う候補(match)と参考候補(reference)を区別させる。数合わせで参考候補を
 *   match扱いにしない／match候補が無いのに無理にmatchを作らない。
 * - 手数料・送客可否・評価/レビュー数はそもそも渡さない（見えない情報は使えない）。
 * - 予算は換算済みの数値を渡さない。学校のtuitionWeekly(AUD・週)とカルテの予算(円)を
 *   生値のまま渡し、判断はLLMの文脈判断に委ねる。
 */

import Anthropic from "@anthropic-ai/sdk";
import { getKarteSummaryItems, type Karte, type ProposalCategory } from "@/lib/karte";
import type { CourseCategory, School } from "@/lib/data/schools";
import type { SchoolFitHints } from "./fitHints";
import { detectCourseCategory } from "./matching";

export type { ProposalCategory };
export type ProposalSituation = "matched" | "partial" | "none";

export interface ProposalEntry {
  schoolSlug: string;
  category: ProposalCategory;
  /** 推薦理由（渡された事実だけを根拠にする） */
  reason: string;
  /** match の2番手以降=見送り理由／reference=希望との相違点。1番手matchなら空文字 */
  caveat: string;
}

export interface ProposalResult {
  situation: ProposalSituation;
  /** situation が "none" のときに必ず入る、正直な前置き文 */
  introNote: string | null;
  proposals: ProposalEntry[];
}

/** LLMに渡す候補1件ぶんの事実バンドル（fitHints + 表示用の最低限の識別情報） */
interface CandidateBundle {
  schoolSlug: string;
  name: string;
  city: string;
  category: ProposalCategory;
  /** reference の場合のみ。第1層の除外理由をコード側で事実として明示する（LLMに推測させない） */
  exclusionFact?: string;
  fitHints: Omit<SchoolFitHints, "schoolSlug">;
}

function describeExclusion(school: School, karte: Karte, courseCategory: CourseCategory | null): string {
  const parts: string[] = [];
  const preferredCity = karte.schoolPrefs.preferredCity.value;
  if (preferredCity) {
    parts.push(`都市: 希望(${preferredCity})と一致（学校の都市: ${school.city}）`);
  }
  if (courseCategory) {
    const has = school.courseCategories?.includes(courseCategory);
    parts.push(
      has
        ? `コース種別: 希望(${courseCategory})に該当`
        : `コース種別: 希望(${courseCategory})に非該当（学校のcourseCategories: ${school.courseCategories?.join(", ") ?? "データ無し"}）`,
    );
  }
  return parts.length > 0 ? parts.join(" / ") : "（除外理由の詳細なし）";
}

function toBundle(
  school: School,
  fitHints: SchoolFitHints,
  category: ProposalCategory,
  exclusionFact?: string,
): CandidateBundle {
  return {
    schoolSlug: fitHints.schoolSlug,
    name: school.name,
    city: school.city,
    category,
    exclusionFact,
    fitHints: {
      budgetStatus: fitHints.budgetStatus,
      budgetHint: fitHints.budgetHint,
      levelHint: fitHints.levelHint,
      japaneseRatioHint: fitHints.japaneseRatioHint,
      courseHints: fitHints.courseHints,
      supportHints: fitHints.supportHints,
      tagHints: fitHints.tagHints,
    },
  };
}

export function buildCandidateBundles(
  karte: Karte,
  matchSchools: { school: School; fitHints: SchoolFitHints }[],
  referenceSchools: { school: School; fitHints: SchoolFitHints }[],
): CandidateBundle[] {
  const courseCategory = detectCourseCategory(karte.schoolPrefs.courseType.value);
  return [
    ...matchSchools.map(({ school, fitHints }) => toBundle(school, fitHints, "match")),
    ...referenceSchools.map(({ school, fitHints }) =>
      toBundle(school, fitHints, "reference", describeExclusion(school, karte, courseCategory)),
    ),
  ];
}

export function deriveSituation(matchCount: number): ProposalSituation {
  if (matchCount >= 2) return "matched";
  if (matchCount === 1) return "partial";
  return "none";
}

export const SELECT_PROPOSALS_TOOL: Anthropic.Tool = {
  name: "select_proposals",
  description:
    "渡された候補(match/reference)の中から提示する学校を選び、理由と見送り理由/相違点を付けて返す。" +
    "点数・合計・パーセントは一切使わない。fitHintsがunknownの項目は根拠にしない。",
  input_schema: {
    type: "object",
    properties: {
      introNote: {
        type: "string",
        description:
          "match候補が0件のときに必ず書く、正直な前置き文（現データに完全に合う学校が見つからなかった旨）。1件以上のときは省略してよい。",
      },
      proposals: {
        type: "array",
        description: "提示する学校の一覧。渡された候補(match/reference)の中からのみ選ぶこと。",
        items: {
          type: "object",
          properties: {
            schoolSlug: { type: "string", description: "候補一覧に含まれる schoolSlug のいずれか" },
            category: {
              type: "string",
              enum: ["match", "reference"],
              description: "渡された候補側の category をそのまま使う（勝手に変えない）",
            },
            reason: {
              type: "string",
              description:
                "推薦理由。渡された fitHints の生データ（unknownでない項目）だけを根拠にすること。",
            },
            caveat: {
              type: "string",
              description:
                "categoryがmatchで2番手以降の場合は「1番手にしなかった理由」。categoryがreferenceの場合は" +
                "「希望とどこが違うか（exclusionFactに基づく具体的な相違点）」。1番手のmatchの場合は空文字でよい。",
            },
          },
          required: ["schoolSlug", "category", "reason", "caveat"],
        },
      },
    },
    required: ["proposals"],
  },
};

export function buildSelectProposalsSystemPrompt(
  karte: Karte,
  situation: ProposalSituation,
  candidates: CandidateBundle[],
  missingFields: string[] = [],
): string {
  const karteSummary = getKarteSummaryItems(karte).map((item) => ({
    label: item.label,
    value: item.value,
    certainty: item.certainty,
  }));

  const situationInstruction: Record<ProposalSituation, string> = {
    matched:
      "match候補が2件以上あります。その中から性格の異なる2〜3校を選び、全員 category: \"match\" にすること。" +
      "1番手は最も合うと考える学校（caveatは空文字でよい）。2番手・3番手は「なぜ1番手にしなかったか」をcaveatに書くこと。" +
      "reference候補があっても、matchが2件以上ある場合は使わなくてよい。",
    partial:
      "match候補が1件だけあります。その学校を必ず category: \"match\" として主役で1件出すこと（caveatは空文字でよい）。" +
      "reference候補があれば、そこから最大2件を category: \"reference\" として追加で出すこと" +
      "（0件や1件しか無ければ無理に数を揃えず、あるだけ出せばよい）。" +
      "reference候補のcaveatには、渡された exclusionFact に基づいて「都市は合うが◯◯が希望と外れる」のように" +
      "具体的な相違点を書くこと。match候補とreference候補を同列に並べず、区別が伝わる書き方にすること。",
    none:
      "match候補は0件です。proposalsは全件 category: \"reference\" にすること。" +
      "reference候補から近い順に最大3件選ぶこと（無ければ空配列でよい）。" +
      "introNoteに、現在のデータには希望に完全に合う学校が見つからなかった旨を正直に書くこと。" +
      "各referenceのcaveatには、渡された exclusionFact に基づいて希望とどこが違うか（都市/コース種別等）を具体的に書くこと。",
  };

  const provisionalSection =
    missingFields.length > 0
      ? `\n\n# 暫定提案（情報不足のまま生成）
このカルテはまだ次の項目が未確定です: ${missingFields.join("、")}
ユーザーが十分な情報を提供する前に提案を求めたため、今わかっている範囲であえて挙げる暫定的な提案です。
situationの値に関わらず（"none"以外でも）、introNote を必ず設定してください。内容は「今わかっている条件の範囲で、あえて挙げるとすれば…」という趣旨の、正直な前置き文にしてください。断定的な言い方は避けてください。`
      : "";

  return `あなたは留学カウンセリングの提案パイプライン第3層（学校候補の選定・説明）です。
以下のカルテ情報と学校候補データだけを根拠に、select_proposals ツールを呼び出してください。

# カルテの要約（分かっている範囲。certainty: inferred は本人未確認の仮説なので断定的に使わない）
\`\`\`json
${JSON.stringify(karteSummary, null, 2)}
\`\`\`

# 学校候補（第1層・第2層を通過した事実データ。これ以外の学校・情報は使わないこと）
\`\`\`json
${JSON.stringify(candidates, null, 2)}
\`\`\`

# 今回の状況
${situationInstruction[situation]}
${provisionalSection}

# 絶対に守ること
- introNote/reason/caveatはマークダウン記法（**による太字、# 見出し、- や * による箇条書き等）を使わず、プレーンな日本語の文章で書く。
- 点数化・合計点・パーセント表示は一切しない（reason/caveatの文章中にも数値化した「マッチ度」等を書かない）。
- 各候補のfitHintsのうち値が "unknown" の項目は、推薦理由にも見送り理由にも一切使わない。
  例: japaneseRatioHint が "unknown" の学校について「日本人が少ないので」のように語ってはいけない。
  levelHint が "unknown" の学校について語学レベルの適合を語ってはいけない。
- 手数料・送客可否・評価/レビュー数は渡していない。存在しない情報として扱い、それらに触れない。
- 予算(budgetHint)は生値（学校の週授業料AUDとカルテの予算JPY）をそのまま見せているだけで、
  為替換算はしていない。断定的な予算判定（「予算内です」等）はせず、あくまで参考情報として触れる程度にとどめる。
- proposalsのschoolSlugは、上記「学校候補」に含まれるものだけを使うこと。候補に無い学校を作らない。
- categoryは渡された候補側のcategoryをそのまま使うこと（matchをreferenceにする等、勝手に変えない）。`;
}

/** モデルのツール入力（unknown）を検証し、安全な ProposalEntry[] に変換する */
export function sanitizeProposalEntries(input: unknown, validSlugs: Set<string>): ProposalEntry[] {
  if (!input || typeof input !== "object") return [];
  const proposals = (input as { proposals?: unknown }).proposals;
  if (!Array.isArray(proposals)) return [];

  const result: ProposalEntry[] = [];
  for (const raw of proposals) {
    if (!raw || typeof raw !== "object") continue;
    const { schoolSlug, category, reason, caveat } = raw as Record<string, unknown>;
    if (typeof schoolSlug !== "string" || !validSlugs.has(schoolSlug)) continue;
    if (category !== "match" && category !== "reference") continue;
    if (typeof reason !== "string" || typeof caveat !== "string") continue;
    result.push({ schoolSlug, category, reason, caveat });
  }
  return result;
}

export function sanitizeIntroNote(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const introNote = (input as { introNote?: unknown }).introNote;
  return typeof introNote === "string" && introNote.trim().length > 0 ? introNote.trim() : null;
}
