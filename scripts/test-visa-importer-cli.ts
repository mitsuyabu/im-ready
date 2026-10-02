/**
 * importer（scripts/import-visa-reference-data.ts）の**実行経路**のテスト。
 *
 *   npx tsx scripts/test-visa-importer-cli.ts
 *
 * 検証したいこと:
 *   - 検証の正本（validateVisaDocument）を import しただけでは main() が走らない。
 *     走ると、テストを実行するだけで生成 SQL が書き換わり標準出力も汚れる。
 *   - CLI としての挙動（--check / 通常生成 / --stdout）は従来どおり。
 *   - 生成される SQL の中身は、生成日時コメント以外変わらない。
 *
 * 子プロセスを起動して実行経路を分けて確認する。ネットワーク・DB へは接続しない。
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

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

const IMPORTER = "scripts/import-visa-reference-data.ts";
const OUT_FILE = "supabase/seed/visa_reference_data.generated.sql";
const TSX = resolve("node_modules/.bin/tsx");

function sha(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** 生成日時コメントを除いた内容（意味のある差分だけを比べる）。 */
function semantic(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.startsWith("-- 生成: "))
    .join("\n");
}

function run(args: string[]): { stdout: string; status: number } {
  try {
    const stdout = execFileSync(TSX, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { stdout, status: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return { stdout: `${e.stdout ?? ""}${e.stderr ?? ""}`, status: e.status ?? 1 };
  }
}

const before = readFileSync(OUT_FILE, "utf8");
const beforeSha = sha(before);
const beforeSemantic = semantic(before);

console.log("Test 1: validator を import しただけでは副作用が無い");
{
  // import だけを行うスクリプトを一時ディレクトリではなくプロジェクト内へ置く
  // （@/ のパス解決と node_modules の解決をプロジェクト基準にするため）。
  const probe = join("scripts", `.probe-importer-${process.pid}.ts`);
  writeFileSync(
    probe,
    [
      'import { validateVisaDocument, formatVisaValidationProblem } from "@/scripts/import-visa-reference-data";',
      'if (typeof validateVisaDocument !== "function") throw new Error("validateVisaDocument が export されていない");',
      'if (typeof formatVisaValidationProblem !== "function") throw new Error("formatVisaValidationProblem が export されていない");',
      "",
    ].join("\n"),
    "utf8",
  );
  try {
    const { stdout, status } = run([probe]);
    assert(status === 0, "import 自体は成功する（export が維持されている）");
    assert(stdout.trim() === "", `import だけでは何も出力しない（実際: ${JSON.stringify(stdout.slice(0, 120))}）`);
    const after = readFileSync(OUT_FILE, "utf8");
    assert(sha(after) === beforeSha, "import だけでは生成 SQL が1バイトも変わらない");
  } finally {
    rmSync(probe, { force: true });
  }
}

console.log("Test 2: --check は従来どおり（検証のみ・SQL を書かない）");
{
  const { stdout, status } = run([IMPORTER, "--check"]);
  assert(status === 0, "exit 0");
  assert(stdout.includes("student-500.json"), "Student 500 を検証している");
  assert(stdout.includes("working-holiday-417.json"), "417 を検証している");
  assert(stdout.includes("有効な entry: 15件"), `受理 15 entry（実際の出力: ${stdout.trim().split("\n").pop()}）`);
  assert(stdout.includes("SQL は出力しません"), "--check では SQL を出さないと明示する");
  assert(sha(readFileSync(OUT_FILE, "utf8")) === beforeSha, "--check では生成 SQL が変わらない");
}

console.log("Test 3: 通常生成は従来どおり（中身は生成日時以外変わらない）");
{
  const { stdout, status } = run([IMPORTER]);
  assert(status === 0, "exit 0");
  assert(stdout.includes("15件ぶんの SQL を書き出しました"), "SQL を書き出したと報告する");
  const after = readFileSync(OUT_FILE, "utf8");
  assert(semantic(after) === beforeSemantic, "生成日時コメント以外に差分が無い");
  assert(after.includes("on conflict (visa_key, category)"), "upsert のままである");
  assert(!/^\s*(drop|truncate|alter|grant|revoke)\b/im.test(after), "破壊的な DDL が混ざっていない");
  // 生成日時だけが変わる想定なので、検証後に元へ戻す（作業ツリーを汚さない）。
  writeFileSync(OUT_FILE, before, "utf8");
  assert(sha(readFileSync(OUT_FILE, "utf8")) === beforeSha, "検証後にファイルを元へ戻した");
}

console.log("Test 4: --stdout は従来どおり（ファイルを書かない）");
{
  const { stdout, status } = run([IMPORTER, "--stdout"]);
  assert(status === 0, "exit 0");
  assert(stdout.includes("insert into visa_reference_data"), "SQL を標準出力へ出す");
  assert(sha(readFileSync(OUT_FILE, "utf8")) === beforeSha, "--stdout では生成 SQL ファイルを書き換えない");
}

console.log("Test 5: 検証エラーのある入力では SQL を書かない（fail-closed のまま）");
{
  const dir = mkdtempSync(join(tmpdir(), "visa-importer-"));
  try {
    // 既存の JSON を壊したコピーを作り、validateVisaDocument が問題を返すことだけを見る
    // （CLI は data/visas を見るため、ここでは validator の判定で確認する）。
    const doc = JSON.parse(readFileSync("data/visas/australia/working-holiday-417.json", "utf8"));
    doc.entries[0].summary = `${doc.entries[0].summary} subclass 462 も対象です。`;
    const broken = join(dir, "broken.json");
    writeFileSync(broken, JSON.stringify(doc), "utf8");
    const probe = join("scripts", `.probe-validate-${process.pid}.ts`);
    writeFileSync(
      probe,
      [
        'import { readFileSync } from "node:fs";',
        'import { validateVisaDocument } from "@/scripts/import-visa-reference-data";',
        `const doc = JSON.parse(readFileSync(${JSON.stringify(broken)}, "utf8"));`,
        'const r = validateVisaDocument("broken.json", doc);',
        "console.log(JSON.stringify({ problems: r.problems.length, entries: r.entries.length }));",
        "",
      ].join("\n"),
      "utf8",
    );
    try {
      const { stdout, status } = run([probe]);
      assert(status === 0, "validator の呼び出し自体は成功する");
      const result = JSON.parse(stdout.trim().split("\n").pop() ?? "{}");
      assert(result.problems > 0, "混入したデータは検証で弾かれる（ルールを弱めていない）");
      assert(result.entries === 0, "弾かれた場合は entry を1件も受理しない");
      assert(sha(readFileSync(OUT_FILE, "utf8")) === beforeSha, "この確認でも生成 SQL は変わらない");
    } finally {
      rmSync(probe, { force: true });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("");
console.log(`passed: ${pass} / failed: ${fail}`);
if (fail > 0) process.exit(1);
