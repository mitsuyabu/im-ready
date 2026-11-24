/**
 * Plan Home のカード配置の確認スクリプト。
 *
 *   npx tsx scripts/test-plan-home-layout.ts
 *
 * 固定したいこと:
 *   1. PC（lg 以上）は 左: AI相談 → Worksheet → My Karte / 右: About This Plan
 *   2. mobile（1 カラム）は従来の DOM 順（AI相談 → Worksheet → About This Plan → My Karte）
 *   3. カードの中身（見出し・説明・アイコン・ボタン・route・見た目）は変えていない
 *   4. gap は従来と同じ（カード間 16px / 左右 24px）で、左右の高さを無理に揃えない
 *
 * server component のソースを読んで検査する（描画・DB アクセスはしない）。
 */

import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    pass++;
    console.log(`  OK   ${message}`);
  } else {
    fail++;
    console.error(`  FAIL ${message}`);
  }
}

const src = readFileSync("app/plans/[planId]/page.tsx", "utf8");

/**
 * 「もう X をしていない」を検査するときに使う。日本語の説明コメントに X の文字列が
 * 残っていると誤検知するため、実行されるコードだけを見る。
 */
function stripComments(code: string): string {
  return code
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ") // JSX コメント
    .replace(/\/\*[\s\S]*?\*\//g, " ") // ブロックコメント
    .replace(/^[ \t]*\/\/.*$/gm, " "); // 行コメント
}

const code = stripComments(src);

/** カードごとの目印（見出し or アイコン）の出現位置。 */
const at = {
  ai: src.indexOf('<h2 className="text-lg font-bold text-[#2b3a55]">AI相談</h2>'),
  worksheet: src.indexOf('<h2 className="text-lg font-bold text-[#2b3a55]">Worksheet</h2>'),
  about: src.indexOf("About This Plan\n"),
  myKarte: src.indexOf(">My Karte</h2>"),
};

console.log("Test 1: mobile（1 カラム）の表示順は従来どおり");
{
  for (const [key, index] of Object.entries(at)) {
    assert(index > 0, `${key} カードを検出できた（テストの前提）`);
  }
  // mobile は outer が flex-col なので DOM 順がそのまま表示順になる
  assert(src.includes("mt-6 flex flex-col gap-4 lg:grid"), "mobile は従来どおり 1 カラム（flex flex-col gap-4）");
  assert(
    at.ai < at.worksheet && at.worksheet < at.about && at.about < at.myKarte,
    "DOM 順は AI相談 → Worksheet → About This Plan → My Karte（mobile の順番を変えていない）",
  );
}

console.log("Test 2: PC（lg 以上）は左 3 枚 / 右 1 枚");
{
  // 左カラム: AI相談（1段）→ Worksheet（2段）→ My Karte（3段）
  const leftPlacements: [string, string][] = [
    ["AI相談", "lg:col-start-1 lg:row-start-1"],
    ["Worksheet", "lg:col-start-1 lg:row-start-2"],
    ["My Karte", "lg:col-start-1 lg:row-start-3"],
  ];
  for (const [label, placement] of leftPlacements) {
    assert(src.includes(placement), `${label} は左カラムの指定（${placement}）がある`);
  }
  // 右カラム: About This Plan のみ
  assert(src.includes("lg:col-start-2 lg:row-start-1 lg:row-span-3"), "About This Plan だけが右カラム");
  assert((src.match(/lg:col-start-2 lg:row-start-/g) ?? []).length === 1, "右カラムに置いているカードは 1 枚だけ");
  assert((src.match(/lg:col-start-1 lg:row-start-/g) ?? []).length === 3, "左カラムに置いているカードは 3 枚");
  // 旧レイアウトのカラム wrapper は残っていない
  assert(!src.includes("左カラム（広め）: AI相談 → Worksheet"), "旧レイアウトのカラム wrapper コメントが残っていない");
  assert(!src.includes("右カラム（狭め）: About This Plan → Documents"), "旧レイアウトの右カラム wrapper コメントが残っていない");
}

console.log("Test 3: gap と高さ（既存のデザインのまま・高さを揃えない）");
{
  assert(src.includes("lg:gap-x-6 lg:gap-y-4"), "左右 24px / カード間 16px（従来と同じ）");
  assert(!src.includes("lg:gap-6\"") , "列と行をまとめた lg:gap-6 にはしていない（行の間隔が広がらない）");
  assert(src.includes("lg:self-start"), "右カラムは self-start（左の高さに合わせて伸ばさない）");
  // カードの見た目のトークンは従来のまま
  assert(src.includes("lg:min-h-[160px]"), "AI相談 / Worksheet の最小高さはそのまま");
  assert(src.includes("lg:min-h-[220px]"), "About This Plan の最小高さはそのまま");
  assert(src.includes("lg:min-h-[165px]"), "My Karte の最小高さはそのまま");
  assert(src.includes("lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]"), "カラム幅の比率は従来のまま");
}

console.log("Test 4: カードの中身・route を変えていない");
{
  for (const needle of [
    // 見出し
    ">AI相談</h2>",
    ">Worksheet</h2>",
    "About This Plan",
    ">My Karte</h2>",
    // 説明文
    "考えたことや決めたことを、相談や共有に使いやすい資料にまとめます。",
    // ボタン文言
    "資料を見る →",
    "見直す →",
    "My Planを見る →",
    // アイコン
  ]) {
    assert(src.includes(needle), `「${needle}」はそのまま`);
  }
  // route
  for (const href of [
    "href={`/plans/${typedPlan.id}/chat`}",
    "href={`/plans/${typedPlan.id}/worksheet`}",
    "href={`/plans/${typedPlan.id}/my-plan`}",
    "href={`/plans/${typedPlan.id}/documents`}",
  ]) {
    assert(src.includes(href), `route ${href.replace("href={`", "").replace("`}", "")} はそのまま`);
  }
  // 既存の取得ロジック・進捗表示
  assert(src.includes("<PlanWorksheetProgress planId={typedPlan.id} karte={karte} serverWorksheet={worksheet} />"), "Worksheet の進捗表示はそのまま");
  assert(src.includes("summarizeKarteForCard(karte)"), "Karte のサマリー取得はそのまま");
}

console.log("Test 5: sidebar / bottom nav には手を入れていない");
{
  const nav = readFileSync("components/AppNav.tsx", "utf8");
  assert(!nav.includes("DESKTOP_PLAN_NAV_ORDER"), "PC サイドバー用の並び替えは残っていない");
  assert(!nav.includes("desktopPlanNavItems"), "並び替え関数は残っていない");
  assert(
    nav.includes('{ key: "myPlan", label: "My Plan", href: `/plans/${planId}/my-plan`, icon: MyPlanIcon },') &&
      nav.includes('{ key: "myKarte", label: "My Karte", href: `/plans/${planId}/documents`, icon: DocStackIcon },'),
    "nav の項目定義は元のまま（My Plan → My Karte の順）",
  );
  assert(nav.includes("{planNavItems(planId).map((item) => ("), "PC サイドバーは planNavItems をそのまま使っている");
  assert(nav.includes("planNavItems(planId)\n          .slice(0, 4)"), "mobile bottom nav も従来どおり");
}

console.log("Test 6: My Karte カード内部は PC だけ 3 列（AI相談 / Worksheet と同じ CTA 配置）");
{
  const cardStart = src.indexOf("{/* My Karte（PC: 左カラム 3 段目");
  const cardEnd = src.indexOf("</section>", src.indexOf(">My Karte</h2>"));
  assert(cardStart > 0 && cardEnd > cardStart, "My Karte カードの範囲を特定できた（テストの前提）");
  const card = src.slice(cardStart, cardEnd);

  // 列構成: mobile 2 列（アイコン / テキスト）→ PC 3 列（アイコン / テキスト / CTA）
  assert(card.includes("grid grid-cols-[auto_minmax(0,1fr)]"), "mobile は 2 列 grid（アイコン列 + テキスト列）");
  assert(card.includes("lg:grid-cols-[auto_minmax(0,1fr)_auto]"), "PC は 3 列 grid（アイコン / テキスト / CTA）");
  assert(card.includes("gap-x-4") && card.includes("lg:gap-x-6"), "列の間隔は mobile 16px / PC 24px（AI相談 / Worksheet と同じ 24px）");
  assert(card.includes("lg:content-center"), "PC は min-h の中で縦中央（Worksheet の items-center と同じ見え方）");
  assert(card.includes("p-5 sm:p-6") && card.includes("lg:p-7"), "card padding は PC で 28px（AI相談 / Worksheet の sm:p-7 と同値）");

  // アイコン: 常に 1 列目。PC では行をまたいで縦中央
  assert(card.includes("col-start-1 row-start-1 lg:row-span-3 lg:self-center"), "アイコンは 1 列目で、PC では行をまたいで縦中央");
  assert(card.includes("${CARD_ICON_CLASS}"), "アイコンのサイズ指定は共通の CARD_ICON_CLASS のまま");

  // 見出し: 常に 2 列目（アイコンの右）
  assert(card.includes('className="col-start-2 row-start-1 min-w-0 text-lg font-bold text-[#2b3a55]">My Karte'), "見出しは常にアイコンの右（2 列目）");

  // 説明文: mobile は 2 列ぶち抜き（カード全幅）、PC は 2 列目（伸縮する列）
  assert(
    /col-span-2 col-start-1 row-start-2 mt-2[^"]*lg:col-span-1 lg:col-start-2 lg:mt-1/.test(card),
    "説明文は mobile ではカード全幅、PC ではアイコンの右（2 列目）",
  );

  // CTA: mobile は説明文の下、PC は 3 列目の右端・縦中央
  assert(/col-span-2 col-start-1 row-start-3 mt-3/.test(card), "CTA は mobile では従来どおり説明文の下");
  assert(card.includes("justify-self-start"), "mobile の CTA は内容幅のまま左寄せ（横に伸びない）");
  assert(
    card.includes("lg:col-span-1 lg:col-start-3 lg:row-start-1 lg:row-span-3 lg:mt-0 lg:self-center lg:justify-self-end"),
    "PC の CTA は 3 列目・行をまたいで縦中央・右端（mt-3 は PC では打ち消す）",
  );
  // PC で CTA がテキスト列に残っていない / 下段に落ちていない
  assert(!/lg:col-start-2[^"]*lg:row-start-3/.test(card), "PC の CTA はテキスト列（2 列目）に残っていない");

  // 旧構造（アイコン＋見出しだけを包む flex 行）は残っていない
  assert(!card.includes('<div className="flex items-center gap-4">'), "旧構造（アイコン＋見出しの flex 行）は残っていない");

  // 文言 / route / アイコンは不変
  assert(card.includes(">My Karte</h2>"), "title は不変");
  assert(card.includes("考えたことや決めたことを、相談や共有に使いやすい資料にまとめます。自分の考えを振り返るときにも役立ちます。"), "description は不変");
  assert(card.includes("<MyKarteIllustration"), "図版は My Karte 用の SVG イラスト");
  assert(card.includes("資料を見る →"), "button text は不変");
  assert(card.includes("href={`/plans/${typedPlan.id}/documents`}"), "route は不変");
  // card chrome（border / shadow / radius / 幅）は共通 CARD のまま
  assert(card.includes("${CARD} overflow-hidden"), "card chrome は共通 CARD のまま（border / shadow / radius 不変）");
  assert(card.includes("style={CARD_SURFACE.myKarte}"), "地色はグラデーション + 地紋 + きらめきの共通レイヤーから受け取る");

  // AI相談 / Worksheet 側は変更していない
  assert(
    (src.match(/\$\{CARD\} flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-7/g) ?? []).length === 2,
    "AI相談 / Worksheet のカード構造は変更していない",
  );
}

console.log("Test 7: Plan Home の 4 カードだけがグラデーション + 地紋 + きらめき（他ページへ波及しない）");
{
  // 表層は CARD_SURFACE に集約し、カード側は style で受け取るだけ
  for (const key of ["chat", "worksheet", "myKarte", "about"]) {
    assert(new RegExp(`${key}: cardSurface\\("#[0-9a-f]{6}", "linear-gradient\\(`).test(src), `${key} は きらめき色 + グラデーションを CARD_SURFACE で定義している`);
    assert(src.includes(`style={CARD_SURFACE.${key}}`), `${key} カードは CARD_SURFACE.${key} を適用している`);
  }
  assert((src.match(/style=\{CARD_SURFACE\./g) ?? []).length === 4, "表層を当てているのは 4 カードだけ");
  assert(!code.includes("CARD_TINT"), "前フェーズのベタ塗り（CARD_TINT）は残っていない");
  assert(!/\$\{(CARD|ABOUT_CARD)\} bg-/.test(src), "カードに bg-* のベタ塗りクラスは残っていない");

  // 3 枚の重ね順と敷き方（きらめき → 地紋 → グラデーション）
  assert(src.includes("backgroundImage: `${svgUrl(decorSvg(spark))}, ${svgUrl(patternSvg(spark))}, ${gradient}`"), "重ね順は きらめき → 地紋 → グラデーション");
  assert(src.includes('backgroundRepeat: "no-repeat, repeat, no-repeat"'), "地紋だけリピートし、きらめきとグラデーションは 1 枚");
  assert(src.includes('backgroundPosition: "right bottom, left top, left top"'), "きらめきはカード右側");
  assert(src.includes('backgroundSize: "auto 100%, 64px 64px, 100% 100%"'), "地紋は 64px 角、グラデーションはカード全面");
  // background-image は本文より必ず背面なので、z-index を増やしていない
  assert(!/z-\[?\d/.test(src), "装飾のために z-index を足していない");
  // 角丸で切り取るための overflow-hidden
  assert(src.includes('"relative overflow-hidden rounded-[18px] border border-[#e7ddc9] shadow-card"'), "CARD は角丸で装飾を切り取る（border / radius / shadow は不変）");
  assert(src.includes('"relative overflow-hidden rounded-[18px] border border-[#e6e1d8] shadow-card"'), "ABOUT_CARD も同様");

  // きらめきの形（雲は不採用）
  assert(src.includes("const SPARKLE_D"), "4 点きらめきの形は 1 か所に定義して使い回す");
  {
    const decor = src.slice(src.indexOf("const decorSvg"), src.indexOf("const patternSvg"));
    assert(!decor.includes("#ffffff"), "装飾レイヤーに白い雲は残っていない");
    assert(!decor.includes("<circle"), "装飾レイヤーに雲の円は残っていない");
    assert(!decor.includes("<rect"), "装飾レイヤーに雲の角丸は残っていない");
    assert((decor.match(/d="\$\{SPARKLE_D\}"/g) ?? []).length === 3, "装飾レイヤーはきらめき 3 粒だけ");
  }

  // CTA は据え置き
  assert(src.includes("bg-[#e0806a]"), "AI相談のコーラル CTA は不変");
  assert((src.match(/border border-\[#2b3a55\]\/30 bg-white/g) ?? []).length === 2, "Worksheet / My Karte の outline ボタンは不変");
}

console.log("Test 8: 3 カードの図版は Mindtrip 参考の SVG イラストで統一");
{
  // 既製の 3D アイコンはどれも参照していない
  for (const webp of ["ai-chat", "worksheet", "documents"]) {
    assert(!code.includes(`/plan-icons/${webp}.webp`), `既製の 3D アイコン（${webp}.webp）はもう参照していない`);
  }
  assert(!code.includes('from "next/image"'), "画像コンポーネントは使わなくなった");

  const illos: [string, string, string][] = [
    ["AiConsultIllustration", "<AiConsultIllustration className={CARD_ICON_CLASS} />", "#e0806a"],
    ["WorksheetIllustration", "<WorksheetIllustration className={CARD_ICON_CLASS} />", "#7f9a6a"],
    ["MyKarteIllustration", "<MyKarteIllustration className={`${CARD_ICON_CLASS} col-start-1 row-start-1 lg:row-span-3 lg:self-center`} />", "#cf9f4c"],
  ];
  for (const [name, usage, spark] of illos) {
    assert(src.includes(usage), `${name} を共通サイズ枠で表示している`);
    const start = src.indexOf(`function ${name}`);
    const end = src.indexOf("\n}\n", start);
    assert(start > 0 && end > start, `${name} を特定できた（テストの前提）`);
    const illo = src.slice(start, end);

    assert(illo.includes('viewBox="0 0 96 96"'), `${name}: 正方形の viewBox`);
    assert(!/<(Image|img)\b/.test(illo), `${name}: 画像ファイルではなくベクター`);
    assert(illo.includes("aria-hidden"), `${name}: 装飾なので支援技術からは隠す`);
    assert(illo.includes('stroke="#2b3a55"'), `${name}: 輪郭は見出しと同じ navy`);
    assert(illo.includes("feGaussianBlur"), `${name}: 下地のにじみはぼかして水彩に見せる`);
    assert(illo.includes("d={SPARKLE_D}"), `${name}: きらめきはカード装飾と同じ形を使う`);
    assert(illo.includes(`fill="${spark}"`), `${name}: きらめきの色はカードの系統色`);
    assert(!/<rect[^>]*width="96"[^>]*height="96"/.test(illo), `${name}: 背景は塗らない（カードの地が下地）`);
  }
  assert(src.includes('const CARD_ICON_CLASS = "h-16 w-16 shrink-0 sm:h-20 sm:w-20 lg:h-24 lg:w-24"'), "図版のサイズ枠は 3 カード共通のまま");
}

console.log("");
console.log(`passed: ${pass} / failed: ${fail}`);
if (fail > 0) process.exit(1);
