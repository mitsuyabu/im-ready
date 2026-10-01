/**
 * 人間レビューで入力されたビザデータが、記録の規則を守っているかを検証する。
 *
 *   npx tsx scripts/test-visa-manual-review.ts
 *
 * importer の検証（出典必須・単位必須・通貨必須・placeholder 拒否 等）に加えて、
 * 「人間が確認した内容として成立しているか」を見る:
 *   - 確認済みの値には必ず出典 URL がある
 *   - 期間を書いたら単位がある／金額を書いたら通貨と基準がある
 *   - same_employer に期間があるなら例外の有無が記録されている
 *   - second_third に期間があるなら specified_work の条件もある
 *   - processing を固定日数の保証にしていない
 *   - 未確認の書類を「必須」に入れていない
 *   - 417 に 462 の条件が混ざっていない
 *   - 未確認を 0 / false / 既定値で埋めていない
 *
 * データが未入力（417 のように entries が空）でも通る。未確認を空のまま残すのが正しい状態。
 * ネットワークへは接続しない。
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { VISA_META, isVisaCategory, isVisaKey, isVisaSourceType } from "@/lib/visaReference";

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

function entryOf(doc: RawDoc, category: string): RawEntry | undefined {
  return entriesOf(doc).find((e) => e.category === category);
}

function details(entry: RawEntry): Record<string, unknown> {
  return entry.details && typeof entry.details === "object" ? entry.details : {};
}

function hasSourceUrl(entry: RawEntry): boolean {
  return (entry.sources ?? []).some((s) => typeof s.sourceUrl === "string" && /^https:\/\//.test(s.sourceUrl));
}

function hasHomeAffairsSource(entry: RawEntry): boolean {
  return (entry.sources ?? []).some((s) => s.sourceType === "home_affairs");
}

/** 未確認を記録するための場所（details.unverified）に項目が入っているか。 */
function unverified(entry: RawEntry): string[] {
  const list = details(entry).unverified;
  return Array.isArray(list) ? list.filter((v): v is string => typeof v === "string") : [];
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

console.log("Test 1: 年齢など確認済みの値には出典が必須");
{
  for (const { file, doc } of docs) {
    for (const entry of entriesOf(doc)) {
      const d = details(entry);
      // 年齢に関する値を入れたなら出典が必要
      const ageKeys = Object.keys(d).filter((k) => /age/i.test(k) && d[k] !== null && d[k] !== undefined);
      if (ageKeys.length > 0) {
        assert(hasSourceUrl(entry), `${file}/${entry.category}: 年齢の値があるので出典 URL がある`);
        assert(
          hasHomeAffairsSource(entry),
          `${file}/${entry.category}: 年齢は一次情報（Home Affairs）の出典が必要`,
        );
      }
    }
    assert(true, `${file}: 年齢の記録規則を確認した`);
  }
}

console.log("Test 2: same_employer に期間があるなら例外の有無が記録されている");
{
  for (const { file, doc } of docs) {
    const entry = entryOf(doc, "same_employer");
    if (!entry) {
      assert(true, `${file}: same_employer は未登録（未確認を空のまま残している）`);
      continue;
    }
    const d = details(entry);
    const hasPeriod =
      (typeof d.duration === "number" && d.duration > 0) || (typeof d.limit === "number" && d.limit > 0);
    if (!hasPeriod) {
      assert(true, `${file}/same_employer: 期間が未確認なので例外の記録は不要`);
      continue;
    }
    const exceptionsRecorded =
      Array.isArray(d.exceptions) ||
      typeof d.exceptionsConfirmed === "boolean" ||
      unverified(entry).some((u) => /例外/.test(u));
    assert(
      exceptionsRecorded,
      `${file}/same_employer: 期間を記録したら、例外情報か「例外の有無を確認したか」のメタデータが必要`,
    );
    assert(
      typeof d.unit === "string" || typeof d.durationUnit === "string",
      `${file}/same_employer: 期間には単位が必要`,
    );
  }
}

console.log("Test 3: second_third に期間だけ入れて specified_work の条件が無い状態を禁止");
{
  for (const { file, doc } of docs) {
    const second = entryOf(doc, "second_third");
    if (!second) {
      assert(true, `${file}: second_third は未登録`);
      continue;
    }
    const d = details(second);
    const hasPeriod = typeof d.duration === "number" || typeof d.requiredPeriod === "number";
    if (!hasPeriod) {
      assert(true, `${file}/second_third: 期間は未確認`);
      continue;
    }
    const specified = entryOf(doc, "specified_work");
    assert(specified !== undefined, `${file}/second_third: 期間があるなら specified_work の entry が必要`);
    if (specified) {
      const sd = details(specified);
      const hasConditions =
        (Array.isArray(sd.industries) && sd.industries.length > 0) ||
        (Array.isArray(sd.regions) && sd.regions.length > 0) ||
        (Array.isArray(sd.evidence) && sd.evidence.length > 0);
      assert(hasConditions, `${file}/specified_work: 業種・地域・証拠のいずれかの条件が必要`);
    }
    // 「88日」を条件そのものとして保存していないこと
    assert(
      !/^88\s*days?$/i.test(String(d.requiredPeriod ?? "")),
      `${file}/second_third: 「88 days」という俗称を条件として保存していない`,
    );
  }
}

console.log("Test 4: 金額には通貨が必須（基準と適用開始日も確認）");
{
  for (const { file, doc } of docs) {
    for (const entry of entriesOf(doc)) {
      const d = details(entry);
      if (d.amount === null || d.amount === undefined) continue;
      assert(typeof d.amount === "number", `${file}/${entry.category}: amount は数値`);
      assert(
        typeof d.currency === "string" && /^[A-Z]{3}$/.test(d.currency),
        `${file}/${entry.category}: amount には currency（3文字）が必須`,
      );
      assert(
        typeof d.basis === "string" && ["from", "exact", "minimum"].includes(d.basis),
        `${file}/${entry.category}: from / exact / minimum の区別が必要`,
      );
      assert(hasSourceUrl(entry), `${file}/${entry.category}: 金額には出典 URL が必要`);
    }
  }
}

console.log("Test 5: processing を固定日数の保証にしていない");
{
  for (const { file, doc } of docs) {
    const entry = entryOf(doc, "processing");
    if (!entry) {
      assert(true, `${file}: processing は未登録`);
      continue;
    }
    const d = details(entry);
    assert(
      d.fixedDuration === null || d.fixedDuration === undefined,
      `${file}/processing: 固定日数（fixedDuration）を保証値として持たない`,
    );
    assert(
      d.guaranteed === undefined || d.guaranteed === false,
      `${file}/processing: guaranteed を true にしない`,
    );
    const summary = typeof entry.summary === "string" ? entry.summary : "";
    assert(!/必ず\s*\d+\s*(日|週|営業日)/.test(summary), `${file}/processing: 「必ず○日」と書いていない`);
  }
}

console.log("Test 6: 未確認の書類を「必須」扱いしない");
{
  for (const { file, doc } of docs) {
    const entry = entryOf(doc, "documents");
    if (!entry) {
      assert(true, `${file}: documents は未登録`);
      continue;
    }
    const d = details(entry);
    const required = Array.isArray(d.requiredDocuments) ? d.requiredDocuments : [];
    const unverifiedList = unverified(entry);
    for (const item of required) {
      assert(
        typeof item === "string" && !unverifiedList.includes(item),
        `${file}/documents: 未確認の書類が必須側に入っていない（${String(item)}）`,
      );
    }
    assert(hasSourceUrl(entry), `${file}/documents: 書類には出典 URL が必要`);
  }
}

console.log("Test 7: 417 と 462 を混同していない");
{
  for (const { file, doc } of docs) {
    const visaKey = doc.visaKey;
    assert(isVisaKey(visaKey), `${file}: visaKey が対象`);
    if (!isVisaKey(visaKey)) continue;
    const meta = VISA_META[visaKey];
    assert(doc.visaCode === meta.code, `${file}: visaCode（${String(doc.visaCode)}）が visaKey と一致`);
    assert(doc.visaName === meta.name, `${file}: visaName が正式名称と一致`);

    const body = JSON.stringify(doc.entries ?? []);
    if (visaKey === "australia_working_holiday_417") {
      assert(!/462|Work and Holiday/i.test(body), `${file}: 417 の entry に 462 の記述が混ざっていない`);
    }
    if (visaKey === "australia_work_and_holiday_462") {
      assert(!/\b417\b|Working Holiday visa/i.test(body), `${file}: 462 の entry に 417 の記述が混ざっていない`);
    }
  }
}

console.log("Test 8: 学生ビザの就労時間は fortnight 単位を保持");
{
  const student = docs.find((d) => d.doc.visaKey === "australia_student_500");
  assert(student !== undefined, "Student 500 の JSON がある");
  if (student) {
    const entry = entryOf(student.doc, "work_rights");
    assert(entry !== undefined, "work_rights が登録されている");
    if (entry) {
      const d = details(entry);
      assert(d.unit === "hours_per_fortnight", "単位が hours_per_fortnight のまま");
      assert(d.limit === 48, "上限が 48 のまま");
      const summary = typeof entry.summary === "string" ? entry.summary : "";
      assert(!/週\s?24\s?時間/.test(summary), "要約に週24時間が無い");
      assert(!/per week|週あたり/.test(summary), "要約が週単位へ言い換えていない");
    }
  }
}

console.log("Test 9: 未確認値を 0 / false / 既定値で埋めていない");
{
  for (const { file, doc } of docs) {
    for (const entry of entriesOf(doc)) {
      const d = details(entry);
      for (const key of ["limit", "amount", "duration", "requiredPeriod"]) {
        assert(d[key] !== 0, `${file}/${entry.category}: ${key} を 0 で埋めていない`);
      }
      // 「確認した」ことを示す boolean を、出典なしで true にしていない
      for (const key of Object.keys(d)) {
        if (!/Confirmed$/.test(key)) continue;
        if (d[key] !== true) continue;
        assert(hasSourceUrl(entry), `${file}/${entry.category}: ${key} が true なら出典が必要`);
      }
      // 空文字で埋めていない
      for (const [key, value] of Object.entries(d)) {
        assert(value !== "", `${file}/${entry.category}: ${key} を空文字で埋めていない（null にする）`);
      }
    }
  }
}

console.log("Test 10: 出典 URL の無い確認済み値を禁止 / 出典メタデータの整合");
{
  for (const { file, doc } of docs) {
    for (const entry of entriesOf(doc)) {
      // summary がある = 何かを確認したということなので、出典が必要
      assert(hasSourceUrl(entry), `${file}/${entry.category}: 確認済みの内容には出典 URL が必要`);
      assert(
        typeof entry.reviewedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedAt),
        `${file}/${entry.category}: reviewed_at がある`,
      );
      for (const source of entry.sources ?? []) {
        assert(isVisaSourceType(source.sourceType), `${file}/${entry.category}: source_type が既知のもの`);
        assert(
          typeof source.accessedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(source.accessedAt),
          `${file}/${entry.category}: 人間がページを開いた日（accessed_at）が記録されている`,
        );
        assert(
          typeof source.sourceName === "string" && source.sourceName.length > 0,
          `${file}/${entry.category}: 出典名がある`,
        );
      }
      assert(isVisaCategory(entry.category), `${file}/${String(entry.category)}: category が既知のもの`);
    }
  }
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
