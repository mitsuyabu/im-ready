/**
 * 留学カウンセリングAI 知識ベース
 *
 * 都市別の生活費数値は lib/data/cities.ts が唯一の出所。このファイルはそこから
 * プロンプト用の説明文を生成する（数値をこのファイルに直書きしない）。
 * ビザ情報・費用の全体感は編集者による一般的な説明文であり、
 * 商用利用が制限された特定データソース（Numbeo等）に基づくものではない。
 *
 * 語学学校の情報は、以前はここに全校ぶんの手書きセクションを常時埋め込んでいたが、
 * (a) schools.ts との二重管理、(b) プロンプト肥大化・コスト増、の2点から廃止した。
 * 代わりに buildCitySchoolKnowledge(preferredCity) で、都市が確定した時点でその都市の
 * 学校だけを schools.ts から抽出し、オンデマンドで文章化する（lib/prompt.ts から呼ばれる）。
 * 生成はLLMを使わない純粋な事実流し込みで、unknownの項目は行ごと省略し、
 * "非公式"/"要確認" 等のヘッジ表記は数値化・断定せずそのまま出す。
 *
 * ※ 費用・ビザ情報は変動するため、AIは「目安」として扱い断定しないこと。
 */

import {
  AUSTRALIA_CITIES,
  AUSTRALIA_STUDENT_VISA_MIN_LIVING_COST,
  type CityCostOfLiving,
  type MoneyRange,
} from "./data/cities";
import {
  AUSTRALIA_SCHOOLS,
  type AccommodationOption,
  type CourseCategory,
  type FeeRange,
  type School,
} from "./data/schools";
import { cityMatches } from "./proposal/matching";

const PERIOD_LABEL: Record<MoneyRange["period"], string> = {
  week: "週",
  month: "月",
  meal: "食",
  year: "年",
};

function formatAmount(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatMoneyRange(range: MoneyRange): string {
  const unit = PERIOD_LABEL[range.period];
  const amount =
    range.min === range.max
      ? formatAmount(range.min)
      : `${formatAmount(range.min)}〜${formatAmount(range.max)}`;
  return `約A$${amount}/${unit}`;
}

function buildCitySection(c: CityCostOfLiving): string {
  const lines = [
    `### ${c.city}`,
    `- 特徴: ${c.characteristics}`,
    `- 向いている人: ${c.suitedFor}`,
    `- 家賃: ${formatMoneyRange(c.rent)}`,
  ];
  if (c.food) lines.push(`- 食費（自炊中心）: ${formatMoneyRange(c.food)}`);
  if (c.eatingOut) lines.push(`- 外食（1食）: ${formatMoneyRange(c.eatingOut)}`);
  if (c.transport) lines.push(`- 交通費: ${formatMoneyRange(c.transport)}`);
  if (c.stateAvgWeeklyEarningsPreTaxAUD) {
    lines.push(
      `- 州平均週収（税引前・州全体の参考値）: 約A$${formatAmount(c.stateAvgWeeklyEarningsPreTaxAUD)}`,
    );
  }
  const confidenceNote =
    c.confidence === "secondary" ? "※二次情報源のため要再確認。" : "";
  lines.push(
    `- 出典: ${c.source}（${c.fetchedAt}取得）${confidenceNote}${c.notes ? ` ${c.notes}` : ""}`,
  );
  return lines.join("\n");
}

function buildCitiesSection(): string {
  return AUSTRALIA_CITIES.map(buildCitySection).join("\n\n");
}

const VISA_SECTION = `## ビザの種類

### ワーキングホリデービザ（サブクラス417）
- 対象: 18〜30歳（英国・カナダ・フランス等の一部の国は35歳まで）
- 滞在期間: 最長12ヶ月
- 就労制限: 同一雇用主のもとで最長6ヶ月。就学は最長4ヶ月
- 申請費用: 約A$670
- 申請方法: オンライン（ImmiAccount）のみ。日本国籍は申請可能
- 必要書類: パスポート（残存12ヶ月以上推奨）、資金証明（約A$5,000以上）、帰国便資金またはチケット
- セカンドワーホリ: 指定地域での特定業種（農業・漁業・建設・観光業等）を3ヶ月以上で取得可能
- サードワーホリ: 指定地域でさらに6ヶ月以上の特定業種従事が条件

### 学生ビザ（サブクラス500）
- 対象: CRICOS登録教育機関（語学学校・大学・専門学校等）で学ぶ方
- 年齢制限: 原則なし
- 滞在期間: コース期間に準じる
- 就労制限: 学期中は2週間で48時間まで（約週24時間）。公式休暇中は上限なし
- 申請費用: 約A$2,000（2026年より値上がり）
- 必要書類: CoE（入学許可書）、資金証明（年間約A$${formatAmount(AUSTRALIA_STUDENT_VISA_MIN_LIVING_COST.amount)}以上、出典: ${AUSTRALIA_STUDENT_VISA_MIN_LIVING_COST.source}、${AUSTRALIA_STUDENT_VISA_MIN_LIVING_COST.fetchedAt}取得）、OSHC（留学生保険）、英語力証明（IELTS 6.0以上が目安）
- 注意: 2026年よりGS（Genuine Student）質問への回答が必須`;

const COURSE_CATEGORY_LABELS: Record<CourseCategory, string> = {
  general_english: "一般英語",
  exam_preparation: "試験対策",
  business_english: "ビジネス",
  academic_pathway: "進学準備",
};

const ACCOMMODATION_LABELS: Record<AccommodationOption, string> = {
  homestay: "ホームステイ",
  dormitory: "学生寮",
  not_arranged: "手配なし",
};

/** FeeRange（構造化済み）があればそれを、無ければ *Note の生文字列（ヘッジ表記込み）をそのまま使う */
function formatFeeRange(fee: FeeRange | undefined, note: string | undefined, unit: string): string | null {
  if (fee) {
    const amount = fee.min === fee.max ? `${fee.min}` : `${fee.min}〜${fee.max}`;
    return `${fee.currency} ${amount}${unit}`;
  }
  if (note) return note;
  return null;
}

/**
 * 学校1件ぶんの事実流し込み文章を組み立てる。LLM呼び出しは無い。
 * 値が無い（unknown）項目は行ごと省略する。"非公式"/"要確認"等の文字列は数値化せずそのまま出す。
 * placeId・地図・評価には一切触れない（表示側の責務）。
 */
function buildSchoolLine(school: School): string {
  const lines: string[] = [`- **${school.name}**${school.nameJa ? `（${school.nameJa}）` : ""}`];
  const push = (label: string, value: string | null | undefined) => {
    if (value) lines.push(`  - ${label}: ${value}`);
  };

  push("都市", school.city);
  push("週授業料", formatFeeRange(school.tuitionWeekly, school.tuitionWeeklyNote, "/週"));
  push("入学金", formatFeeRange(school.enrollmentFee, school.enrollmentFeeNote, ""));
  push("教材費", formatFeeRange(school.materialFee, school.materialFeeNote, ""));
  push("日本人比率", school.japaneseRatio);
  push("コース種別", school.courseCategories?.map((c) => COURSE_CATEGORY_LABELS[c]).join("・"));
  push("コース名", school.courses?.join("；"));
  push("対応レベル", school.levels);
  push(
    "滞在オプション",
    school.accommodationOptions?.map((a) => ACCOMMODATION_LABELS[a]).join("・"),
  );
  push("認定", school.accreditation);
  push("特徴", school.tags?.join("；"));
  push(
    "進学パスウェイ",
    school.hasPathway === true ? "あり" : school.hasPathway === false ? "なし" : undefined,
  );

  return lines.join("\n");
}

/**
 * 希望都市が確定した時点で、その都市の学校だけを schools.ts から抽出して文章化する。
 * 該当校が無ければ null を返す（空セクションを注入しない）。
 * 中立性のため、データが薄い（大半が「要確認」の）学校も選別せず全件列挙する。
 */
export function buildCitySchoolKnowledge(preferredCity: string): string | null {
  const matched = AUSTRALIA_SCHOOLS.filter((s) => cityMatches(preferredCity, s.city));
  if (matched.length === 0) return null;

  const parts: string[] = [
    `## ${preferredCity}の語学学校（参考情報）`,
    "",
    "以下は実在する語学学校の一般的な情報。学校を比較・検討する際の参考に使うが、具体的な学費・コース内容は必ず各校の公式サイトや最新パンフレットで確認するよう案内すること。",
    "",
  ];
  for (const school of matched) {
    parts.push(buildSchoolLine(school), "");
  }
  return parts.join("\n").trimEnd();
}

const GENERAL_COST_SECTION = `## 費用の全体感（目安・円換算）

1 AUD ≈ 95円（変動するため、最新レートは要確認）

| 項目 | 目安 |
|---|---|
| 語学学校の学費 | 週A$300〜500（約3〜5万円）が一般的 |
| ホームステイ費用 | 週A$250〜350（食事付き） |
| シェアハウス家賃 | 週A$200〜400（都市・立地による） |
| 食費（自炊中心） | 月A$400〜600 |
| 交通費 | 月A$150〜220（都市による） |
| ワーホリビザ申請料 | 約A$670（約6.4万円） |
| 学生ビザ申請料 | 約A$2,000（約19万円） |`;

function buildAustraliaKnowledge(): string {
  return `
# オーストラリア留学・ワーホリ 知識ベース

---

${VISA_SECTION}

---

## 主要6都市の特徴と費用目安

${buildCitiesSection()}

---

${GENERAL_COST_SECTION}

---

※ 上記はすべて「一般的な傾向・目安」です。実際の費用・条件・制度は変動します。
  入学前に各語学学校の公式サイト、ビザについては移民局（Department of Home Affairs）の最新情報を必ず確認するようユーザーに案内してください。
`;
}

export const AUSTRALIA_KNOWLEDGE = buildAustraliaKnowledge();
