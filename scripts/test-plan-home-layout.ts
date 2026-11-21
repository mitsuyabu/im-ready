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

/** カードごとの目印（見出し or アイコン）の出現位置。 */
const at = {
  ai: src.indexOf('<h2 className="text-lg font-bold text-[#2b3a55]">AI相談</h2>'),
  worksheet: src.indexOf('<h2 className="text-lg font-bold text-[#2b3a55]">Worksheet</h2>'),
  about: src.indexOf("About This Plan\n"),
  myKarte: src.indexOf('<h2 className="min-w-0 text-lg font-bold text-[#2b3a55]">My Karte</h2>'),
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
  assert((src.match(/lg:col-start-2/g) ?? []).length === 1, "右カラムに置いているカードは 1 枚だけ");
  assert((src.match(/lg:col-start-1/g) ?? []).length === 3, "左カラムに置いているカードは 3 枚");
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
    "/plan-icons/ai-chat.webp",
    "/plan-icons/worksheet.webp",
    "/plan-icons/documents.webp",
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

console.log("");
console.log(`passed: ${pass} / failed: ${fail}`);
if (fail > 0) process.exit(1);
