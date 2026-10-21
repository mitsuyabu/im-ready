/**
 * 資金要件（financial_capacity）の「金額を聞く質問」と「証明方法を聞く質問」の分離テスト。
 *
 *   npx tsx scripts/test-financial-evidence-routing.ts
 *
 * 背景（Phase 8.5）: 「どう証明する？」に対して、プロンプトをどれだけ強めても
 * 未確認の書類名が確率的に出た（実機で 1〜3/10）。そこで**推測の材料そのものを渡さない**
 * 経路へ切り替える。判定は question intent と entry の evidenceStatus の**両方**で行う。
 *
 * LLM は呼ばない（route と同じ分岐を再現して、渡るコンテキストを検証する）。
 */

import { readFileSync, readdirSync } from "node:fs";
import {
  buildVisaCitations,
  buildVisaReferenceContext,
  buildVisaUnverifiedEvidenceContext,
  visaCitationsToSourceCandidates,
} from "@/lib/visaReferenceContext";
import { buildChatSources, sanitizeStoredChatSources } from "@/lib/referenceSources";
import { detectVisaIntent, resolveVisaKeysForChat } from "@/lib/visaReferenceIntent";
import type { VisaCategory, VisaKey, VisaReferenceEntry } from "@/lib/visaReference";

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

/** 未確認のときに出してはいけない書類名。 */
const BANNED = [
  "残高証明",
  "銀行口座",
  "bank statement",
  "通帳",
  "給与明細",
  "payslip",
  "送金記録",
  "奨学金証明",
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

type Projected = {
  kind: string;
  categories: VisaCategory[];
  context: string;
  sourceCount: number;
  usedEntries: VisaCategory[];
};

/**
 * route（app/api/chat/route.ts）と同じ分岐を再現する。
 * `entries` を差し替えられるようにして、将来 verified になった場合も検証できる形にする。
 */
function project(message: string, seed: VisaReferenceEntry[] = SEED): Projected {
  const intent = detectVisaIntent(message);
  if (!intent) return { kind: "none", categories: [], context: "", sourceCount: 0, usedEntries: [] };
  const resolution = resolveVisaKeysForChat({
    visaKeysInMessage: intent.visaKeysInMessage,
    myPlanVisaKey: null,
    karteStated: undefined,
  });
  if (resolution.kind !== "resolved") {
    return { kind: "needsVisa", categories: intent.categories, context: "", sourceCount: 0, usedEntries: [] };
  }
  const entries = seed.filter(
    (e) => resolution.visaKeys.includes(e.visaKey) && intent.categories.includes(e.category),
  );
  const financialEntry = entries.find((e) => e.category === "financial_capacity");
  const evidenceUnverified =
    financialEntry !== undefined && financialEntry.details.evidenceStatus === "unverified";
  const asksEvidenceMethod =
    intent.financialQuestion === "evidence_method" || intent.financialQuestion === "mixed";

  if (evidenceUnverified && asksEvidenceMethod) {
    const keep =
      intent.financialQuestion === "mixed"
        ? entries
        : entries.filter((e) => e.category !== "financial_capacity");
    const evidenceContext = buildVisaUnverifiedEvidenceContext(resolution.visaKeys);
    if (keep.length === 0) {
      return {
        kind: `${intent.financialQuestion}/未確認のみ`,
        categories: intent.categories,
        context: evidenceContext,
        sourceCount: 0,
        usedEntries: [],
      };
    }
    const kept = buildVisaReferenceContext(keep, {}) ?? "";
    return {
      kind: `${intent.financialQuestion}/併記`,
      categories: intent.categories,
      context: kept ? `${kept}\n\n---\n\n${evidenceContext}` : evidenceContext,
      sourceCount: buildChatSources(visaCitationsToSourceCandidates(buildVisaCitations(keep))).length,
      usedEntries: keep.map((e) => e.category),
    };
  }

  return {
    kind: intent.financialQuestion,
    categories: intent.categories,
    context: buildVisaReferenceContext(entries, {}) ?? "",
    sourceCount: buildChatSources(visaCitationsToSourceCandidates(buildVisaCitations(entries))).length,
    usedEntries: entries.map((e) => e.category),
  };
}

console.log("Test 1: amount intent（金額を聞く質問）");
{
  for (const message of [
    "学生ビザの資金はいくら必要ですか？",
    "学生ビザの資金要件はいくらですか？",
    "学生ビザの資金は最低いくら必要？",
    "学生ビザの必要資金はどれくらい必要ですか？",
  ]) {
    const r = project(message);
    assert(r.kind === "amount", `「${message}」→ amount（実際: ${r.kind}）`);
    assert(r.context.includes("AUD 29,710"), `「${message}」→ 金額が渡る`);
    assert(r.usedEntries.includes("financial_capacity"), `「${message}」→ 資金要件の entry を使う`);
    assert(r.sourceCount === 1, `「${message}」→ 出典1件（Study Australia）`);
  }
}

console.log("Test 2: evidence-method intent（証明方法を聞く質問）");
{
  for (const message of [
    "学生ビザの資金証明はどうやって示すんですか？",
    "学生ビザで何を提出すれば資金証明できますか？",
    "学生ビザの資金力はどう証明しますか？",
    "学生ビザの資金の証明方法を教えてください",
  ]) {
    const r = project(message);
    assert(r.kind === "evidence_method/未確認のみ", `「${message}」→ 未確認経路（実際: ${r.kind}）`);
    assert(r.usedEntries.length === 0, `「${message}」→ 資金要件の entry を渡さない`);
    assert(!r.context.includes("29,710"), `「${message}」→ 金額を渡さない`);
    for (const word of BANNED) {
      assert(!r.context.includes(word), `「${message}」→ コンテキストに「${word}」が無い`);
    }
    assert(r.sourceCount === 0, `「${message}」→ 出典を付けない`);
    assert(
      r.context.includes("現在確認できている情報では特定できません"),
      `「${message}」→ 答え方が渡る`,
    );
    assert(r.context.includes("最後に質問を返さないでください"), `「${message}」→ follow-up を禁止する`);
  }
}

console.log("Test 3: mixed intent（金額と証明方法の両方）");
{
  for (const message of [
    "学生ビザではいくら資金が必要で、どう証明しますか？",
    "学生ビザの資金はいくら必要で、何を提出すればいいですか？",
  ]) {
    const r = project(message);
    assert(r.kind === "mixed/併記", `「${message}」→ 併記経路（実際: ${r.kind}）`);
    assert(r.context.includes("AUD 29,710"), `「${message}」→ 金額は渡る`);
    assert(
      r.context.includes("どう証明するか・何を提出するか"),
      `「${message}」→ 証明方法は未確認として渡る`,
    );
    assert(r.usedEntries.includes("financial_capacity"), `「${message}」→ 金額の entry は使う`);
    assert(r.sourceCount === 1, `「${message}」→ 金額の出典は付く`);
  }
}

console.log("Test 4: evidenceStatus が unverified のときだけ未確認経路へ");
{
  // evidenceStatus を外した seed では、従来どおり entry を渡す（キーワードだけで決め打ちしない）
  const withoutStatus = SEED.map((e) =>
    e.category === "financial_capacity"
      ? { ...e, details: Object.fromEntries(Object.entries(e.details).filter(([k]) => k !== "evidenceStatus")) }
      : e,
  );
  const r = project("学生ビザの資金証明はどうやって示すんですか？", withoutStatus);
  assert(r.kind === "evidence_method", `evidenceStatus が無ければ従来経路（実際: ${r.kind}）`);
  assert(r.usedEntries.includes("financial_capacity"), "従来どおり entry を渡す");
  // unverified のときだけ切り替わる
  const r2 = project("学生ビザの資金証明はどうやって示すんですか？");
  assert(r2.kind === "evidence_method/未確認のみ", "unverified なら未確認経路へ切り替わる");
}

console.log("Test 5: 将来 verified になったら確認済みデータを使える");
{
  const verified = SEED.map((e) =>
    e.category === "financial_capacity"
      ? {
          ...e,
          details: {
            ...e.details,
            evidenceStatus: "verified",
            evidenceGuidance: {
              specificMethodsVerified: true,
              doNotNameSpecificDocuments: false,
              verifiedEvidence: ["確認済みの証明書類A"],
            },
          },
        }
      : e,
  );
  const r = project("学生ビザの資金証明はどうやって示すんですか？", verified);
  assert(r.kind === "evidence_method", `verified なら従来経路（実際: ${r.kind}）`);
  assert(r.usedEntries.includes("financial_capacity"), "verified では entry を渡す");
  assert(r.context.includes("確認済みの証明方法"), "確認済みの証明方法が渡る");
  assert(r.context.includes("確認済みの証明書類A"), "verifiedEvidence の内容が渡る");
  assert(
    r.context.includes("他の書類名を足さないでください"),
    "確認済み以外を足させない指示が付く",
  );
}

console.log("Test 6: documents 質問との分離");
{
  const r = project("学生ビザの必要書類は？");
  assert(r.categories.join(",") === "documents", `documents へ routing（${r.categories.join(",")}）`);
  assert(r.usedEntries.join(",") === "documents", "documents の entry を使う");
  assert(r.context.includes("CoE"), "CoE が渡る");
  assert(r.context.includes("健康保険（OSHC）の情報"), "OSHC の情報が渡る");
  assert(
    !r.context.includes("どう証明するか・何を提出するか"),
    "financial_capacity 専用の未確認経路へ誤ルーティングしない",
  );
}

console.log("Test 7: 申請料（costs）質問との分離");
{
  const r = project("学生ビザはいくらですか？");
  assert(r.categories.join(",") === "costs", `costs へ routing（${r.categories.join(",")}）`);
  assert(r.context.includes("AUD 2,500"), "申請料が渡る");
  assert(!r.context.includes("29,710"), "資金要件の金額へ誤ルーティングしない");
}

console.log("Test 8-10: コンテキストの中身（渡す/渡さないの境界）");
{
  const evidence = project("学生ビザの資金証明はどうやって示すんですか？");
  assert(!evidence.context.includes("29,710"), "8. 証明方法だけの質問に金額を含めない");
  assert(!evidence.context.includes("Study Australia"), "8. 出典名も含めない");
  for (const word of BANNED) {
    assert(!evidence.context.includes(word), `9. 具体的な書類名「${word}」を含めない`);
  }
  assert(evidence.context.length < 1200, `9. コンテキストが小さい（${evidence.context.length}文字・推測材料を渡さない）`);
  const mixed = project("学生ビザではいくら資金が必要で、どう証明しますか？");
  assert(mixed.context.includes("AUD 29,710"), "10. 混合質問では金額を保持");
  assert(
    mixed.context.includes("現在確認できている情報では特定できません"),
    "10. 混合質問でも証明方法は未確認として止める",
  );
}

console.log("Test 11: 出典パネルの意味を壊さない");
{
  const evidence = project("学生ビザの資金証明はどうやって示すんですか？");
  assert(evidence.sourceCount === 0, "未確認だけの回答には出典を付けない");
  const amount = project("学生ビザの資金はいくら必要ですか？");
  assert(amount.sourceCount === 1, "金額の回答には従来どおり出典が付く");
  const sources = buildChatSources(
    visaCitationsToSourceCandidates(
      buildVisaCitations(SEED.filter((e) => e.category === "financial_capacity")),
    ),
  );
  assert(sources[0].name.includes("Study Australia"), "出典は Study Australia");
  assert(!sources.some((s) => s.label.includes("一次情報")), "一次情報として見せない");
}

console.log("Test 12: 内部の確認状態を永続化しない");
{
  const sources = buildChatSources(
    visaCitationsToSourceCandidates(
      buildVisaCitations(SEED.filter((e) => e.category === "financial_capacity")),
    ),
  );
  const stored = JSON.stringify(sanitizeStoredChatSources(sources));
  for (const word of ["evidenceStatus", "evidenceGuidance", "specificMethodsVerified", "verifiedEvidence"]) {
    assert(!stored.includes(word), `永続化される値に「${word}」が無い`);
  }
}

console.log("");
console.log(`passed: ${pass} / failed: ${fail}`);
if (fail > 0) process.exit(1);
