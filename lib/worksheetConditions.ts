/**
 * Worksheet「現実条件（conditions）」カテゴリの選択肢カタログ。
 *
 * lib/worksheetPriorities.ts / lib/worksheetNextStep.ts と同じ考え方で、id 付きの安定した定数として持つ
 * （それらのファイルには追記しない。既存カテゴリのコードに触れないよう独立ファイルにする）。
 *
 * 設計方針:
 * - option id は **カテゴリ全体で一意**になるよう接頭辞を付ける（localStorage の sanitize が
 *   「kind ごとの有効 id 集合」で検証する実装のため、他設問の id と衝突させない）。
 * - どの設問にも「まだ決まっていない / まだ分からない」を正式な選択肢として置く。
 *   I'm ready! は未定の人が整理していくサービスなので、未定を回答として扱う。
 * - ここにあるのは *希望・現状* の整理であり、実行計画（開始月・期間の確定）は My Plan、
 *   学校名の比較は School Comparison の役割。学校名はここに持たない。
 */

import type { ChoiceOption } from "@/lib/worksheetNextStep";

/** 行ってみたい国（複数選択 + 自由記入）。 */
export const COUNTRY_OPTIONS: ChoiceOption[] = [
  { id: "country-au", label: "オーストラリア" },
  { id: "country-ca", label: "カナダ" },
  { id: "country-nz", label: "ニュージーランド" },
  { id: "country-uk", label: "イギリス" },
  { id: "country-us", label: "アメリカ" },
  { id: "country-ph", label: "フィリピン" },
  { id: "country-mt", label: "マルタ" },
  { id: "country-other", label: "その他" },
  { id: "country-undecided", label: "まだ決まっていない" },
];

/**
 * 行ってみたい都市（複数選択 + 自由記入）。
 * 国に応じた出し分け（dependent select）の仕組みは現状存在しないため作らない。
 * 現在サービスが実データを持つオーストラリアの主要都市を並べ、それ以外は自由記入で受ける。
 */
export const CITY_OPTIONS: ChoiceOption[] = [
  { id: "city-sydney", label: "シドニー" },
  { id: "city-melbourne", label: "メルボルン" },
  { id: "city-goldcoast", label: "ゴールドコースト" },
  { id: "city-brisbane", label: "ブリスベン" },
  { id: "city-cairns", label: "ケアンズ" },
  { id: "city-perth", label: "パース" },
  { id: "city-adelaide", label: "アデレード" },
  { id: "city-other", label: "その他" },
  { id: "city-undecided", label: "まだ決まっていない" },
];

/** 出発時期（単一選択 + 自由記入）。 */
export const DEPARTURE_TIMING_OPTIONS: ChoiceOption[] = [
  { id: "depart-3m", label: "3ヶ月以内" },
  { id: "depart-6m", label: "半年以内" },
  { id: "depart-12m", label: "1年以内" },
  { id: "depart-beyond", label: "1年以上先" },
  { id: "depart-undecided", label: "時期は決めていない" },
  { id: "depart-other", label: "その他" },
];

/** 留学全体の期間（単一選択）。学校に通う期間（STUDY_DURATION_OPTIONS）とは別に扱う。 */
export const STAY_DURATION_OPTIONS: ChoiceOption[] = [
  { id: "dur-1-2w", label: "1〜2週間" },
  { id: "dur-1m", label: "1ヶ月" },
  { id: "dur-2-3m", label: "2〜3ヶ月" },
  { id: "dur-6m", label: "半年" },
  { id: "dur-1y", label: "1年" },
  { id: "dur-over1y", label: "1年以上" },
  { id: "dur-undecided", label: "まだ決めていない" },
];

/** 現在の語学力（単一選択 + 自由記入）。スコアや得意/苦手は自由記入で受ける。 */
export const ENGLISH_LEVEL_OPTIONS: ChoiceOption[] = [
  { id: "eng-none", label: "ほとんど話せない" },
  { id: "eng-basic", label: "簡単な会話ならできる" },
  { id: "eng-daily", label: "日常会話ができる" },
  { id: "eng-work", label: "仕事や授業でもある程度使える" },
  { id: "eng-confident", label: "かなり自信がある" },
  { id: "eng-unknown", label: "よく分からない" },
];

/** 予算の目安（単一選択 + 自由記入）。金額の内訳・条件は自由記入で受ける。 */
export const BUDGET_OPTIONS: ChoiceOption[] = [
  { id: "budget-under50", label: "50万円未満" },
  { id: "budget-50-100", label: "50〜100万円" },
  { id: "budget-100-150", label: "100〜150万円" },
  { id: "budget-150-200", label: "150〜200万円" },
  { id: "budget-200-300", label: "200〜300万円" },
  { id: "budget-over300", label: "300万円以上" },
  { id: "budget-unknown", label: "まだ分からない" },
];

/** 現在の職業・状況（単一選択 + 自由記入）。 */
export const OCCUPATION_OPTIONS: ChoiceOption[] = [
  { id: "occ-highschool", label: "高校生" },
  { id: "occ-university", label: "大学生" },
  { id: "occ-vocational", label: "専門学生" },
  { id: "occ-employee", label: "会社員" },
  { id: "occ-parttime", label: "アルバイト・パート" },
  { id: "occ-freelance", label: "フリーランス" },
  { id: "occ-onleave", label: "休職中" },
  { id: "occ-none", label: "無職" },
  { id: "occ-other", label: "その他" },
];

/** 就学希望（複数選択 + 自由記入）。学校名は聞かない（School Comparison の役割）。 */
export const STUDY_FORMAT_OPTIONS: ChoiceOption[] = [
  { id: "study-language", label: "語学学校" },
  { id: "study-university", label: "大学" },
  { id: "study-grad", label: "大学院" },
  { id: "study-vet", label: "専門学校 / VET" },
  { id: "study-short", label: "短期コース" },
  { id: "study-nonstudy", label: "学校には通わない予定" },
  { id: "study-undecided", label: "まだ決めていない" },
  { id: "study-other", label: "その他" },
];

/** 就学期間（単一選択）。留学全体の期間とは別。 */
export const STUDY_DURATION_OPTIONS: ChoiceOption[] = [
  { id: "sdur-under1m", label: "1ヶ月未満" },
  { id: "sdur-1-3m", label: "1〜3ヶ月" },
  { id: "sdur-3-6m", label: "3〜6ヶ月" },
  { id: "sdur-6-12m", label: "6〜12ヶ月" },
  { id: "sdur-over1y", label: "1年以上" },
  { id: "sdur-none", label: "学校には通わない" },
  { id: "sdur-undecided", label: "まだ決めていない" },
];

/** 滞在方法の希望（複数選択 + 自由記入）。開始月・期間の確定は My Plan の役割。 */
export const ACCOMMODATION_OPTIONS: ChoiceOption[] = [
  { id: "stay-homestay", label: "ホームステイ" },
  { id: "stay-dorm", label: "学生寮" },
  { id: "stay-share", label: "シェアハウス" },
  { id: "stay-hotel", label: "ホテル / ホステル" },
  { id: "stay-friend", label: "友人・家族宅" },
  { id: "stay-undecided", label: "まだ決めていない" },
  { id: "stay-other", label: "その他" },
];

/** 現地で働く希望（単一選択 + 自由記入）。職種の希望は自由記入で受ける。 */
export const LOCAL_WORK_OPTIONS: ChoiceOption[] = [
  { id: "work-strong", label: "ぜひ働きたい" },
  { id: "work-prefer", label: "できれば働きたい" },
  { id: "work-conditional", label: "条件が合えば考えたい" },
  { id: "work-none", label: "働く予定はない" },
  { id: "work-unknown", label: "まだ分からない" },
];

/** 今の学校・仕事との調整（単一選択 + 自由記入）。学生／社会人どちらでも選べる並びにする。 */
export const ADJUSTMENT_OPTIONS: ChoiceOption[] = [
  { id: "adjust-graduate", label: "卒業後に行く予定" },
  { id: "adjust-schoolleave", label: "休学を考えている" },
  { id: "adjust-resign", label: "退職を考えている" },
  { id: "adjust-workleave", label: "休職を考えている" },
  { id: "adjust-undecided", label: "まだ何も決めていない" },
  { id: "adjust-other", label: "その他" },
];

/** 家族への共有状況（単一選択 + 自由記入）。Parent Explanation の前提情報として使える。 */
export const FAMILY_SHARING_OPTIONS: ChoiceOption[] = [
  { id: "family-consulted", label: "すでに相談している" },
  { id: "family-partly", label: "少し話している" },
  { id: "family-planned", label: "これから相談する" },
  { id: "family-notyet", label: "まだ話していない" },
  { id: "family-unnecessary", label: "家族への相談は必要ない" },
];

/**
 * Karte へ deterministic に反映するときに「具体的な希望として扱ってよい」id かどうか。
 * 「その他」「まだ決まっていない」「よく分からない」は値を持たないため、ここでは false。
 * （自由記入に書かれた内容は、各設問の自由記入欄として別に扱う）
 */
export function isConcreteOptionId(optionId: string): boolean {
  return !/(?:-other|-undecided|-unknown|-notyet)$/.test(optionId);
}

/** option id → label。見つからなければ null（fake な値は作らない）。 */
export function optionLabel(options: ChoiceOption[], optionId: string): string | null {
  return options.find((o) => o.id === optionId)?.label ?? null;
}

/** 選択済み id 群から、具体的な選択肢のラベルだけを元の並び順で返す。 */
export function concreteLabels(options: ChoiceOption[], selectedIds: string[]): string[] {
  return options
    .filter((o) => selectedIds.includes(o.id) && isConcreteOptionId(o.id))
    .map((o) => o.label);
}

/* ------------------------------------------------------------------ */
/* Karte（AI相談で本人が明言した値）→ Worksheet 選択肢 の対応表            */
/* ------------------------------------------------------------------ */

/**
 * 選択肢ごとの「同じ意味だと確定できる表記」の一覧（ラベル自身は常に含めて扱う）。
 *
 * Chat 由来の Karte 値（例: "Gold Coast"）を Worksheet の選択肢（city-goldcoast）へ戻すときにだけ使う。
 * 部分一致・類似度・`includes` のような fuzzy match はしない。正規化（全角半角・大小文字・空白）後の
 * **完全一致**だけを採用し、どれにも当たらなければ選択肢には変換しない（自由記入候補として扱う）。
 *
 * 「その他」「まだ決まっていない」「学校には通わない予定」のように、Karte の値から
 * 自動で選ばせるべきでない選択肢には alias を置かない。
 */
const OPTION_ALIASES: Record<string, string[]> = {
  "city-sydney": ["sydney"],
  "city-melbourne": ["melbourne"],
  "city-goldcoast": ["gold coast", "goldcoast"],
  "city-brisbane": ["brisbane"],
  "city-cairns": ["cairns"],
  "city-perth": ["perth"],
  "city-adelaide": ["adelaide"],

  "stay-homestay": ["homestay", "home stay"],
  "stay-dorm": ["寮", "dormitory", "dorm", "student accommodation"],
  "stay-share": ["share house", "sharehouse", "フラットシェア", "flat share", "flatshare"],
  "stay-hotel": ["ホテル", "ホステル", "hotel", "hostel"],
  "stay-friend": ["友人宅", "家族宅", "知人宅"],

  "study-language": ["language school", "english school", "英語学校"],
  "study-university": ["university"],
  "study-grad": ["graduate school"],
  "study-vet": ["専門学校", "vet", "tafe"],
  "study-short": ["short course"],

  "occ-employee": ["正社員", "会社勤め"],
  "occ-parttime": ["アルバイト", "パート", "フリーター"],
  "occ-freelance": ["個人事業主"],
  "occ-vocational": ["専門学校生"],
  "occ-none": ["離職中"],
};

/** 自動で選ばせない選択肢（label 完全一致でも変換しない）。 */
const NEVER_AUTO_SELECT = /(?:-other|-undecided|-unknown|-notyet|-nonstudy|-none)$/;

/** 全角半角・大小文字・空白の違いだけを吸収する。意味の言い換えはしない。 */
function normalizeForAlias(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

/**
 * Karte の文字列値に **完全一致**する選択肢 id を返す。見つからなければ null。
 * 複数の選択肢に当たる曖昧なケースも null（どちらかを推測で選ばない）。
 * `occ-none`（無職）だけは「働く予定はない」系ではなく職業の選択肢なので例外的に許可する。
 */
export function matchOptionIdExactly(options: ChoiceOption[], value: string): string | null {
  const target = normalizeForAlias(value);
  if (target.length === 0) return null;
  const hits = options.filter((o) => {
    if (NEVER_AUTO_SELECT.test(o.id) && o.id !== "occ-none") return false;
    const forms = [o.label, ...(OPTION_ALIASES[o.id] ?? [])];
    return forms.some((f) => normalizeForAlias(f) === target);
  });
  return hits.length === 1 ? hits[0].id : null;
}

/**
 * Worksheet → Karte（schoolPrefs.courseType）に書いてよい学び方か。
 * 「学校には通わない予定」は学び方の種類ではなく、courseType に入れると
 * 学校提案の gate（courseType あり）を誤って満たしてしまうため除外する。
 */
export function isCourseTypeOptionId(optionId: string): boolean {
  return isConcreteOptionId(optionId) && optionId !== "study-nonstudy";
}
