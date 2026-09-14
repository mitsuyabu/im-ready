/**
 * Worksheetの質問カタログ（純粋な定義のみ）。
 *
 * components/Worksheet.tsx は "use client" のUIコンポーネントであり、Server Component
 * （例: app/plans/[planId]/worksheet/[sectionId]/page.tsx）からCATEGORIES等の値をimportすると、
 * ビルド/バンドラの扱い上、実行時に期待通りの配列として渡らないことがある
 * （"CATEGORIES.find is not a function" のようなruntime error）。
 * そのため、質問定義（Question/Category型・CATEGORIES・ALL_QUESTIONS）はUIから独立した
 * このファイルに置き、Server/Client どちらからでも安全にimportできるようにする。
 *
 * 質問ID・質問文・カテゴリID・回答スキーマは既存のcomponents/Worksheet.tsxから
 * 一切変更せずそのまま移設したもの。
 */

import { PRIORITY_ITEMS, type PriorityItem } from "@/lib/worksheetPriorities";
import { READINESS_OPTIONS, NEXT_TOPICS, type ChoiceOption } from "@/lib/worksheetNextStep";
import {
  ACCOMMODATION_OPTIONS,
  ADJUSTMENT_OPTIONS,
  BUDGET_OPTIONS,
  CITY_OPTIONS,
  COUNTRY_OPTIONS,
  DEPARTURE_TIMING_OPTIONS,
  ENGLISH_LEVEL_OPTIONS,
  FAMILY_SHARING_OPTIONS,
  LOCAL_WORK_OPTIONS,
  OCCUPATION_OPTIONS,
  STAY_DURATION_OPTIONS,
  STUDY_DURATION_OPTIONS,
  STUDY_FORMAT_OPTIONS,
} from "@/lib/worksheetConditions";

type FreeTextQuestion = {
  kind: "freeText";
  id: string;
  heading: string;
  supplement: string;
  examples: string[];
};

type RatingQuestion = {
  kind: "rating";
  id: string;
  heading: string;
  supplement: string;
  items: PriorityItem[];
};

type RankingQuestion = {
  kind: "ranking";
  id: string;
  heading: string;
  supplement: string;
  items: PriorityItem[];
  maxRanks: number;
};

type CompromiseQuestion = {
  kind: "compromise";
  id: string;
  heading: string;
  supplement: string;
  items: PriorityItem[];
};

/**
 * 選択式の設問に添える 1 行の自由記入欄。「事情やニュアンスが人によって違う」設問で使う。
 * 値は freeText 設問と同じ `WorksheetPersistedData.answers[question.id]` に入るため、
 * localStorage のスキーマ変更は不要（選択は singleSelections / multiSelections 側に入る）。
 */
type FreeTextSupplement = { label: string; placeholder: string };

/** 選択肢の並べ方。"chips" は選択肢が多い設問が mobile で縦に伸びすぎないようにするため。 */
type OptionLayout = "list" | "chips";

type SingleSelectQuestion = {
  kind: "singleSelect";
  id: string;
  heading: string;
  supplement: string;
  options: ChoiceOption[];
  freeText?: FreeTextSupplement;
  optionLayout?: OptionLayout;
};

type MultiSelectQuestion = {
  kind: "multiSelect";
  id: string;
  heading: string;
  supplement: string;
  options: ChoiceOption[];
  freeText?: FreeTextSupplement;
  optionLayout?: OptionLayout;
};

/** 数値だけを答える設問（年齢）。値は answers[question.id] に文字列として入る。 */
type NumberQuestion = {
  kind: "number";
  id: string;
  heading: string;
  supplement: string;
  placeholder: string;
  unit: string;
  min: number;
  max: number;
};

export type Question =
  | FreeTextQuestion
  | RatingQuestion
  | RankingQuestion
  | CompromiseQuestion
  | SingleSelectQuestion
  | MultiSelectQuestion
  | NumberQuestion;

export type Category = {
  id: string;
  title: string;
  questions: Question[];
};

export const CATEGORIES: Category[] = [
  {
    id: "motivation",
    title: "きっかけ・目的",
    questions: [
      {
        kind: "freeText",
        id: "trigger",
        heading: "海外に興味を持ったきっかけは？",
        supplement:
          "どんな小さなことでも大丈夫です。「なんとなく」でも、そこには理由が隠れていることが多いので、思い出せる範囲で書いてみてください。",
        examples: [
          "家族旅行で行った海外が楽しくて、住んでみたいと思った",
          "友人がワーホリに行った話を聞いて、自分も行きたくなった",
          "今の生活を変えたくて、漠然と海外に憧れている",
          "はっきりしたきっかけはないけど、昔からずっと興味がある",
        ],
      },
      {
        kind: "freeText",
        id: "current-life",
        heading: "今の生活で、変えたいと感じていることはありますか？",
        supplement:
          "留学したい気持ちの裏には、「今」への思いがあることが多いです。不満でも、物足りなさでも、やってみたいことでも。今の気持ちに正直に書いてみてください。",
        examples: [
          "毎日同じことの繰り返しで、刺激がないと感じている",
          "今の仕事を続けていいのか、迷いがある",
          "特に不満はないけど、若いうちに違う世界を見てみたい",
          "英語ができない自分を変えたい",
        ],
      },
      {
        kind: "freeText",
        id: "goal-or-means",
        heading: "留学そのものが目的？ それとも、何かのための手段？",
        supplement:
          "「英語を話せるようになること」自体がゴールなのか、それとも「英語を使って、その先にやりたいこと」があるのか。どちらでも正解です。今の気持ちに近いほうを書いてみてください。",
        examples: [
          "英語を話せるようになること自体が目標。まずはそこを達成したい",
          "英語はあくまで手段。将来、海外で働くために必要だから",
          "留学生活そのものを経験してみたい。英語はそのついで",
          "正直まだ分からない。行ってみて考えたい",
        ],
      },
      {
        kind: "freeText",
        id: "regret",
        heading: "もし今回行かなかったら、1〜2年後にどう感じていそうですか？",
        supplement:
          "少し先の自分を想像してみてください。このまま行かずに過ごしたとき、どんな気持ちでいそうか。この問いは、自分の本当の気持ちに気づくヒントになります。",
        examples: [
          "やっぱり行けばよかった、とモヤモヤしていそう",
          "タイミングを逃したことを、少し後悔していそう",
          "案外、普通に過ごしていて気にしていないかも",
          "わからない。だからこそ、今のうちに確かめたい",
        ],
      },
      {
        kind: "freeText",
        id: "success",
        heading: "どうなったら「行ってよかった」と思えそうですか？",
        supplement:
          "留学のゴールは人それぞれです。英語力でも、経験でも、出会いでも、自分の変化でも。「これができたら成功」と思えるものを、思いつくままに書いてみてください。",
        examples: [
          "日常会話に困らないくらい、英語が話せるようになる",
          "一人で海外で生活しきったという自信がつく",
          "一生の友達や、忘れられない経験ができる",
          "まだ具体的には描けていない。それも含めて見つけたい",
        ],
      },
    ],
  },
  {
    id: "future",
    title: "将来像",
    questions: [
      {
        kind: "freeText",
        id: "future-self",
        heading: "留学が終わったとき、どんな自分になっていたいですか？",
        supplement:
          "遠い未来より、まず「留学を終えた直後」を想像してみてください。どんな変化があったら「行ってよかった」と思えそうか、思いつくままに。",
        examples: [
          "日常会話に困らないくらい、英語が話せるようになっていたい",
          "一人で海外で生活しきった、という自信がついていたい",
          "視野が広がって、前より柔軟にものを考えられるようになっていたい",
          "まだ具体的には描けていない。それも含めて、行って見つけたい",
        ],
      },
      {
        kind: "freeText",
        id: "future-use",
        heading: "帰国したあと、それをどう活かしたいですか？",
        supplement:
          "留学は「その先」に繋がることが多いです。仕事、進学、生き方——どんな形でもいいので、帰ってきた後にやりたいことがあれば書いてみてください。",
        examples: [
          "英語を活かせる仕事に、転職したい",
          "今の仕事に戻るけど、視野を広げて活かしたい",
          "海外との関わりがある働き方を、これから探していきたい",
          "特に決めていない。帰ってから考える",
        ],
      },
      {
        kind: "freeText",
        id: "future-priority",
        heading: "留学で一番伸ばしたいのは、どれですか？",
        supplement:
          "全部大事だと思いますが、あえて「これを一番」と選ぶなら？ 優先順位が見えると、学校や過ごし方も選びやすくなります。",
        examples: [
          "英語力。とにかく話せるようになりたい",
          "自信や、自分で決めて動く力",
          "いろんな国の友達や、人とのつながり",
          "キャリアに繋がる経験やスキル",
        ],
      },
      {
        kind: "freeText",
        id: "future-location",
        heading: "帰国後の未来と、海外に残る未来。今の気持ちは、どちら寄りですか？",
        supplement:
          "今すぐ決める必要はありません。ただ、なんとなくの気持ちの傾きを知っておくと、留学の位置づけがはっきりします。",
        examples: [
          "留学は一区切り。ちゃんと日本に帰ってくるつもり",
          "できれば、そのまま海外で働く道も探ってみたい",
          "ワーホリや現地就労も含めて、長く海外にいたい",
          "まったく決めていない。行ってから考えたい",
        ],
      },
    ],
  },
  {
    /**
     * 現実条件。「自分が実際に留学するうえでの条件・現状・制約」を整理する場所。
     * 感情・動機は motivation / future、判断軸は priorities、不安は anxiety、
     * 次の行動は nextstep が持つ。ここには重複させない。
     *
     * 回答形式の考え方:
     *   - 選択のみ    … 構造化しやすく自由度が不要なもの（留学期間・就学期間・年齢）
     *   - 選択+自由記入 … 事情やニュアンスが人によって違うもの（その他の設問）
     *   - 自由記入のみ … ここでは増やさない（深掘りは Why? / My Future / Worries）
     * どの設問でも「まだ決まっていない / まだ分からない」を正式な回答として扱う。
     */
    id: "conditions",
    title: "現実条件",
    questions: [
      {
        kind: "multiSelect",
        id: "destination-country",
        heading: "行ってみたい国はありますか？",
        supplement:
          "候補がいくつあっても大丈夫です。まだ決まっていなければ「まだ決まっていない」で構いません。",
        options: COUNTRY_OPTIONS,
        optionLayout: "chips",
        freeText: {
          label: "その他の国や、補足があれば",
          placeholder: "例: アイルランドも気になっている",
        },
      },
      {
        kind: "multiSelect",
        id: "destination-city",
        heading: "行ってみたい都市はありますか？",
        supplement:
          "下の候補はオーストラリアの主要都市です。他の国の都市を考えている場合は、自由記入に書いてください。",
        options: CITY_OPTIONS,
        optionLayout: "chips",
        freeText: {
          label: "その他の都市や、補足があれば",
          placeholder: "例: バンクーバー / 郊外でも気にならない",
        },
      },
      {
        kind: "singleSelect",
        id: "timing",
        heading: "いつ頃の出発を考えていますか？",
        supplement:
          "まだ決まっていなくて大丈夫です。「今の仕事を辞めたあと」のような決まり方でも構いません。",
        options: DEPARTURE_TIMING_OPTIONS,
        freeText: {
          label: "時期についての補足があれば",
          placeholder: "例: 大学卒業後 / 来年の春頃",
        },
      },
      {
        kind: "singleSelect",
        id: "stay-duration",
        heading: "どのくらいの期間を考えていますか？",
        supplement: "留学全体の期間のイメージです。あとから変えて構いません。",
        options: STAY_DURATION_OPTIONS,
      },
      {
        kind: "singleSelect",
        id: "english-level",
        heading: "現在の英語力について、どのように感じていますか？",
        supplement:
          "テストのスコアがなくても大丈夫です。近い感覚のものを選んでください。",
        options: ENGLISH_LEVEL_OPTIONS,
        freeText: {
          label: "スコアや、得意・苦手があれば",
          placeholder: "例: TOEIC 600点 / 読むのはできるが話すのが苦手",
        },
      },
      {
        kind: "singleSelect",
        id: "budget",
        heading: "留学に使える予算の目安はありますか？",
        supplement:
          "正確な金額でなくて大丈夫です。現地で働いて補う前提でも構いません。",
        options: BUDGET_OPTIONS,
        freeText: {
          label: "金額や条件の補足があれば",
          placeholder: "例: 貯金120万円＋現地のアルバイトで補いたい",
        },
      },
      {
        kind: "number",
        id: "age",
        heading: "現在の年齢を教えてください。",
        supplement:
          "ビザやワーキングホリデーの条件、学校の選び方に関わるため、現実条件のひとつとして伺っています。",
        placeholder: "例: 24",
        unit: "歳",
        min: 10,
        max: 99,
      },
      {
        kind: "singleSelect",
        id: "occupation",
        heading: "現在の状況に近いものを教えてください。",
        supplement: "留学の進め方や時期の考え方に関わります。近いものを選んでください。",
        options: OCCUPATION_OPTIONS,
        freeText: {
          label: "補足があれば",
          placeholder: "例: 来月から転職予定",
        },
      },
      {
        kind: "multiSelect",
        id: "study-format",
        heading: "現地でどんな学び方を考えていますか？",
        supplement:
          "学校そのものを決める必要はありません。学び方のイメージを選んでください（複数可）。",
        options: STUDY_FORMAT_OPTIONS,
        optionLayout: "chips",
        freeText: {
          label: "学び方についての補足があれば",
          placeholder: "例: 語学学校のあと専門コースも考えたい",
        },
      },
      {
        kind: "singleSelect",
        id: "study-duration",
        heading: "学校にはどのくらい通いたいですか？",
        supplement: "留学全体の期間とは別に、学校に通う期間のイメージです。",
        options: STUDY_DURATION_OPTIONS,
      },
      {
        kind: "multiSelect",
        id: "accommodation",
        heading: "どんな滞在方法を考えていますか？",
        supplement:
          "いつから・どのくらい住むかは、あとで My Plan で決められます。ここでは希望だけ選んでください。",
        options: ACCOMMODATION_OPTIONS,
        optionLayout: "chips",
        freeText: {
          label: "滞在についての補足があれば",
          placeholder: "例: 最初はホームステイ、慣れたらシェアハウス",
        },
      },
      {
        kind: "singleSelect",
        id: "local-work",
        heading: "現地で働くことを考えていますか？",
        supplement: "費用の面でも経験の面でも大きな分かれ道です。今の気持ちに近いものを。",
        options: LOCAL_WORK_OPTIONS,
        freeText: {
          label: "やってみたい仕事があれば",
          placeholder: "例: カフェ / 観光 / ファーム",
        },
      },
      {
        kind: "singleSelect",
        id: "school-work-adjustment",
        heading: "今の学校や仕事について、留学に向けた予定は決まっていますか？",
        supplement: "まだ何も決めていなくて大丈夫です。今の状況に近いものを選んでください。",
        options: ADJUSTMENT_OPTIONS,
        freeText: {
          label: "予定についての補足があれば",
          placeholder: "例: 上司にはまだ話していない",
        },
      },
      {
        kind: "singleSelect",
        id: "family-sharing",
        heading: "家族には留学について話していますか？",
        supplement:
          "話せているかどうかを整理するだけの質問です。説明のための資料は、あとで My Karte で作れます。",
        options: FAMILY_SHARING_OPTIONS,
        freeText: {
          label: "家族の反応や状況があれば",
          placeholder: "例: 母は前向き、父はまだ反対している",
        },
      },
    ],
  },
  {
    id: "priorities",
    title: "優先順位",
    questions: [
      {
        kind: "rating",
        id: "priority-rating",
        heading: "留学先を選ぶとき、それぞれがあなたにとってどのくらい大切ですか？",
        supplement:
          "10個の項目それぞれに、1〜5で今の気持ちをつけてみてください。全部大事に感じても大丈夫です。まずは直感で構いません。",
        items: PRIORITY_ITEMS,
      },
      {
        kind: "ranking",
        id: "priority-ranking",
        heading: "この中でも、特に大事にしたいものを3つ選んで、順位をつけてください。",
        supplement:
          "問1で高い点数をつけたものが多くても、あえて3つに絞るならどれか、を考えてみてください。ここではっきりした順位が見えると、学校選びの軸になります。",
        items: PRIORITY_ITEMS,
        maxRanks: 3,
      },
      {
        kind: "compromise",
        id: "priority-compromise",
        heading: "反対に、この中で少し条件が合わなくても受け入れられそうなものはありますか？",
        supplement:
          "全部を完璧に満たす学校は多くありません。「これは大事だけど、他が良ければ多少妥協できる」と思えるものがあれば選んでみてください。無ければ「特にない」を選んでください。",
        items: PRIORITY_ITEMS,
      },
    ],
  },
  {
    id: "anxiety",
    title: "不安と障壁",
    questions: [
      {
        kind: "freeText",
        id: "anxiety-biggest",
        heading: "今、いちばん引っかかっている不安は何ですか？",
        supplement:
          "お金、英語、仕事、家族、安全…いろいろあると思います。あえて「これが一番大きい」を選ぶとしたら？ 複数あっても、うまく言えなくても大丈夫です。",
        examples: [
          "やっぱり、お金が足りるかどうか",
          "英語が通じなかったらどうしよう、と思う",
          "仕事を辞めることに、踏ん切りがつかない",
          "漠然と不安だけど、何が不安かうまく言えない",
        ],
      },
      {
        kind: "freeText",
        id: "anxiety-blocker",
        heading: "今すぐ「行く」と決められないとしたら、何が引っかかっていますか？",
        supplement:
          "決めきれない理由が分かると、次に何をクリアすればいいかが見えてきます。正直な気持ちで大丈夫です。",
        examples: [
          "お金の目処が、まだ立っていないから",
          "家族とちゃんと話せていないから",
          "本当に行くべきか、自分でも迷っているから",
          "特に理由はないけど、なんとなく踏み出せない",
        ],
      },
      {
        kind: "freeText",
        id: "anxiety-resolved",
        heading: "その不安が解消されたら、前に進めそうですか？",
        supplement:
          "この問いは、あなたの「本当の気持ち」を映します。不安さえ消えれば行きたいのか、それとも別の迷いがあるのか、考えてみてください。",
        examples: [
          "お金の不安さえ消えれば、すぐにでも行きたい",
          "不安が減れば、前向きに考えられると思う",
          "不安が消えても、まだ迷いは残りそう",
          "自分でも、どうなるか分からない",
        ],
      },
    ],
  },
  {
    id: "nextstep",
    title: "次の一歩",
    questions: [
      {
        kind: "singleSelect",
        id: "nextstep-readiness",
        heading: "今の時点で、留学についてどのくらい進みたい気持ちですか？",
        supplement:
          "ここまで考えてみた今の気持ちに、一番近いものを選んでください。途中で変わっても大丈夫です。",
        options: READINESS_OPTIONS,
      },
      {
        kind: "multiSelect",
        id: "nextstep-topics",
        heading: "次に、確認したい・整理したいことは何ですか？",
        supplement: "今の自分に足りていない情報や、整理したいことを選んでください。いくつでも大丈夫です。",
        options: NEXT_TOPICS,
      },
    ],
  },
];

/**
 * アコーディオン開閉・進捗表示・「次へ進む」の判定用に、カテゴリをまたいだ1本のリストに平坦化したもの。
 * Plan Home側の回答済み件数表示（lib/worksheetProgress.ts）でも、質問カタログの二重定義を避けるため
 * これをそのまま再利用する。
 */
export const ALL_QUESTIONS: { question: Question; categoryId: string }[] = CATEGORIES.flatMap((category) =>
  category.questions.map((question) => ({ question, categoryId: category.id })),
);

/**
 * localStorage 復元時の sanitize 用に、カタログ上「実在する」選択肢 id を kind ごとに集めたもの。
 * sanitizeWorksheetState は設問単位ではなく kind 単位の集合で検証するため、選択式の設問を
 * 増やしたときにここを更新し忘れると、保存済みの選択が黙って捨てられる。カタログから
 * 導出することで、その取りこぼしが起きないようにする。
 */
export const ALL_SINGLE_SELECT_OPTION_IDS: Set<string> = new Set(
  ALL_QUESTIONS.flatMap(({ question }) =>
    question.kind === "singleSelect" ? question.options.map((o) => o.id) : [],
  ),
);

export const ALL_MULTI_SELECT_OPTION_IDS: Set<string> = new Set(
  ALL_QUESTIONS.flatMap(({ question }) =>
    question.kind === "multiSelect" ? question.options.map((o) => o.id) : [],
  ),
);
