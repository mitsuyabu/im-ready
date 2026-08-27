import type { ReactNode } from "react";
import Image from "next/image";

/** public/landing/how-it-works-chat.png・how-it-works-worksheet.png・
 *  how-it-works-my-plan.pngの実寸(px)。wrapperのaspect-ratioをこれに厳密に一致させる
 *  ことで、object-coverでも実際には一切croppingが発生しないようにしている。 */
const CHAT_VISUAL_WIDTH = 1536;
const CHAT_VISUAL_HEIGHT = 1024;
const WORKSHEET_VISUAL_WIDTH = 1484;
const WORKSHEET_VISUAL_HEIGHT = 1060;
const MY_PLAN_VISUAL_WIDTH = 1719;
const MY_PLAN_VISUAL_HEIGHT = 915;

type Accent = "sky" | "amber" | "sage";

const ACCENT_NUMBER_CLASS: Record<Accent, string> = {
  sky: "text-sky-600",
  amber: "text-amber-600",
  sage: "text-emerald-700",
};

const STEPS: {
  number: string;
  accent: Accent;
  /** 大きく見せる短いheadline（Chat/Worksheet/My Planを直接指す） */
  title: string;
  /** titleとdescriptionの間の、やや強調したlead文（既存の文言をそのまま使用） */
  lead: string;
  description: string;
  visual: ReactNode;
}[] = [
  {
    number: "01",
    accent: "sky",
    title: "Chatで話す",
    lead: "まだ言葉になっていないことから、話してみる。",
    description:
      "「なぜ行きたいのか」「何が不安なのか」。まとまっていなくても大丈夫です。AIとの会話を通して、気持ちや条件を少しずつ整理していきます。",
    // 完成された1枚絵（チャットUI×都市・語学学校の写真群）のため、mockカードのような
    // 追加要素は重ねない。wrapperのaspect-ratioを画像の実寸に一致させ、object-coverでも
    // cropが発生しないようにしている（02/03のmock visualとは異なる種類のvisualのため、
    // 個別にJSXを書いている）。
    visual: (
      <div
        className="relative w-full overflow-hidden rounded-3xl shadow-sm"
        style={{ aspectRatio: `${CHAT_VISUAL_WIDTH} / ${CHAT_VISUAL_HEIGHT}` }}
      >
        <Image
          src="/landing/how-it-works-chat.png"
          alt=""
          fill
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover"
        />
      </div>
    ),
  },
  {
    number: "02",
    accent: "amber",
    title: "Worksheetで整理する",
    lead: "自分のペースで、考えを整理する。",
    description: "目的、将来、条件、優先順位、不安。会話だけでは整理しきれないことを、Worksheetでじっくり考えられます。",
    // 01と同様、完成された1枚絵（Worksheet UI×Why?/Conditions/Worries/Priorityカード×
    // 人物・都市写真）のため、mockカードや色付き背景箱は重ねない。wrapperのaspect-ratioを
    // 画像の実寸に一致させ、object-coverでもcropが発生しないようにしている。
    visual: (
      <div
        className="relative w-full overflow-hidden rounded-3xl shadow-sm"
        style={{ aspectRatio: `${WORKSHEET_VISUAL_WIDTH} / ${WORKSHEET_VISUAL_HEIGHT}` }}
      >
        <Image
          src="/landing/how-it-works-worksheet.png"
          alt=""
          fill
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover"
        />
      </div>
    ),
  },
  {
    number: "03",
    accent: "sage",
    title: "My Planが育つ",
    lead: "話したこと、考えたことが、ひとつのPlanになる。",
    description: "ChatやWorksheetで整理した内容から、自分だけの留学Planが少しずつかたちになります。",
    // 01/02と同様、完成された1枚絵（My Study Abroad Plan UI×Why/Budget/City/Departure×
    // 留学先・人物写真）のため、mockカードや色付き背景箱は重ねない。wrapperのaspect-ratioを
    // 画像の実寸に一致させ、object-coverでもcropが発生しないようにしている。
    visual: (
      <div
        className="relative w-full overflow-hidden rounded-3xl shadow-sm"
        style={{ aspectRatio: `${MY_PLAN_VISUAL_WIDTH} / ${MY_PLAN_VISUAL_HEIGHT}` }}
      >
        <Image
          src="/landing/how-it-works-my-plan.png"
          alt=""
          fill
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover"
        />
      </div>
    ),
  },
];

/**
 * 「How it works」と「主要機能」は別sectionに分けず、説明＋実際のUI visualを1セットにする。
 * Hero直後に「How it Works」という大見出しを置き、Heroのオレンジから白背景へ切り替わる
 * ことでsectionの区切りを明確にする。見出しはpage全体の主見出しとして扱い、参考にした
 * Mindtripのように大きく・太く・中央寄せで表示する（Desktop text-6xl、Mobile text-4xl）。
 *
 * 各stepは 番号（小さくaccent色）→title（大きく黒、Chat/Worksheet/My Planを直接示す短い語句）
 * →lead（中間サイズ、黒、既存の文言を流用）→description（body、黒85%）という4段階の階層。
 * Desktopでは奇数/偶数stepでtext-left/visual-rightを反転させ、visualは7/12→8/12相当の
 * 大きめ比率のまま維持する。mobileでは常にtext→visualの順に積む（flex-col +
 * lg:flex-row-reverseの組み合わせにより、DOM順は変えずCSSだけで反転させている）。
 *
 * 各stepには淡いaccent色（Chat=sky, Worksheet=amber, My Plan=sage）を割り当て、番号の色と
 * visual側のトーンだけに使う（白・黒・sageという基本色は崩さず、原色ベタ塗り・gradientは
 * 使わない）。本文はLP全体の方針に合わせてtext-worksheet-secondary（グレー）を廃止し、
 * 黒ベース（text-worksheet-primaryとその不透明度違い）に統一している。
 * 01 Chat・02 Worksheet・03 My Planいずれも支給された完成済み1枚絵（public/landing/
 * how-it-works-chat.png・how-it-works-worksheet.png・how-it-works-my-plan.png）をそのまま
 * 使い、mockカードや色付き背景箱は重ねない（旧ChatMockVisual.tsx・WorksheetMockVisual.tsx・
 * MyPlanMockVisual.tsxはいずれも他に使用箇所が無いことを確認した上で削除した）。
 */
export default function HowItWorksSection() {
  return (
    <section className="bg-worksheet-surface px-4 py-20 md:px-8 md:py-24 lg:px-[60px] lg:py-32">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-4xl font-bold tracking-tight text-worksheet-primary sm:text-5xl lg:text-6xl">
          How it Works
        </h2>
        <p className="mt-4 text-sm font-medium text-worksheet-primary/80 sm:text-base">
          話す。整理する。Planになる。
        </p>
      </div>

      <div className="mx-auto mt-20 flex max-w-6xl flex-col gap-20 sm:mt-24 sm:gap-28 lg:mt-32 lg:gap-36">
        {STEPS.map((step, index) => {
          const reversed = index % 2 === 1;
          return (
            <div
              key={step.number}
              className={`flex flex-col gap-8 lg:flex-row lg:items-center lg:gap-16 ${
                reversed ? "lg:flex-row-reverse" : ""
              }`}
            >
              <div className="lg:w-4/12">
                <p className={`text-sm font-semibold tracking-wide ${ACCENT_NUMBER_CLASS[step.accent]}`}>
                  {step.number}
                </p>
                <h3 className="mt-3 text-3xl font-bold leading-tight text-worksheet-primary sm:text-4xl lg:text-5xl">
                  {step.title}
                </h3>
                <p className="mt-4 text-lg font-semibold leading-snug text-worksheet-primary sm:text-xl">
                  {step.lead}
                </p>
                <p className="mt-3 text-base leading-relaxed text-worksheet-primary/85 sm:text-lg">
                  {step.description}
                </p>
              </div>
              <div className="lg:w-8/12">{step.visual}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
