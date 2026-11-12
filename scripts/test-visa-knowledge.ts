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
  // Phase 8.6: 証拠の具体名はここで挙げない方針になったため、
  // 「条件の存在を示す」ことと「証拠は確認済みデータに限る」ことの両方を見る。
  assert(
    PROMPT.includes("対象となる業種・地域・期間などの条件"),
    "業種・地域・期間という条件の存在を示している",
  );
  assert(
    PROMPT.includes("必要な証拠・書類の具体名は、確認済みのデータに書かれているものだけを案内する"),
    "証拠の具体名は確認済みデータに限ると示している",
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
}

console.log("Test 15: 417 の就学・訓練の条件を常時注入の知識ベース側が持たない（正本は formal data）");
{
  // 以前は「就学できる期間にも制限がある」と、**制限の存在そのもの**を断定していた。
  // 当時は study / training の可否も期間上限の有無も未確認で、「制限がある」も「制限がない」も
  // 断定できなかった（実機では 2/3 でこの断定が再生産されていた）。
  //
  // 2026-11-12 に condition 8548（Maximum 4 months study）を人間が確認し、
  // 417 の study_rights は formal data として登録した。ただし**正本は formal data 側**であり、
  // 毎ターン注入されるこの知識ベースへ 4か月・17週・8548 を複製しない
  // （複製すると、データが更新されても古い値が常時注入され続ける）。
  //
  // 禁止語は runtime の prompt へは入れない（列挙するとその語彙を思い出させるため）。
  // ここ（テスト側）だけで検査する。
  for (const asserted of [
    "就学できる期間にも制限がある",
    "就学期間には制限がある",
    "就学できる期間には制限がある",
    "就学には制限がある",
    "study duration is limited",
  ]) {
    assert(!PROMPT.includes(asserted), `1. 未確認の断定「${asserted}」が無い`);
  }
  // 可否の断定（どちらの向きも）
  for (const asserted of ["就学できます", "就学できません", "勉強できます", "勉強はできません", "就学は可能", "就学は不可"]) {
    assert(!PROMPT.includes(asserted), `2. 就学の可否を断定していない（「${asserted}」が無い）`);
  }
  // 期間の具体値・条件番号（formal data が正本。常時注入側へ複製しない）
  for (const value of ["4か月", "4ヶ月", "4カ月", "17週", "17 weeks", "four months", "4 months", "8548"]) {
    assert(!PROMPT.includes(value), `3. 就学期間の具体値・条件番号「${value}」が常時注入側に無い`);
  }
  assert(!/就学は最長/.test(PROMPT), "3. 「就学は最長〜」の形も無い");
  // 「この知識ベースは扱っていない」という方針そのものは残っていること（黙って消していない）。
  // formal data が渡らないターン（未登録のビザ・category）でもこの安全文が効く必要がある。
  assert(
    PROMPT.includes("就学・訓練") &&
      PROMPT.includes("この知識ベースは**何も扱っていない**") &&
      PROMPT.includes("ワーキングホリデービザでの就学・訓練の条件を特定できません") &&
      PROMPT.includes("制度の有無・可否・期間・条件の有無には、こちらから触れない"),
    "4. 就学・訓練は知識ベースが扱っておらず、使う文と触れない範囲が明記されている",
  );
  // 確認済みデータが渡るターンは、そちらを正本として答えることが書かれている
  assert(
    PROMPT.includes("そちらだけを正本として答える"),
    "4. 確認済みデータが渡るターンは formal data を正本にすることが書かれている",
  );
  // 417 の study_rights は formal data 側に登録済み（正本はこちら）
  const whv417 = JSON.parse(readFileSync("data/visas/australia/working-holiday-417.json", "utf8"));
  const entries = (whv417.entries ?? []) as { category: string; details?: Record<string, unknown> }[];
  const study = entries.find((e) => e.category === "study_rights");
  assert(study !== undefined, "5. 417 の study_rights は formal data に登録済み");
  assert(study?.details?.conditionNumber === 8548, "5. formal data 側が condition 8548 を持つ");
  assert(study?.details?.duration === 4, "5. formal data 側が 4 months を持つ");
}

console.log("Test 14: 417 の未確認な具体値・書類名が常時注入の知識ベースに無い（Phase 8.6）");
{
  // 毎ターン注入されるこのセクションに、human-reviewed な 417 reference data で
  // 裏づけられていない断定が残っていた（stay は entry 未登録、specified work の
  // 一般的な証拠要件は unverified として明記されている）。別表現への置き換えも禁止。
  assert(!/給与明細/.test(PROMPT), "1. 「給与明細が必要」と断定していない");
  assert(!/残高証明|bank statement|通帳/i.test(PROMPT), "2. 「残高証明」等を必要書類として挙げていない");
  assert(!/払込|雇用証明|シフト表|payslip/i.test(PROMPT), "2. その他の書類名も挙げていない");
  assert(!/滞在期間は通常12ヶ月/.test(PROMPT), "3. 「滞在期間は通常12ヶ月」を置いていない");
  for (const alt of ["12ヶ月", "12か月", "1年間", "通常1年", "最長1年", "およそ1年", "12 months"]) {
    assert(!PROMPT.includes(alt), `4. 同義の固定値「${alt}」へ置き換えていない`);
  }
  // 417 の stay は reference data 側にだけ持ち、**常時注入のこのセクションには置かない**
  // （聞かれたターンだけ出典つきで渡す。常時注入すると出典なしの固定値になる）。
  const whv = JSON.parse(readFileSync("data/visas/australia/working-holiday-417.json", "utf8"));
  const entries = (whv.entries ?? []) as { category: string; details?: Record<string, unknown> }[];
  const stay = entries.find((e) => e.category === "stay");
  assert(stay !== undefined, "5. 417 の stay は reference data 側に登録されている");
  const first = (stay?.details?.first ?? {}) as Record<string, unknown>;
  assert(first.duration === 12 && first.durationUnit === "months", "5. その値は 12 months（単位つき）");
  assert(
    PROMPT.includes("具体的な期間は確認済みのデータが無いため、こちらから数値を示さない"),
    "5. 期間は確認済みデータが無いことを明示している",
  );
  assert(
    PROMPT.includes("確認済みのデータに書かれているものだけを案内する"),
    "1. 書類名は確認済みデータに限る指示がある",
  );
  // formal data がある 4 カテゴリの大枠は壊していない
  assert(
    PROMPT.includes("同一雇用主のもとで働ける期間には制限があり"),
    "6. same_employer の大枠は維持されている",
  );
  assert(
    PROMPT.includes("specified work（指定された業種・地域・期間の仕事）"),
    "6. specified_work の大枠は維持されている",
  );
  assert(
    PROMPT.includes("農場で日数を働けば必ず取得できるというものではない"),
    "6. second_third の単純化防止は維持されている",
  );
  assert(
    PROMPT.includes("年齢などの申請資格（eligibility）の条件がある"),
    "6. eligibility の大枠は維持されている",
  );
  // 学生ビザ側の既存記述は変えていない
  assert(PROMPT.includes("48 hours per fortnight"), "学生ビザの就労条件は維持されている");
  assert(PROMPT.includes("AUD$29,710"), "学生ビザの資金要件は維持されている");
}

console.log("");
console.log(`passed: ${pass} / failed: ${fail}`);
if (fail > 0) process.exit(1);
