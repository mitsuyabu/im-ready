/**
 * ビザリファレンス基盤（intent routing / resolution / context builder / 検証）のテスト。
 *
 *   npx tsx scripts/test-visa-reference-data.ts
 *
 * 仕様の Test 1〜15 に対応。ネットワーク・remote DB へは接続しない。
 * 公的データ側はテスト用の架空 entry と、実 seed JSON の両方を使う。
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import {
  VISA_CATEGORIES,
  VISA_CATEGORY_LABELS,
  VISA_META,
  isVisaCategory,
  isVisaKey,
  isVisaSourceType,
  needsVisaReviewCaution,
  readMoneyFact,
  readWorkHourLimit,
  type VisaCategory,
  type VisaKey,
  type VisaReferenceEntry,
  hasFinancialEvidence,
  onlyFinancialEvidence,
} from "@/lib/visaReference";
import { detectVisaIntent, extractVisaKeysFromText, resolveVisaKeysForChat } from "@/lib/visaReferenceIntent";
import {
  buildVisaCitations,
  buildVisaNeedsVisaContext,
  buildVisaNoDataContext,
  buildVisaReferenceContext,
} from "@/lib/visaReferenceContext";
import { loadVisaReferenceEntries, parseVisaReferenceEntry } from "@/lib/visaReferenceServer";
import { validateVisaDocument } from "@/scripts/import-visa-reference-data";
import type { SupabaseClient } from "@supabase/supabase-js";

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

const NOW = new Date("2026-10-01T00:00:00Z");

/** 実 seed（人間が確認済みの Student 500）を entry 形へ読み込む。 */
function loadSeedEntries(): VisaReferenceEntry[] {
  const out: VisaReferenceEntry[] = [];
  for (const file of readdirSync("data/visas/australia")) {
    if (!file.endsWith(".json") || file.startsWith("_")) continue;
    const doc = JSON.parse(readFileSync(`data/visas/australia/${file}`, "utf8"));
    for (const [i, e] of (doc.entries ?? []).entries()) {
      out.push({
        id: `${doc.visaKey}-${e.category}-${i}`,
        visaKey: doc.visaKey as VisaKey,
        visaCode: doc.visaCode,
        visaName: doc.visaName,
        countryCode: doc.countryCode ?? "AU",
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

const SEED = loadSeedEntries();

function seedEntry(visaKey: VisaKey, category: VisaCategory): VisaReferenceEntry | undefined {
  return SEED.find((e) => e.visaKey === visaKey && e.category === category);
}

/** テスト用の架空 entry。 */
function entry(
  visaKey: VisaKey,
  category: VisaCategory,
  overrides: Partial<VisaReferenceEntry> = {},
): VisaReferenceEntry {
  const meta = VISA_META[visaKey];
  return {
    id: `${visaKey}-${category}`,
    visaKey,
    visaCode: meta.code,
    visaName: meta.name,
    countryCode: "AU",
    category,
    summary: `${category} のテスト用要約`,
    details: {},
    reviewedAt: "2026-10-01",
    sources: [
      {
        sourceName: "Department of Home Affairs - test",
        sourceUrl: "https://immi.homeaffairs.gov.au/test",
        sourceType: "home_affairs",
        sourcePublishedAt: null,
        sourceUpdatedAt: null,
        accessedAt: "2026-10-01",
      },
    ],
    ...overrides,
  };
}

/** route と同じ組み立てを再現する。 */
function simulate(input: {
  message: string;
  entries?: VisaReferenceEntry[];
  karteStated?: { workingHolidayInterest?: boolean | null; studyIntent?: boolean | null };
}): {
  context: string;
  readVisaData: boolean;
  categories: VisaCategory[];
  visaKeys: VisaKey[];
  usedData: boolean;
} {
  const empty = { context: "", readVisaData: false, categories: [] as VisaCategory[], visaKeys: [] as VisaKey[], usedData: false };
  const intent = detectVisaIntent(input.message);
  if (!intent) return empty;

  const resolution = resolveVisaKeysForChat({
    visaKeysInMessage: intent.visaKeysInMessage,
    myPlanVisaKey: null,
    karteStated: input.karteStated,
  });
  if (resolution.kind === "needsVisa") {
    return {
      ...empty,
      context: buildVisaNeedsVisaContext(resolution.reason),
      categories: intent.categories,
      readVisaData: true,
    };
  }

  const all = input.entries ?? SEED;
  const loaded = all.filter(
    (e) => resolution.visaKeys.includes(e.visaKey) && intent.categories.includes(e.category),
  );
  // route と同じ射影: 資金の質問で足した documents entry は資金の情報を持つものだけ使い、
  // 資金だけを聞かれたターンでは資金の情報へ絞る。
  const usable = intent.asksDocuments
    ? loaded
    : loaded.filter((e) => e.category !== "documents" || hasFinancialEvidence(e));
  const matched =
    !intent.asksDocuments && intent.financialQuestion !== "unspecified"
      ? usable.map(onlyFinancialEvidence)
      : usable;
  if (matched.length === 0) {
    return {
      context: buildVisaNoDataContext(resolution.visaKeys, intent.categories),
      readVisaData: true,
      categories: intent.categories,
      visaKeys: resolution.visaKeys,
      usedData: false,
    };
  }
  return {
    context:
      buildVisaReferenceContext(matched, {
        mentionsTax: intent.mentionsTax,
        mentionsFarmJobSearch: intent.mentionsFarmJobSearch,
        now: NOW,
      }) ?? "",
    readVisaData: true,
    categories: intent.categories,
    visaKeys: resolution.visaKeys,
    usedData: true,
  };
}

async function main() {
  console.log("Test 1: 通常会話 → visa DB read 0");
  for (const message of [
    "留学するか迷っています",
    "親に反対されていて不安です",
    "英語が話せるようになるか心配です",
    "メルボルンの治安はどう？",
    "シドニーの生活費は高い？",
  ]) {
    const r = simulate({ message });
    assert(!r.readVisaData && r.context === "", `「${message}」ではビザ情報を読まない`);
  }

  console.log("Test 2: 「学生ビザで何時間働ける？」→ 500 / work_rights のみ・週換算しない");
  {
    const r = simulate({ message: "学生ビザで何時間働ける？" });
    assert(r.visaKeys.join(",") === "australia_student_500", "ビザは 500 に解決される");
    assert(r.categories.join(",") === "work_rights", "category は work_rights だけ");
    assert(r.usedData, "確認済みデータが使われる");
    assert(r.context.includes("48 hours per fortnight（2週間あたりの時間数）"), "単位つきで 48 が渡る");
    assert(!/週\s?24\s?時間/.test(r.context), "週24時間が出てこない");
    assert(r.context.includes("2で割って週単位の上限へ言い換えないでください"), "週換算を禁止する指示がある");
    assert(r.context.includes("Masters by Research"), "例外（研究学位）が渡る");
    assert(r.context.includes("適用: 授業期間中"), "どの期間に適用されるかが渡る");
    assert(r.context.includes("未確認"), "ブレイク中の扱いが未確認であることが渡る");
  }

  console.log("Test 3: 「学生ビザの費用は？」→ costs のみ・確定額として扱わない・円なし");
  {
    const r = simulate({ message: "学生ビザの費用はいくら？" });
    assert(r.categories.includes("costs"), "costs が対象");
    assert(r.context.includes("AUD 2,500"), "確認済みの金額が渡る");
    assert(r.context.includes("この額“から”"), "「から」であることが明示される");
    assert(r.context.includes("適用開始: 2026-07-01"), "適用開始日が渡る");
    assert(r.context.includes("日本円へ換算しないでください"), "円換算を禁止する");
    assert(!/[\d０-９][\d０-９,.]*\s?(円|万円)/.test(r.context), "円建ての金額が無い");
    assert(r.context.includes("申請料・年齢条件・審査期間・必要日数などを推測で答えてはいけません"), "数値の推測を禁止する");
  }

  console.log("Test 4: 「学生ビザで保険必要？」→ health_insurance / OSHC");
  {
    const r = simulate({ message: "学生ビザで保険は必要？" });
    assert(r.categories.includes("health_insurance"), "health_insurance が対象");
    assert(r.context.includes("OSHC"), "OSHC の説明が渡る");
    assert(r.context.includes("滞在の全期間"), "滞在全期間の要件が渡る");
  }

  console.log("Test 5: 「ワーホリのセカンドは？」→ 417 / second_third + specified_work");
  {
    const r = simulate({ message: "ワーホリのセカンドはどうやって取るの？" });
    assert(r.visaKeys.join(",") === "australia_working_holiday_417", "417 に解決される");
    assert(
      r.categories.includes("second_third") && r.categories.includes("specified_work"),
      "second_third と specified_work の両方を取得する（片方だけでは誤解を生むため）",
    );
    // 2026-10-02 の人間確認で specified_work / second_third が登録されたため、データが使われる
    assert(r.usedData, "確認済みデータが使われる");
    assert(r.context.includes("88 calendar days"), "セカンドの最低暦日数が渡る");
    assert(r.context.includes("179 calendar days"), "サードの最低暦日数が渡る");
    assert(
      r.context.includes("それだけでは条件を満たさない"),
      "暦日数だけでは条件を満たさないことが渡る",
    );
    assert(
      r.context.includes("農場で日数を働けば必ず取得できるわけではない"),
      "「日数を働けば取れる」を否定する指示が入る",
    );
    assert(r.context.includes("ここに無い事実を数値で補わないでください"), "捏造を禁止する");
  }

  console.log("Test 6: 「ファームで88日働けば取れる？」→ 条件を説明・YES と断定しない");
  {
    const r = simulate({
      message: "ファームで88日働けばセカンド取れる？",
      entries: [
        entry("australia_working_holiday_417", "specified_work", {
          summary: "specified work の条件（テスト用）",
          details: {
            industries: ["植物・動物の栽培", "漁業・真珠養殖"],
            regions: ["指定された地域"],
            evidence: ["給与明細", "雇用主の情報"],
          },
        }),
        entry("australia_working_holiday_417", "second_third", { summary: "セカンドの申請資格（テスト用）" }),
      ],
    });
    assert(r.usedData, "データが使われる");
    assert(
      r.context.includes("農場で日数を働けば必ず取得できるわけではない"),
      "「働けば必ず取れる」と答えさせない指示がある",
    );
    assert(r.context.includes("「これをやれば取れます」と結論づけないでください"), "結論づけを禁止する");
    assert(r.context.includes("対象となる業種: 植物・動物の栽培"), "対象業種が構造化データから渡る");
    assert(r.context.includes("必要な証拠: 給与明細"), "証拠の要件が渡る");
    assert(
      r.context.includes("specified work の対象となる仕事・業種・地域を、渡されたデータ以外から足さないでください"),
      "対象を勝手に足させない",
    );
  }

  console.log("Test 7: 「ビザ何日で出る？」→ processing・確定日数を保証しない");
  {
    const r = simulate({
      message: "学生ビザは何日で出る？",
      entries: [entry("australia_student_500", "processing", { summary: "審査期間の目安（テスト用）" })],
    });
    assert(r.categories.includes("processing"), "processing が対象");
    assert(r.context.includes("具体的な日数を保証しないでください"), "日数の保証を禁止する");
    assert(r.context.includes("日数を推測しないでください"), "日数の推測も禁止する");
  }

  console.log("Test 8: DB の category 欠損 → 安全な fallback・数値捏造なし");
  {
    // Student 500 の arrival_preparation は未登録
    const r = simulate({ message: "学生ビザで行くまでに準備することは？" });
    assert(r.categories.includes("arrival_preparation"), "arrival_preparation が対象");
    assert(!r.usedData, "未登録なのでデータは使われない");
    assert(r.context.includes("確認済みのデータがありません"), "データが無いことを伝える");
    assert(r.context.includes("渡航までの準備"), "どの項目が無いのかを示す");
    assert(
      r.context.includes("知識ベースに書かれている制度の大枠"),
      "fallback として知識ベースの大枠は使える旨が書かれている",
    );
    assert(r.context.includes("具体的な数値や個別の条件は断定しないでください"), "断定を禁止する");

    // documents は今回 Home Affairs 一次情報で登録されたので、データが使われる側へ移った
    const docs = simulate({ message: "学生ビザの必要書類は？" });
    assert(docs.categories.includes("documents"), "documents が対象");
    assert(docs.usedData, "documents は登録済みなのでデータが使われる");
  }

  console.log("Test 9: reviewed_at が古い → 再確認推奨が付く");
  {
    const old = entry("australia_student_500", "costs", {
      reviewedAt: "2025-01-01",
      details: { amount: 1600, currency: "AUD", basis: "exact", per: "application" },
    });
    assert(needsVisaReviewCaution(old, NOW), "6ヶ月を超えていれば再確認推奨");
    const r = simulate({ message: "学生ビザのビザ代は？", entries: [old] });
    assert(r.context.includes("再確認推奨"), "再確認推奨が渡る");
    assert(r.context.includes("2025-01-01"), "確認日がそのまま渡る");
    assert(r.context.includes("断定せず"), "断定させない");

    const fresh = entry("australia_student_500", "costs", { reviewedAt: "2026-09-01" });
    assert(!needsVisaReviewCaution(fresh, NOW), "6ヶ月以内なら注意は不要");
    const freshCtx = buildVisaReferenceContext([fresh], { now: NOW }) ?? "";
    assert(!freshCtx.includes("再確認推奨"), "新しい entry に再確認推奨は付かない");
  }

  console.log("Test 10: 出典を聞かれたら正確に答えられる");
  {
    const r = simulate({ message: "学生ビザの就労時間は何時間？" });
    assert(r.context.includes("https://www.studyaustralia.gov.au/"), "出典 URL がコンテキストに含まれる");
    assert(r.context.includes("Study Australia（オーストラリア政府の留学情報）"), "出典の種別が渡る");
    assert(
      r.context.includes("「出典は？」「どこの情報？」「いつの情報？」と聞かれたら"),
      "聞かれたら答える指示がある",
    );
    assert(r.context.includes("出典の URL を本文に並べないでください"), "通常は URL を並べさせない");

    // work_rights は今回 Home Affairs 一次情報で照合したので、弱める表現は付かない
    assert(
      !r.context.includes("一次情報（Home Affairs）ではなく政府系の補助的な案内です"),
      "一次情報で照合済みなら補助的な案内という注記は付かない",
    );
    // 一次情報が無い場合（financial_capacity）は言い方を弱める
    const saOnly = simulate({ message: "学生ビザの資金証明はいくら必要？" });
    assert(
      saOnly.context.includes("一次情報（Home Affairs）ではなく政府系の補助的な案内です"),
      "Study Australia のみの場合は一次情報でないことを明示する",
    );

    const citations = buildVisaCitations([seedEntry("australia_student_500", "work_rights")!]);
    assert(citations.length === 3, `表示用 citation を取り出せる（実際: ${citations.length}件）`);
    assert(citations[0].sourceUrl.startsWith("https://"), "citation に URL が含まれる");
    assert(citations[0].reviewedAt === "2026-10-02", "citation に確認日が含まれる");
  }

  console.log("Test 11: complex case → eligibility を保証しない");
  {
    const r = simulate({ message: "学生ビザの申請条件を教えて" });
    const text = r.context;
    assert(
      text.includes("「このビザが取れます」「申請は通ります」と保証しないでください"),
      "個別の可否を保証しない指示がある",
    );
    for (const term of ["却下（refusal）", "取消（cancellation）", "オーバーステイ", "bridging visa"]) {
      assert(text.includes(term), `複雑な個別ケース（${term}）を断定しない対象に含めている`);
    }
    assert(
      text.includes("registered migration agent") && text.includes("移民弁護士"),
      "移民エージェント・弁護士への相談を案内する",
    );
  }

  console.log("Test 12: 税務の質問 → visa DB へ誤 routing しない");
  {
    const taxOnly = simulate({ message: "TFNってどうやって取るの？" });
    assert(!taxOnly.readVisaData, "税務だけの質問ではビザ情報を読まない");

    const superOnly = simulate({ message: "superannuationは帰国時に返ってくる？" });
    assert(!superOnly.readVisaData, "superannuation だけの質問でも読まない");

    // ビザの話に税務が混ざった場合は、ビザ情報は使いつつ税務の境界を示す
    const mixed = simulate({ message: "学生ビザで働いたら税金どうなる？" });
    assert(mixed.readVisaData, "ビザの話が含まれていればビザ情報を読む");
    assert(mixed.context.includes("税金の話が含まれています"), "税務の境界が示される");
    assert(mixed.context.includes("ATO（Australian Taxation Office）"), "ATO への案内がある");
    assert(mixed.context.includes("ビザとは別の制度"), "ビザと税務を区別する");
  }

  console.log("Test 13: ファームの仕事探し → specified work のビザ質問と区別");
  {
    const jobOnly = simulate({ message: "ファームの仕事ってどう探すのがいい？" });
    assert(!jobOnly.readVisaData, "仕事探しだけならビザ情報を読まない");

    const visaSide = simulate({
      message: "セカンドのためのファームってどんな条件？",
      entries: [entry("australia_working_holiday_417", "specified_work"), entry("australia_working_holiday_417", "second_third")],
    });
    assert(visaSide.readVisaData, "ビザ条件の質問ならビザ情報を読む");
    assert(visaSide.categories.includes("specified_work"), "specified_work として扱う");

    const both = simulate({
      message: "セカンド取りたいんですが、ファームの仕事はどう探せばいい？",
      entries: [entry("australia_working_holiday_417", "specified_work"), entry("australia_working_holiday_417", "second_third")],
    });
    assert(both.context.includes("ファームの仕事探しについて"), "仕事探しの話題として区別される");
    assert(both.context.includes("ビザの条件（specified work）と、仕事の探し方は別の話"), "混ぜないよう指示される");
    assert(both.context.includes("Fair Work Ombudsman"), "労働条件の相談先を案内する");
    assert(both.context.includes("現金のみ"), "労働トラブルの注意点に触れられる");
    assert(both.context.includes("過度に不安をあおらないこと"), "恐怖訴求を抑える指示がある");
  }

  console.log("Test 14: 462 → 417 と混同しない");
  {
    assert(
      extractVisaKeysFromText("462ビザってワーホリと違うの？").includes("australia_work_and_holiday_462"),
      "462 を明示したら 462 として認識する",
    );
    const r = simulate({
      message: "462ビザの条件を教えて",
      entries: [entry("australia_work_and_holiday_462", "eligibility")],
    });
    assert(r.visaKeys.includes("australia_work_and_holiday_462"), "462 が対象になる");
    assert(r.context.includes("ワークアンドホリデービザ（サブクラス462）"), "462 の名称で渡る");

    const both = simulate({
      message: "417と462どっちが対象？",
      entries: [entry("australia_working_holiday_417", "eligibility"), entry("australia_work_and_holiday_462", "eligibility")],
    });
    assert(both.visaKeys.length === 2, "両方が対象になる");
    assert(
      both.context.includes("特にサブクラス417と462は別のビザです"),
      "417 と 462 を混同させない指示がある",
    );

    // ワーホリと言われただけでは 462 を混ぜない
    const whvOnly = extractVisaKeysFromText("ワーホリの条件は？");
    assert(
      whvOnly.includes("australia_working_holiday_417") && !whvOnly.includes("australia_work_and_holiday_462"),
      "「ワーホリ」だけでは 462 を対象にしない",
    );
  }

  console.log("Test 15: Home Affairs 未確認値 → null・hallucination なし");
  {
    // 417 は人間が確認したカテゴリだけが入っている（未確認は空のまま）
    const whv417 = SEED.filter((e) => e.visaKey === "australia_working_holiday_417");
    assert(whv417.length === 11, `417 は確認済みの11カテゴリだけ（実際: ${whv417.length}）`);
    assert(
      whv417.map((e) => e.category).sort().join(",") ===
        "application,costs,documents,eligibility,processing,same_employer,second_third,specified_work,stay,study_rights,work_rights",
      "application / costs / documents / eligibility / processing / same_employer / second_third / specified_work / stay / study_rights / work_rights のみ",
    );
    for (const unconfirmed of ["health_insurance", "financial_capacity", "genuine_student", "arrival_preparation"]) {
      assert(!whv417.some((e) => e.category === unconfirmed), `未確認の ${unconfirmed} は入っていない`);
    }

    const doc = JSON.parse(readFileSync("data/visas/australia/working-holiday-417.json", "utf8"));
    assert(
      doc._readme.join(" ").includes("推測で埋めてはいけない"),
      "417 の JSON に推測禁止が明記されている",
    );
    assert(doc._readme.join(" ").includes("same_employer"), "未確認カテゴリが記録されている");

    // 単位の無い数値・通貨の無い金額は使わない
    assert(readWorkHourLimit({ limit: 48 }) === null, "単位の無い就労時間は使わない");
    assert(readWorkHourLimit({ unit: "hours_per_fortnight" }) === null, "数値の無い就労時間は使わない");
    assert(readMoneyFact({ amount: 2500 }) === null, "通貨の無い金額は使わない");
    assert(readMoneyFact({ amount: 2500, currency: "AUD" })?.amount === 2500, "通貨つきの金額は使う");

    // seed に unverified が記録されている項目がある
    const work = seedEntry("australia_student_500", "work_rights")!;
    assert(Array.isArray(work.details.unverified), "未確認項目が details に記録されている");
  }

  console.log("Test 16: visa resolution の優先順位（§19 / §20）");
  {
    const fromMessage = simulate({
      message: "学生ビザの就労時間は？",
      karteStated: { workingHolidayInterest: true },
    });
    assert(fromMessage.visaKeys.join(",") === "australia_student_500", "発言の明示が最優先");

    const fromKarte = simulate({ message: "ビザの条件を教えて", karteStated: { workingHolidayInterest: true } });
    assert(fromKarte.visaKeys.join(",") === "australia_working_holiday_417", "Karte stated を使う");

    const ambiguous = simulate({
      message: "ビザの条件を教えて",
      karteStated: { workingHolidayInterest: true, studyIntent: true },
    });
    assert(ambiguous.visaKeys.length === 0, "両方の可能性があれば勝手に選ばない");
    assert(ambiguous.context.includes("どちらか一方を前提にせず"), "どちらかを確認させる");

    const unknown = simulate({ message: "ビザの条件を教えて" });
    assert(unknown.visaKeys.length === 0, "手がかりが無ければ確定しない");
    assert(unknown.context.includes("どのビザの話かが確定していません"), "確認に回る");
    assert(
      unknown.context.includes("国籍が確認できていない場合は、特定のサブクラスの条件を断定しないでください"),
      "国籍未確認時にサブクラスを断定させない（§20）",
    );
  }

  console.log("Test 17: 読み取りは sanitized view のみ・内部メモ非公開");
  {
    const serverSrc = readFileSync("lib/visaReferenceServer.ts", "utf8");
    assert(serverSrc.includes('from("visa_reference_public")'), "entry は公開 view から読む");
    assert(serverSrc.includes('from("visa_reference_sources_public")'), "出典も公開 view から読む");
    assert(!serverSrc.includes('from("visa_reference_data")'), "base table を直接読まない");
    const entryColumns = serverSrc.match(/const ENTRY_COLUMNS = "([^"]+)"/)?.[1] ?? "";
    assert(entryColumns.length > 0 && !entryColumns.includes("review_note"), "SELECT 列に内部メモを含めない");
    const sourceColumns = serverSrc.match(/const SOURCE_COLUMNS =\s*"([^"]+)"/)?.[1] ?? "";
    assert(sourceColumns.length > 0 && !sourceColumns.includes("notes"), "出典の内部メモも読まない");

    const migration = readFileSync("supabase/migrations/20261001_visa_reference_data.sql", "utf8");
    assert(/revoke all on visa_reference_data from anon, authenticated/.test(migration), "base table の権限を全て落とす");
    assert(/revoke all on visa_reference_sources from anon, authenticated/.test(migration), "出典 table の権限も落とす");
    assert(!/create policy/i.test(migration), "base table に policy を作らない");
    assert(/grant select on visa_reference_public to anon, authenticated/.test(migration), "view にだけ select を許可");
    assert(/security_invoker = false/.test(migration), "view は owner 権限で読む（明示）");
    const viewPart = migration.slice(migration.indexOf("create view visa_reference_public"));
    assert(!/review_note/.test(viewPart.slice(0, viewPart.indexOf("from visa_reference_data"))), "view に review_note を含めない");
    assert(/reviewed_at date not null/.test(migration), "reviewed_at は必須");
  }

  console.log("Test 18: curated workflow の検証（自動取得なし・未確認を公開しない）");
  {
    const importer = readFileSync("scripts/import-visa-reference-data.ts", "utf8");
    assert(!/\bfetch\s*\(/.test(importer), "importer は自動取得をしない");
    assert(!/puppeteer|playwright|cheerio|axios/i.test(importer), "取得ライブラリを使わない");
    assert(importer.includes("DB へ直接書き込まない"), "SQL を出力するだけ");
    assert(importer.includes("有効な出典がありません"), "出典の無い内容を登録しない");
    // 規則そのものは importer の検証関数を直接呼んで確認する（メッセージ文字列に依存しない）。
    // 詳細な回帰テストは scripts/test-visa-importer-validation.ts にある。
    const noUnit = validateVisaDocument("t.json", {
      visaKey: "australia_student_500",
      visaCode: "500",
      visaName: "Student visa (subclass 500)",
      entries: [
        {
          category: "work_rights",
          summary: "単位の無い数値のテスト",
          details: { limit: 48 },
          reviewedAt: "2026-10-01",
          sources: [
            {
              sourceName: "Home Affairs",
              sourceUrl: "https://immi.homeaffairs.gov.au/x",
              sourceType: "home_affairs",
              accessedAt: "2026-10-01",
            },
          ],
        },
      ],
    });
    assert(noUnit.entries.length === 0, "単位の無い数値を弾く");

    const noCurrency = validateVisaDocument("t.json", {
      visaKey: "australia_student_500",
      visaCode: "500",
      visaName: "Student visa (subclass 500)",
      entries: [
        {
          category: "costs",
          summary: "通貨の無い金額のテスト",
          details: { amount: 2500, basis: "from" },
          reviewedAt: "2026-10-01",
          sources: [
            {
              sourceName: "Home Affairs",
              sourceUrl: "https://immi.homeaffairs.gov.au/x",
              sourceType: "home_affairs",
              accessedAt: "2026-10-01",
            },
          ],
        },
      ],
    });
    assert(noCurrency.entries.length === 0, "通貨の無い金額を弾く");
    assert(importer.includes("0 で埋めないでください"), "unknown を 0 で埋めるのを弾く");
    assert(importer.includes("PLACEHOLDER"), "テンプレートの未記入文を弾く");
    assert(!/delete from visa_reference_data/i.test(importer), "対象外 entry を DELETE しない");
    assert(importer.includes("on conflict (visa_key, category) do update"), "upsert 方式");

    const template = JSON.parse(readFileSync("data/visas/australia/_template.json", "utf8"));
    assert(Array.isArray(template.entries), "テンプレートに entries がある");
    assert(template._readme.join(" ").includes("自動取得"), "テンプレートに自動取得禁止が書かれている");

    // 生成 SQL（あれば）に危険な文が無いこと
    if (existsSync("supabase/seed/visa_reference_data.generated.sql")) {
      const sql = readFileSync("supabase/seed/visa_reference_data.generated.sql", "utf8");
      assert(!/truncate|drop /i.test(sql), "生成 SQL に TRUNCATE / DROP が無い");
      assert(!/delete from visa_reference_data/i.test(sql), "生成 SQL が entry を削除しない");
    }
  }

  console.log("Test 19: view 行の読み取りと検証");
  {
    const row = {
      id: "x",
      visa_key: "australia_student_500",
      visa_code: "500",
      visa_name: "Student visa (subclass 500)",
      country_code: "AU",
      category: "work_rights",
      summary: "テスト",
      details: { limit: 48, unit: "hours_per_fortnight" },
      reviewed_at: "2026-10-01",
    };
    assert(parseVisaReferenceEntry(row)?.visaKey === "australia_student_500", "行を読める");
    assert(parseVisaReferenceEntry({ ...row, visa_key: "canada_whv" }) === null, "対象外のビザは捨てる");
    assert(parseVisaReferenceEntry({ ...row, category: "tax" }) === null, "未知の category は捨てる");
    assert(parseVisaReferenceEntry({ ...row, reviewed_at: null }) === null, "確認日が無い行は捨てる");
    assert(parseVisaReferenceEntry(null) === null, "null は null");

    // 出典が1件も無い entry は使わない / 不正な URL を弾く
    const builder = {
      select: () => builder,
      in: () => builder,
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) => resolve({ data: [], error: null }),
    };
    let table = "";
    const client = {
      from(t: string) {
        table = t;
        if (t === "visa_reference_public") {
          return {
            select: () => ({ in: () => ({ in: () => ({ then: (r: (v: { data: unknown[]; error: null }) => unknown) => r({ data: [row], error: null }) }) }) }),
          };
        }
        return {
          select: () => ({ in: () => ({ then: (r: (v: { data: unknown[]; error: null }) => unknown) => r({ data: [], error: null }) }) }),
        };
      },
    } as unknown as SupabaseClient;
    const loaded = await loadVisaReferenceEntries(client, ["australia_student_500"], ["work_rights"]);
    assert(loaded.length === 0, "出典が1件も無い entry は使わない");
    assert(table === "visa_reference_sources_public", "出典も公開 view から読んでいる");
    void builder;
  }

  console.log("Test 20: 実 seed の不変条件");
  {
    const student500 = SEED.filter((e) => e.visaKey === "australia_student_500");
    const whv = SEED.filter((e) => e.visaKey === "australia_working_holiday_417");
    assert(student500.length === 11, `Student 500 の確認済み entry が11件（実際: ${student500.length}）`);
    // 未確認の category は登録されていないままであること
    for (const absent of ["same_employer", "second_third", "specified_work", "arrival_preparation"]) {
      assert(
        !student500.some((e) => e.category === absent),
        `Student 500: 未確認の ${absent} は登録しない`,
      );
    }
    assert(whv.length === 11, `417 の確認済み entry が11件（実際: ${whv.length}）`);
    for (const absent of ["health_insurance", "financial_capacity", "genuine_student", "arrival_preparation"]) {
      assert(!whv.some((e) => e.category === absent), `417: 未確認の ${absent} は登録しない`);
    }
    for (const e of SEED) {
      assert(isVisaKey(e.visaKey), `${e.category}: visaKey が対象`);
      assert(isVisaCategory(e.category), `${e.category}: category が既存のもの`);
      assert(/^\d{4}-\d{2}-\d{2}$/.test(e.reviewedAt), `${e.category}: reviewedAt がある`);
      assert(e.sources.length > 0, `${e.category}: 出典が1件以上ある`);
      for (const s of e.sources) {
        assert(/^https:\/\//.test(s.sourceUrl), `${e.category}: 出典が https`);
        assert(isVisaSourceType(s.sourceType), `${e.category}: source_type が既存のもの`);
        assert(s.accessedAt !== null, `${e.category}: 人間が確認した日が記録されている`);
      }
      assert(!needsVisaReviewCaution(e, NOW), `${e.category}: 確認日が新しい`);
    }
    assert(VISA_CATEGORIES.length === 15, "category は15種類");
  }

  console.log("Test 17: 417 の stay / costs / processing / application が正しい質問へ届く");
  {
    // どの質問がどの category へ回るか（Phase 5 の routing 監査を回帰として固定する）
    const cases: { message: string; categories: string; entries: string[] }[] = [
      { message: "ワーホリは何年いられる？", categories: "stay", entries: ["stay"] },
      { message: "ワーホリはどのくらい滞在できますか？", categories: "stay", entries: ["stay"] },
      { message: "ワーホリのビザはいくら？", categories: "costs", entries: ["costs"] },
      { message: "ワーホリの申請料はいくら？", categories: "costs", entries: ["costs"] },
      { message: "417のビザ代はいくら？", categories: "costs", entries: ["costs"] },
      { message: "ワーホリビザの費用は？", categories: "costs", entries: ["costs"] },
      { message: "ワーホリの審査期間は？", categories: "processing", entries: ["processing"] },
      { message: "ワーホリはどこから申請する？", categories: "application", entries: ["application"] },
      { message: "最初のワーホリはどこから申請しますか？", categories: "application", entries: ["application"] },
    ];
    for (const c of cases) {
      const r = simulate({ message: c.message });
      assert(
        r.categories.join(",") === c.categories,
        `「${c.message}」→ ${c.categories}（実際: ${r.categories.join(",")}）`,
      );
      assert(r.visaKeys.join(",") === "australia_working_holiday_417", `「${c.message}」→ 417 のデータを読む`);
      for (const category of c.entries) {
        const label = VISA_CATEGORY_LABELS[category as VisaCategory];
        assert(r.context.includes(label), `「${c.message}」→ ${category} の情報が渡る`);
      }
    }

    // 資金要件（AUD 5,000）と申請料（AUD 840 / 1,000）を混同しない
    const funds = simulate({ message: "ワーホリの資金はいくら必要？" });
    assert(funds.context.includes("5,000"), "資金の質問には AUD 5,000 が渡る");
    assert(!funds.context.includes("840"), "資金の質問に申請料（840）が混ざらない");
    const fee = simulate({ message: "ワーホリのビザはいくら？" });
    assert(fee.context.includes("840") && fee.context.includes("1,000"), "申請料の質問には 840 と 1,000 が渡る");
    assert(!fee.context.includes("5,000"), "申請料の質問に資金要件（5,000）が混ざらない");

    // 学生ビザの金額・資金と 417 を取り違えない
    const student500Fee = simulate({ message: "学生ビザはいくら？" });
    assert(student500Fee.visaKeys.join(",") === "australia_student_500", "「学生ビザはいくら？」→ 500 のデータ");
    assert(student500Fee.context.includes("2,500"), "500 の申請料（From AUD 2,500）が渡る");
    assert(!student500Fee.context.includes("840"), "417 の申請料が混ざらない");
    const student500Funds = simulate({ message: "学生ビザの資金はいくら？" });
    assert(
      student500Funds.categories.includes("financial_capacity"),
      "「学生ビザの資金はいくら？」→ financial_capacity へ回る",
    );
    assert(!student500Funds.context.includes("840"), "500 の資金の質問に 417 の申請料が混ざらない");
  }

  console.log("Test 18: 新しい4カテゴリが未確認事項を強めていない");
  {
    const whv = SEED.filter((e) => e.visaKey === "australia_working_holiday_417");
    const byCategory = (category: string) => whv.find((e) => e.category === category)!;

    // costs: 回ごとの額が取り違えられていない／from・minimum へ強めていない
    const costs = byCategory("costs").details as Record<string, unknown>;
    const stageAmount = (stage: string) =>
      ((costs[stage] as Record<string, unknown>) ?? {}) as Record<string, unknown>;
    assert(stageAmount("first").amount === 840, "costs: 1回目は AUD 840");
    assert(stageAmount("second").amount === 1000, "costs: 2回目は AUD 1,000");
    assert(stageAmount("third").amount === 1000, "costs: 3回目は AUD 1,000");
    for (const stage of ["first", "second", "third"]) {
      assert(stageAmount(stage).currency === "AUD", `costs: ${stage} の通貨が AUD`);
      assert(
        stageAmount(stage).basis === "exact_as_displayed",
        `costs: ${stage} の basis が exact_as_displayed（from / minimum / exact へ強めない）`,
      );
    }
    assert(costs.effectiveFrom === null, "costs: 適用開始日は未確認のまま null");
    assert(
      typeof costs.effectiveFromNote === "string" && (costs.effectiveFromNote as string).includes("2024-12-09"),
      "costs: ページの Last updated を適用開始日として使わない旨が記録されている",
    );
    for (const forbidden of ["surcharge", "paymentFee", "additionalApplicantCharge", "costConcessions"]) {
      assert(costs[forbidden] === undefined, `costs: 未確認の ${forbidden} を持たない`);
    }
    const costsContext = simulate({ message: "ワーホリのビザはいくら？" }).context;
    // from / minimum / exact の表示（formatMoneyBasis が付ける括弧書き）になっていないこと。
    // 「「〜から」「最低額」とは書かれていない」という**注記のほう**は入っていてよい。
    for (const strongerBasis of ["（この額“から”。状況により上がる）", "（最低額）", "（確定額）"]) {
      assert(!costsContext.includes(strongerBasis), `costs: ${strongerBasis} として渡さない`);
    }
    assert(
      costsContext.includes("確定額・固定額として断定しないこと"),
      "costs: 画面表示までの確認であることが渡る",
    );

    // stay: up to / exact のどちらとも決めていない
    const stay = byCategory("stay").details as Record<string, unknown>;
    for (const stage of ["first", "second", "third"]) {
      const s = stay[stage] as Record<string, unknown>;
      assert(s.duration === 12 && s.durationUnit === "months", `stay: ${stage} は 12 months`);
    }
    assert(stay.durationBasis === undefined, "stay: durationBasis は設定しない（up to / exact が未確認）");
    assert(stay.startRule === undefined, "stay: 起算点（startRule）を作らない");
    assert(stay.travelRights === undefined, "stay: travel / re-entry を作らない");
    const stayContext = simulate({ message: "ワーホリは何年いられる？" }).context;
    assert(!stayContext.includes("**上限**"), "stay: 上限として渡さない");

    // processing: 固定日数・保証を持たない
    const processing = byCategory("processing").details as Record<string, unknown>;
    assert(processing.type === "dynamic_official_guide", "processing: 動的な案内として持つ");
    assert(processing.fixedDuration === null, "processing: 固定日数を持たない");
    assert(processing.guaranteed === false, "processing: 保証しない");
    const guidance = processing.currentAverageGuidance as Record<string, unknown>;
    assert(guidance.value === 3 && guidance.unit === "months", "processing: 現在の目安は約3か月");
    assert(guidance.wording === "expected to be around", "processing: 公式の弱い言い方を保持する");
    assert(typeof guidance.checkedAt === "string", "processing: 目安の確認日を持つ");
    assert(processing.percentile === undefined, "processing: percentile を作らない");
    assert(processing.outsideAustraliaPrioritySystem === undefined, "processing: 優先順位の仕組みを作らない");
    const processingContext = simulate({ message: "ワーホリの審査期間は？" }).context;
    assert(processingContext.includes("保証ではない"), "processing: 保証ではないことが渡る");
    assert(!/3\s*か月以内|3\s*ヶ月以内/.test(processingContext), "processing: 「3か月以内」として渡さない");

    // application: First と Second / Third を混ぜない
    const application = byCategory("application").details as Record<string, unknown>;
    const first = application.first as Record<string, unknown>;
    assert(first.online === true, "application: 1回目はオンライン申請");
    assert(first.locationRequirement === "outside_australia", "application: 1回目は国外から");
    const secondThird = application.secondThird as Record<string, unknown>;
    assert(secondThird.locationRequirement === undefined, "application: 2回目・3回目の申請場所は持たない");
    assert(secondThird.online === undefined, "application: 2回目・3回目のオンライン要件は持たない");
    const condition = secondThird.inAustraliaStatusCondition as Record<string, unknown>;
    assert(
      Array.isArray(condition.options) && (condition.options as unknown[]).length === 2,
      "application: 国内在留条件は2つの状態を両方持つ",
    );
    assert(typeof condition.scopeNote === "string", "application: 条件の範囲の注記を持つ");
    const applicationContext = simulate({ message: "セカンドワーホリはオーストラリア国内から申請できますか？" }).context;
    assert(
      applicationContext.includes("オーストラリア国内にいる場合に満たす必要がある状態"),
      "application: 「国内にいる場合の状態」であることが渡る",
    );
    assert(
      applicationContext.includes("申請場所の"),
      "application: 申請場所のルールへ一般化しない注記が渡る",
    );

    // 既存 entry の正本を複製していない（specified work の期間・同一雇用主・年齢）
    for (const category of ["costs", "stay", "processing", "application", "work_rights"]) {
      const serialized = JSON.stringify(byCategory(category).details);
      for (const duplicated of ["88", "179", "8547", "18〜30"]) {
        assert(
          !serialized.includes(duplicated),
          `${category}: 既存 entry が正本の値（${duplicated}）を複製していない`,
        );
      }
    }
  }

  console.log("Test 19: 417 work_rights は概要画面の文言だけで、時間・雇用形態・期間へ広げない");
  {
    const workRights = SEED.find(
      (e) => e.visaKey === "australia_working_holiday_417" && e.category === "work_rights",
    );
    assert(workRights !== undefined, "417 の work_rights entry がある");
    const details = (workRights?.details ?? {}) as Record<string, unknown>;

    // 確認済みの事実（概要画面の3つの公式文言）
    assert(details.generalWorkRight === true, "就労が認められることが登録されている");
    const wording = (stage: string) =>
      ((details[stage] as Record<string, unknown>) ?? {}).officialWording;
    assert(wording("first") === "You can work while you are here", "1回目の公式文言が原文のまま");
    assert(
      wording("second") === "You can do any kind of work while you are here",
      "2回目の公式文言が原文のまま",
    );
    assert(
      wording("third") === "You can do any kind of work while you are here",
      "3回目の公式文言が原文のまま",
    );

    // 時間の上限を表す field を持たない（readWorkHourLimit が反応する構造を作らない）
    for (const forbidden of [
      "limit",
      "unit",
      "hoursPerWeek",
      "hoursPerFortnight",
      "weeklyLimit",
      "fortnightLimit",
      "maxHours",
    ]) {
      assert(details[forbidden] === undefined, `work_rights: 時間の上限 field（${forbidden}）を持たない`);
    }
    assert(
      readWorkHourLimit(details) === null,
      "work_rights: 上限として読み取れる構造になっていない（未確認のため）",
    );

    // 文言の差の意味を推測する field を持たない
    assert(typeof details.wordingDifferenceNote === "string", "文言の差が未確認であることを保持している");
    for (const guessed of ["occupationRestriction", "occupationFree", "sameMeaning", "firstIsRestricted"]) {
      assert(details[guessed] === undefined, `work_rights: 差を説明する推測 field（${guessed}）を持たない`);
    }
    assert(details.sameEmployerHandledSeparately === true, "同一雇用主の制限は別 category だと明示している");

    // same_employer / specified_work / second_third の正本値を複製していない
    const serialized = JSON.stringify(details);
    for (const owned of ["8547", "88", "179", "Northern Australia", "critical sector", "postcode"]) {
      assert(!serialized.includes(owned), `work_rights: 他 category が正本の内容（${owned}）を複製していない`);
    }

    // context: 公式文言が渡り、時間の上限は「特定できない」として渡る
    const ctx = simulate({ message: "ワーホリで働くことができますか？" });
    assert(ctx.categories.join(",") === "work_rights", `work_rights へ routing される（${ctx.categories.join(",")}）`);
    assert(ctx.context.includes("You can work while you are here"), "1回目の公式文言が渡る");
    assert(
      ctx.context.includes("You can do any kind of work while you are here"),
      "2回目・3回目の公式文言が渡る",
    );
    assert(
      ctx.context.includes("週あたり・2週間あたりの上限は今回確認できている情報では特定できません"),
      "時間の上限が未確認であることが渡る",
    );
    assert(
      ctx.context.includes("「上限はない」「制限なく働ける」とも言わない"),
      "「制限なし」と言わせない指示が渡る",
    );
    // Student 500 の上限が混ざらない
    assert(!ctx.context.includes("48"), "417 の就労の質問に Student 500 の 48 hours が混ざらない");

    // 「どんな仕事でもできますか？」も work_rights だけへ届く（基本セットへ落ちない）
    const kind = simulate({ message: "ワーホリはどんな仕事でもできますか？" });
    assert(kind.categories.join(",") === "work_rights", `仕事の種類の質問も work_rights（${kind.categories.join(",")}）`);
    assert(
      kind.context.includes("その差が何を意味するかまでは今回確認できていません"),
      "文言の差が未確認であることが渡る",
    );

    // 同一雇用主の質問では same_employer が正本として渡り、6か月が落ちない
    const employer = simulate({ message: "ワーホリで同じ会社で何ヶ月働けますか？" });
    assert(employer.categories.includes("same_employer"), "同一雇用主の質問は same_employer へも回る");
    assert(employer.context.includes("6 months"), "same_employer の6か月が渡る");
    assert(employer.context.includes("8547"), "condition 8547 は same_employer 側から渡る");

    // 28日（申請時の在留状態の条件）を就労権へ転用しない
    const expiry = simulate({ message: "ワーホリのビザが切れたあと28日間は働けますか？" });
    assert(
      expiry.categories.join(",") === "work_rights",
      `満了後の就労の質問は work_rights へ回る（${expiry.categories.join(",")}）`,
    );
    assert(
      !expiry.context.includes("28"),
      "就労の質問に application の28日ルールが渡らない（申請条件を就労権へ転用させない）",
    );
    assert(
      expiry.context.includes("ビザが始まる前・満了したあとの就労の扱い"),
      "満了後の就労が未確認であることが渡る",
    );
  }

  console.log("Test 21: 417 の就学の質問は condition 8548 の formal data へ届く");
  {
    // study_rights へ届かないと基本セット（eligibility / work_rights / stay）へ落ち、
    // 就学の質問に**就労の条件**が渡ってしまう（前フェーズの監査で実測した漏れ）。
    for (const message of [
      "ワーホリで学校に通えますか？",
      "ワーホリで学校に通いたい",
      "ワーホリで勉強できますか？",
      "ワーホリで勉強できる？",
      "ワーホリで何ヶ月勉強できますか？",
      "ワーホリで勉強したい",
      "ワーホリの就学期間は？",
      "417でstudyできますか？",
      "ワーホリで語学学校に通えますか？",
      "ワーホリでtrainingできますか？",
    ]) {
      const r = simulate({ message });
      assert(
        r.categories.join(",") === "study_rights",
        `「${message}」→ study_rights だけへ routing される（実際: ${r.categories.join(",")}）`,
      );
      assert(r.visaKeys.join(",") === "australia_working_holiday_417", `「${message}」→ 417 のデータを読む`);
      assert(r.usedData === true, `「${message}」→ formal entry（condition 8548）が取れる`);
      assert(r.context.includes("8548"), `「${message}」→ condition 8548 が渡る`);
      assert(r.context.includes("4 months"), `「${message}」→ 上限 4 months が渡る`);
      assert(
        r.context.includes("就学と訓練を**合わせた合計**で 4 months"),
        `「${message}」→ 就学と訓練の**合計**であることが渡る`,
      );
      assert(r.context.includes("17 weeks"), `「${message}」→ 17 weeks 3 days の換算が渡る`);
      // 就労の条件を就学の答えの根拠にさせない
      assert(
        !r.context.includes("You can do any kind of work while you are here"),
        `「${message}」→ work_rights の公式文言が渡らない`,
      );
      // Student 500 の就学条件が混ざらない（§13 の相互分離）。
      // 一般の prompt 規則には「他のビザの条件（CoE・CRICOS）を当てはめない」という**禁止**が入るため、
      // データ部分（## データ 以降）だけを見る。
      const data = r.context.slice(r.context.indexOf("## データ"));
      for (const contaminated of [
        "CRICOS",
        "CoE",
        "packaged courses",
        "Genuine Student",
        "OSHC",
        "48 hours",
        "fortnight",
        "full-time enrolment",
      ]) {
        assert(!data.includes(contaminated), `「${message}」→ Student 500 の ${contaminated} が渡らない`);
      }
    }

    // 専用の指示（合計であることを崩させない）が渡る
    const study = simulate({ message: "ワーホリで何ヶ月勉強できますか？" });
    assert(
      study.context.includes("就学（study）と訓練（training）を合わせた合計"),
      "「合計」であることの指示が渡る",
    );
    assert(
      study.context.includes("1つのコースごとに4か月"),
      "コース単位の上限として説明させない指示が渡る",
    );
    assert(study.context.includes("週末（weekends）"), "4か月に含まれるものが渡る");
    assert(study.context.includes("オリエンテーション期間（orientation periods）"), "含まれないものが渡る");
    assert(study.context.includes("work-based training"), "カウントしない活動が渡る");
    assert(
      study.context.includes("correspondence courses that you could take outside Australia"),
      "カウントしない通信講座の範囲が渡る",
    );
    assert(
      study.context.includes("1回目（ファースト）・2回目（セカンド）・3回目（サード）のいずれにも同じように付される"),
      "First / Second / Third すべてに付されることが渡る",
    );
    // カウントしない活動の**条件**を落とさせない指示（実機のドリフト対策）
    assert(
      study.context.includes("「オーストラリアの外でも受けられるもの」という条件つきで伝え"),
      "通信講座の条件を落とさせない指示が渡る",
    );
    assert(
      study.context.includes("work-based training は公式の用語のまま伝えてください"),
      "work-based training を言い換えさせない指示が渡る",
    );
    // 一般描画の「期間: 4 months」だけで終わらない（合計であることが落ちない）
    assert(
      !study.context.includes("- 期間: 4 months"),
      "合計であることが落ちる一般描画の期間行を出していない",
    );

    // 417 の study_rights が登録され、確認した範囲を超える field を持たない
    const whvStudy = SEED.find(
      (e) => e.visaKey === "australia_working_holiday_417" && e.category === "study_rights",
    );
    assert(whvStudy !== undefined, "417 の study_rights が登録されている");
    if (whvStudy) {
      const d = whvStudy.details as Record<string, unknown>;
      assert(d.conditionNumber === 8548, "condition 8548 を保持している");
      assert(d.conditionTitle === "Maximum 4 months study", "条件の名称を保持している");
      assert(d.studyAllowed === true && d.trainingAllowed === true, "就学・訓練ともに可能として保持");
      assert(d.duration === 4 && d.durationUnit === "months", "4 months を単位つきで保持");
      assert(d.studyTrainingCombinedLimit === true, "合計の上限であることを保持");
      assert(typeof d.durationScope === "string" && d.durationScope.includes("合計"), "scope が合計である");
      const eq = d.equivalentDuration as Record<string, unknown>;
      assert(eq.weeks === 17 && eq.days === 3, "17 weeks and 3 days を保持");
      assert(d.sameAcrossStages === true, "First / Second / Third で同じ条件として保持");
      // 回ごとの条件を勝手に作っていない
      for (const stage of ["first", "second", "third"]) {
        assert(d[stage] === undefined, `回ごとの就学条件（${stage}）を作っていない`);
      }
      // Student 500 の条件を 417 へ持ち込んでいない
      const serialized = JSON.stringify(d);
      for (const owned of ["CRICOS", "CoE", "Genuine Student", "OSHC", "packaged", "fortnight", "48 hours"]) {
        assert(!serialized.includes(owned), `417 の study_rights に Student 500 の ${owned} が入っていない`);
      }
      // 時間の上限（就労）と混同する field を持たない
      for (const forbidden of ["limit", "unit", "hoursPerWeek", "hoursPerFortnight"]) {
        assert(d[forbidden] === undefined, `就労時間の field（${forbidden}）を持たない`);
      }
      // 未確認のものは unverified に残っている
      const unverified = JSON.stringify(d.unverified ?? []);
      for (const open of ["ELICOS", "vocational", "フルタイム", "合算", "4か月を超えた"]) {
        assert(unverified.includes(open), `未確認の項目（${open}）が残っている`);
      }
    }

    // 数え方の質問（condition 8548 の「含む／含まない」）。
    // ビザ名を言わない追い質問でも study_rights へ回り、どのビザか決まらなければ確認経路へ行く
    // （数え方を勝手に答えない）。
    for (const message of [
      "4か月には土日も含まれますか？",
      "オリエンテーションは4か月に含まれますか？",
      "work-based trainingは4か月に含まれますか？",
      "17週3日とはどういう意味ですか？",
    ]) {
      const intent = detectVisaIntent(message);
      assert(
        intent !== null && intent.categories.join(",") === "study_rights",
        `「${message}」→ study_rights へ回る（実際: ${JSON.stringify(intent?.categories)}）`,
      );
      // ビザが分かっている場合は 8548 のデータへ届く
      const r = simulate({ message, karteStated: { workingHolidayInterest: true } });
      assert(r.usedData === true, `「${message}」→ ワーホリ前提なら formal entry が取れる`);
      assert(r.context.includes("8548"), `「${message}」→ condition 8548 が渡る`);
      // ビザが決まらない場合は、数え方を答えずどのビザかを確認する
      const unknown = simulate({ message });
      assert(
        unknown.usedData === false && unknown.context.includes("どのビザの話か"),
        `「${message}」→ ビザ未確定なら確認経路（勝手に数え方を答えない）`,
      );
    }
    // 含む／含まないの両方が同じ context で渡る（片方だけ渡して終わらせない）
    const counting = simulate({
      message: "ワーホリの4か月には土日も含まれますか？",
    });
    assert(counting.context.includes("祝日（public holidays）"), "含まれるものが渡る");
    assert(counting.context.includes("休暇期間（holiday periods）"), "含まれないものが渡る");

    // 学校の費用・学校選びは就学の権利条件ではない（ビザ層を起動しない／costs へ行かない）
    for (const message of [
      "語学学校の料金は？",
      "語学学校の学費はいくら？",
      "学校の選び方を教えて",
      "おすすめの学校は？",
      "英語をstudyしています",
      "英語が勉強できるアプリを教えて",
      "どの学校に通うか迷っています",
    ]) {
      assert(
        detectVisaIntent(message) === null,
        `「${message}」→ ビザ層を起動しない（実際: ${JSON.stringify(detectVisaIntent(message)?.categories)}）`,
      );
    }
    // ビザの語があっても、学費は study_rights の条件として扱わない
    const tuition = simulate({ message: "ワーホリ中の語学学校の学費はいくら？" });
    assert(!tuition.categories.includes("study_rights"), "学費の質問を study_rights へ回さない");
    assert(!tuition.categories.includes("costs"), "学校の学費をビザ申請料（costs）へ誤 routing しない");
    assert(!tuition.context.includes("8548"), "学費の質問に condition 8548 が渡らない");

    // Student 500 の就学条件は従来どおり 500 の formal data へ届く（§13 の回帰）
    const student = simulate({ message: "学生ビザで学校に通えますか？" });
    assert(
      student.categories.join(",") === "study_rights",
      `「学生ビザで学校に通えますか？」→ study_rights（実際: ${student.categories.join(",")}）`,
    );
    assert(student.visaKeys.join(",") === "australia_student_500", "500 のデータを読む");
    assert(student.usedData === true, "500 の study_rights entry が取れる");
    assert(student.context.includes("CRICOS"), "500 の CRICOS 条件が渡る");
    assert(student.context.includes("packaged courses"), "500 の packaged courses が渡る");
    // 417 の4か月が学生ビザの答えへ混ざらない
    assert(!student.context.includes("8548"), "500 の就学の質問に 417 の condition 8548 が渡らない");
    assert(!student.context.includes("4 months"), "500 の就学の質問に 417 の 4 months が渡らない");

    // 417 の就労・滞在の質問に就学の4か月が混ざらない（§19 の回帰）
    const work = simulate({ message: "ワーホリで働くことができますか？" });
    assert(work.categories.join(",") === "work_rights", `就労の質問は work_rights（${work.categories.join(",")}）`);
    assert(!work.context.includes("8548"), "就労の質問に condition 8548 が渡らない");
    assert(!work.context.includes("4 months"), "就労の質問に就学の 4 months が渡らない");
    const stay = simulate({ message: "ワーホリはどのくらい滞在できますか？" });
    assert(stay.categories.includes("stay"), "滞在の質問は stay へ回る");
    assert(stay.context.includes("12"), "滞在の 12 months が渡る");
    assert(!stay.context.includes("8548"), "滞在の質問に condition 8548 が渡らない");
  }

  console.log("");
  console.log(`passed: ${pass} / failed: ${fail}`);
  if (fail > 0) process.exit(1);
}

void main();
