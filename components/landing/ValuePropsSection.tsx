type Accent = "sky" | "amber" | "sage";

const ACCENT_DOT_CLASS: Record<Accent, string> = {
  sky: "bg-sky-400",
  amber: "bg-amber-400",
  sage: "bg-emerald-500",
};

const VALUE_ITEMS: { number: string; accent: Accent; headline: string; body: string }[] = [
  {
    number: "01",
    accent: "sky",
    headline: "「なぜ行きたいか」から考える",
    body: "条件だけでなく、気持ちや不安も整理します。",
  },
  {
    number: "02",
    accent: "amber",
    headline: "ChatとWorksheet、両方から育つ",
    body: "少しずつ、自分だけのPlanになっていきます。",
  },
  {
    number: "03",
    accent: "sage",
    headline: "学校を探す前に、自分の軸をつくる",
    body: "「今は行かない」という選択も含めて考えられます。",
  },
];

/**
 * 「I'm ready!ならではの価値」section。カードを5枚並べるようなUIにはせず、3項目それぞれに
 * 小さな番号・short headline・color accent（How it worksと同じsky/amber/sageの3色）を添えて、
 * 静かに、かつ読みやすく伝える。「意思決定」という硬い語は使わない。
 * 学校提案については、この節の最後に控えめな1文＋小さなschool card visualだけ添える
 * （自分を整理する→Planができる→必要になったら学校候補も考えられる、という順番を守るため
 * 最後に置き、主役にはしない。カードは1枚だけの控えめなサイズに留めている）。
 */
export default function ValuePropsSection() {
  return (
    <section className="bg-worksheet-surface px-4 py-16 md:px-8 md:py-20 lg:px-[60px] lg:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-semibold leading-snug text-worksheet-primary sm:text-3xl">
          留学先を決める前に、
          <br />
          自分のことを整理する。
        </h2>

        <div className="mx-auto mt-10 max-w-lg space-y-6 text-left">
          {VALUE_ITEMS.map((item) => (
            <div key={item.number} className="flex items-start gap-4">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ACCENT_DOT_CLASS[item.accent]}`} aria-hidden />
              <div className="min-w-0">
                <p className="text-xs font-medium text-worksheet-secondary">{item.number}</p>
                <p className="mt-0.5 text-base font-semibold text-worksheet-primary sm:text-lg">{item.headline}</p>
                <p className="mt-1 text-sm leading-relaxed text-worksheet-secondary sm:text-base">{item.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-12 flex max-w-lg items-center gap-3 border-t border-worksheet-border pt-6 text-left">
          <div className="h-10 w-10 shrink-0 rounded-xl bg-worksheet-surface-2" aria-hidden />
          <p className="text-xs text-worksheet-secondary sm:text-sm">
            必要になったら、学校の候補も一緒に考えられます。
          </p>
        </div>
      </div>
    </section>
  );
}
