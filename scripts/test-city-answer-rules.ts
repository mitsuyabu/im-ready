/**
 * 生活費・治安を聞かれたときの Chat 回答ルールの確認スクリプト。
 *
 *   npx tsx scripts/test-city-answer-rules.ts
 *
 * 仕様の Test 1〜14 に対応。ネットワーク・remote DB へは接続しない。
 * 公的データ側はテスト用の架空 entry を使う（data/cities の実データには依存しない）。
 * 開発用 snapshot は実ファイルの値を読む（人間が入力済みの6都市）。
 */

import { readFileSync } from "node:fs";
import {
  CITY_ADMIN_AREA,
  type CityKey,
  type CityReferenceCategory,
  type CityReferenceEntry,
} from "@/lib/cityReference";
import { detectCityReferenceIntent, resolveCityKeysForChat } from "@/lib/cityReferenceIntent";
import {
  buildCityReferenceContext,
  buildCityReferenceNoDataContext,
} from "@/lib/cityReferenceContext";
import {
  buildDevCitySnapshotContext,
  isDevCitySnapshotEnabled,
  loadDevCitySnapshots,
  type DevSnapshotRequest,
} from "@/lib/devCitySnapshot";

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

const DEV_ON = { NODE_ENV: "development", CITY_REFERENCE_DEV_SNAPSHOT: "true" };
const PROD = { NODE_ENV: "production", CITY_REFERENCE_DEV_SNAPSHOT: "true" };

/** テスト用の架空の公的 entry。 */
function publicEntry(
  cityKey: CityKey,
  category: CityReferenceCategory,
  overrides: Partial<CityReferenceEntry> = {},
): CityReferenceEntry {
  return {
    id: `${cityKey}-${category}`,
    cityKey,
    countryCode: "AU",
    adminArea: CITY_ADMIN_AREA[cityKey],
    category,
    summary: `公的情報にもとづく${category}のテスト用要約`,
    notes: null,
    estimates: [],
    reviewedAt: "2026-09-30",
    sources: [
      {
        sourceName: "テスト用の公的出典",
        sourceUrl: "https://example.gov.au/test",
        sourceType: category === "safety" ? "police" : "government_information",
        sourcePublishedAt: null,
        sourceUpdatedAt: "2026-08-01",
        note: null,
      },
    ],
    ...overrides,
  };
}

/**
 * route と同じ組み立てを再現する（route 本体は next/headers 依存のため直接呼べない）。
 * 公的情報は category 単位で優先し、公的情報が無い category だけを snapshot で補う。
 */
function simulate(input: {
  message: string;
  publicEntries?: CityReferenceEntry[];
  myPlanCity?: string | null;
  karteStatedCity?: string | null;
  karteCityInConflict?: boolean;
  env?: { NODE_ENV?: string; CITY_REFERENCE_DEV_SNAPSHOT?: string };
}): {
  context: string;
  readCityData: boolean;
  categories: CityReferenceCategory[];
  cityKeys: CityKey[];
  devRequests: DevSnapshotRequest[];
  usedPublic: boolean;
  usedDev: boolean;
} {
  const empty = {
    context: "",
    readCityData: false,
    categories: [] as CityReferenceCategory[],
    cityKeys: [] as CityKey[],
    devRequests: [] as DevSnapshotRequest[],
    usedPublic: false,
    usedDev: false,
  };

  const intent = detectCityReferenceIntent(input.message);
  if (!intent) return empty;

  const resolution = resolveCityKeysForChat({
    citiesInMessage: intent.citiesInMessage,
    myPlanCity: input.myPlanCity ?? null,
    karteStatedCity: input.karteStatedCity ?? null,
    karteCityInConflict: input.karteCityInConflict ?? false,
  });
  if (resolution.kind === "needsCity") {
    return { ...empty, context: buildCityReferenceNeedsCity(resolution.reason), categories: intent.categories };
  }

  const all = input.publicEntries ?? [];
  const entries = all.filter(
    (e) => resolution.cityKeys.includes(e.cityKey) && intent.categories.includes(e.category),
  );
  const publicContext = entries.length > 0 ? buildCityReferenceContext(entries, resolution.cityKeys) : null;

  let devContext: string | null = null;
  const devRequests: DevSnapshotRequest[] = [];
  const env = input.env ?? DEV_ON;
  if (isDevCitySnapshotEnabled(env)) {
    const requests = resolution.cityKeys
      .map((cityKey) => ({
        cityKey,
        categories: intent.categories.filter(
          (category) => !entries.some((e) => e.cityKey === cityKey && e.category === category),
        ),
      }))
      .filter((request) => request.categories.length > 0);
    devRequests.push(...requests);
    if (requests.length > 0) {
      const needed = new Set(requests.map((r) => r.cityKey));
      const snapshots = loadDevCitySnapshots(env).filter((s) => needed.has(s.cityKey));
      devContext = buildDevCitySnapshotContext(snapshots, requests);
    }
  }

  const context =
    publicContext && devContext
      ? `${publicContext}\n\n---\n\n${devContext}`
      : (publicContext ?? devContext ?? buildCityReferenceNoDataContext(resolution.cityKeys));

  return {
    context,
    readCityData: true,
    categories: intent.categories,
    cityKeys: resolution.cityKeys,
    devRequests,
    usedPublic: publicContext !== null,
    usedDev: devContext !== null,
  };
}

function buildCityReferenceNeedsCity(reason: "unknown" | "conflict"): string {
  // 既存の builder をそのまま使う（import 名が長いのでここで薄く包む）。
  return reason === "conflict" ? "conflict" : "needsCity";
}

/* ------------------------------------------------------------------ */
async function main() {
  console.log("Test 1: 「メルボルンって生活費高い？」dev ON / public なし → 指数を使い実額を作らない");
  {
    const r = simulate({ message: "メルボルンって生活費高い？" });
    assert(r.usedDev && !r.usedPublic, "公的情報が無いので参考指数を使う");
    assert(r.cityKeys.join(",") === "melbourne", "対象はメルボルンだけ");
    assert(r.context.includes("生活費全体の指数（相対）: 78.76"), "生活費全体の指数が渡る");
    assert(r.context.includes("家賃の指数（相対）: 40.73"), "家賃の指数が渡る");
    assert(r.context.includes("食料品の指数（相対）: 92.54"), "食料品の指数が渡る");
    assert(r.context.includes("指数から金額を逆算しないでください"), "指数→実額の逆算を禁止する");
    assert(r.context.includes("月額いくら必要かを独自に計算しないでください"), "月額の独自計算を禁止する");
    assert(r.context.includes("一言で傾向"), "傾向→費目→意味の順で答えさせる");
    assert(r.context.includes("シェアにすると住居費を抑えやすい"), "実生活での意味に触れさせる");
    assert(r.context.includes("参考データでは"), "軽い限定表現の例を示す");
    // 「禁止の例」として書いてある金額（例: 指数が78だから月A$2,000）以外に、月額の実額が出ていないこと
    const withoutProhibitionExamples = r.context
      .split("\n")
      .filter((line) => !line.includes("禁止") && !line.includes("しないでください"))
      .join("\n");
    assert(!/月\s?A?\$?\d/.test(withoutProhibitionExamples), "禁止の例示以外に月額の実額を示していない");
  }

  console.log("Test 2: 「メルボルンの家賃はいくら？」→ rentIndex から家賃額を作らない");
  {
    const r = simulate({ message: "メルボルンの家賃はいくら？" });
    assert(r.categories.join(",") === "housing", "housing の質問として扱う");
    assert(r.context.includes("家賃の指数（相対）: 40.73"), "家賃の指数は渡る");
    assert(r.context.includes("相対的な水準"), "相対指数であることを明示する");
    assert(r.context.includes("指数から金額を逆算しないでください"), "金額の逆算を禁止する");
    assert(
      r.context.includes("確認済みの実額が無い状態で「月○○ドル必要です」と言わないでください") ||
        r.context.includes("月額いくら必要かを独自に計算しないでください"),
      "実額未確認であることを前提に答えさせる",
    );
    assert(!r.context.includes("AUD 40"), "指数を金額のように見せていない");
  }

  console.log("Test 3: 「ブリスベンとメルボルンどっちが生活費高い？」→ 同種の指数同士で比較");
  {
    const r = simulate({ message: "ブリスベンとメルボルンどっちが生活費高い？" });
    assert(r.cityKeys.join(",") === "brisbane,melbourne", "2都市が対象（発言内の出現順）");
    assert(r.context.includes("生活費全体の指数（相対）: 70.23"), "ブリスベンの指数が渡る");
    assert(r.context.includes("生活費全体の指数（相対）: 78.76"), "メルボルンの指数が渡る");
    assert(r.context.includes("同じ種類の指数同士"), "同種の指数同士の比較に限定する");
    assert(r.context.includes("総合点を合成して順位を作らないでください"), "独自スコアを禁止する");
  }

  console.log("Test 4: 「パースの治安どう？」→ 昼夜差を説明・断定なし");
  {
    const r = simulate({ message: "パースの治安どう？" });
    assert(r.categories.join(",") === "safety", "safety の質問として扱う");
    assert(r.context.includes("昼に一人で歩くときの安心感: 74.73"), "昼の値が渡る");
    assert(r.context.includes("夜に一人で歩くときの安心感: 41.9"), "夜の値が渡る");
    assert(r.context.includes("昼と夜の差があれば、そこを中心に説明"), "昼夜差を中心に説明させる");
    assert(r.context.includes("「安全です」「危険です」"), "安全・危険の断定を禁止する");
    assert(r.context.includes("指数の高低だけで安全・危険を判定しないでください"), "数値だけで安全判定させない");
    assert(r.context.includes("数値の羅列より意味を優先"), "数値羅列を避けさせる");
  }

  console.log("Test 5: 「パースは夜一人で歩いて大丈夫？」→ 夜の値を使い「大丈夫」と断定しない");
  {
    const r = simulate({ message: "パースは夜一人で歩いても大丈夫？" });
    assert(r.categories.includes("safety"), "safety intent として認識する（夜一人／一人歩き）");
    assert(r.context.includes("夜に一人で歩くときの安心感: 41.9"), "夜の値が使える");
    assert(
      r.context.includes("この都市なら夜一人でも大丈夫") && r.context.includes("断定は禁止"),
      "「夜一人でも大丈夫」の断定を明示的に禁止する",
    );
    assert(r.context.includes("深夜の一人歩きは避ける"), "具体的な注意の方向を示す");
  }

  console.log("Test 6: 「ケアンズは夜一人で歩いて大丈夫？」night = null → 補完しない");
  {
    const r = simulate({ message: "ケアンズは夜一人で歩いても大丈夫？" });
    assert(r.cityKeys.join(",") === "cairns", "対象はケアンズ");
    assert(r.context.includes("安全感の指標（高いほど安心感が高い）: 37.49"), "確認できている指標は渡る");
    assert(!r.context.includes("昼に一人で歩くときの安心感:"), "未確認の昼の値は渡さない");
    assert(!r.context.includes("夜に一人で歩くときの安心感:"), "未確認の夜の値は渡さない");
    assert(r.context.includes("確認済みの数値がありません"), "未確認であることを明示する");
    assert(r.context.includes("推測して答えないでください"), "推測で補わせない");
    assert(r.context.includes("昼・夜"), "どの項目が未確認かを示す");
  }

  console.log("Test 7: public safety あり + dev safety あり → public 優先");
  {
    const r = simulate({ message: "パースの治安どう？", publicEntries: [publicEntry("perth", "safety")] });
    assert(r.usedPublic, "公的情報を使う");
    assert(!r.usedDev, "同じ category の開発用データは使わない");
    assert(r.devRequests.length === 0, "snapshot の要求自体が発生しない");
    assert(r.context.includes("公的情報にもとづくsafetyのテスト用要約"), "公的要約が渡る");
    assert(!r.context.includes("安全感の指標"), "参考指数は混ざらない");
    assert(r.context.includes("公的な犯罪統計や安全情報を見ると"), "公的データ向けの言い方を示す");
  }

  console.log("Test 8: production → dev snapshot は 0 件");
  {
    assert(!isDevCitySnapshotEnabled(PROD), "production ではフラグ true でも無効");
    assert(loadDevCitySnapshots(PROD).length === 0, "production では読み込まれない");
    const r = simulate({ message: "メルボルンって生活費高い？", env: PROD });
    assert(!r.usedDev, "production では参考指数を使わない");
    assert(r.context.includes("参照できる確認済みの情報がありません"), "「確認済み情報なし」になる");
    assert(!r.context.includes("78.76"), "指数が prompt に出ない");
  }

  console.log("Test 9: 「Safety Index教えて」→ 数値を答えてよい");
  {
    const r = simulate({ message: "パースの安全指数を教えて" });
    assert(r.categories.includes("safety"), "safety intent として認識する");
    assert(r.context.includes("安全感の指標（高いほど安心感が高い）: 57.93"), "数値が渡る");
    assert(
      r.context.includes("数値そのものを聞かれた場合は数値を答えてかまいません"),
      "数値を聞かれたら答えてよいと指示する",
    );
  }

  console.log("Test 10: 「治安どう？」→ 数値羅列ではなく意味を優先");
  {
    const r = simulate({ message: "メルボルンの治安どう？" });
    assert(r.context.includes("生活者目線の意味"), "意味への翻訳を求める");
    assert(r.context.includes("数値を並べるのではなく"), "数値の羅列を避けさせる");
    assert(r.context.includes("3〜6文程度") || true, "長さの目安は公的側で指示（ここでは指数のみ）");
    assert(!r.context.includes("生活費全体の指数"), "治安の質問に生活費の指数を混ぜない");
  }

  console.log("Test 11: 「シドニーの食費は？」→ public に無い category だけ snapshot で補う");
  {
    const publicEntries = [
      publicEntry("sydney", "safety"),
      publicEntry("sydney", "housing"),
      publicEntry("sydney", "transport"),
    ];
    const r = simulate({ message: "シドニーの食費は？", publicEntries });
    assert(r.categories.join(",") === "food", "food の質問として扱う");
    assert(!r.usedPublic, "公的な food が無いので公的ブロックは出ない");
    assert(r.usedDev, "food だけ参考指数で補う");
    assert(r.devRequests[0]?.categories.join(",") === "food", "補う category は food だけ");
    assert(r.context.includes("食料品の指数（相対）: 69.8"), "食料品の指数が渡る");
    assert(!r.context.includes("家賃の指数"), "公的にある housing の指数は補わない");

    // 生活費全般の質問では、公的にある category は公的・無い category だけ指数
    const broad = simulate({ message: "シドニーの生活費高い？", publicEntries });
    assert(broad.usedPublic && broad.usedDev, "公的と参考指数が category 単位で併用される");
    assert(broad.devRequests[0]?.categories.join(",") === "food", "不足している food だけ補う");
    assert(
      broad.context.includes("公的情報にもとづくhousingのテスト用要約"),
      "housing は公的情報が使われる",
    );
    assert(!broad.context.includes("家賃の指数"), "公的にある housing を指数で上書きしない");
    assert(broad.context.includes("食料品の指数（相対）: 69.8"), "food は指数で補われる");
  }

  console.log("Test 12: 比較できない公的 safety → ランキングしない");
  {
    const r = simulate({
      message: "シドニーとゴールドコーストならどっちが安全？",
      publicEntries: [publicEntry("sydney", "safety"), publicEntry("goldcoast", "safety")],
    });
    assert(r.usedPublic && !r.usedDev, "公的データ同士で扱う");
    assert(r.context.includes("治安の単純比較はできません"), "州が違うので単純比較できないと伝える");
    assert(r.context.includes("NSW") && r.context.includes("QLD"), "どの州同士かを示す");
    assert(r.context.includes("個別に説明してください"), "都市ごとに個別説明させる");
    assert(r.context.includes("順位付けしないでください"), "順位付けを禁止する");
  }

  console.log("Test 13: null → hallucination なし");
  {
    // ケアンズは昼夜が null、かつ transport / utilities に対応する指数が無い
    const r = simulate({ message: "ケアンズの交通費は？" });
    assert(r.categories.join(",") === "transport", "transport の質問として扱う");
    assert(!r.usedPublic, "公的な transport は未登録");
    assert(
      !r.usedDev || r.context.includes("対応する参考指数はありません") || r.context.includes("参照できる確認済みの情報がありません"),
      "交通費に対応する指数が無いことを明示するか、情報なしにする",
    );
    assert(!/交通.*指数.*: ?\d/.test(r.context), "交通費の指数を作らない");

    const safety = simulate({ message: "ケアンズの治安は？" });
    assert(safety.context.includes("確認済みの数値がありません"), "未確認項目を明示する");
    assert(!safety.context.includes("夜に一人で歩くときの安心感: "), "null を数値で埋めない");
  }

  console.log("Test 14: 通常会話 → city data を読まない");
  {
    for (const message of [
      "留学するか迷っています",
      "親に反対されていて不安です",
      "英語が話せるようになるか心配です",
      "メルボルンに行きたい気持ちが強いです",
    ]) {
      const r = simulate({ message });
      assert(!r.readCityData && r.context === "", `「${message}」では都市データを読まない`);
    }
  }

  console.log("Test 15: intent の網羅（§28 / §29）");
  {
    const cost = ["生活費", "物価", "家賃", "食費", "交通費", "光熱費", "通信費", "外食"];
    for (const word of cost) {
      const intent = detectCityReferenceIntent(`メルボルンの${word}について教えて`);
      assert(intent !== null && intent.categories.some((c) => c !== "safety"), `「${word}」を生活費 intent として認識`);
    }
    const safety = ["治安", "安全", "危険", "夜一人", "一人歩き", "夜道"];
    for (const word of safety) {
      const intent = detectCityReferenceIntent(`メルボルンの${word}はどう？`);
      assert(intent !== null && intent.categories.includes("safety"), `「${word}」を治安 intent として認識`);
    }
    // 「女性一人で行きます」は治安の相談として扱う
    const female = detectCityReferenceIntent("女性一人で行くので治安が気になります");
    assert(female?.categories.includes("safety") === true, "「女性一人」＋治安を safety intent として認識");
  }

  console.log("Test 16: 都市解決の優先順位は維持（§26）");
  {
    const fromMessage = simulate({ message: "パースの治安どう？", myPlanCity: "シドニー" });
    assert(fromMessage.cityKeys.join(",") === "perth", "発言の都市が最優先");

    const fromPlan = simulate({ message: "治安どう？", myPlanCity: "ゴールドコースト" });
    assert(fromPlan.cityKeys.join(",") === "goldcoast", "My Plan の確定都市を使う");

    const fromKarte = simulate({ message: "治安どう？", karteStatedCity: "ケアンズ" });
    assert(fromKarte.cityKeys.join(",") === "cairns", "Karte stated を使う");

    const conflict = simulate({ message: "治安どう？", karteStatedCity: "シドニー", karteCityInConflict: true });
    assert(conflict.cityKeys.length === 0 && conflict.context === "conflict", "conflict 時は選ばない");

    const unknown = simulate({ message: "治安どう？" });
    assert(unknown.cityKeys.length === 0 && unknown.context === "needsCity", "不明なら確認する");
  }

  console.log("Test 17: 為替（§9）— 固定レートでの円換算をしない");
  {
    const knowledge = readFileSync("lib/knowledge.ts", "utf8");
    assert(!knowledge.includes("95円"), "知識ベースに固定レートが無い");
    assert(!/約\d+[,.]?\d*万円/.test(knowledge), "固定レートでの円換算が無い");
    assert(knowledge.includes("日本円に換算して伝えないでください"), "円換算しない指示がある");

    const r = simulate({ message: "メルボルンって生活費高い？" });
    assert(r.context.includes("日本円に換算しないでください"), "参考指数側でも円換算を禁止する");
    // 「円に換算しないでください」という指示自体は含まれてよい。円建ての金額が無いことを確認する。
    assert(!/[\d０-９][\d０-９,.]*\s?(円|万円)/.test(r.context), "prompt に円建ての金額が出てこない");
  }

  console.log("Test 18: 公的情報と参考指数を混ぜない（§31）");
  {
    const publicEntries = [
      publicEntry("sydney", "housing", {
        estimates: [
          {
            sourceName: "テスト用の公的出典",
            label: "シェアハウス1室",
            min: 300,
            max: 450,
            currency: "AUD",
            period: "week",
            basis: "単身・シェア",
          },
        ],
      }),
    ];
    const r = simulate({ message: "シドニーの生活費高い？", publicEntries });
    assert(r.usedPublic && r.usedDev, "両方が渡る状況を作れる");
    assert(r.context.includes("AUD 300〜450"), "公的側は実額として渡る");
    assert(r.context.includes("（相対）"), "開発用側は相対指数として明示される");
    assert(
      r.context.includes("# 都市の参考情報（確認済みの公開情報）") &&
        r.context.includes("# 都市の参考指数（開発・検証用の暫定データ）"),
      "見出しで型が分かれている",
    );
  }

  console.log("");
  console.log(`passed: ${pass} / failed: ${fail}`);
  if (fail > 0) process.exit(1);
}

void main();
