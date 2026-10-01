/**
 * 常時プロンプトへ注入されるビザ情報（lib/knowledge.ts の VISA_SECTION）の安全性テスト。
 *
 *   npx tsx scripts/test-visa-knowledge.ts
 *
 * 正式なビザ基盤（出典追跡つき DB レイヤー）を作る前の暫定段階として、
 * 「古い固定値・危険な単純化・固定為替・旧制度名が本番プロンプトに入っていないこと」を検証する。
 * ネットワークへは接続しない。
 */

import { readFileSync } from "node:fs";
import { AUSTRALIA_KNOWLEDGE } from "@/lib/knowledge";
import { buildSystemPrompt } from "@/lib/prompt";

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

/** 実際に Chat へ渡る system prompt（ここに入っているものがユーザーの回答に効く）。 */
const PROMPT = buildSystemPrompt(null, null, null, null, { planContext: true });
const KNOWLEDGE_SRC = readFileSync("lib/knowledge.ts", "utf8");

/** コメントを除いたコード・テンプレート部分（説明コメント内の語で誤検出しないため）。 */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\/\/.*$/, ""))
    .join("\n");
}

const KNOWLEDGE_CODE = codeOnly(KNOWLEDGE_SRC);

console.log("前提: VISA_SECTION は AUSTRALIA_KNOWLEDGE 経由で常時 system prompt に入る");
{
  assert(PROMPT.includes("## ビザの種類"), "ビザ情報が system prompt に含まれている");
  assert(AUSTRALIA_KNOWLEDGE.includes("## ビザの種類"), "知識ベースにビザ情報がある");
}

console.log("Test 1: 学生ビザの就労は fortnight 単位を保持し、週換算の固定が無い");
{
  assert(PROMPT.includes("48 hours per fortnight"), "公式単位（48 hours per fortnight）が保持されている");
  assert(!PROMPT.includes("週24時間"), "「週24時間」が存在しない");
  assert(!PROMPT.includes("約週24時間"), "「約週24時間」が存在しない");
  assert(!/週\s?24\s?時間/.test(PROMPT), "表記違いの週24時間も存在しない");
  assert(
    PROMPT.includes("2で割って週単位の上限へ言い換えないこと"),
    "週単位へ言い換えないよう明示している（禁止すべき数値自体はプロンプトに書かない）",
  );
  assert(PROMPT.includes("Masters by Research"), "公式に確認した例外（研究学位）に触れている");
}

console.log("Test 2: ワーホリの同一雇用主ルールを無条件に断定していない");
{
  assert(!/同一雇用主のもとで最長6ヶ月/.test(PROMPT), "「同一雇用主のもとで最長6ヶ月」という断定が無い");
  assert(!/同じ雇用主で.{0,6}6ヶ月まで/.test(PROMPT), "言い換えの断定も無い");
  assert(
    PROMPT.includes("同一雇用主のもとで働ける期間には制限があり") && PROMPT.includes("例外もある"),
    "制限があることと例外があることの両方に触れている",
  );
  assert(
    PROMPT.includes("一律には言えない"),
    "一律の期間として案内させない指示がある",
  );
}

console.log("Test 3: セカンドビザを「3ヶ月働けば取れる」と読める単純化が無い");
{
  assert(!/セカンドワーホリ: 指定地域/.test(PROMPT), "旧記述（セカンド＝3ヶ月以上）が無い");
  assert(!/3ヶ月以上で取得可能/.test(PROMPT), "「3ヶ月以上で取得可能」が無い");
  assert(PROMPT.includes("specified work"), "specified work という条件に触れている");
  assert(
    PROMPT.includes("農場で日数を働けば必ず取得できるというものではない"),
    "「働けば必ず取れる」と解釈されない説明がある",
  );
  assert(PROMPT.includes("88日"), "俗称「88日」に触れつつ条件を説明している");
  assert(
    PROMPT.includes("対象となる業種・地域・期間の条件") && PROMPT.includes("証拠"),
    "業種・地域・期間・証拠という条件の存在を示している",
  );
  assert(
    PROMPT.includes("このサービスでは保証できない"),
    "特定の求人がセカンド対象かを保証しない指示がある",
  );
}

console.log("Test 4: サードビザを「6ヶ月働けば取れる」と読める単純化が無い");
{
  assert(!/サードワーホリ: 指定地域でさらに6ヶ月以上/.test(PROMPT), "旧記述（サード＝6ヶ月以上）が無い");
  assert(!/6ヶ月以上の特定業種従事が条件/.test(PROMPT), "「6ヶ月以上の特定業種従事が条件」が無い");
  assert(
    PROMPT.includes("セカンド・サードのワーキングホリデービザには"),
    "セカンドとサードを同じ枠組み（specified work）で扱っている",
  );
}

console.log("Test 5: IELTS 6.0 を学生ビザ共通条件として断定していない");
{
  assert(!/IELTS 6\.0以上が目安/.test(PROMPT), "「IELTS 6.0以上が目安」が無い");
  assert(!/IELTS\s?6\.0/.test(PROMPT), "IELTS 6.0 という固定基準が無い");
  assert(
    PROMPT.includes("必要な英語力はコースや申請状況によって異なる"),
    "英語力は状況によって異なると説明している",
  );
  assert(
    PROMPT.includes("特定の試験スコアを一律の基準として案内しないこと"),
    "一律基準として案内させない指示がある（スコア自体はプロンプトに書かない）",
  );
}

console.log("Test 6: 旧制度名（GTE）と未来時制が残っていない");
{
  assert(!/GTE requirement を置き換え/.test(PROMPT) || PROMPT.includes("2024年3月23日"), "GTE に触れる場合は置き換え時期が明示されている");
  assert(!/Genuine Temporary Entrant/.test(PROMPT), "旧名称 Genuine Temporary Entrant が本文に無い");
  assert(PROMPT.includes("Genuine Student (GS) requirement"), "現行名称 Genuine Student を使っている");
  assert(PROMPT.includes("2024年3月23日"), "GS の適用開始日（公式確認済み）を明示している");
  assert(!/2026年より.*必須/.test(PROMPT), "「2026年より必須」という誤った未来時制が無い");
  assert(!/2026年より値上がり/.test(PROMPT), "「2026年より値上がり」という曖昧な表現が無い");
}

console.log("Test 7: ビザ申請料の重複した裸の固定値が無い");
{
  // 旧: 417=約A$670 / 500=約A$2,000 が VISA_SECTION と費用表の2箇所にあった
  assert(!/A\$670/.test(PROMPT), "ワーホリ申請料の固定値（A$670）が無い");
  assert(!/約A\$2,000/.test(PROMPT), "学生ビザ申請料の旧固定値（約A$2,000）が無い");
  assert(
    (PROMPT.match(/ワーホリビザ申請料/g) ?? []).length === 0,
    "費用表からビザ申請料の行が外れている（重複の解消）",
  );
  assert(
    PROMPT.includes("ビザの申請料はこの表に含めていません"),
    "費用表にビザ申請料を置かない理由が書かれている",
  );
  // 保持している金額は出典と確認日つきであること（裸の固定値にしない）
  assert(PROMPT.includes("AUD$2,500"), "公式に確認した学生ビザ申請料は保持している");
  assert(
    /AUD\$2,500 \*\*から\*\*（免除対象を除く。出典: Study Australia。2026-10-01 確認）/.test(PROMPT),
    "学生ビザ申請料は「から」＋出典＋確認日つきで書かれている",
  );
  assert(
    /AUD\$29,710（出典: Study Australia。2026-10-01 確認）/.test(PROMPT),
    "資金要件も出典＋確認日つきで書かれている",
  );
  assert(PROMPT.includes("2024年5月10日以降に申請する場合"), "資金要件の適用開始日が明示されている");
  assert(
    !/申請費用: 約A\$/.test(PROMPT),
    "出典なしの「申請費用: 約A$〜」という書き方が残っていない",
  );
}

console.log("Test 8: 固定為替での円換算が無い");
{
  assert(!PROMPT.includes("95円"), "固定レート（95円）が無い");
  assert(!/[\d０-９][\d０-９,.]*\s?(円|万円)/.test(PROMPT), "円建ての金額が無い");
  assert(PROMPT.includes("日本円に換算して伝えないでください"), "円換算しない指示がある");
}

console.log("Test 9: 個別ケースを保証しない／相談先を案内する指示がある");
{
  assert(
    PROMPT.includes("「このビザが取れます」「申請は通ります」と保証しない"),
    "個別のビザ可否を保証しない指示がある",
  );
  for (const term of ["却下（refusal）", "取消（cancellation）", "オーバーステイ", "bridging visa"]) {
    assert(PROMPT.includes(term), `複雑な個別ケース（${term}）を断定しない対象に含めている`);
  }
  assert(
    PROMPT.includes("registered migration agent") && PROMPT.includes("移民弁護士"),
    "移民エージェント・弁護士への相談を案内している",
  );
  assert(
    PROMPT.includes("これだけあれば必ず申請できる") && PROMPT.includes("とは言わない"),
    "必要書類を言い切らせない指示がある",
  );
  assert(PROMPT.includes("document checklist"), "最終確認先（Home Affairs の checklist）を示している");
}

console.log("Test 10: 税務をビザと混同しない（§16）");
{
  assert(PROMPT.includes("税金（TFN"), "税務が別制度であることに触れている");
  assert(PROMPT.includes("ATO（Australian Taxation Office）"), "税務の相談先を示している");
  assert(
    PROMPT.includes("ビザとは別の制度"),
    "ビザ制度と税務制度を区別する指示がある",
  );
  // ビザの条件として税務用語を混ぜていない
  assert(!/就労制限.*TFN/.test(PROMPT), "就労条件の説明に税務用語を混ぜていない");
}

console.log("Test 11: 免責は繰り返さず、末尾に1回だけ");
{
  const matches = PROMPT.match(/Department of Home Affairs の最新情報を確認/g) ?? [];
  assert(matches.length === 1, `「Home Affairs の最新情報を確認」が1回だけ（実際: ${matches.length}回）`);
  const anyLatest = PROMPT.match(/最新情報を確認/g) ?? [];
  assert(anyLatest.length <= 2, `「最新情報を確認」の繰り返しが過剰でない（実際: ${anyLatest.length}回）`);
}

console.log("Test 12: 出典と確認日がコード上に残っている（§17）");
{
  assert(KNOWLEDGE_CODE.includes('VISA_REVIEWED_AT = "2026-10-01"'), "確認日が定義されている");
  assert(KNOWLEDGE_SRC.includes("studyaustralia.gov.au"), "確認した公式 URL がコメントに残っている");
  assert(
    KNOWLEDGE_SRC.includes("immi.homeaffairs.gov.au") && KNOWLEDGE_SRC.includes("HTTP 403"),
    "確認できなかった一次情報とその理由が記録されている",
  );
  assert(
    KNOWLEDGE_SRC.includes("推測で補完していない"),
    "未確認項目を推測で埋めていないことが明記されている",
  );
  // 巨大な原文を貼り付けていないこと
  assert(KNOWLEDGE_SRC.length < 20000, `knowledge.ts が肥大化していない（${KNOWLEDGE_SRC.length} 文字）`);
}

console.log("Test 13: 417 の未確認項目に固定値を置いていない");
{
  assert(!/18〜30歳/.test(PROMPT), "年齢の固定値（18〜30歳）が無い");
  assert(!/35歳まで/.test(PROMPT), "国別の年齢例外の固定記述が無い");
  assert(!/就学は最長4ヶ月/.test(PROMPT), "就学期間の固定値が無い");
  assert(!/資金証明（約A\$5,000以上）/.test(PROMPT), "資金証明の固定値が無い");
  assert(
    PROMPT.includes("年齢などの申請資格（eligibility）の条件がある"),
    "条件の存在だけを示して具体値は公式に委ねている",
  );
  assert(PROMPT.includes("滞在期間は通常12ヶ月"), "確認済みの大枠（通常12ヶ月）は残している");
}

console.log("");
console.log(`passed: ${pass} / failed: ${fail}`);
if (fail > 0) process.exit(1);
