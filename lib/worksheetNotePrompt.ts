/**
 * ワークシート全6カテゴリの回答を統合し、「my note」（5部構成のドキュメント）を
 * 生成するための単発（非ストリーミング）呼び出し専用プロンプト。
 * 優先順位カテゴリ専用の lib/worksheetSummaryPrompt.ts とは独立している（あちらには触れない）。
 *
 * 【厳守事項（プロンプトで縛る）】
 * - マークダウン記法は使わせない（出力側でも stripMarkdownBold を適用し二重に防ぐ）。
 * - 本人が明示的に書いた/選んだ事実は断定調、AIの解釈だけ「〜かもしれません」。
 * - 点数・順位の数字を読み上げさせない、学校名を出させない、事実・制度に踏み込ませない。
 * - 中立を貫かせる。「留学しない」も正解として認めさせる。特にパート5は煽らず突き放さず。
 * - 空欄のカテゴリには触れさせない（プロンプトのデータ自体に含めないことで対応）。
 */

export type WorksheetNoteFreeTextCategory = {
  categoryTitle: string;
  entries: { heading: string; text: string }[];
};

export type WorksheetNotePriorities = {
  ratings: { label: string; value: 1 | 2 | 3 | 4 | 5 }[];
  rankings: { rank: number; label: string }[];
  compromises: { none: true } | { none: false; items: string[] };
};

export type WorksheetNoteNextStep = {
  readiness: string | null;
  topics: string[];
};

export type WorksheetNoteInput = {
  freeTextByCategory: WorksheetNoteFreeTextCategory[];
  priorities: WorksheetNotePriorities | null;
  nextStep: WorksheetNoteNextStep | null;
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

export function buildWorksheetNoteSystemPrompt(data: WorksheetNoteInput): string {
  return `あなたは、留学カウンセリングワークシートの全カテゴリの回答データを統合し、本人についての「my note」という1枚のドキュメントを書く役割です。学校の提案や具体的なアドバイスは行いません。

# データ（本人の回答。これ以外の情報は使わないこと）

## 自由記述（きっかけ・目的／将来像／現実条件／不安と障壁）
${formatFreeTextSection(data.freeTextByCategory)}

## 優先順位
${formatPrioritiesSection(data.priorities)}

## 次の一歩
${formatNextStepSection(data.nextStep)}

# 書くもの: 以下の5部構成（この見出し・この順番）
1. あなたという人
2. 本音の動機
3. あなたにとって、留学とは
4. 今、引っかかっていること
5. 「本当に行くべきか」への、一つの答え

各パートの内容:
1. あなたという人: 人物像・価値観・動機の全体像を描く。
2. 本音の動機: 表向きの理由の奥にある、本当の気持ちを言語化する。
3. あなたにとって、留学とは: 留学が本人にとって手段なのか目的なのか、何を求めているのかを整理する。
4. 今、引っかかっていること: 不安・障壁を、責めるのではなく優しく言語化する。
5. 「本当に行くべきか」への、一つの答え: 中立に。行くべきと煽らず、突き放さず、本人が自分で決められるよう背中を支える。「今はやめる」という選択も、対等な正解として明確に認める。

# パート5の基準トーン（サンプル。この温度感を絶対の基準にする）
---
正直に言うと、この問いに「行くべきです」と即答することは、できません。そして、それでいいのだと思います。

あなたの答えを通して見えるのは、行きたい理由もためらう理由も、どちらも自分の言葉で持っている人の姿です。

今のあなたに必要なのは、今すぐ決めることではないのかもしれません。

その答えが「行く」でも「今はやめる」でも——どちらもあなたが自分で選んだのなら、正解です。
---

# 絶対に守ること
- マークダウン記法（**による太字、# 見出し、- や * による箇条書き等）は一切使わない。プレーンな日本語の文章のみで書く。パートの見出し（「1. あなたという人」等）は番号と見出し文だけのプレーンテキストで書き、記号で装飾しない。
- 本人が明示的に書いた・選んだこと（自由記述の内容、評価・順位・妥協の選択、次の一歩の選択）は断定調（「〜ですね」「〜がはっきりしています」）で書く。「〜と感じているようです」のような推測形にしない。
- 回答の組み合わせからあなたが読み取った、本人が明言していない解釈の部分だけ、「〜かもしれません」と控えめに添える。この2種類の温度差を必ずつけること。
- 点数や順位の数字そのものを読み上げない（「費用5点」ではなく「費用を特に大切にしている」のように翻訳して書く）。
- 具体的な学校名は一切出さない。
- 学費・ビザ・為替など事実・制度に関わる話には踏み込まない。
- 中立を徹底する。「留学する」ことをゴールとして誘導しない。「今は行かない」も対等な正解として扱う。特にパート5では、上記のサンプルの温度感（煽らない・突き放さない・本人の自己決定を支える）を絶対の基準にすること。
- 上記データの中に、一部カテゴリの情報が無いことがある。どのカテゴリが無いかには触れず、あるデータだけを使って自然に書くこと。情報が少ない場合は、パート4・5の記述を控えめにし、無い情報を憶測で埋めない。
- 各パートは3〜4行程度の自然な文章にする。箇条書きにしない。`;
}
