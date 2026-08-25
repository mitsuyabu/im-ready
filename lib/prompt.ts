import Anthropic from "@anthropic-ai/sdk";
import type { Karte } from "./karte";
import { BLOCK_SPECS, getFieldLabel, getKarteSummaryItems } from "./karte";
import { AUSTRALIA_KNOWLEDGE, buildCitySchoolKnowledge } from "./knowledge";
import { formatTranscript, type ChatMessage } from "./chat";

/**
 * カウンセリングのシステムプロンプト。
 * レイヤーA（気持ち・動機の壁打ち）とレイヤーB（条件整理）を明示的に分けている。
 * 順序は固定しない。両方とも自然な会話の中で扱う。
 *
 * TODO: lib/karte/gates.ts の readyFor() 実装後、「必須項目が揃うまで提案しない」という
 * ゲート連携の指示をここに追加する。今回は未実装のため、レイヤーBの自然な指示のみに留める。
 */
export const SYSTEM_PROMPT = `あなたは「留学カウンセラーAI」です。留学を検討している日本語話者に、信頼できる中立的なカウンセラーとして寄り添います。

# あなたの役割
- ユーザーの目的や、本人もまだ言語化できていない潜在的な動機を、対話を通じて引き出し、一緒に整理する。
- 必要であれば「今は留学しない」という結論も一緒に検討する。留学を勧めることがゴールではない。ユーザーが自分の気持ちを整理し、納得して次の一歩を決められることがゴール。

# 対話の2つのレイヤー（順序は柔軟に。両方とも自然な会話の中で扱う）

## レイヤーA: 気持ち・動機の壁打ち
- なぜ留学を考え始めたのか。
- なぜ今なのか。それは留学でしか得られないことなのか。
- 今行かなかったら、後悔しそうか。
- 決めつけず、質問を通じてユーザー自身に整理してもらう。
- 「行かない」という選択も、対等な選択肢として一緒に検討する。

## レイヤーB: 条件整理
- 目的・予算・期間・渡航時期・語学レベル・年齢・就労希望・環境の好み・進学意向・制約などを、自然な流れで一つずつ聞く。
- 既に話してくれた内容は聞き直さない。
- 集めた条件から、国・都市の方向性を仮に提案し、感触をすり合わせる。
- 最後に、話した内容を要約して提示し、認識のズレがないか確認する。

# 話し方のルール
- 一度にたくさん質問しない。原則、1回の返答につき質問は1つ。
- 温かく共感的に。ただし冗長にならず簡潔に。
- 専門用語は避け、平易な言葉で話す。
- マークダウン記法（**による太字、# 見出し、- や * による箇条書き等）は使わず、プレーンな日本語の文章で書く。
- 押し売りや誘導をしない。中立を保つ。
- 学費・ビザ・為替など変わりやすい情報は「一般的な傾向」として話し、正確な最新情報は各機関での確認が必要だと必要に応じて添える。断定しすぎない。
- 学費などのお金をこのサービスで預かることはない、という前提で話す。
- ユーザーが不安や迷いを見せたら、まずその気持ちを受け止めてから進む。
- ユーザーが明言していない内容を、決めつけて事実であるかのように話さない。本人にまだ確認していない推測は、あくまで推測として扱う。

# 会話履歴に含まれる学校提案について
- 会話履歴の中に、学校の提案（合う候補・参考候補とその理由）が含まれていることがある。これは検証済みの構造化データ（提案パイプライン）から提示されたものであり、あなた自身の未検証の発言ではない。これを疑ったり、「確かな情報ではなかった」と撤回したりせず、確かな前提として扱ってよい。
- ただし、その提案に含まれていない新たな数値（学費・日本人比率など）を自分で創作して断定することは引き続きしない。提案に無い情報を聞かれたら、提案時点のデータに無い旨を伝え、公式サイト等での確認を促す。

# 学校の扱い（推薦・順位づけはしない）
- このプロンプトの末尾に、確定した都市の学校情報が追加されていることがある。これは事実として会話で使ってよい（学校名・特徴を語る、ユーザーに聞かれた学校について答える等）。
- ただし、あなた自身が特定の学校を「一番おすすめ」と言ったり、複数の学校を比較して順位づけしたりしない。学校の推薦・順位づけは、条件が整理された後に別の仕組み（提案パイプライン）が行う役割であり、あなたの役割ではない。中立に「こういう学校がある」と情報提供するに留める。
- ユーザーが「おすすめは?」「どこがいい?」のように学校の推薦を求めてきても、あなた自身が学校を選んで答えることはしない。まず、提案に必要な情報のうちまだ聞けていないもの（語学レベル・予算・コース種別・希望都市 等）を聞く質問を返す。「条件を伺えたら、正式な形で候補をまとめてお出しします」のように、推薦は別途出ることを伝えてよい。
- ユーザーがその質問に答えず、なお推薦を求め続けても、あなた自身が代わりに学校を選ぶことはしない。この場合は裏側の仕組みが暫定的な提案を別途用意するので、あなたは無理に何かを答えようとせず、「今わかっている範囲で一旦まとめますね」といった一言を添えるだけでよい。

# してはいけないこと
- 特定のエージェントや学校を、根拠なく強く勧めること。
- 特定の学校を「一番おすすめ」と言ったり、複数校を順位づけして語ったりすること（推薦・順位づけは提案パイプラインの役割）。
- ユーザーの発言を無視して次の質問に進むこと。
- 事実でない具体的数値（学費・合格率など）を断定的に述べること。

${AUSTRALIA_KNOWLEDGE}`;

/**
 * Plan Chat専用（includeKnownFacts時のみ呼ばれる）。karte中のcertainty==="stated"な項目だけを
 * 「本人が既に明示した情報」として整形する。inferred（AIの未検証の仮説）は含めない。
 */
export function buildKnownFactsText(karte: Karte): string | null {
  const items = getKarteSummaryItems(karte).filter((item) => item.certainty === "stated");
  if (items.length === 0) return null;
  return items.map((item) => `・${item.label}: ${item.value}`).join("\n");
}

const LEANING_CONTEXT_LABELS: Record<string, string> = {
  going: "進む方向で考えている",
  not_going: "進まない方向で考えている",
  undecided: "まだ決まっていない",
};

/**
 * Plan Chat専用。decision.leaning / decision.stage のうち、certainty==="stated"かつ
 * 値があるものだけを「現在の検討状況」として整形する。inferred/unknownは絶対に使わない。
 * leaningはenumなのでLLM要約ではなく固定マッピングのみ。stageは自由記述なので原文をそのまま使い、
 * 意味の推測・要約は行わない。buildKnownFactsTextと同じ値が重複して見える場合があるが、
 * こちらは「現在のフェーズ」を伝える別目的の区画として意図的に別枠にしている。
 */
export function buildDecisionContextText(karte: Karte): string | null {
  const lines: string[] = [];

  const leaning = karte.decision.leaning;
  if (leaning.certainty === "stated" && leaning.value) {
    const label = LEANING_CONTEXT_LABELS[leaning.value];
    if (label) lines.push(`現在の意向: ${label}`);
  }

  const stage = karte.decision.stage;
  if (stage.certainty === "stated" && stage.value) {
    lines.push(`現在の検討段階: ${stage.value}`);
  }

  if (lines.length === 0) return null;
  return lines.join("\n");
}

function labelForSource(source: string): string {
  if (source === "worksheet") return "ワークシート";
  if (source === "profile") return "プロフィール";
  return "会話";
}

/**
 * Plan Chat専用。handoff.conflicts（異なるsourceのstated情報同士が食い違っている項目）を、
 * 「確認が必要な情報」として整形する。ここに入る内容はstated factとして扱わせないこと。
 */
export function buildConflictsText(karte: Karte): string | null {
  const conflicts = karte.handoff.conflicts;
  if (!conflicts || conflicts.length === 0) return null;
  return conflicts
    .map(
      (c) =>
        `・${getFieldLabel(c.block, c.key)}: ${labelForSource(c.existingSource)}では「${c.existingValue}」、${labelForSource(c.incomingSource)}では「${c.incomingValue}」と伺っています。`,
    )
    .join("\n");
}

/**
 * 会話の毎ターン、これを使ってシステムプロンプトを組み立てる。
 * knownFactsText/conflictsText/decisionContextTextはPlan Chat（includeKnownFacts時）のみ
 * 渡される。/widgetは常にnull。
 * preferredCity が確定している（本人が明言=stated。inferredの段階では渡さないこと）場合のみ、
 * その都市の学校情報（schools.tsから事実流し込み型で生成）をSYSTEM_PROMPTの末尾に追加する。
 */
export function buildSystemPrompt(
  preferredCity: string | null,
  knownFactsText: string | null,
  conflictsText: string | null,
  decisionContextText: string | null,
): string {
  let prompt = SYSTEM_PROMPT;

  if (knownFactsText) {
    prompt += `

---

# 本人が既に明示した情報
以下は本人がこれまでに明示した情報です。原則として情報収集のためだけに同じ質問を繰り返さないでください。ただし本人が変更・訂正した場合や、現在の判断に必要な確認がある場合は新しい情報を優先してください。

${knownFactsText}`;
  }

  if (decisionContextText) {
    prompt += `

---

# 現在の検討状況
${decisionContextText}

この状況を踏まえて会話してください。すでに決まっている条件を情報収集目的だけで聞き直さず、現在の判断に必要な整理を優先してください。本人が変更・訂正した場合は最新の発言を優先してください。`;
  }

  if (conflictsText) {
    prompt += `

---

# 確認が必要な情報
以下は、会話とワークシートで異なる内容が確認されている項目です。これらは別々の記録から来ているだけで、必ずしも本人の意見が矛盾しているとは限りません（同じことを違う言葉で述べただけの可能性があります）。
- 2つの内容を読み比べ、意味がほぼ同じだと思われる場合は、「矛盾しています」のような断定した言い方をせず、「念のため確認ですが、〜という理解で合っていますか？」のように軽く確認してください。
- 金額・期間・方向性（行く/行かない等）のように、明確に異なる内容だと判断できる場合は、これまで通りしっかり確認してください。
- どちらの場合も、あなた自身の判断で一方の内容を正しいと決めつけたり、2つを勝手に1つへまとめたりしないでください。本人の回答を待ってください。

${conflictsText}`;
  }

  const citySchoolKnowledge = preferredCity ? buildCitySchoolKnowledge(preferredCity) : null;
  if (citySchoolKnowledge) {
    prompt += `

---

${citySchoolKnowledge}`;
  }

  return prompt;
}

// ---- update_karte ツール定義（lib/karte.ts の BLOCK_SPECS から生成） ----

type SpecEntry = { kind: string; description: string; values?: readonly string[] };

function fieldValueSchema(spec: SpecEntry): Record<string, unknown> {
  switch (spec.kind) {
    case "string":
      return { type: "string" };
    case "number":
      return { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "string[]":
      return { type: "array", items: { type: "string" } };
    case "enum":
      return { type: "string", enum: spec.values };
    default:
      return { type: "string" };
  }
}

function fieldSchema(spec: SpecEntry) {
  return {
    type: "object",
    description: spec.description,
    properties: {
      value: fieldValueSchema(spec),
      certainty: {
        type: "string",
        enum: ["stated", "inferred"],
        description: "stated=本人が明言 / inferred=対話から読み取った仮説（事実として扱わない）",
      },
    },
    required: ["value", "certainty"],
  };
}

function blockSchema(spec: Record<string, SpecEntry>, blockDescription: string) {
  const properties: Record<string, unknown> = {};
  for (const [key, fieldSpec] of Object.entries(spec)) {
    properties[key] = fieldSchema(fieldSpec);
  }
  return {
    type: "object",
    description: blockDescription,
    properties,
  };
}

const BLOCK_DESCRIPTIONS: Record<keyof typeof BLOCK_SPECS, string> = {
  profile: "本人の基本情報",
  motivation: "動機・潜在ニーズ",
  language: "語学面",
  budget: "予算",
  timing: "時期・期間",
  work: "就労意向",
  lifestyle: "生活環境の好み",
  personality: "性格・進め方の好み",
  constraints: "制約条件",
  support: "求めるサポート範囲",
  schoolPrefs: "学校選びの希望",
  decision: "意思決定の状況",
};

/**
 * カルテ（lib/karte.ts の BLOCK_SPECS）を差分更新するためのツール定義。
 * モデルには「今回の直近のやり取りから新たに判明した項目のみ」を、certainty付きで渡すよう指示する。
 * すべてのフィールドは任意（省略可）。
 */
export const UPDATE_KARTE_TOOL: Anthropic.Tool = {
  name: "update_karte",
  description:
    "留学カウンセリングのカルテを更新する。直近のやり取りから新たに判明した項目のみを渡すこと。" +
    "まだ不明な項目や、既に把握済みで変化がない項目は含めない。" +
    "本人が明言した内容は certainty: stated、対話から読み取った推測・仮説は certainty: inferred として送ること。" +
    "特に motivation.trueGoalHypothesis は必ず inferred として扱うこと（事実として扱わない）。",
  input_schema: {
    type: "object",
    properties: {
      ...Object.fromEntries(
        (Object.keys(BLOCK_SPECS) as (keyof typeof BLOCK_SPECS)[]).map((block) => [
          block,
          blockSchema(BLOCK_SPECS[block], BLOCK_DESCRIPTIONS[block]),
        ]),
      ),
      summary: {
        type: "string",
        description:
          "3〜5行の要約。会話の区切りで、これまでの内容を要約しユーザーに確認を求めるターンにのみ含める。それ以外のターンでは省略する。",
      },
      immediateProposalRequested: {
        type: "boolean",
        description:
          "ユーザーが条件確認の質問に答えないまま学校の推薦・提案を求め続けている、と新たに判断した場合にのみ true を送る。" +
          "それ以外のターンでは省略する（省略時は現在の値が維持される）。false を明示的に送る必要はない。",
      },
    },
  },
};

/** カルテ抽出専用の system プロンプトを組み立てる（現在のカルテ状態を渡し、差分のみ抽出させる） */
export function buildKarteExtractionSystemPrompt(karte: Karte): string {
  return `あなたは会話ログから留学カウンセリングのカルテ項目を抽出するアシスタントです。
以下は現時点で判明済みのカルテです（JSON）。この内容と重複する情報は再送しないでください。

\`\`\`json
${JSON.stringify(karte, null, 2)}
\`\`\`

会話全体を踏まえつつ、直近のやり取りで新たに判明した項目、または訂正された項目だけを update_karte ツールで送信してください。
新たに判明した項目が何もない場合も、必ず update_karte を1回呼び出してください（その場合フィールドは何も含めなくてよい）。

各項目には certainty を必ず付けてください。
- stated: ユーザーが実際に述べた内容
- inferred: ユーザーは明言していないが、対話の文脈からAIが読み取った推測・仮説
推測を certainty: stated と偽らないこと。特に motivation.trueGoalHypothesis（本当の動機の仮説）は必ず inferred にすること。

# 新しい事実の根拠について（重要・絶対条件）
- 今回新たにKarteへ追加・更新できる情報は、会話ログの中で本人（ユーザー）が実際に書いた行（「ユーザー: 」で始まる行）によって明示または支持される内容だけです。
- 「カウンセラー: 」で始まる行（あなた自身の過去の発言）は、直近のユーザー発言の意味を正しく理解するための文脈としてのみ使ってください。カウンセラー自身が尋ねた質問・提示した提案・述べた仮説の内容そのものを、certaintyがstated・inferredいずれであっても、新しい事実として抽出してはいけません。
- 特に、会話ログの最後の行がカウンセラー（あなた自身）の発言である場合、それはまだユーザーが一度も返答していない最新の発言です。その発言の中身（質問・提案・仮説）を、ユーザーが同意・確認したかのように扱ってはいけません。この最後のカウンセラー発言は、summaryフィールドの判定（要約と確認を求めている発言かどうか）にのみ使ってください。
- ユーザーがまだ回答・同意していない内容は、stated・inferredのどちらであっても新規事実として追加しないでください。

summary フィールドは、直近のAIの発言が「これまでの内容を要約し、ユーザーに認識のズレがないか確認を求めているもの」である場合にのみ、3〜5行の要約を書いて含めてください。それ以外のターンでは summary を省略してください。

immediateProposalRequested フィールドについて:
会話の流れ全体を見て、ユーザーが学校の推薦・提案を強く求め続けているのに、条件確認の質問には答えていない状態かどうかを判断してください。
- 言い回しは問いません。「質問はいいから」「もういいから教えて」「とりあえずどこがいい」「早く知りたい」「そういうのはいいので」など、表現は様々です。
- 一度だけでなく、AIが条件を聞く質問で返しても、それに答えずに推薦を求めてくる流れ全体を見て判断してください。目安として、AIが1回条件を尋ねる質問で応じても、なお答えずに求めてくるようなら true にしてください（厳密な回数ではなく、流れで判断する）。
- ユーザーが素直に条件確認の質問に答えている間は true にしないでください。
- 新たにこの状態になったと判断した場合にのみ true を送ってください。それ以外のターンでは省略してください（省略した場合は現在のカルテの値がそのまま維持されます。あなたが false を送る必要はありません）。`;
}

/**
 * /api/karte のuser turnに渡す本文を組み立てる。
 *
 * messagesの末尾がカウンセラー（assistant）の発言の場合、それを「まだユーザーが返答していない
 * 最新の発言」として文脈から明確に切り離し、別区画として渡す（本文をそのまま抽出対象から除外は
 * しない。summaryフィールドの判定＝「AIが要約を提示して確認を求めているか」の検出には、
 * この最新発言自体が必要なため）。事実抽出の根拠にしないことは
 * buildKarteExtractionSystemPrompt側の指示で担保する。
 */
export function buildKarteExtractionUserContent(messages: ChatMessage[]): string {
  const last = messages[messages.length - 1];
  const hasTrailingAssistant = messages.length > 0 && last.role === "assistant";
  const contextMessages = hasTrailingAssistant ? messages.slice(0, -1) : messages;

  let text = `以下は留学カウンセリングの会話ログです。\n\n${formatTranscript(contextMessages)}`;

  if (hasTrailingAssistant) {
    text += `

--- 直近のカウンセラー（あなた自身）の発言。ユーザーはまだこれに返答していません ---
${last.content}

この発言はまだユーザーの返答を経ていません。summaryフィールドの判定にのみ使ってください。
この発言の中でカウンセラー自身が述べた質問・提案・仮説の内容そのものを、新しいstated/inferred事実として抽出しないでください。`;
  }

  text += `\n\n上記を踏まえ、update_karte ツールを呼び出してください。`;
  return text;
}
