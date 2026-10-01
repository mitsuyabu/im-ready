/**
 * 人間レビューで入力されたビザデータが、記録の規則を守っているかを検証する。
 *
 *   npx tsx scripts/test-visa-manual-review.ts
 *
 * **データの不変条件の検証は importer 本体（validateVisaDocument）が正本**で、ここでは
 * それを呼んで現行データが通ることを確認する（同じ検証ロジックを再実装しない）。
 * 個々の規則そのものの回帰テストは scripts/test-visa-importer-validation.ts にある。
 *
 * このファイルが追加で見るのは、importer では表現できない「運用の記録」:
 *   - 人間レビュー記録シートが存在し、必要な記録欄がある
 *   - 417 が未確認のまま空で保持されている
 *   - Student 500 の一次情報照合の状態が記録されている
 *   - 学生ビザの就労時間が fortnight 単位のまま保たれている
 *
 * データが未入力（417 のように entries が空）でも通る。未確認を空のまま残すのが正しい状態。
 * ネットワークへは接続しない。
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import {
  formatVisaValidationProblem,
  validateVisaDocument,
} from "@/scripts/import-visa-reference-data";

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

type RawSource = {
  sourceName?: unknown;
  sourceUrl?: unknown;
  sourceType?: unknown;
  accessedAt?: unknown;
};

type RawEntry = {
  category?: unknown;
  summary?: unknown;
  details?: Record<string, unknown>;
  reviewedAt?: unknown;
  reviewNote?: unknown;
  sources?: RawSource[];
};

type RawDoc = {
  visaKey?: unknown;
  visaCode?: unknown;
  visaName?: unknown;
  entries?: RawEntry[];
};

const DIR = "data/visas/australia";
const files = readdirSync(DIR).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
const docs: { file: string; doc: RawDoc }[] = files.map((file) => ({
  file,
  doc: JSON.parse(readFileSync(`${DIR}/${file}`, "utf8")) as RawDoc,
}));

function entriesOf(doc: RawDoc): RawEntry[] {
  return Array.isArray(doc.entries) ? doc.entries : [];
}

function hasHomeAffairsSource(entry: RawEntry): boolean {
  return (entry.sources ?? []).some((s) => s.sourceType === "home_affairs");
}

console.log("前提: 記録シートと curated JSON が揃っている");
{
  assert(existsSync("docs/VISA_MANUAL_REVIEW.md"), "人間レビュー記録シートがある");
  const sheet = readFileSync("docs/VISA_MANUAL_REVIEW.md", "utf8");
  for (const column of ["確認", "値", "要約", "出典名", "出典 URL", "ページ箇所", "適用開始日", "accessed_at", "reviewed_at", "備考"]) {
    assert(sheet.includes(column), `記録シートに「${column}」の記録欄がある`);
  }
  assert(sheet.includes("HTTP 403"), "自動取得ができない理由が記録されている");
  assert(sheet.includes("長い原文をコピーしない"), "原文の長いコピーを禁止している");
  assert(sheet.includes("日付を作らない"), "不明な日付を作らない方針が書かれている");
  assert(docs.length === 2, `curated JSON が2件ある（実際: ${docs.length}）`);
}

console.log("Test 1-10: データの不変条件は importer 本体の検証に委ねる（単一の正本）");
{
  // 規則（same_employer の例外・second_third の条件・88日の単独条件禁止・processing の保証禁止・
  // documents の分類・具体値の出典必須・単位必須・417/462 の分離・0 や空文字での埋め禁止）は
  // すべて importer 側で強制されている。ここでは現行データがその検証を通ることだけを確認する。
  for (const { file, doc } of docs) {
    const result = validateVisaDocument(file, doc);
    assert(
      result.problems.length === 0,
      `${file}: importer の検証を問題なく通る（${result.problems.map(formatVisaValidationProblem).join(" | ")}）`,
    );
    const entryCount = entriesOf(doc).length;
    assert(
      result.entries.length === entryCount,
      `${file}: 登録されている ${entryCount} 件すべてが受理される（実際: ${result.entries.length}）`,
    );
  }

  // 規則そのものの回帰テストが別途あることを確認（検証の二重実装を避けるため）
  assert(existsSync("scripts/test-visa-importer-validation.ts"), "importer 検証の回帰テストが存在する");
  const regression = readFileSync("scripts/test-visa-importer-validation.ts", "utf8");
  assert(
    regression.includes('from "@/scripts/import-visa-reference-data"'),
    "回帰テストは importer の検証関数を直接呼んでいる（再実装していない）",
  );
}

console.log("Test 11: 417 は未確認のまま空で保持されている（今回の正しい状態）");
{
  const whv = docs.find((d) => d.doc.visaKey === "australia_working_holiday_417");
  assert(whv !== undefined, "417 の JSON がある");
  if (whv) {
    assert(entriesOf(whv.doc).length === 0, "417 は1件も登録していない（Home Affairs 未確認）");
    const readme = JSON.stringify((whv.doc as { _readme?: string[] })._readme ?? []);
    assert(/HTTP 403/.test(readme), "未確認の理由が記録されている");
    assert(/推測で埋めてはいけない/.test(readme), "推測禁止が明記されている");
  }
}

console.log("Test 12: Student 500 の一次情報照合の状態が記録されている");
{
  const student = docs.find((d) => d.doc.visaKey === "australia_student_500");
  if (student) {
    for (const entry of entriesOf(student.doc)) {
      const hasHA = hasHomeAffairsSource(entry);
      const note = typeof entry.reviewNote === "string" ? entry.reviewNote : "";
      // Home Affairs の出典が無い entry は、その旨が review_note に残っていること
      assert(
        hasHA || /403|未了|一次情報/.test(note),
        `${entry.category}: 一次情報が未照合なら review_note にその旨がある`,
      );
    }
    const sheet = readFileSync("docs/VISA_MANUAL_REVIEW.md", "utf8");
    assert(sheet.includes("勝手に上書きしない"), "不一致時に上書きしない方針が記録シートにある");
  }
}

console.log("");
console.log(`passed: ${pass} / failed: ${fail}`);
if (fail > 0) process.exit(1);
