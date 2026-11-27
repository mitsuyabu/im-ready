/**
 * Plan Home のカード配置の確認スクリプト。
 *
 *   npx tsx scripts/test-plan-home-layout.ts
 *
 * 固定したいこと:
 *   1. PC（lg 以上）は 左: AI相談 → Worksheet → My Karte / 右: About This Plan
 *   2. mobile（1 カラム）は従来の DOM 順（AI相談 → Worksheet → About This Plan → My Karte）
 *   3. カードの中身（見出し・説明・アイコン・ボタン・route）は変えていない
 *   4. gap は従来と同じ（カード間 16px / 左右 24px）で、左右の高さを無理に揃えない
 *   5. 新デザイン: カードは白地 + 薄い border + 控えめな影。機能別カラーはアイコン背景だけ、
 *      主要操作だけが蛍光ライム（パステルの全面塗り・地紋・きらめきレイヤーは廃止）
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
  ai: src.indexOf('<h2 className="mk-card-title">AI相談</h2>'),
  worksheet: src.indexOf('<h2 className="mk-card-title">Worksheet</h2>'),
  about: src.indexOf("About This Plan<"),
  myKarte: src.indexOf('<h2 className="mk-card-title">My Karte</h2>'),
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
  // 新デザイン: 情報量に対して余白が余らないよう、カードの最小高さは固定しない
  assert(!code.includes("lg:min-h-["), "カードの最小高さを固定していない（過剰な余白を作らない）");
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

console.log("Test 6: 3 枚のカードは同じ 1 行構成（アイコン / テキスト / CTA）");
{
  // AI相談 / Worksheet / My Karte は mobile 縦積み → sm 以上で横 1 行、という同じ骨格。
  assert(
    (src.match(/\$\{CARD\} flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-5 sm:p-6/g) ?? []).length === 3,
    "3 枚とも同じ card 構造（mobile は縦積み / sm 以上で 1 行）",
  );
  // 旧 My Karte 専用の grid 構造は残っていない
  assert(!code.includes("lg:grid-cols-[auto_minmax(0,1fr)_auto]"), "My Karte カード専用の 3 列 grid は残っていない");
  assert(!code.includes("col-span-2 col-start-1 row-start-3"), "My Karte カード専用の CTA 配置指定は残っていない");

  const cardStart = src.indexOf("{/* My Karte（PC: 左カラム 3 段目");
  const cardEnd = src.indexOf("</section>", src.indexOf('<h2 className="mk-card-title">My Karte</h2>'));
  assert(cardStart > 0 && cardEnd > cardStart, "My Karte カードの範囲を特定できた（テストの前提）");
  const card = src.slice(cardStart, cardEnd);

  // 文言 / route / 図版は不変
  assert(card.includes(">My Karte</h2>"), "title は不変");
  assert(
    card.includes("考えたことや決めたことを、相談や共有に使いやすい資料にまとめます。自分の考えを振り返るときにも役立ちます。"),
    "description は不変",
  );
  assert(card.includes("<MyKarteIllustration"), "図版は My Karte 用の SVG イラスト");
  assert(card.includes("資料を見る →"), "button text は不変");
  assert(card.includes("href={`/plans/${typedPlan.id}/documents`}"), "route は不変");
  assert(card.includes("${CARD}"), "card chrome は共通 CARD（= .mk-card）のまま");
}

console.log("Test 7: 白いカード + 機能別カラーはアイコン背景だけ + 主要操作だけ蛍光ライム");
{
  // 1) 旧デザイン（全面グラデーション + 地紋 + きらめきレイヤー）は完全に無くなっている
  for (const gone of ["CARD_SURFACE", "cardSurface(", "decorSvg", "patternSvg", "svgUrl(", "CARD_TINT"]) {
    assert(!code.includes(gone), `旧デザインの装飾レイヤー（${gone}）は残っていない`);
  }
  assert(!/style=\{CARD_SURFACE\./.test(src), "カードに表層 style を当てていない");
  assert(!/linear-gradient\(115deg/.test(src), "カード全面のパステルグラデーションは残っていない");
  assert(!code.includes("repeating-linear-gradient"), "方眼・地紋のリピート背景は残っていない");

  // 2) カードは共通の白いカード（.mk-card）
  assert(src.includes('const CARD = "mk-card relative overflow-hidden"'), "カードは共通の .mk-card（白地 + 薄い border + 控えめな影）");
  assert(!/\$\{CARD\} bg-\[/.test(src), "カードに地色のベタ塗りクラスを足していない");
  assert((src.match(/\$\{CARD\}/g) ?? []).length === 4, "4 枚とも同じカード chrome を使っている");

  // 3) 機能別カラーはアイコン背景だけ（カードの地にしない）
  const fnColors = ["--fn-chat", "--fn-worksheet", "--fn-karte", "--fn-plan"];
  for (const token of fnColors) {
    assert(src.includes(`backgroundColor: "var(${token})"`), `${token} を使っているのは背景色の指定だけ`);
  }
  assert(
    (src.match(/className=\{ICON_TILE\}/g) ?? []).length === 3,
    "AI相談 / Worksheet / My Karte の 3 枚にだけアイコンタイルを置いている",
  );
  assert(src.includes('const ICON_TILE =\n  "fn-icon'), "アイコンタイルは共通クラス（.fn-icon）を使う");
  for (const token of fnColors) {
    assert(
      !new RegExp(`\\$\\{CARD\\}[^"]*${token}`).test(src) && !new RegExp(`bg-\\[var\\(${token}\\)\\]`).test(src),
      `${token} でカードの面を塗っていない`,
    );
  }

  // 4) CTA: 主要操作（AI相談）だけ蛍光ライム、ほかは白地の副次ボタン
  assert(
    (src.match(/className="btn-primary shrink-0 self-start sm:self-center"/g) ?? []).length === 1,
    "蛍光ライムの主要ボタンは 1 枚だけ（AI相談）",
  );
  assert(
    (src.match(/className="btn-quiet shrink-0 self-start sm:self-center"/g) ?? []).length === 2,
    "Worksheet / My Karte は白地の副次ボタン",
  );
  assert(!code.includes("bg-[#e0806a]"), "旧コーラルの CTA は残っていない");
  assert(!code.includes("border-[#2b3a55]/30"), "旧 outline ボタンの色指定は残っていない");

  // 5) About This Plan: ラベンダーの全面背景を廃止し、項目のアイコン背景だけ色を持つ
  assert(!code.includes("ABOUT_CARD"), "About This Plan 専用の card chrome は共通化した");
  assert(
    (src.match(/className="fn-icon h-9 w-9 rounded-\[12px\]"/g) ?? []).length === 2,
    "行き先 / 出発の目安の 2 項目に小さなアイコン背景を置いている",
  );
  assert(src.includes("My Planを見る →"), "My Plan への導線は維持");

  // 6) 文字は共通タイポグラフィに揃っている（画面ごとに px を決め直さない）
  assert((src.match(/className="mk-card-title"/g) ?? []).length === 3, "3 枚のカードタイトルは共通クラス");
  assert(src.includes('className="mk-section-title"'), "About This Plan はセクション見出しクラス");
  assert((src.match(/mk-item-label-sm/g) ?? []).length === 2, "項目名は共通クラス");
  assert(!/text-\[#(2b3a55|6b6357|8b857a)\]/.test(code), "旧配色の文字色（navy / warm gray）は残っていない");

  // 7) 装飾のために z-index を足していない
  assert(!/z-\[?\d/.test(src), "装飾のために z-index を足していない");
}

console.log("Test 8: 3 カードの図版は既存の SVG イラストを縮小して使う");
{
  // 既製の 3D アイコンはどれも参照していない
  for (const webp of ["ai-chat", "worksheet", "documents"]) {
    assert(!code.includes(`/plan-icons/${webp}.webp`), `既製の 3D アイコン（${webp}.webp）はもう参照していない`);
  }
  assert(!code.includes('from "next/image"'), "画像コンポーネントは使わなくなった");

  const illos: [string, string][] = [
    ["AiConsultIllustration", "#e0806a"],
    ["WorksheetIllustration", "#7f9a6a"],
    ["MyKarteIllustration", "#cf9f4c"],
  ];
  for (const [name, spark] of illos) {
    assert(
      src.includes(`<${name} className={CARD_ICON_CLASS} />`),
      `${name} を共通サイズ枠で表示している`,
    );
    const start = src.indexOf(`function ${name}`);
    const end = src.indexOf("\n}\n", start);
    assert(start > 0 && end > start, `${name} を特定できた（テストの前提）`);
    const illo = src.slice(start, end);

    assert(illo.includes('viewBox="0 0 96 96"'), `${name}: 正方形の viewBox`);
    assert(!/<(Image|img)\b/.test(illo), `${name}: 画像ファイルではなくベクター`);
    assert(illo.includes("aria-hidden"), `${name}: 装飾なので支援技術からは隠す`);
    assert(illo.includes('stroke="#2b3a55"'), `${name}: 輪郭は見出しと同じ navy`);
    // アイコン背景（機能別カラー）と二重になるため、水彩のにじみは外した
    assert(!illo.includes("feGaussianBlur"), `${name}: ぼかした下地は外してある（パステルの背景と重ねない）`);
    assert(illo.includes("d={SPARKLE_D}"), `${name}: きらめきは共通の形を使う`);
    assert(illo.includes(`fill="${spark}"`), `${name}: きらめきの色はこれまでの系統色のまま`);
    assert(!/<rect[^>]*width="96"[^>]*height="96"/.test(illo), `${name}: 背景は塗らない（アイコン背景が下地）`);
  }
  assert(
    src.includes('const CARD_ICON_CLASS = "h-11 w-11 shrink-0 sm:h-[52px] sm:w-[52px]"'),
    "図版は 3 カード共通のサイズ枠で、以前より小さくしている",
  );
}

console.log("Test 9: 現在地（ステージ表示）は状態を色だけで示していない");
{
  const ribbon = readFileSync("components/PlanJourneyRibbon.tsx", "utf8");
  const ribbonCode = stripComments(ribbon);
  assert(
    ribbon.includes('const STEPS = ["気持ちを整理", "学校を比べる", "出発準備", "現地で暮らす"]'),
    "4 つのステージとラベルは従来のまま",
  );
  assert(
    ribbon.includes("Math.min(Math.max(Math.trunc(currentIndex), 0), STEPS.length - 1)"),
    "いまの段階の決め方（呼び出し側の currentIndex）は変えていない",
  );
  assert(src.includes("<PlanJourneyRibbon currentIndex={journeyIndex} />"), "Plan Home からの渡し方も不変");
  assert(
    src.includes('karte.proposals.presented.some((p) => p.type === "school") ? 1 : 0'),
    "判定ロジックは不変",
  );
  // 状態の示し分け: 完了 = チェック、いまここ = 蛍光ライム + 中の点、未到達 = 白 + 細い枠
  assert(ribbonCode.includes("<CheckIcon />"), "済んだ段階にはチェックが入る（色だけで示さない）");
  assert(ribbonCode.includes("bg-[var(--neon-lime)] ring-2"), "いまの段階は蛍光ライムの丸 + リング");
  assert(ribbonCode.includes("（いまここ）") && ribbonCode.includes("（完了）"), "読み上げ用のラベルも残す");
  assert(ribbonCode.includes("bg-[var(--neon-lime)]") && ribbonCode.includes("progressRight"), "進捗ラインも「いまここ」までだけ蛍光ライム");
  // 方眼紙・破れた縁の装飾は廃止
  assert(!ribbonCode.includes("repeating-linear-gradient"), "方眼紙の地紋は残っていない");
  assert(!ribbonCode.includes("clipPath"), "破れた縁の clipPath は残っていない");
  assert(ribbonCode.includes("mk-card"), "白いカードの共通クラスを使っている");
}

console.log("");
console.log(`passed: ${pass} / failed: ${fail}`);
if (fail > 0) process.exit(1);
