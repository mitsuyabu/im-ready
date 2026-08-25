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

type SingleSelectQuestion = {
  kind: "singleSelect";
  id: string;
  heading: string;
  supplement: string;
  options: ChoiceOption[];
};

type MultiSelectQuestion = {
  kind: "multiSelect";
  id: string;
  heading: string;
  supplement: string;
  options: ChoiceOption[];
};

export type Question =
  | FreeTextQuestion
  | RatingQuestion
  | RankingQuestion
  | CompromiseQuestion
  | SingleSelectQuestion
  | MultiSelectQuestion;

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
    id: "conditions",
    title: "現実条件",
    questions: [
      {
        kind: "freeText",
        id: "timing",
        heading: "いつ頃、どのくらいの期間で考えていますか？",
        supplement:
          "まだ決まっていなくて大丈夫です。「なんとなくこのへん」でも、時期と期間のイメージがあると、計画が立てやすくなります。",
        examples: [
          "来年の春ごろ、半年〜1年くらい",
          "今の仕事が一段落したら。期間はまだ未定",
          "できるだけ早く行きたい。1年は滞在したい",
          "時期も期間も、まだ全然決めていない",
        ],
      },
      {
        kind: "freeText",
        id: "budget",
        heading: "予算は、今のところどのくらいをイメージしていますか？",
        supplement:
          "正確な金額でなくて大丈夫です。ざっくりの感覚や、「これくらいなら用意できそう」という範囲で。現地で働いて補う前提でも構いません。",
        examples: [
          "100万円くらいを目安に考えている",
          "200〜300万円は準備できそう",
          "あまり余裕はないので、現地で働きながら補いたい",
          "まだ具体的に計算できていない",
        ],
      },
      {
        kind: "freeText",
        id: "english-level",
        heading: "今の英語力は、自分ではどれくらいだと感じますか？",
        supplement:
          "テストのスコアがなくても大丈夫です。「話すのは苦手」「読むのはできる」など、正直な感覚で書いてみてください。",
        examples: [
          "挨拶くらいで、会話にはほとんど自信がない",
          "読み書きはできるけど、話すと固まってしまう",
          "日常会話はなんとなくできる。もっと伸ばしたい",
          "自分の英語力が、正直よく分からない",
        ],
      },
      {
        kind: "freeText",
        id: "local-work",
        heading: "現地で働くこと（アルバイトなど）は、考えていますか？",
        supplement:
          "費用の面でも、経験の面でも、現地で働くかどうかは大きな分かれ道です。今の気持ちに近いものを。",
        examples: [
          "費用を抑えたいので、現地で働くつもり",
          "経験として、働いてみたい気持ちがある",
          "勉強に集中したいので、働く予定はない",
          "働けるものなら働きたいけど、まだよく分からない",
        ],
      },
      {
        kind: "freeText",
        id: "study-format",
        heading: "現地では、どんな形で学ぶことを考えていますか？",
        supplement:
          "留学にはいろいろな形があります。今の時点でのイメージで大丈夫です。まだ決まっていなければ、それも含めて選んでみてください。",
        examples: [
          "まずは語学学校で、英語の基礎を固めたい",
          "語学学校のあと、大学や専門学校への進学も考えたい",
          "大学・大学院など、専門的な勉強をしに行きたい",
          "ワーキングホリデーで、働きながら生活の中で学びたい",
          "どんな形がいいか、まだ迷っている",
        ],
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
