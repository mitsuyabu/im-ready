/**
 * ワークシートの回答から、本人が親に直接見せられる「資料（計画書＋最後に本人からのメッセージ）」を
 * 生成するための単発（非ストリーミング）呼び出し専用プロンプト。my note（lib/worksheetNotePrompt.ts）
 * とは独立した別成果物だが、データの型はmy note側のものをそのままimportして再利用する（複製しない）。
 *
 * 【厳守事項（プロンプトで縛る）】
 * - 宛名（「お父さん、お母さんへ」等）は書かせない。タイトルから始めさせる。
 * - 不自然な二人称・造語、特定の家族構成を前提にした書き方をさせない。
 * - マークダウン記法・記号での見出し装飾は使わせない（出力側でも stripMarkdownBold を適用し二重に防ぐ）。
 * - 本人が明示的に書いた/選んだ事実は断定調、AIの解釈だけ「〜かもしれません」。
 * - 数字（点数・順位）を読み上げさせない、無い具体情報（確定した国・都市・学校名等）を創作させない。
 * - 「説得」ではなく「誠実に伝えて対話を求める」姿勢。押し切らせない。中立を貫かせる。
 * - 空欄のカテゴリには触れさせない（プロンプトのデータ自体に含めないことで対応）。
 *
 * 【将来の拡張ポイント】
 * concreteDetails は今回は常に null。将来、希望国・都市・学校名・確定予算などの具体情報が
 * （提案パイプライン等から）渡せるようになったら、この型に値を入れて渡すだけでよい。
 * プロンプト本文は最初から「concreteDetailsの有無」で分岐する形にしてあるため、
 * そのときプロンプトの書き換えは不要になる想定。
 */

import type {
  WorksheetNoteFreeTextCategory,
  WorksheetNotePriorities,
  WorksheetNoteNextStep,
} from "@/lib/worksheetNotePrompt";

export type WorksheetLetterConcreteDetails = {
  country?: string;
  city?: string;
  schoolName?: string;
  budgetDetail?: string;
  stayStyle?: string;
} | null;

export type WorksheetLetterInput = {
  freeTextByCategory: WorksheetNoteFreeTextCategory[];
  priorities: WorksheetNotePriorities | null;
  nextStep: WorksheetNoteNextStep | null;
  /** 今回は常に null（将来の具体情報の受け口） */
  concreteDetails: WorksheetLetterConcreteDetails;
};

function formatFreeTextSection(categories: WorksheetNoteFreeTextCategory[]): string {
  if (categories.length === 0) return "（自由記述カテゴリの回答なし）";
  return categories
    .map((category) => {
      const lines = category.entries.map((entry) => `- ${entry.heading}\n  ${entry.text}`).join("\n");
      return `## ${category.categoryTitle}\n${lines}`;
    })
    .join("\n\n");
}

function formatPrioritiesSection(priorities: WorksheetNotePriorities | null): string {
  if (!priorities) return "（優先順位カテゴリの回答なし）";
  const compromisesText = priorities.compromises.none
    ? "「特にない」を明示的に選択（妥協できるものは無い、という意思表示）"
    : priorities.compromises.items.length > 0
      ? priorities.compromises.items.join("、")
      : "未回答";
  return `評価（1〜5、本人がつけた点数）:
${JSON.stringify(priorities.ratings, null, 2)}

特に大事にしたい上位の順位（本人が明示的に選んだ順位）:
${JSON.stringify(priorities.rankings, null, 2)}

妥協できるもの: ${compromisesText}`;
}

function formatNextStepSection(nextStep: WorksheetNoteNextStep | null): string {
  if (!nextStep) return "（次の一歩カテゴリの回答なし）";
  const readinessText = nextStep.readiness ?? "未回答";
  const topicsText = nextStep.topics.length > 0 ? nextStep.topics.join("、") : "未回答";
  return `今の進みたい気持ち: ${readinessText}
次に確認・整理したいこと: ${topicsText}`;
}

function formatConcreteDetailsInstruction(concreteDetails: WorksheetLetterConcreteDetails): string {
  if (concreteDetails) {
    return `以下の確定情報を、「費用について」「時期・期間・学び方」の項目に自然に織り込み、具体的に書くこと。
\`\`\`json
${JSON.stringify(concreteDetails, null, 2)}
\`\`\``;
  }
  return `具体的な国・都市・学校名・確定した予算額はまだ無い。「現実条件」カテゴリの回答（時期・期間・予算感・英語力・学ぶ形など）があればそれを使い、無ければ気持ち・方針ベース（例:「費用は貯金と現地就労で考えている」「治安を重視して選ぶつもり」）で書くこと。存在しない具体情報（確定した国・都市・学校名・金額の断定等）を創作しないこと。`;
}

export function buildWorksheetLetterSystemPrompt(data: WorksheetLetterInput): string {
  return `あなたは、留学カウンセリングワークシートの回答から、本人が親に直接見せられる「資料」を書く役割です。紙に印刷してもLINEで送ってもよい、それ単体で完結した文章です。学校の提案や具体的なアドバイスは行いません。

# データ（本人の回答。これ以外の情報は使わないこと）

## 自由記述（きっかけ・目的／将来像／現実条件／不安と障壁）
${formatFreeTextSection(data.freeTextByCategory)}

## 優先順位（背景情報。この資料の主役ではない）
${formatPrioritiesSection(data.priorities)}

## 次の一歩（背景情報。この資料の主役ではない）
${formatNextStepSection(data.nextStep)}

# 全体の構成: 「計画書」＋ 最後に「本人からのメッセージ」
宛名（「お父さん、お母さんへ」等）は書かない。タイトルから始め、落ち着いた計画書調（「〜します」「〜予定です」）で要点を番号付きの項目として整理し、最後だけ手紙のような温かさを持つ「本人からのメッセージ」で締める、という構成にすること。

## タイトルの決め方
「現実条件」カテゴリの中に、現地でどんな形で学ぶか（語学学校／進学／大学・専門／ワーキングホリデー等）についての回答があれば、それを手がかりにタイトルを次の基準で選ぶこと。データから確実に判別できない場合は、無理に決めず3番目の無難な形にすること（創作・断定しない）。
- 回答が明確にワーキングホリデーを選んでいる → タイトルは「ワーキングホリデー計画」
- 回答が明確にそれ以外（語学学校・進学・大学や専門学校など）を選んでいる → タイトルは「留学計画」
- 該当の回答が無い、またはどちらか判別できない → タイトルは「留学・海外挑戦計画」（どちらの可能性も含む無難な形）

## 計画書本体（番号付きの項目。対応する回答が無い項目は無理に書かず省略してよい）
1. 目的: なぜ留学（あるいは挑戦）したいのか。「きっかけ・目的」「将来像」カテゴリの回答から。
2. 留学後の展望: 帰国後・その先どうしたいか。「将来像」カテゴリの回答から。
3. 費用について: 「現実条件」カテゴリの予算感から。具体的な金額や国名を創作せず、今は方針ベースで書く（下記の指示に従う）。
4. 時期・期間・学び方: 「現実条件」カテゴリの時期・期間・学ぶ形の回答から。
5. 現状の課題: 「不安と障壁」カテゴリの回答から。正直に、しかし前向きなトーンで。

## 「費用について」「時期・期間・学び方」の書き方
${formatConcreteDetailsInstruction(data.concreteDetails)}

## 最後の「本人からのメッセージ」
見出しは「最後に、ひとこと」のような自然な言葉にする。計画書部分で誠実さを示したうえで、ここだけ気持ちを込めて締めくくること。心配をかけることは分かっている、一方的に進めるつもりはない、不安があれば聞かせてほしい、一緒に考えたい、一度話す時間がほしい、という対話を求める姿勢（押し切らない）を込めること。「きっかけ・目的」等の自由記述の中に、この締めに使えそうな本人自身の言葉があれば、それを活かして書くこと。無ければ他の回答をもとに、本人の言葉として自然に生成すること。

# 絶対に守ること
- 宛名（「お父さん、お母さんへ」等）を書かない。タイトルから始めること。
- 「親さん」のような不自然な二人称・造語を作らない。二人称が必要な場面は自然な日本語にするか、主語を省く書き方にする。父母がそろっている、といった特定の家族構成を前提にした書き方をしない。
- マークダウン記法（**による太字、# 見出し、- や * による箇条書き等）や「■」等の記号による見出し装飾は一切使わない。見出しは自然な言葉の一文として書き、プレーンな日本語の文章のみで書く。
- 本人が明示的に書いた・選んだこと（自由記述の内容、優先順位・次の一歩の選択）は断定調（「〜です」「〜と考えています」）で書く。「〜のようです」のような他人事の推測形にしない（本人が書いた資料として一人称で書くため）。
- 回答の組み合わせからあなたが読み取った、本人が明言していない部分（動機の奥にあるものなど）を書く場合は、断定せず控えめな書き方にとどめる。
- 数字や順位をそのまま読み上げない（点数・順位を根拠として書かない）。
- 具体的な学校名は、データに無ければ出さない。
- 中立を徹底する。留学することを正当化するために事実を誇張しない。不安を煽って同情を引こうともしない。誠実に、対話を求める姿勢を最後まで保つこと（「今はやめる」という可能性も否定しない）。
- 上記データの中に、一部カテゴリの情報が無いことがある。どのカテゴリが無いかには触れず、あるデータだけを使って自然に書くこと。情報が少ない場合は、無理に埋めず、対応する項目を省略してシンプルにする。
- タイトル・計画書本体・最後のメッセージを含め、実際に誰かに渡せる、完結した1つの資料として書くこと。`;
}
