/**
 * 「テーマから整理する」6 枚のテーマカードの確認スクリプト。
 *
 *   npx tsx scripts/test-worksheet-section-cards.ts
 *
 * ここで固定するのは、見た目を作り替えても**壊してはいけないこと**と、
 * 今回の作り替えで**戻してはいけないこと**:
 *   1. 遷移先・進捗の集計・summary bar が変わっていない（データと導線は不変）
 *   2. 6 枚が 1 つのアイコンセットとして揃っている（線幅・viewBox・アクセントが 1 か所）
 *   3. 完成画像（WebP）をカードとして貼る実装に戻っていない
 *   4. 色でテーマを塗り分けていない（白地 + ごく小さなアクセントだけ）
 *   5. hover で派手に動かさない / 進捗の読み込みで高さが動かない
 *
 * DB・ネットワークへは接続しない（ソースと設問定義だけを見る）。
 */

import { readFileSync } from "node:fs";
import { CATEGORIES } from "@/lib/worksheetQuestions";
import { WORKSHEET_SECTION_META } from "@/lib/worksheetSectionMeta";

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

const src = readFileSync("components/WorksheetSectionList.tsx", "utf8");

/** 「していないこと」の検査は、説明コメントを除いた**実際に描画されるコード**だけを見る。 */
function stripComments(s: string): string {
  return s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}
const code = stripComments(src);

console.log("Test 1: 遷移先と進捗の集計は変えていない");
{
  assert(
    src.includes("href={`/plans/${planId}/worksheet/${category.id}`}"),
    "各カードの遷移先は /plans/[planId]/worksheet/[sectionId] のまま",
  );
  assert(src.includes("CATEGORIES.map("), "カードは CATEGORIES をそのまま並べている（並び順・件数を持たない）");
  assert(src.includes("countAnsweredInCategory(data, category)"), "回答済み件数は既存の集計関数から取る");
  assert(
    src.includes("resolvePlanWorksheetForDisplay(planId, serverWorksheet)"),
    "サーバーに回答が無いときの localStorage 集計の経路は不変",
  );
  assert(src.includes('if (state === "complete") return "整理済み";'), "進捗ラベルの文言は不変");
  assert(src.includes('if (state === "complete") return "bg-[#7d9a63]";'), "進捗ドットの色は不変");
  assert(src.includes("もう一度見直す"), "上部の summary bar（見直し導線）は残っている");
  assert(src.includes("{completedThemes} / {totalThemes} 整理済み"), "summary bar の整理済み件数は不変");
}

console.log("Test 2: 6 テーマすべてに、同じ描き方のイラストがある");
{
  for (const category of CATEGORIES) {
    assert(
      new RegExp(`\\n  ${category.id}: \\w+Illo,`).test(src),
      `${category.id} のイラストが SECTION_ILLO に登録されている`,
    );
  }
  const illoCount = (src.match(/function \w+Illo\(\{ className, accent \}: IlloProps\)/g) ?? []).length;
  assert(illoCount === CATEGORIES.length, `イラストはテーマ数と同じ ${CATEGORIES.length} 個（実際: ${illoCount}）`);

  // 「アイコンセットに見える」条件は 1 か所（illoProps）に集約し、6 枚が必ずそれを使う
  const usesShared = (src.match(/<svg \{\.\.\.illoProps\(className\)\}>/g) ?? []).length;
  assert(usesShared === CATEGORIES.length, "6 枚とも共通の illoProps で描いている（線幅や viewBox を個別に持たない）");
  assert((src.match(/viewBox: "0 0 48 48"/g) ?? []).length === 1, "viewBox は 1 か所だけで定義している");
  assert((src.match(/strokeWidth: 1\.5/g) ?? []).length === 1, "線幅は 1 か所だけで定義している");
  assert(src.includes('strokeLinecap: "round" as const'), "線の端は round で統一している");
  // 線幅・塗りの検査は 6 枚のイラスト定義部だけを見る
  // （同じファイルにある「もう一度見直す」のクリップアイコンは対象外）。
  const illoBlock = code.slice(code.indexOf("type IlloProps"), code.indexOf("const SECTION_ILLO"));
  assert(!/<svg[^>]*strokeWidth=/.test(illoBlock.slice(illoBlock.indexOf("function"))), "個別のイラストが線幅を上書きしていない");
  assert(src.includes("type IlloProps = { className?: string; accent: string };"), "アクセント色は外から受け取る（テーマと連動させるため）");
  assert(
    (illoBlock.match(/fill=\{accent\}/g) ?? []).length >= CATEGORIES.length,
    "6 枚とも塗りはテーマのアクセント色を使っている",
  );
  assert(!/fill="#(?!ffffff)[0-9a-f]{6}"/.test(illoBlock), "イラストに色をベタ書きしていない（白のオクルージョンを除く）");
  assert(/stroke: "currentColor"/.test(src), "線画は dark neutral のまま（色を持たせない）");
}

console.log("Test 3: 完成画像をカードとして貼る実装には戻っていない");
{
  assert(!code.includes('from "next/image"'), "next/image は使っていない");
  assert(!code.includes("/worksheet-cards/"), "WebP のカード画像は参照していない");
  assert(!code.includes("CARD_IMAGE"), "画像マップ（CARD_IMAGE）は残っていない");
  // 番号・英語名・日本語の一行は、画像ではなく実テキストとして出す
  assert(src.includes('String(index + 1).padStart(2, "0")'), "番号は実テキスト（01〜06）で出している");
  assert(src.includes("{meta.enName}"), "英語タイトルは WORKSHEET_SECTION_META から出している");
  assert(src.includes("{meta.tagline}"), "日本語の一行は WORKSHEET_SECTION_META から出している");
  for (const category of CATEGORIES) {
    assert(
      typeof WORKSHEET_SECTION_META[category.id]?.tagline === "string",
      `${category.id} の表示テキストが meta に揃っている`,
    );
  }
}

console.log("Test 4: 色でテーマを塗り分けず、白地 + 細い border に揃えている");
{
  // カード本体（テーマカードの <Link>）だけを見る。先に出てくる「もう一度見直す」の
  // <Link> と取り違えないよう、key={category.id} を持つ方から末尾までを切り出す。
  const cardStart = code.indexOf("key={category.id}");
  const card = code.slice(cardStart, code.indexOf("</Link>", cardStart));
  assert(cardStart > 0, "テーマカードの <Link> を特定できた（テストの前提）");
  assert(card.includes("bg-white"), "カードの地は白");
  assert(card.includes("border border-[#e9e4d9]"), "border は細く淡い 1 本");
  assert(card.includes("shadow-card"), "影は既存の共通トークン（shadow-card）");
  assert(card.includes("rounded-[18px]"), "角丸は他カードと同じ 18px");
  // 色が付くのはフッター帯だけ。カード本体（<Link> の className）は白のまま。
  const cardClass = card.slice(card.indexOf('className="group'), card.indexOf('"\n', card.indexOf('className="group')));
  assert(!/bg-\[#/.test(cardClass), "カード本体にテーマの地色は付けていない");
  assert(cardClass.includes("overflow-hidden"), "フッター帯を角丸で切り取るため overflow-hidden を持つ");
  assert(!card.includes("CARD_TINT") && !card.includes("CARD_SURFACE"), "Plan Home のパステル面を持ち込んでいない");
}

console.log("Test 5: hover は控えめ / 読み込みで高さが動かない");
{
  assert(src.includes("hover:-translate-y-0.5"), "hover は 0.5（2px）持ち上がるだけ");
  assert(src.includes("hover:shadow-card-hover"), "hover の影は既存の共通トークン");
  assert(!/hover:scale-/.test(code), "hover で拡大しない");
  assert(!/animate-/.test(code), "派手なアニメーションを足していない");
  assert(
    src.includes("-mx-7 -mb-7 mt-auto flex min-h-[22px] items-center"),
    "進捗行は state が決まる前も帯の高さを確保し、常にカード下端に来る",
  );
  assert(!/className="group flex h-full /.test(src), "h-full は付けない（grid の stretch が効かなくなるため）");
  assert(src.includes("focus-visible:ring-2"), "キーボード操作時の focus リングは残っている");
}

console.log("Test 6: 色が付くのはフッター帯だけ / 6 テーマぶんそろっている");
{
  // 色の中身は scripts/test-worksheet-section-theme.ts（一覧と詳細の共通定義元）で確認する。
  // ここで固定するのは「一覧カードがその共通定義だけを見ている」こと。
  assert(
    src.includes('from "@/lib/worksheetSectionTheme"'),
    "テーマ色は共通モジュール（lib/worksheetSectionTheme.ts）から読む",
  );
  assert(!src.includes("const SECTION_THEME"), "一覧カードの中にテーマ色を二重定義していない");
  assert(src.includes("worksheetSectionTheme(category.id)"), "テーマは既存の category.id で引く");
  assert(src.includes("style={{ backgroundColor: theme.tint }}"), "フッターの地色は共通テーマの tint");
  assert(src.includes("accent={theme.accent}"), "イラストのアクセントも同じテーマから受け取る");

  // ステータス自体には地色を付けない（状態はドットと文言だけで表す）
  assert(!code.includes("statusPillClass"), "ステータスのピル背景（statusPillClass）は残っていない");
  assert(src.includes('if (state === "complete") return "bg-[#7d9a63]";'), "状態のドットの色は不変");
  assert(src.includes("statusDotClass(state)"), "状態のドットは残っている");
  assert(src.includes("{statusLabel(state, progress!)}"), "状態の文言と件数は既存ロジックのまま");
  const footerBlock = code.slice(code.indexOf("-mx-7 -mb-7"), code.indexOf("</Link>"));
  assert(!/rounded-full px-/.test(footerBlock), "ステータスをピルの形にしていない");

  // 帯はカード幅いっぱい（内側の余白を負の margin で打ち消す）
  assert(src.includes("-mx-7 -mb-7 mt-auto"), "帯はカード下端に貼り付き、左右もカード幅いっぱい");
  assert(src.includes("sm:-mx-8 sm:-mb-8 sm:px-8"), "desktop の余白（32px）とも整合している");
}

console.log("Test 7: カードは 1 段階だけ大きくしている");
{
  assert(src.includes("min-h-[208px]") && src.includes("sm:min-h-[232px]"), "カードの下限の高さは据え置き");
  assert(src.includes("p-7") && src.includes("sm:p-8"), "余白は mobile 28px / desktop 32px");
  assert(src.includes('text-[28px] leading-[1.15] tracking-tight text-[#26251f] sm:text-[31px]'), "英語タイトルは 28 / 31px");
  assert(src.includes('className="h-12 w-12 shrink-0 text-[#3f3d38] sm:h-14 sm:w-14"'), "イラストは 48 / 56px");
  assert(src.includes('<p className="mt-2 text-[14px] leading-relaxed'), "日本語の一行は 14px");
  // 数字は装飾しない（丸囲み・地色を足さない）
  const numberLine = src.slice(src.indexOf("font-serif text-[13px]"), src.indexOf("String(index + 1)"));
  assert(!/rounded-full|border|bg-/.test(numberLine), "番号は丸囲みや地色を付けず、静かなままにしている");
}

console.log("");
console.log(`passed: ${pass} / failed: ${fail}`);
if (fail > 0) process.exit(1);
