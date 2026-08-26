import type { ReactNode } from "react";
import ChatMockVisual from "@/components/landing/mock/ChatMockVisual";
import WorksheetMockVisual from "@/components/landing/mock/WorksheetMockVisual";
import MyPlanMockVisual from "@/components/landing/mock/MyPlanMockVisual";

type Accent = "sky" | "amber" | "sage";

const ACCENT_NUMBER_CLASS: Record<Accent, string> = {
  sky: "text-sky-600",
  amber: "text-amber-600",
  sage: "text-emerald-700",
};

const STEPS: {
  number: string;
  accent: Accent;
  headline: string;
  description: string;
  visual: ReactNode;
}[] = [
  {
    number: "01",
    accent: "sky",
    headline: "まだ言葉になっていないことから、話してみる。",
    description:
      "「なぜ行きたいのか」「何が不安なのか」。まとまっていなくても大丈夫です。AIとの会話を通して、気持ちや条件を少しずつ整理していきます。",
    visual: <ChatMockVisual />,
  },
  {
    number: "02",
    accent: "amber",
    headline: "自分のペースで、考えを整理する。",
    description: "目的、将来、条件、優先順位、不安。会話だけでは整理しきれないことを、Worksheetでじっくり考えられます。",
    visual: <WorksheetMockVisual />,
  },
  {
    number: "03",
    accent: "sage",
    headline: "話したこと、考えたことが、ひとつのPlanになる。",
    description: "ChatやWorksheetで整理した内容から、自分だけの留学Planが少しずつかたちになります。",
    visual: <MyPlanMockVisual />,
  },
];

/**
 * 「How it works」と「主要機能」は別sectionに分けず、説明＋実際のUI visualを1セットにする。
 * Hero直後に「How it Works」という大見出しを置き、Heroのオレンジから白背景へ切り替わる
 * ことでsectionの区切りを明確にする。
 *
 * Desktopでは奇数/偶数stepでtext-left/visual-rightを反転させ、visualの比率を7/12→8/12へ
 * 拡大した（文字だけが小さくポツンと見える状態を避けるため）。mobileでは常にtext→visualの順に
 * 積む（flex-col + lg:flex-row-reverseの組み合わせにより、DOM順は変えずCSSだけで反転させている）。
 *
 * 各stepには淡いaccent色（Chat=sky, Worksheet=amber, My Plan=sage）を割り当て、番号の色と
 * visual側のトーンだけに使う（白・黒・sageという基本色は崩さず、原色ベタ塗り・gradientは使わない）。
 * Visualはmock（components/landing/mock/*）で、実際のChat/Worksheet/My Planのcomponent・
 * ロジックには依存していない。
 */
export default function HowItWorksSection() {
  return (
    <section className="bg-worksheet-surface px-4 py-20 md:px-8 md:py-24 lg:px-[60px] lg:py-28">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-worksheet-primary sm:text-4xl lg:text-5xl">
          How it Works
        </h2>
        <p className="mt-3 text-sm text-worksheet-secondary sm:text-base">話す。整理する。Planになる。</p>
      </div>

      <div className="mx-auto mt-16 flex max-w-6xl flex-col gap-20 sm:mt-20 sm:gap-24 lg:gap-32">
        {STEPS.map((step, index) => {
          const reversed = index % 2 === 1;
          return (
            <div
              key={step.number}
              className={`flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-16 ${
                reversed ? "lg:flex-row-reverse" : ""
              }`}
            >
              <div className="lg:w-4/12">
                <p className={`text-sm font-semibold tracking-wide ${ACCENT_NUMBER_CLASS[step.accent]}`}>
                  {step.number}
                </p>
                <h3 className="mt-2 text-2xl font-semibold leading-snug text-worksheet-primary sm:text-3xl">
                  {step.headline}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-worksheet-secondary sm:text-lg">
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
