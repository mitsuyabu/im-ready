/**
 * 「確認済みデータに無い書類名・証拠名を出させない」ための grounding 規則のテスト。
 *
 *   npx tsx scripts/test-visa-document-grounding.ts
 *
 * 背景（Phase 8.3）: 「ファームで88日働けばセカンド取れますか？」への実機回答に
 * 「給与明細などの証拠をもらっておく」が再出現した。curated data は specified work の
 * 一般的な証拠要件を**確認できていない**と明記しているため、書類名を出すのは誤案内。
 * 規則が「必ず守ること」（最優先セクション）に入っていること、データ側に禁止語が無いこと、
 * データに実在する書類名（雇用契約書・CoE・OSHC）は使えることを固定する。
 *
 * LLM は呼ばない（実機の出力は完了報告に記録する）。
 */

import { readFileSync, readdirSync } from "node:fs";
import { buildVisaReferenceContext } from "@/lib/visaReferenceContext";
import { detectVisaIntent, resolveVisaKeysForChat } from "@/lib/visaReferenceIntent";
import { readFactList, type VisaCategory, type VisaKey, type VisaReferenceEntry } from "@/lib/visaReference";
import { buildVisaCitations, visaCitationsToSourceCandidates } from "@/lib/visaReferenceContext";
import { buildChatSources, sanitizeStoredChatSources } from "@/lib/referenceSources";
import { validateVisaDocument } from "@/scripts/import-visa-reference-data";

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

/** データに無いのに出してはいけない書類名。 */
const BANNED_DOCUMENT_WORDS = [
  "給与明細",
  "シフト表",
  "雇用証明",
  "残高証明",
  "銀行の残高",
  "通帳",
  "納税書類",
  "雇用主からの手紙",
  "work diary",
  "payslip",
  "bank statement",
];

function loadSeed(): VisaReferenceEntry[] {
  const out: VisaReferenceEntry[] = [];
  for (const file of readdirSync("data/visas/australia")) {
    if (!file.endsWith(".json") || file.startsWith("_")) continue;
    const d = JSON.parse(readFileSync(`data/visas/australia/${file}`, "utf8"));
    for (const [i, e] of (d.entries ?? []).entries()) {
      out.push({
        id: `${d.visaKey}-${e.category}-${i}`,
        visaKey: d.visaKey as VisaKey,
        visaCode: d.visaCode,
        visaName: d.visaName,
        countryCode: "AU",
        category: e.category as VisaCategory,
        summary: e.summary,
        details: e.details ?? {},
        reviewedAt: e.reviewedAt,
        sources: (e.sources ?? []).map((s: Record<string, unknown>) => ({
          sourceName: s.sourceName,
          sourceUrl: s.sourceUrl,
          sourceType: s.sourceType,
          sourcePublishedAt: s.sourcePublishedAt ?? null,
          sourceUpdatedAt: s.sourceUpdatedAt ?? null,
          accessedAt: s.accessedAt ?? null,
        })),
      } as VisaReferenceEntry);
    }
  }
  return out;
}

const SEED = loadSeed();
const NOW = new Date("2026-10-20T00:00:00Z");

/** route と同じ routing でそのターンのコンテキストを作る。 */
function contextFor(message: string): { ctx: string; data: string; categories: VisaCategory[] } {
  const intent = detectVisaIntent(message);
  if (!intent) return { ctx: "", data: "", categories: [] };
  const resolution = resolveVisaKeysForChat({
    visaKeysInMessage: intent.visaKeysInMessage,
    myPlanVisaKey: null,
    karteStated: undefined,
  });
  if (resolution.kind !== "resolved") return { ctx: "", data: "", categories: intent.categories };
  const entries = SEED.filter(
    (e) => resolution.visaKeys.includes(e.visaKey) && intent.categories.includes(e.category),
  );
  const ctx = buildVisaReferenceContext(entries, { now: NOW }) ?? "";
  return { ctx, data: ctx.split("## データ")[1] ?? "", categories: intent.categories };
}

function entryOf(visaKey: VisaKey, category: VisaCategory): VisaReferenceEntry {
  const found = SEED.find((e) => e.visaKey === visaKey && e.category === category);
  if (!found) throw new Error(`${visaKey}/${category} が seed に無い`);
  return found;
}

console.log("Test 1: 88日のコンテキストに禁止された書類名が無い");
{
  const { data, categories } = contextFor("ファームで88日働けばセカンド取れますか？");
  assert(
    categories.sort().join(",") === "second_third,specified_work",
    `セカンドと specified work が対象（${categories.join(",")}）`,
  );
  for (const word of BANNED_DOCUMENT_WORDS) {
    assert(!data.includes(word), `データ部に「${word}」が無い`);
  }
  // curated data 側にも無い（根拠が存在しないことの確認）
  const raw = readFileSync("data/visas/australia/working-holiday-417.json", "utf8");
  assert(!raw.includes("給与明細"), "curated data に「給与明細」が無い");
  // 一般的な証拠要件が未確認であることが明記されている
  const spec = entryOf("australia_working_holiday_417", "specified_work").details as Record<string, unknown>;
  assert(
    readFactList(spec, "unverified").some((u) => u.includes("証拠要件")),
    "一般的な証拠要件が未確認として記録されている",
  );
}

console.log("Test 2: grounding 規則が最優先セクションに入っている");
{
  const { ctx } = contextFor("ファームで88日働けばセカンド取れますか？");
  const must = ctx.split("## 必ず守ること")[1]?.split("\n##")[0] ?? "";
  assert(must.length > 0, "「必ず守ること」セクションがある");
  assert(
    must.includes("話し方・親切さ・カウンセリングのルールより優先"),
    "style / helpfulness より優先する旨が最優先セクションにある",
  );
  assert(
    must.includes("書類名・証拠の名前は、下のデータに出てくるものだけ"),
    "書類名をデータ内に限定する規則が最優先セクションにある",
  );
  assert(
    must.includes("一般知識から具体条件を補わないでください"),
    "一般知識からの補完を禁止する規則がある",
  );
  for (const word of ["給与明細", "シフト表", "雇用証明", "payslip", "bank statement", "work diary"]) {
    assert(must.includes(word), `禁止例として「${word}」が挙げられている`);
  }
  assert(must.includes("例示・候補の列挙にも当てはまります"), "例示・候補の列挙も禁止している");
  assert(
    must.includes("どんな書類が候補になるかを書かずに"),
    "未確認のときは候補を並べない指示がある",
  );
  assert(
    must.includes("確認済みの情報だけでは特定できません"),
    "未確認のときの言い方が示されている",
  );
}

console.log("Test 3: データに実在する書類名は使える");
{
  const { data } = contextFor("ファームで88日働けばセカンド取れますか？");
  // specified work の証拠はシフト勤務時の雇用契約書だけがデータにある
  assert(data.includes("雇用契約書"), "データにある「雇用契約書」は渡る");
  const must = contextFor("ファームで88日働けばセカンド取れますか？").ctx.split("## 必ず守ること")[1] ?? "";
  assert(
    must.includes("データに書かれている書類名（例: 雇用契約書・CoE・健康保険の情報）はそのまま使ってかまいません"),
    "データにある書類名は使える旨が明記されている",
  );
}

console.log("Test 4: Student 500 の CoE / OSHC は出せる");
{
  const { data } = contextFor("学生ビザの必要書類は何ですか？");
  assert(data.includes("CoE"), "CoE が渡る");
  assert(data.includes("健康保険（OSHC）の情報"), "OSHC の情報が渡る");
  assert(data.includes("Document Checklist tool"), "最終確認手段が渡る");
  for (const word of BANNED_DOCUMENT_WORDS) {
    assert(!data.includes(word), `必要書類のデータ部に「${word}」が無い`);
  }
  // ケース依存の分類はあるが、具体的な書類名までは持っていない
  const docs = entryOf("australia_student_500", "documents").details as Record<string, unknown>;
  const caseDependent = readFactList(docs, "caseDependentDocuments").join(" / ");
  assert(caseDependent.includes("資金の証明"), "資金の証明という分類はある");
  assert(!/残高証明|通帳|給与明細/.test(caseDependent), "分類に具体的な書類名を入れていない");
}

console.log("Test 5: 資金証明は証明方法が未確認であることを持っている");
{
  const fin = entryOf("australia_student_500", "financial_capacity").details as Record<string, unknown>;
  assert(
    readFactList(fin, "unverified").some((u) => u.includes("資金の証明方法")),
    "資金の証明方法が未確認として記録されている",
  );
  const { data } = contextFor("学生ビザの資金証明はいくら？");
  assert(data.includes("資金の証明方法"), "未確認であることが渡る");
  for (const word of BANNED_DOCUMENT_WORDS) {
    assert(!data.includes(word), `資金要件のデータ部に「${word}」が無い`);
  }
}

console.log("Test 6: same_employer に証拠要件は無い（捏造の根拠が無い）");
{
  const same = entryOf("australia_working_holiday_417", "same_employer").details as Record<string, unknown>;
  assert(readFactList(same, "evidence").length === 0, "same_employer に evidence が無い");
  const { data } = contextFor("ワーホリで同じ会社で6ヶ月を超えて働く許可はどうやって申請しますか？");
  for (const word of BANNED_DOCUMENT_WORDS) {
    assert(!data.includes(word), `同一雇用主のデータ部に「${word}」が無い`);
  }
  // データにある手続きの情報は保持されている
  assert(data.includes("8547"), "条件番号が渡る");
  assert(data.includes("許可が必ず認められるとは限らない"), "必ず認められないことが渡る");
}

console.log("Test 7: 既存の条件（業種・地域・期間）は落ちていない");
{
  const { data } = contextFor("ファームで88日働けばセカンド取れますか？");
  for (const need of ["88 calendar days", "対象となる業種", "対象となる地域", "フルタイム", "短縮されない"]) {
    assert(data.includes(need), `条件（${need}）が渡る`);
  }
  const { ctx } = contextFor("ファームで88日働けばセカンド取れますか？");
  assert(
    ctx.includes("業種だけに触れて地域の条件を落とさないでください"),
    "地域の条件を落とさない指示が残っている",
  );
  assert(
    ctx.includes("UK パスポート") || ctx.includes("UK 限定"),
    "UK 例外が日本へ適用されない旨が渡る",
  );
}

console.log("Test 8: financial_capacity の証明方法が未確認として構造化されている（Phase 8.4）");
{
  const fin = entryOf("australia_student_500", "financial_capacity");
  const det = fin.details as Record<string, unknown>;
  assert(det.evidenceStatus === "unverified", `evidenceStatus = unverified（実際: ${String(det.evidenceStatus)}）`);
  const guidance = (det.evidenceGuidance ?? {}) as Record<string, unknown>;
  assert(guidance.specificMethodsVerified === false, "specificMethodsVerified = false");
  assert(guidance.doNotNameSpecificDocuments === true, "doNotNameSpecificDocuments = true");
  assert(
    Array.isArray(guidance.verifiedEvidence) && (guidance.verifiedEvidence as unknown[]).length === 0,
    "verifiedEvidence は空（確認済みの書類が無い）",
  );
  // 金額・出典は維持されている
  assert(det.amount === 29710 && det.currency === "AUD", "金額 AUD 29,710 が維持されている");
  assert(det.primarySourceVerified === false, "一次照合未了のまま");
  assert(
    fin.sources.length === 1 && fin.sources[0].sourceType === "study_australia",
    "出典は Study Australia のみ（Home Affairs を捏造していない）",
  );
  assert(
    !fin.sources.some((src) => src.sourceType === "home_affairs"),
    "Home Affairs の出典を付けていない",
  );
  // 新しい証明方法をデータへ追加していない
  const raw = readFileSync("data/visas/australia/student-500.json", "utf8");
  for (const word of ["残高証明", "bank statement", "通帳", "給与明細", "送金記録", "奨学金証明"]) {
    assert(!raw.includes(word), `curated data に「${word}」を追加していない`);
  }
}

console.log("Test 9: entry 固有の禁止指示がコンテキストへ出る");
{
  const { data } = contextFor("学生ビザの資金証明はどうやって示すんですか？");
  assert(
    data.includes("この項目の具体的な証明方法・必要書類は確認できていません"),
    "未確認であることが entry 単位で渡る",
  );
  assert(data.includes("書類の例を足さず"), "書類の例を足させない指示が渡る");
  assert(
    data.includes("今回確認できている情報では特定できません"),
    "答え方（定型文）が渡る",
  );
  assert(
    data.includes("どんな書類が候補になるかの説明は、この項目については一切書かないでください"),
    "候補の説明を禁止する指示が渡る",
  );
  assert(data.includes("金額そのものには触れてかまいません"), "金額には触れてよいと渡る");
  // 禁止語を列挙して思い出させない（実機10回で逆効果を確認したため）
  for (const word of ["残高証明", "通帳", "payslip", "bank statement"]) {
    assert(!data.includes(word), `禁止指示の中に「${word}」を列挙していない`);
  }
  // 金額は従来どおり渡る
  assert(data.includes("AUD 29,710"), "金額が渡る");
}

console.log("Test 10: 他の category へ誤適用しない");
{
  // Student の必要書類では CoE / OSHC が出せる（financial_capacity のルールを持ち込まない）
  const docs = contextFor("学生ビザの必要書類は？");
  assert(docs.data.includes("CoE"), "CoE は出せる");
  assert(docs.data.includes("健康保険（OSHC）の情報"), "OSHC の情報は出せる");
  assert(
    !docs.data.includes("この項目の具体的な証明方法・必要書類は確認できていません"),
    "必要書類の回答へ financial_capacity 固有の禁止を持ち込まない",
  );
  // same_employer / specified_work にも evidenceStatus は無い
  for (const category of ["same_employer", "specified_work", "second_third"] as const) {
    const det = entryOf("australia_working_holiday_417", category).details as Record<string, unknown>;
    assert(det.evidenceStatus === undefined, `417/${category} に evidenceStatus を付けていない`);
  }
}

console.log("Test 11: evidenceStatus の validation が効く（弱めていない）");
{
  const base = JSON.parse(readFileSync("data/visas/australia/student-500.json", "utf8"));
  function rejected(mutate: (d: Record<string, unknown>) => void): boolean {
    const doc = JSON.parse(JSON.stringify(base));
    const fin = doc.entries.find((e: { category: string }) => e.category === "financial_capacity");
    mutate(fin.details as Record<string, unknown>);
    const r = validateVisaDocument("x.json", doc);
    return r.problems.some((p) => (p.field ?? "").includes("evidence"));
  }
  assert(
    rejected((d) => {
      (d.evidenceGuidance as Record<string, unknown>).specificMethodsVerified = true;
    }),
    "unverified なのに specificMethodsVerified: true は拒否",
  );
  assert(
    rejected((d) => {
      delete (d.evidenceGuidance as Record<string, unknown>).doNotNameSpecificDocuments;
    }),
    "unverified で doNotNameSpecificDocuments が無いのは拒否",
  );
  assert(
    rejected((d) => {
      (d.evidenceGuidance as Record<string, unknown>).verifiedEvidence = ["銀行の残高証明"];
    }),
    "unverified のまま確認済み書類を入れるのは拒否",
  );
  assert(rejected((d) => { d.evidenceStatus = "maybe"; }), "不正な status は拒否");
  assert(rejected((d) => { delete d.evidenceGuidance; }), "evidenceGuidance が無いのは拒否");
  assert(
    rejected((d) => {
      d.evidenceStatus = "verified";
      (d.evidenceGuidance as Record<string, unknown>).specificMethodsVerified = true;
      (d.evidenceGuidance as Record<string, unknown>).verifiedEvidence = ["X"];
    }),
    "verified にするのに一次情報の出典が無いのは拒否",
  );
  // 現状のデータは通る
  const ok = validateVisaDocument("data/visas/australia/student-500.json", base);
  assert(ok.problems.length === 0, `現状のデータは通る（${ok.problems.length}件）`);
}

console.log("Test 12: 内部の確認状態を出典パネル・永続化へ出さない");
{
  const fin = entryOf("australia_student_500", "financial_capacity");
  const sources = buildChatSources(visaCitationsToSourceCandidates(buildVisaCitations([fin])));
  const serialized = JSON.stringify(sources);
  for (const word of [
    "evidenceStatus",
    "evidenceGuidance",
    "specificMethodsVerified",
    "doNotNameSpecificDocuments",
    "verifiedEvidence",
    "primarySourceVerified",
    "書類名を回答に挙げない",
  ]) {
    assert(!serialized.includes(word), `出典パネルに「${word}」が出ない`);
  }
  assert(sources.length === 1 && sources[0].name.includes("Study Australia"), "出典は Study Australia のみ");
  const stored = JSON.stringify(sanitizeStoredChatSources(sources));
  assert(!/evidence|primarySourceVerified/.test(stored), "永続化される値にも内部状態が入らない");
}

console.log("");
console.log(`passed: ${pass} / failed: ${fail}`);
if (fail > 0) process.exit(1);
