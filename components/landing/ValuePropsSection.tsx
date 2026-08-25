const VALUE_LINES = [
  "「なぜ行きたいか」から考える。条件だけでなく、気持ちや不安も整理します。",
  "ChatとWorksheet、両方からPlanが少しずつ育っていきます。",
  "学校を探す前に、まず自分の軸をつくる。「今は行かない」という選択も含めて考えられます。",
];

/**
 * 「I'm ready!ならではの価値」section。カードを大量に並べず、短い文章のまとまりで静かに伝える。
 * 「意思決定」という硬い語は使わない。
 * 学校提案については、この節の最後に控えめな1文だけ添える（自分を整理する→Planができる→
 * 必要になったら学校候補も考えられる、という順番を守るため最後に置き、主役にはしない）。
 */
export default function ValuePropsSection() {
  return (
    <section className="px-4 py-16 md:px-8 md:py-20 lg:px-[60px] lg:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-xl font-semibold leading-snug text-worksheet-primary sm:text-2xl">
          留学先を決める前に、
          <br />
          自分のことを整理する。
        </h2>

        <div className="mx-auto mt-8 max-w-xl space-y-4 text-left">
          {VALUE_LINES.map((line) => (
            <p key={line} className="text-sm leading-relaxed text-worksheet-secondary sm:text-base">
              {line}
            </p>
          ))}
        </div>

        <div className="mx-auto mt-10 max-w-xl border-t border-worksheet-border pt-6">
          <p className="text-xs text-worksheet-secondary sm:text-sm">
            必要になったら、学校の候補も一緒に考えられます。
          </p>
        </div>
      </div>
    </section>
  );
}
