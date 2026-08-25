import ChatMockVisual from "@/components/landing/mock/ChatMockVisual";
import WorksheetMockVisual from "@/components/landing/mock/WorksheetMockVisual";
import MyPlanMockVisual from "@/components/landing/mock/MyPlanMockVisual";

const STEPS = [
  {
    number: "01",
    headline: "まだ言葉になっていないことから、話してみる。",
    description:
      "「なぜ行きたいのか」「何が不安なのか」。まとまっていなくても大丈夫です。AIとの会話を通して、気持ちや条件を少しずつ整理していきます。",
    visual: <ChatMockVisual />,
  },
  {
    number: "02",
    headline: "自分のペースで、考えを整理する。",
    description: "目的、将来、条件、優先順位、不安。会話だけでは整理しきれないことを、Worksheetでじっくり考えられます。",
    visual: <WorksheetMockVisual />,
  },
  {
    number: "03",
    headline: "話したこと、考えたことが、ひとつのPlanになる。",
    description: "ChatやWorksheetで整理した内容から、自分だけの留学Planが少しずつかたちになります。",
    visual: <MyPlanMockVisual />,
  },
];

/**
 * 「How it works」と「主要機能」は別sectionに分けず、説明＋実際のUI visualを1セットにする
 * （ご指示の通り）。Desktopでは奇数/偶数stepでtext-left/visual-rightを反転させ、
 * mobileでは常にtext→visualの順に積む（flex-col + lg:flex-row-reverseの組み合わせにより、
 * DOM順は変えずCSSだけで反転させている）。Visualはmock（components/landing/mock/*）で、
 * 実際のChat/Worksheet/My Planのcomponent・ロジックには依存していない。
 */
export default function HowItWorksSection() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20 lg:py-24">
      <div className="mx-auto flex max-w-5xl flex-col gap-16 sm:gap-20 lg:gap-28">
        {STEPS.map((step, index) => {
          const reversed = index % 2 === 1;
          return (
            <div
              key={step.number}
              className={`flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-16 ${
                reversed ? "lg:flex-row-reverse" : ""
              }`}
            >
              <div className="lg:w-5/12">
                <p className="text-xs font-medium tracking-wide text-worksheet-secondary">{step.number}</p>
                <h2 className="mt-2 text-xl font-semibold leading-snug text-worksheet-primary sm:text-2xl">
                  {step.headline}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-worksheet-secondary sm:text-base">
                  {step.description}
                </p>
              </div>
              <div className="lg:w-7/12">{step.visual}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
