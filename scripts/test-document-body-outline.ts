/**
 * lib/documentBodyOutline.ts の pure parser を確認するスクリプト（Step 27）。
 *
 * 確認する契約:
 * - 「■ 」見出しで preamble ＋ セクションへ分解する
 * - 見出しが 0 個なら null（呼び出し側は元 body 全文へ fallback）
 * - 出現順を保持し、非空テキスト行を 1 行も失わない
 * - 入力を mutate しない / deterministic
 *
 * 実行方法: npx tsx scripts/test-document-body-outline.ts
 */

import {
  isBlankLine,
  parseDocumentBodyOutline,
  splitFullwidthKeyValue,
} from "@/lib/documentBodyOutline";

let pass = 0;
let fail = 0;

function assert(condition: unknown, message: string) {
  if (condition) {
    pass++;
    console.log(`  OK   ${message}`);
  } else {
    fail++;
    console.error(`  FAIL ${message}`);
  }
}

/** outline 結果に含まれる全テキスト行（見出し＋preamble＋lines）から非空行を集める。 */
function collectNonEmpty(outline: NonNullable<ReturnType<typeof parseDocumentBodyOutline>>): string[] {
  const acc: string[] = [];
  for (const l of outline.preamble) if (!isBlankLine(l)) acc.push(l.trim());
  for (const s of outline.sections) {
    acc.push(s.heading.trim());
    for (const l of s.lines) if (!isBlankLine(l)) acc.push(l.trim());
  }
  return acc;
}

console.log("Case 1: standard headings");
{
  const body = ["メモ", "", "■ 今考えていること", "留学したい気持ちがある。", "", "■ 今の気持ち", "前向き。"].join("\n");
  const o = parseDocumentBodyOutline(body);
  assert(o !== null, "null でない");
  assert(o?.sections.length === 2, "セクションが 2 個");
  assert(o?.sections[0].heading === "今考えていること", "1 個目の見出し語");
  assert(o?.sections[1].heading === "今の気持ち", "2 個目の見出し語");
  assert(o?.sections[0].lines.join("\n") === "留学したい気持ちがある。", "1 個目の本文");
}

console.log("Case 2: preamble 保持");
{
  const body = ["現在の学校候補の比較", "金額は目安です。", "", "■ 今回比較する学校", "School A"].join("\n");
  const o = parseDocumentBodyOutline(body);
  assert(o?.preamble.includes("現在の学校候補の比較"), "タイトル行が preamble に残る");
  assert(o?.preamble.includes("金額は目安です。"), "免責文が preamble に残る");
  assert(o?.preamble[0] === "現在の学校候補の比較", "preamble 先頭がタイトル");
}

console.log("Case 3: heading 順を保持");
{
  const body = ["■ B", "b", "■ A", "a", "■ C", "c"].join("\n");
  const o = parseDocumentBodyOutline(body);
  assert(o?.sections.map((s) => s.heading).join(",") === "B,A,C", "見出しは出現順（並べ替えない）");
}

console.log("Case 4: section lines を保持（内部の空行も残す）");
{
  const body = ["■ X", "1 行目", "", "3 行目"].join("\n");
  const o = parseDocumentBodyOutline(body);
  assert(o?.sections[0].lines.length === 3, "内部の空行を含めて 3 行");
  assert(o?.sections[0].lines[1] === "", "内部の空行が残っている");
}

console.log("Case 5: heading 0 個 → null");
{
  assert(parseDocumentBodyOutline("ただのテキスト\n2 行目\nラベル：値") === null, "■ 見出しが無ければ null");
}

console.log("Case 6: 空 body → null");
{
  assert(parseDocumentBodyOutline("") === null, "空文字は null");
}

console.log("Case 7: 空白のみ body → null");
{
  assert(parseDocumentBodyOutline("   \n\t\n  ") === null, "空白のみは null");
}

console.log("Case 8: multiple sections（preamble 無し）");
{
  const body = ["■ 一", "x", "■ 二", "y", "■ 三", "z"].join("\n");
  const o = parseDocumentBodyOutline(body);
  assert(o?.preamble.length === 0, "preamble は空配列");
  assert(o?.sections.length === 3, "セクション 3 個");
}

console.log("Case 9: prose 内の ■ を誤認しない");
{
  const body = ["■ 見出し", "文中に■という記号が出てくることがある。", "■印を付けた。", "行頭でない ■ もある。"].join("\n");
  const o = parseDocumentBodyOutline(body);
  assert(o?.sections.length === 1, "見出しは 1 個だけ（prose 中の ■ を見出し扱いしない）");
  assert(o?.sections[0].lines.length === 3, "prose 3 行がそのまま本文に残る");
  assert(o?.sections[0].lines[1] === "■印を付けた。", "スペース無しの ■印 は本文のまま");
}

console.log("Case 10: 全角スペース見出し / trim");
{
  const body = ["■　今回比較する学校", "School A", "■  余白多め   ", "v"].join("\n");
  const o = parseDocumentBodyOutline(body);
  assert(o?.sections[0].heading === "今回比較する学校", "全角スペース区切りの見出しを認識");
  assert(o?.sections[1].heading === "余白多め", "見出し語は trim される");
}

console.log("Case 11: 入力を mutate しない / deterministic");
{
  const body = ["■ A", "x", "", "■ B", "y"].join("\n");
  const snapshot = body;
  const a = parseDocumentBodyOutline(body);
  const b = parseDocumentBodyOutline(body);
  assert(body === snapshot, "入力文字列は不変");
  assert(JSON.stringify(a) === JSON.stringify(b), "同じ入力なら同じ結果");
}

console.log("Case 12: 非空テキスト行の非損失");
{
  const body = [
    "タイトル",
    "前文の 1 行",
    "",
    "■ セクション1",
    "本文 A",
    "ラベル：値",
    "",
    "■ セクション2",
    "本文 B",
  ].join("\n");
  const o = parseDocumentBodyOutline(body);
  assert(o !== null, "null でない");
  const got = new Set(collectNonEmpty(o!));
  for (const line of ["タイトル", "前文の 1 行", "セクション1", "本文 A", "ラベル：値", "セクション2", "本文 B"]) {
    assert(got.has(line), `"${line}" が保持されている`);
  }
}

console.log("Case 13: My Note（見出し＋prose）が outline だけで扱える");
{
  const body = [
    "My Note",
    "",
    "■ 今考えていること",
    "留学するかどうか、まだ迷っている。",
    "でも前より気持ちは固まってきた。",
    "",
    "■ 不安に思っていること",
    "英語がどこまで伸びるか不安。",
  ].join("\n");
  const o = parseDocumentBodyOutline(body);
  assert(o?.preamble.join("") === "My Note", "タイトルが preamble");
  assert(o?.sections.length === 2, "見出し 2 個");
  assert(o?.sections[0].lines.length === 2, "prose 2 行がそのまま");
}

console.log("Case 14: splitFullwidthKeyValue の基本");
{
  assert(splitFullwidthKeyValue("都市：Sydney")?.label === "都市", "label 抽出");
  assert(splitFullwidthKeyValue("都市：Sydney")?.value === "Sydney", "value 抽出");
  assert(splitFullwidthKeyValue("参照先：https://example.com/a：b")?.value === "https://example.com/a：b", "最初の ： だけで分割（value 内の ： は保持）");
  assert(splitFullwidthKeyValue("ラベルのみ") === null, "： が無ければ null");
  assert(splitFullwidthKeyValue("：値だけ") === null, "label 空は null");
  assert(splitFullwidthKeyValue("ラベル：") === null, "value 空は null");
  assert(splitFullwidthKeyValue("label:value") === null, "半角コロンは分割しない");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
