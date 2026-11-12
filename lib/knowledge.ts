/**
 * 留学カウンセリングAI 知識ベース
 *
 * **都市名 + 具体的な金額を LLM へ渡してよいのは formal city reference data だけ**
 * （remote の city_reference_data → lib/cityReferenceContext.ts）。毎ターン注入される
 * この知識ベースからは、**都市別の具体的な金額を渡さない**。
 *
 * 以前は lib/data/cities.ts の家賃・食費・外食・交通費・州平均週収を都市ごとに文章化して
 * 常時注入していた。そのため formal city reference が無い都市（メルボルン・ブリスベン・
 * ケアンズ・パース）についても prompt 内に都市別の実額が存在し、実機で
 * 「メルボルンの家賃は週A$150〜400」のような確認済みでない値が、その都市の相場として
 * （あるいは全国の目安として）使われていた。lib/data/cities.ts 自体は他用途のために残し、
 * **LLM への常時注入経路からだけ金額を外す**。
 *
 * 国レベルの一般的な目安（GENERAL_COST_SECTION）は残すが、**オーストラリア全体の目安**で
 * あり特定都市の相場ではないことを明示する。
 *
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

import { AUSTRALIA_CITIES, type CityCostOfLiving } from "./data/cities";
import {
  AUSTRALIA_SCHOOLS,
  type AccommodationOption,
  type CourseCategory,
  type FeeRange,
  type School,
} from "./data/schools";
import { cityMatches } from "./proposal/matching";

/**
 * 都市1件ぶんの説明。**金額は出さない**（定性的な情報だけ）。
 *
 * 家賃・食費・外食・交通費・州平均週収は lib/data/cities.ts に残っているが、ここで
 * 文章化すると毎ターンの prompt に都市別の実額が入り、formal city reference data が
 * 無い都市についても「その都市の相場」として使われてしまう（実測で再現）。
 * 都市別の金額は formal city reference（出典・確認日つき）だけが持つ。
 * 出典行も、金額が無くなったので出さない（特徴・向いている人は編集者による説明文）。
 */
function buildCitySection(c: CityCostOfLiving): string {
  return [
    `### ${c.city}`,
    `- 特徴: ${c.characteristics}`,
    `- 向いている人: ${c.suitedFor}`,
  ].join("\n");
}

function buildCitiesSection(): string {
  return AUSTRALIA_CITIES.map(buildCitySection).join("\n\n");
}

/**
 * ビザ情報の出典（2026-10-01 に確認）。
 *
 * 正式なビザ基盤（出典追跡つきの DB レイヤー）を作るまでの**暫定**セクション。
 * ここは詳細なデータベースではなく、**高レベルの安全な基礎知識**に留める方針。
 *
 * 確認できた公式情報（Australian Government / Study Australia）:
 *   - 学生ビザの就労: 授業期間中は最大 48 hours per fortnight。Masters by Research / Doctoral は例外
 *     https://www.studyaustralia.gov.au/en/plan-your-move/your-guide-to-visas/student-visa-subclass-500
 *     https://www.studyaustralia.gov.au/en/work-in-australia/work-rights-and-responsibilities/your-work-rights-explained
 *   - 学生ビザの滞在: コース期間（最長5年）／OSHC は滞在全期間で必要（同上）
 *   - 学生ビザの申請料: 2026年7月1日以降は 1申請あたり AUD$2,500 から（免除対象を除く）（同上）
 *   - Genuine Student (GS) requirement が 2024年3月23日に GTE requirement を置き換えた
 *     https://www.studyaustralia.gov.au/en_in/tools-and-resources/news/student-and-temporary-graduate-visa-changes--2024
 *   - 学生ビザの資金要件: 2024年5月10日以降の申請で個人 AUD$29,710（同上）
 *   - 英語力要件: 2024年3月23日から新しい要件が適用（具体的な基準は上記ページに記載なし）
 *
 * 確認できなかったため、固定値を置かずに「公式で確認」に委ねている項目:
 *   - ワーキングホリデー（417）の年齢条件・滞在期間・申請料・同一雇用主の期間制限と例外・
 *     就学可能期間・セカンド/サードの具体要件・specified work の詳細・処理期間
 *   いずれも Department of Home Affairs（immi.homeaffairs.gov.au）が一次情報だが、
 *   今回の調査では当該ページを取得できなかった（HTTP 403）。推測で補完していない。
 *
 * 2026-10-21: このコメントと本文の食い違いを解消した。
 *   本文には「滞在期間は通常12ヶ月」と「給与明細などの証拠も必要になる」が残っていたが、
 *   どちらも human-reviewed な 417 の reference data に根拠が無い
 *   （stay は entry 自体が未登録、specified work の一般的な証拠要件は
 *    data/visas/australia/working-holiday-417.json で unverified として明記）。
 *   毎ターン注入されるこのセクションから断定を外し、別表現にも置き換えていない。
 *   417 の確認済み事実（年齢・パスポート・申請期限・同一雇用主の条件・specified work・
 *   セカンド/サードの期間）は lib/visaReference* の reference data 側が持ち、
 *   そちらが渡るターンではこの知識ベースより優先される。
 *
 * 注意: 申請料・年齢条件・就労条件・必要書類・処理期間は変更される。固定値を増やさないこと。
 * **確認済みデータに無い具体値・書類名を、このセクションへ追加しないこと。**
 * 税務（TFN・superannuation・working holiday maker tax 等）はビザ制度とは別の領域なので、
 * このセクションに混ぜない（別フェーズで ATO を一次情報として扱う）。
 */
const VISA_REVIEWED_AT = "2026-10-01";

const VISA_SECTION = `## ビザの種類（${VISA_REVIEWED_AT} 時点で確認した範囲）

ここに書いてあるのは制度の大枠だけです。実際の条件は申請者の状況によって変わります。

### ワーキングホリデービザ（サブクラス417）
- 日本国籍の方が利用する主なワーキングホリデービザ
- 年齢などの申請資格（eligibility）の条件がある
- 滞在できる期間には条件がある。**具体的な期間は確認済みのデータが無いため、こちらから数値を示さない**（公式情報での確認を案内する）
- 就労できるが条件がある。**同一雇用主のもとで働ける期間には制限があり、業種や地域によって例外もある**ため、「同じ雇用主で何ヶ月まで」と一律には言えない
- 就学・訓練（study / training）については、この知識ベースは**何も扱っていない**（確認済みのデータが無い）。そのターンに「ビザ・手続きの確認済み情報」として就学の条件が渡っている場合は、**そちらだけを正本として答える**。渡っていない場合は「今回確認できている情報では、ワーキングホリデービザでの就学・訓練の条件を特定できません」とだけ伝え、公式情報での確認を案内する。いずれの場合も、**制度の有無・可否・期間・条件の有無には、こちらから触れない**（この知識ベースを根拠にして補わない）
- セカンド・サードのワーキングホリデービザには、**specified work（指定された業種・地域・期間の仕事）**という追加条件がある。
  日本語では「88日」と呼ばれることが多いが、**農場で日数を働けば必ず取得できるというものではない**。
  対象となる業種・地域・期間などの条件を満たす必要がある。
  **必要な証拠・書類の具体名は、確認済みのデータに書かれているものだけを案内する**（ここで書類名を挙げない）。
  特定の求人がセカンドの対象になるかどうかは、このサービスでは保証できない（本人が公式条件と雇用主の情報で確認する必要がある）
- 申請料・年齢条件・就労条件は変更されるため、具体的な数字は案内せず、公式情報での確認を促すこと

### 学生ビザ（サブクラス500）
- CRICOS登録校（語学学校・大学・専門学校等）で学ぶためのビザ
- **CoE（Confirmation of Enrolment）**が必要
- **OSHC（留学生向け健康保険）**を滞在全期間について維持する必要がある
- **Genuine Student (GS) requirement**（2024年3月23日に以前の GTE requirement を置き換えた）に沿った質問への回答が必要
- 就労は、授業期間中は原則 **48 hours per fortnight（2週間で48時間）**まで。
  **これを2で割って週単位の上限へ言い換えないこと**（fortnight単位の管理と週単位は厳密には同じではない）。
  Masters by Research・Doctoral の学生は例外として、コース開始後はこの上限を超えて働ける。
  授業期間外（コースのブレイク中）の扱いは異なるため、公式情報で確認すること
- 滞在できるのはコース期間に応じた期間（最長5年）
- 資金要件は、2024年5月10日以降に申請する場合、個人で年間 AUD$29,710（出典: Study Australia。${VISA_REVIEWED_AT} 確認）
- 申請料は 2026年7月1日以降、1申請あたり AUD$2,500 **から**（免除対象を除く。出典: Study Australia。${VISA_REVIEWED_AT} 確認）
- 英語力の要件は2024年3月23日から新しい要件が適用されている。**必要な英語力はコースや申請状況によって異なるため、特定の試験スコアを一律の基準として案内しないこと**

### 制度の説明でやってはいけないこと
- 個別のユーザーについて「このビザが取れます」「申請は通ります」と保証しない
- ビザの却下（refusal）・取消（cancellation）・オーバーステイ・bridging visa・健康面（health）・
  犯罪歴等（character）が関わるケースでは、断定的な助言をしない。
  Department of Home Affairs、または登録移民エージェント（registered migration agent）・移民弁護士への相談を案内する
- 税金（TFN・確定申告・superannuation・working holiday maker tax 等）はビザとは別の制度。
  個人の納税額について断定せず、ATO（Australian Taxation Office）や登録税務エージェントの確認を案内する

ビザの条件・料金・就労条件・必要書類は変更されることがあるため、申請前には Department of Home Affairs の最新情報を確認するよう案内してください。必要書類は申請者の状況によって変わるので、「これだけあれば必ず申請できる」とは言わないこと（最終的な確認先は Home Affairs の申請画面と document checklist）。`;

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

// 金額は AUD のみで持つ。固定の為替レートを埋め込まず、円換算もしない
// （最新レートを参照する仕組みがないため、古いレートでの換算は誤解を生む）。
// 円でいくらかを聞かれた場合は、最新レートを本人に確認してもらう案内に留めること。
const GENERAL_COST_SECTION = `## 費用の全体感（**オーストラリア全体**の一般的な目安）

この表は**オーストラリア全体の一般的な目安**です。**特定の都市の相場ではありません**。
都市名と金額を結びつけて答えてよいのは、そのターンに確認済みの都市情報（出典つき）が渡っている場合だけです。

| 項目 | 目安 |
|---|---|
| 語学学校の学費 | 週A$300〜500が一般的 |
| ホームステイ費用 | 週A$250〜350（食事付き） |
| シェアハウス家賃 | 週A$200〜400（都市・立地による） |
| 食費（自炊中心） | 月A$400〜600 |
| 交通費 | 月A$150〜220（都市による） |

この目安に触れるときは、**記載されている費目と単位のまま**伝えてください（週あたりは週あたり、月あたりは月あたりのまま）。
費目の値を足し合わせて「月いくら必要」という**合計額を作らないでください**。合計を知りたいと言われた場合は、費目ごとの目安を並べたうえで、本人の滞在期間・住まい方・自炊の度合いによって変わることを伝え、一緒に整理する形にしてください。
「オーストラリア全体の目安」として伝え、「〇〇（都市名）では」「〇〇の相場は」という言い方へ置き換えないでください。

ビザの申請料はこの表に含めていません（変更されるため、上の「ビザの種類」に出典つきで書いた内容だけを使い、具体的な金額は公式情報での確認を促してください）。

金額はすべて豪ドル（AUD）です。日本円に換算して伝えないでください（為替は変動し、最新レートを参照する仕組みがありません）。円での目安を聞かれた場合は、その時点のレートで確認するよう案内してください。`;

function buildAustraliaKnowledge(): string {
  return `
# オーストラリア留学・ワーホリ 知識ベース

---

${VISA_SECTION}

---

## 主要6都市の特徴（**金額は持っていません**）

ここには都市別の金額がありません。**都市別の家賃・食費・交通費を、この知識ベースから答えることはできません。**
都市別の具体的な金額は、確認済みの都市情報（出典つき）が渡っているターンでだけ使えます。

${buildCitiesSection()}

---

${GENERAL_COST_SECTION}

---

※ 上記はすべて「一般的な傾向・目安」です。実際の費用・条件・制度は変動します。
  入学前に各語学学校の公式サイト、ビザについては移民局（Department of Home Affairs）の最新情報を必ず確認するようユーザーに案内してください。
`;
}

export const AUSTRALIA_KNOWLEDGE = buildAustraliaKnowledge();
