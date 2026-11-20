/**
 * Worksheet テーマ詳細画面（C案: 質問 / 回答の要点 / 回答全文 / AIと整理する の4層）の確認スクリプト。
 *
 *   npx tsx scripts/test-worksheet-section-detail.ts
 *
 * ここで固定するのは、見た目を作り替えても**壊してはいけないこと**:
 *   1. 回答データを加工・捏造していない（要点をクライアント側で作らない）
 *   2. 自動保存の経路（useWorksheetAnswers の handler）が変わっていない
 *   3. 質問と回答が別のカードに分かれている（記入例は質問側）
 *   4. 要点が無いときに文章を作らず、空の状態だけを出す
 *   5. 匿名 Worksheet（/worksheet）の表示が変わっていない
 *
 * DB・ネットワークへは接続しない（ソースと設問定義だけを見る）。
 */

import { readFileSync } from "node:fs";
import { CATEGORIES } from "@/lib/worksheetQuestions";

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

const detail = readFileSync("components/WorksheetSectionDetail.tsx", "utf8");
const worksheet = readFileSync("components/Worksheet.tsx", "utf8");

/** 「していないこと」や並び順の検査は、説明コメントを除いた**実際に描画されるコード**だけを見る。 */
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}
const detailCode = stripComments(detail);

/** 「回答カード」のソース範囲（あなたの回答 〜 設問ループの終わり）。 */
const answerCardStart = detailCode.indexOf("あなたの回答");
const questionCardStart = detailCode.indexOf("{q.heading}");

console.log("Test 1: 質問と回答が別カードに分かれている");
{
  assert(questionCardStart > 0, "質問カードのブロックがある");
  assert(answerCardStart > questionCardStart, "回答カードは質問カードの後ろにある");
  assert(detail.includes("{q.heading}"), "質問文を表示している");
  assert(detail.includes("{q.supplement}"), "質問の補足説明を表示している");
  assert(detail.includes('<p className="text-[11px] font-semibold tracking-wide text-white/70">質問</p>'), "質問カードに「質問」ラベルがある");
  assert(detail.includes("あなたの回答"), "回答カードの見出し「あなたの回答」がある");
  // 質問カードのヘッダー（深緑 + 装飾番号）は維持
  assert(detail.includes("style={{ backgroundColor: theme.bg }}"), "深緑ヘッダーの配色を維持している");
  assert(detail.includes('style={{ color: theme.numeral }}'), "装飾番号を維持している");
  assert(detail.includes("font-serif"), "装飾番号は serif のまま（装飾用途）");
}

console.log("Test 2: 記入例は質問側にあり、回答カードの中に入っていない");
{
  assert(detail.includes("<QuestionExamples"), "質問カード側で記入例を描画している");
  const examplesAt = detailCode.indexOf("<QuestionExamples");
  assert(examplesAt > 0 && examplesAt < answerCardStart, "記入例は回答カードより前（＝質問カード内）にある");
  assert(detail.includes("showExamples={false}"), "回答カード内の QuestionCard は記入例を出さない");
  // 記入例の中身・開閉 state は既存のまま（openExamples / toggleExamples）
  assert(detail.includes("openExamples[q.id] ?? false"), "記入例の開閉 state は既存の openExamples を使っている");
  assert(detail.includes("onToggle={() => toggleExamples(q.id)}"), "開閉 handler も既存のまま");
}

console.log("Test 3: 回答の要点は表示しない（正式な生成・保存の仕組みが無いため）");
{
  // 要点を作る仕組みが無い間は、空の状態すら出さずブロック自体を非表示にする。
  // 将来 true に戻すだけで再表示できるよう、マークアップと文言は残してある。
  assert(
    /const SHOW_ANSWER_SUMMARY: boolean = false;/.test(detailCode),
    "表示フラグ SHOW_ANSWER_SUMMARY が false になっている",
  );
  assert(
    detailCode.includes("{SHOW_ANSWER_SUMMARY && answered && ("),
    "要点ブロックはフラグで閉じられている（回答があっても描画しない）",
  );
  assert(detail.includes("回答の要点"), "将来の再表示のためにブロック自体は残してある");
  assert(
    detail.includes("回答を整理すると、ここに要点が表示されます"),
    "空の状態の文言も残してある（今は描画されない）",
  );
  // 回答全文の上マージンもフラグに連動させ、要点が無い状態で余白だけ残らないようにする
  assert(
    detailCode.includes('className={SHOW_ANSWER_SUMMARY && answered ? "mt-4" : ""}'),
    "要点を出さないときは回答全文の上マージンも付けない",
  );
  // クライアント側で回答本文から要約を作っていない（フラグを戻しても作らない）
  assert(!/回答の要点[\s\S]{0,400}answers\[q\.id\]/.test(detailCode), "要点ブロックが回答本文（answers）を加工していない");
  assert(!/回答の要点[\s\S]{0,400}(slice|substring|split)\(/.test(detailCode), "要点ブロックで文字列を切り出していない");
  assert(!/回答の要点[\s\S]{0,400}deriveWrittenChips/.test(detailCode), "要点ブロックが機械抽出チップを流用していない");
  // 既存の「このテーマで見えてきたこと」（機械抽出チップ）は別物として残っている
  assert(detail.includes("このテーマで見えてきたこと"), "既存の desktop 補助カードを消していない");
  assert(detail.includes("あなたが書いたこと"), "既存の「あなたが書いたこと」表示を消していない");
  assert(detail.includes("deriveWrittenChips("), "既存の機械抽出ロジックはそのまま残っている");
  // 要約を作る経路は、既存の「判断軸を確認する」（priorities 限定・/api/worksheet-summary）だけ。
  const summaryReads = detailCode.match(/data\?\.summary/g) ?? [];
  assert(summaryReads.length === 1, `要約レスポンスの読み取りは既存の 1 箇所だけ（実際: ${summaryReads.length}）`);
  assert(
    detailCode.indexOf("data?.summary") > detailCode.indexOf("async function handleGenerateAxisSummary"),
    "その 1 箇所は既存の判断軸サマリー処理の中にある",
  );
  assert(detailCode.includes("判断軸を確認する"), "既存の判断軸サマリー機能を消していない");
}

console.log("Test 4: 自動保存の経路を変えていない");
{
  assert(
    detail.includes("useWorksheetAnswers(planId, karte, serverWorksheet)"),
    "回答 state は既存の useWorksheetAnswers のまま",
  );
  for (const handler of [
    "onTextChange={(value) => handleChange(q.id, value)}",
    "onRate={(itemId, value) => handleRate(q.id, itemId, value)}",
    "onToggleRank={(itemId) => handleToggleRank(q.id, itemId)}",
    "onToggleCompromise={(itemId) => handleToggleCompromise(q.id, itemId)}",
    "onSelectSingle={(optionId) => handleSelectSingle(q.id, optionId)}",
    "onToggleMulti={(optionId) => handleToggleMulti(q.id, optionId)}",
  ]) {
    assert(detail.includes(handler), `既存の保存 handler をそのまま渡している（${handler.split("=")[0]}）`);
  }
  // 保存のための独自 fetch を足していない（既存の判断軸サマリーだけ）
  const fetches = [...detailCode.matchAll(/fetch\("([^"]+)"/g)].map((m) => m[1]);
  assert(
    JSON.stringify(fetches) === JSON.stringify(["/api/worksheet-summary"]),
    `fetch は既存の /api/worksheet-summary だけ（実際: ${fetches.join(", ") || "なし"}）`,
  );
  // 回答値を書き換える新しい経路を作っていない
  assert(!/localStorage/.test(detailCode), "この画面から localStorage を直接触っていない");
  assert(!/supabase/i.test(detailCode), "この画面から DB を直接触っていない");
  assert(detail.includes("saveStatus"), "保存状態の表示を維持している");
  assert(detail.includes("回答は自動保存されます"), "自動保存の案内文を維持している");
}

console.log("Test 5: AI導線は既存 action のまま");
{
  const links = [...detailCode.matchAll(/href="\/widget"/g)];
  assert(links.length === 2, `AI相談は既存の /widget（ページ上部 ＋ 回答カード）で計 2 箇所（実際: ${links.length}）`);
  assert(detail.includes("AIと話しながら整理する"), "ページ上部の既存導線の文言を変えていない");
  assert(detail.includes("AIと整理する"), "回答カード側は「AIと整理する」として同じ action を出す");
  assert(!/\/api\/(?!worksheet-summary)/.test(detailCode), "新しい API を作っていない");
}

console.log("Test 6: 匿名 Worksheet（/worksheet）の表示は変わっていない");
{
  assert(worksheet.includes("export function QuestionExamples"), "記入例を共通コンポーネントとして切り出した");
  assert(worksheet.includes("showExamples = true"), "既定では記入例を従来どおりカード内に出す");
  assert(worksheet.includes("{showExamples && ("), "記入例の描画位置だけをフラグで切り替えている");
  // 記入例の見た目（クラス）は従来と同一
  assert(
    worksheet.includes("bg-worksheet-sage px-3 py-1.5 text-xs font-medium text-worksheet-primary"),
    "記入例ボタンのスタイルは従来と同じ",
  );
  assert(
    worksheet.includes('grid-rows-[1fr] opacity-100'),
    "記入例の展開アニメーションも従来と同じ",
  );
  // textarea（自動保存の入口）は従来のまま
  assert(worksheet.includes("onChange={(e) => onTextChange(e.target.value)}"), "textarea の onChange は従来のまま");
  assert(worksheet.includes('placeholder="あなたの言葉で、自由に書いてみてください"'), "placeholder を変えていない");
}

console.log("Test 7: 設問データ・文言に手を入れていない");
{
  // 設問定義は読み取りのみ（このテストは件数・形だけを確認する）
  assert(CATEGORIES.length > 0, "設問カテゴリを読める（テストの前提）");
  const freeText = CATEGORIES.flatMap((c) => c.questions).filter((q) => q.kind === "freeText");
  assert(freeText.length > 0, "freeText の設問がある（記入例の対象）");
  assert(
    freeText.every((q) => Array.isArray((q as { examples?: unknown }).examples)),
    "freeText の設問は記入例を持つ",
  );
  // 画面側に設問文をハードコードしていない（データ由来のままにする）
  for (const q of CATEGORIES.flatMap((c) => c.questions).slice(0, 12)) {
    assert(!detail.includes(q.heading), `設問文「${q.heading.slice(0, 12)}…」を画面側にコピーしていない`);
  }
}

console.log("Test 8: C案の層が上から順に並んでいる（要点は非表示）");
{
  // 要点ブロックは非表示なので、実際に見える順番は 質問 → あなたの回答 → 回答全文。
  const order = ["質問</p>", "あなたの回答", "回答全文"];
  let last = -1;
  for (const needle of order) {
    const at = detailCode.indexOf(needle);
    assert(at > last, `「${needle.replace("</p>", "")}」が前の層より後ろにある`);
    last = at;
  }
  // AI 導線は回答カードのヘッダー（＝「あなたの回答」の直後、要点より前）
  const aiAt = detailCode.indexOf("AIと整理する");
  assert(
    aiAt > detailCode.indexOf("あなたの回答") && aiAt < detailCode.indexOf("回答全文"),
    "「AIと整理する」は回答カードのヘッダー（「あなたの回答」と「回答全文」の間）にある",
  );
}

console.log("");
console.log(`passed: ${pass} / failed: ${fail}`);
if (fail > 0) process.exit(1);
