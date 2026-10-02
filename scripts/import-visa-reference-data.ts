/**
 * 【運用者がローカルで実行するスクリプト】
 * data/visas/<country>/<visa>.json（人間が公式情報を確認して書いたビザ情報）を検証し、
 * visa_reference_data / visa_reference_sources 用の**冪等な SQL** を生成する。
 *
 * 実行方法:
 *   npx tsx scripts/import-visa-reference-data.ts            # 検証して SQL をファイルへ出力
 *   npx tsx scripts/import-visa-reference-data.ts --stdout   # 標準出力へ
 *   npx tsx scripts/import-visa-reference-data.ts --check     # 検証だけ（SQL を出さない）
 *
 * 設計:
 *   - **DB へ直接書き込まない**。base table には書き込み policy が無く anon key では書けない。
 *     service role key を使わない方針のため、SQL を生成し、人間が確認してから適用する。
 *   - **自動取得をしない**（クローラー・スクレイピング・外部 API 連携を持たない）。
 *     Home Affairs は自動アクセスを拒否するため、回避策も作らない。入力は人間が書いた JSON だけ。
 *   - 検証に通らない entry は SQL に出さない（未確認の内容がそのまま公開データになるのを防ぐ）。
 *   - 対象 entry 以外を DELETE しない（upsert のみ。出典だけはその entry 分を入れ替える）。
 */

import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  VISA_CATEGORIES,
  VISA_KEYS,
  VISA_META,
  VISA_SOURCE_TYPES,
  isVisaCategory,
  isVisaKey,
  isVisaSourceType,
} from "../lib/visaReference";

const DATA_ROOT = resolve(__dirname, "../data/visas");
const OUT_DIR = resolve(__dirname, "../supabase/seed");
const OUT_FILE = join(OUT_DIR, "visa_reference_data.generated.sql");

const args = new Set(process.argv.slice(2));
const toStdout = args.has("--stdout");
const checkOnly = args.has("--check");

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** テンプレートの未記入マーカー。これを含む文章は「未確認」として弾く。 */
const PLACEHOLDER = /[（(]例[:：]|（公式ページで確認|（内部メモ|（参照した箇所|（この金額|（出典を確認/;

/** 置き換えを忘れたテンプレート URL。 */
const PLACEHOLDER_URL = /example\.(gov\.au|com|invalid)/i;

/**
 * 検証エラー。人間が直せるよう、どのビザ・どの category・どの field が問題かを分けて持つ。
 * （秘密情報は扱わない。入力ファイル由来の値はメッセージに載せない方針）
 */
export type VisaValidationProblem = {
  file: string;
  visaKey: string | null;
  category: string | null;
  field: string | null;
  reason: string;
};

export type VisaValidationResult = {
  entries: ValidEntry[];
  problems: VisaValidationProblem[];
};

/** `australia_working_holiday_417 / same_employer / exceptions: 理由` の形に整える。 */
export function formatVisaValidationProblem(problem: VisaValidationProblem): string {
  const scope = [problem.visaKey, problem.category, problem.field].filter(Boolean).join(" / ");
  return scope.length > 0 ? `${scope}: ${problem.reason}` : problem.reason;
}

/** 検証中にエラーを集めるための入れ物（呼び出しごとに作る）。 */
type Collector = {
  file: string;
  visaKey: string | null;
  problems: VisaValidationProblem[];
  add: (category: string | null, field: string | null, reason: string) => void;
};

function createCollector(file: string): Collector {
  const problems: VisaValidationProblem[] = [];
  const collector: Collector = {
    file,
    visaKey: null,
    problems,
    add(category, field, reason) {
      problems.push({ file, visaKey: collector.visaKey, category, field, reason });
    },
  };
  return collector;
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlNullableString(value: string | null): string {
  return value === null ? "null" : sqlString(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

type ValidSource = {
  sourceName: string;
  sourceUrl: string;
  sourceType: string;
  sourcePublishedAt: string | null;
  sourceUpdatedAt: string | null;
  accessedAt: string | null;
  notes: string | null;
};

type ValidEntry = {
  visaKey: string;
  visaCode: string;
  visaName: string;
  countryCode: string;
  category: string;
  summary: string;
  details: Record<string, unknown>;
  reviewedAt: string;
  reviewNote: string | null;
  sources: ValidSource[];
};

function nullableDate(value: unknown, c: Collector, category: string | null, field: string): string | null {
  if (value === null || value === undefined) return null;
  const date = text(value);
  if (!date || !ISO_DATE.test(date)) {
    c.add(category, field, "YYYY-MM-DD または null にしてください（不明な日付を作らない）");
    return null;
  }
  return date;
}

/** 具体値として扱う数値 field（これらがあると出典が必須になる）。 */
const CONCRETE_VALUE_KEYS = ["limit", "amount", "duration", "requiredPeriod"];

/** 金額の基準として許す値。 */
const MONEY_BASIS = ["exact", "from", "minimum"];

/** 「88日」のような俗称だけを正式条件として保存することを禁止するための判定。 */
const COLLOQUIAL_88 = /^\s*88\s*(days?|日)\s*$/i;

/** 俗称・説明として持つことは許す field（正式条件の代替にはしない）。 */
const COLLOQUIAL_KEYS = ["colloquial", "alias", "commonlyCalled", "note", "notes"];

/**
 * details の構造検証。数値には必ず単位・通貨を要求する
 * （単位の無い数値は Chat が意味を誤解するため登録しない）。
 */
function validateDetails(details: Record<string, unknown>, c: Collector, category: string): boolean {
  let ok = true;

  // 就労時間など: limit があるなら unit が必須
  if (details.limit !== null && details.limit !== undefined) {
    if (typeof details.limit !== "number" || !Number.isFinite(details.limit)) {
      c.add(category, "limit", "数値または null にしてください");
      ok = false;
    } else if (!text(details.unit)) {
      c.add(category, "limit", "数値を入れるなら unit（例: hours_per_fortnight）が必須です");
      ok = false;
    }
  }

  // 金額: amount があるなら currency と basis が必須
  if (details.amount !== null && details.amount !== undefined) {
    if (typeof details.amount !== "number" || !Number.isFinite(details.amount)) {
      c.add(category, "amount", "数値または null にしてください");
      ok = false;
    } else {
      const currency = text(details.currency);
      if (!currency || !/^[A-Z]{3}$/.test(currency)) {
        c.add(category, "currency", "金額を入れるなら通貨コード（例: AUD）が必須です");
        ok = false;
      }
      const basis = text(details.basis);
      if (!basis || !MONEY_BASIS.includes(basis)) {
        c.add(category, "basis", `金額の基準を ${MONEY_BASIS.join(" / ")} のいずれかで指定してください`);
        ok = false;
      }
      if (details.per !== undefined && details.per !== null && !text(details.per)) {
        c.add(category, "per", "文字列または null にしてください");
        ok = false;
      }
    }
  }

  // 期間: duration があるなら durationUnit（または unit）が必須
  if (details.duration !== null && details.duration !== undefined) {
    if (typeof details.duration !== "number" || !Number.isFinite(details.duration)) {
      c.add(category, "duration", "数値または null にしてください");
      ok = false;
    } else if (!text(details.durationUnit) && !text(details.unit)) {
      c.add(category, "duration", "期間を入れるなら durationUnit（例: months / years_max）が必須です");
      ok = false;
    }
  }

  // requiredPeriod（セカンド等の必要従事期間）も単位が必須
  if (details.requiredPeriod !== null && details.requiredPeriod !== undefined) {
    if (typeof details.requiredPeriod === "number") {
      if (!text(details.requiredPeriodUnit) && !text(details.unit)) {
        c.add(category, "requiredPeriod", "期間を入れるなら requiredPeriodUnit（例: days / months）が必須です");
        ok = false;
      }
    } else if (COLLOQUIAL_88.test(String(details.requiredPeriod))) {
      // 「88 days」という俗称だけを正式条件にしない
      c.add(
        category,
        "requiredPeriod",
        "「88 days」のような俗称を正式条件として保存できません。公式の期間と単位（数値 + requiredPeriodUnit）で記録してください",
      );
      ok = false;
    } else {
      c.add(category, "requiredPeriod", "数値（+ 単位）で記録してください");
      ok = false;
    }
  }

  // 俗称だけを条件にしていないか（俗称を持ってよい field は除く）
  for (const [key, value] of Object.entries(details)) {
    if (COLLOQUIAL_KEYS.includes(key)) continue;
    if (typeof value === "string" && COLLOQUIAL_88.test(value)) {
      c.add(category, key, "「88日」は俗称です。正式条件の代わりに保存できません");
      ok = false;
    }
  }

  // unknown を 0 / 空文字 / "unknown" で埋めていないか
  for (const key of CONCRETE_VALUE_KEYS) {
    if (details[key] === 0) {
      c.add(category, key, "0 で埋めないでください（未確認なら null か field 自体を省く）");
      ok = false;
    }
  }
  for (const [key, value] of Object.entries(details)) {
    if (value === "") {
      c.add(category, key, "空文字で埋めないでください（未確認なら null）");
      ok = false;
    }
    if (typeof value === "string" && /^(unknown|不明|未確認|未定|tbd|n\/a)$/i.test(value.trim())) {
      c.add(category, key, "「unknown」等の文字列を具体値の field に入れないでください（null か details.unverified へ）");
      ok = false;
    }
  }

  // 日付形式
  for (const key of ["effectiveFrom"]) {
    const value = details[key];
    if (value === undefined || value === null) continue;
    const date = text(value);
    if (!date || !ISO_DATE.test(date)) {
      c.add(category, key, "YYYY-MM-DD にしてください");
      ok = false;
    }
  }

  // exceptions の形
  if (details.exceptions !== undefined && details.exceptions !== null) {
    if (!Array.isArray(details.exceptions)) {
      c.add(category, "exceptions", "配列にしてください");
      ok = false;
    } else {
      for (const [i, raw] of details.exceptions.entries()) {
        if (!raw || typeof raw !== "object") {
          c.add(category, `exceptions[${i}]`, "オブジェクトにしてください");
          ok = false;
          continue;
        }
        const e = raw as Record<string, unknown>;
        if (!text(e.appliesTo) || !text(e.note)) {
          c.add(category, `exceptions[${i}]`, "appliesTo と note が必要です");
          ok = false;
        }
      }
    }
  }

  // ---- category ごとの追加ルール ----

  // same_employer: 期間を登録するなら、例外の情報か「例外の有無を公式で確認した」記録が必須
  if (category === "same_employer") {
    const hasPeriod =
      (typeof details.duration === "number" && Number.isFinite(details.duration)) ||
      (typeof details.limit === "number" && Number.isFinite(details.limit));
    if (hasPeriod) {
      const hasExceptionList = Array.isArray(details.exceptions) && details.exceptions.length > 0;
      const reviewed = details.exceptionsReviewed === true || details.exceptionsConfirmed === true;
      if (!hasExceptionList && !reviewed) {
        c.add(
          category,
          "exceptions",
          "期間制限を登録する場合は、例外の具体情報（exceptions）か、例外の有無を公式で確認したことを示す metadata（exceptionsReviewed: true）が必要です",
        );
        ok = false;
      }
      // 「例外は無い」と公式確認できたケースは、明示的な false を許す
      if (reviewed && !hasExceptionList && details.exceptionsExist !== false) {
        c.add(
          category,
          "exceptionsExist",
          "例外の一覧が無い場合は、公式で「例外なし」と確認できたことを exceptionsExist: false で明示してください",
        );
        ok = false;
      }
    }
  }

  // processing: 固定日数の保証を禁止する
  if (category === "processing") {
    if (details.guaranteed === true) {
      c.add(category, "guaranteed", "審査期間を保証できません（true にしないでください）");
      ok = false;
    }
    if (details.fixedDuration !== null && details.fixedDuration !== undefined) {
      c.add(
        category,
        "fixedDuration",
        "固定日数を保証値として持てません（動的な案内なら type: \"dynamic_official_guide\" と fixedDuration: null）",
      );
      ok = false;
    }
  }

  // documents: 未確認の書類を必須側へ昇格させない／分類の重複を禁止する
  if (category === "documents") {
    const groups = {
      requiredDocuments: Array.isArray(details.requiredDocuments) ? details.requiredDocuments : [],
      caseDependentDocuments: Array.isArray(details.caseDependentDocuments) ? details.caseDependentDocuments : [],
      mayBeRequestedDocuments: Array.isArray(details.mayBeRequestedDocuments) ? details.mayBeRequestedDocuments : [],
    };
    const unverifiedList = (Array.isArray(details.unverified) ? details.unverified : []).filter(
      (v): v is string => typeof v === "string",
    );
    for (const item of groups.requiredDocuments) {
      if (typeof item === "string" && unverifiedList.includes(item)) {
        c.add(
          category,
          "requiredDocuments",
          "details.unverified に入っている書類を必須側に登録できません（未確認のものを必須へ昇格させない）",
        );
        ok = false;
        break;
      }
    }
    const seenDoc = new Map<string, string>();
    for (const [group, items] of Object.entries(groups)) {
      for (const item of items) {
        if (typeof item !== "string") continue;
        const previous = seenDoc.get(item);
        if (previous && previous !== group) {
          c.add(category, group, `同じ書類が ${previous} と ${group} の両方に入っています（分類を1つにしてください）`);
          ok = false;
        }
        seenDoc.set(item, group);
      }
    }
  }

  return ok;
}

/** 具体値を持つ entry かどうか（出典の必須判定に使う）。 */
function hasConcreteValue(details: Record<string, unknown>): boolean {
  for (const key of CONCRETE_VALUE_KEYS) {
    const value = details[key];
    if (typeof value === "number" && Number.isFinite(value)) return true;
  }
  // 年齢などの具体条件
  for (const key of Object.keys(details)) {
    if (/age/i.test(key) && details[key] !== null && details[key] !== undefined) return true;
  }
  return false;
}

/**
 * curated JSON を検証する（**検証の単一の正本**。テストもこの関数を呼ぶ）。
 * ファイル I/O はしない純粋関数なので、合成データでの回帰テストにも使える。
 */
export function validateVisaDocument(file: string, raw: unknown): VisaValidationResult {
  const c = createCollector(file);

  if (!raw || typeof raw !== "object") {
    c.add(null, null, "JSON のトップレベルがオブジェクトではありません");
    return { entries: [], problems: c.problems };
  }
  const doc = raw as Record<string, unknown>;

  const visaKey = text(doc.visaKey);
  if (!visaKey || !isVisaKey(visaKey)) {
    c.add(null, "visaKey", `対象外です（対象: ${VISA_KEYS.join(" / ")}）`);
    return { entries: [], problems: c.problems };
  }
  c.visaKey = visaKey;
  const meta = VISA_META[visaKey];
  const visaCode = text(doc.visaCode) ?? meta.code;
  const visaName = text(doc.visaName) ?? meta.name;
  const countryCode = text(doc.countryCode) ?? "AU";

  // サブクラスの食い違いを防ぐ（417 と 462 の混同対策）
  if (visaCode !== meta.code) {
    c.add(null, "visaCode", `visaKey（${visaKey} = ${meta.code}）と一致しません`);
    return { entries: [], problems: c.problems };
  }
  if (visaName !== meta.name) {
    c.add(null, "visaName", "正式名称と一致しません");
    return { entries: [], problems: c.problems };
  }

  if (!Array.isArray(doc.entries)) {
    c.add(null, "entries", "配列ではありません");
    return { entries: [], problems: c.problems };
  }
  if (doc.entries.length === 0) {
    // 空は正常（未確認のビザは登録しない）。
    return { entries: [], problems: c.problems };
  }

  // 417 の JSON に 462 の条件（またはその逆）が混ざっていないか
  const body = JSON.stringify(doc.entries);
  if (visaKey === "australia_working_holiday_417" && /462|Work and Holiday/i.test(body)) {
    c.add(null, "entries", "417 のデータに 462（Work and Holiday）の記述が混ざっています");
    return { entries: [], problems: c.problems };
  }
  if (visaKey === "australia_work_and_holiday_462" && /\b417\b|Working Holiday visa/i.test(body)) {
    c.add(null, "entries", "462 のデータに 417（Working Holiday）の記述が混ざっています");
    return { entries: [], problems: c.problems };
  }

  const valid: ValidEntry[] = [];
  const seen = new Set<string>();
  const presentCategories = new Set(
    doc.entries
      .map((e) => (e && typeof e === "object" ? (e as Record<string, unknown>).category : null))
      .filter((v): v is string => typeof v === "string"),
  );

  for (const [index, rawEntry] of doc.entries.entries()) {
    const at = `entries[${index}]`;
    if (!rawEntry || typeof rawEntry !== "object") {
      c.add(null, at, "オブジェクトではありません");
      continue;
    }
    const entry = rawEntry as Record<string, unknown>;

    if (!isVisaCategory(entry.category)) {
      c.add(null, at, `category が不正です（対象: ${VISA_CATEGORIES.join(" / ")}）`);
      continue;
    }
    const category = entry.category;
    if (seen.has(category)) {
      c.add(category, null, "category が重複しています（1ビザ1categoryにつき1件）");
      continue;
    }

    const summary = text(entry.summary);
    if (!summary) {
      c.add(category, "summary", "空です");
      continue;
    }
    if (PLACEHOLDER.test(summary)) {
      c.add(category, "summary", "テンプレートの未記入文のままです（公式情報を確認して書き換えてください）");
      continue;
    }

    const reviewedAt = text(entry.reviewedAt);
    if (!reviewedAt || !ISO_DATE.test(reviewedAt)) {
      c.add(category, "reviewedAt", "確認した日（YYYY-MM-DD）が必須です");
      continue;
    }

    const details =
      entry.details && typeof entry.details === "object" && !Array.isArray(entry.details)
        ? (entry.details as Record<string, unknown>)
        : {};
    if (!validateDetails(details, c, category)) continue;

    // processing の要約に保証表現が無いか
    if (category === "processing" && /必ず\s*\d+\s*(日|週|営業日)|\d+\s*日以内に(出|発給|下り)/.test(summary)) {
      c.add(category, "summary", "審査期間を保証する表現（「必ず○日」「○日以内に出る」等）は使えません");
      continue;
    }

    // セカンド・サードに期間条件を登録するなら、specified_work の条件も必要
    if (category === "second_third") {
      const hasPeriod =
        (typeof details.duration === "number" && Number.isFinite(details.duration)) ||
        (typeof details.requiredPeriod === "number" && Number.isFinite(details.requiredPeriod));
      if (hasPeriod) {
        if (!presentCategories.has("specified_work")) {
          c.add(
            category,
            "requiredPeriod",
            "期間条件を登録するなら、同じビザに specified_work の entry が必要です（期間だけでは条件になりません）",
          );
          continue;
        }
        const specified = doc.entries.find(
          (e) => e && typeof e === "object" && (e as Record<string, unknown>).category === "specified_work",
        ) as Record<string, unknown> | undefined;
        const sd =
          specified?.details && typeof specified.details === "object"
            ? (specified.details as Record<string, unknown>)
            : {};
        const nonEmpty = (key: string) => Array.isArray(sd[key]) && (sd[key] as unknown[]).length > 0;
        if (!nonEmpty("industries") && !nonEmpty("regions") && !nonEmpty("areas") && !nonEmpty("evidence")) {
          c.add(
            category,
            "requiredPeriod",
            "specified_work に対象業種（industries）・対象地域（regions / areas）・必要な証拠（evidence）のいずれかが必要です",
          );
          continue;
        }
      }
    }

    // 出典（具体値があるなら出典メタデータを厳しく要求する）
    const rawSources = Array.isArray(entry.sources) ? entry.sources : [];
    const sources: ValidSource[] = [];
    const needsStrictSource = hasConcreteValue(details);
    for (const [sIndex, rawSource] of rawSources.entries()) {
      const sAt = `sources[${sIndex}]`;
      if (!rawSource || typeof rawSource !== "object") {
        c.add(category, sAt, "オブジェクトではありません");
        continue;
      }
      const source = rawSource as Record<string, unknown>;
      const sourceName = text(source.sourceName);
      const sourceUrl = text(source.sourceUrl);
      if (!sourceName || PLACEHOLDER.test(sourceName)) {
        c.add(category, `${sAt}.sourceName`, "未記入です");
        continue;
      }
      if (!sourceUrl || !/^https:\/\//i.test(sourceUrl) || PLACEHOLDER_URL.test(sourceUrl)) {
        c.add(category, `${sAt}.sourceUrl`, "実際の https URL にしてください");
        continue;
      }
      if (!isVisaSourceType(source.sourceType)) {
        c.add(category, `${sAt}.sourceType`, `不正です（対象: ${VISA_SOURCE_TYPES.join(" / ")}）`);
        continue;
      }
      const accessedAt = nullableDate(source.accessedAt, c, category, `${sAt}.accessedAt`);
      if (needsStrictSource && !accessedAt) {
        c.add(category, `${sAt}.accessedAt`, "具体値を登録する entry では、ページを開いた日が必須です");
        continue;
      }
      const notes = text(source.notes);
      sources.push({
        sourceName,
        sourceUrl,
        sourceType: source.sourceType,
        sourcePublishedAt: nullableDate(source.sourcePublishedAt, c, category, `${sAt}.sourcePublishedAt`),
        sourceUpdatedAt: nullableDate(source.sourceUpdatedAt, c, category, `${sAt}.sourceUpdatedAt`),
        accessedAt,
        notes: notes && !PLACEHOLDER.test(notes) ? notes : null,
      });
    }
    if (sources.length === 0) {
      c.add(
        category,
        "sources",
        needsStrictSource
          ? "具体値（金額・期間・上限・年齢など）を登録するには、出典 URL・種別・確認日が必要です"
          : "有効な出典がありません（出典の無い内容は登録しません）",
      );
      continue;
    }

    // 一次情報（Home Affairs）が無い場合、照合が未了であることが失われていないか
    const hasPrimary = sources.some((s) => s.sourceType === "home_affairs");
    const reviewNote = text(entry.reviewNote);
    const unverifiedList = Array.isArray(details.unverified) ? details.unverified : [];
    if (!hasPrimary) {
      const recorded =
        (reviewNote !== null && /403|未了|一次情報|home affairs/i.test(reviewNote)) ||
        details.primarySourceVerified === false ||
        unverifiedList.length > 0;
      if (!recorded) {
        c.add(
          category,
          "reviewNote",
          "一次情報（Home Affairs）の出典が無い場合は、照合が未了であることを reviewNote か details.primarySourceVerified: false に残してください",
        );
        continue;
      }
    }

    seen.add(category);
    valid.push({
      visaKey,
      visaCode,
      visaName,
      countryCode,
      category,
      summary,
      details,
      reviewedAt,
      reviewNote: reviewNote && !PLACEHOLDER.test(reviewNote) ? reviewNote : null,
      sources,
    });
  }

  return { entries: valid, problems: c.problems };
}


/** 1 entry ぶんの SQL。unique(visa_key, category) に対する upsert で冪等にする。 */
function buildSql(entry: ValidEntry): string {
  const sourceRows = entry.sources
    .map(
      (s) =>
        `      (${sqlString(s.sourceName)}, ${sqlString(s.sourceUrl)}, ${sqlString(s.sourceType)}, ${sqlNullableString(s.sourcePublishedAt)}::date, ${sqlNullableString(s.sourceUpdatedAt)}::date, ${sqlNullableString(s.accessedAt)}::date, ${sqlNullableString(s.notes)})`,
    )
    .join(",\n");

  return `-- ${entry.visaKey} / ${entry.category}（確認日: ${entry.reviewedAt}）
with upserted as (
  insert into visa_reference_data (
    visa_key, visa_code, visa_name, country_code, category, summary, details, reviewed_at, review_note, updated_at
  ) values (
    ${sqlString(entry.visaKey)}, ${sqlString(entry.visaCode)}, ${sqlString(entry.visaName)}, ${sqlString(entry.countryCode)},
    ${sqlString(entry.category)}, ${sqlString(entry.summary)}, ${sqlString(JSON.stringify(entry.details))}::jsonb,
    ${sqlString(entry.reviewedAt)}::date, ${sqlNullableString(entry.reviewNote)}, now()
  )
  on conflict (visa_key, category) do update set
    visa_code = excluded.visa_code,
    visa_name = excluded.visa_name,
    country_code = excluded.country_code,
    summary = excluded.summary,
    details = excluded.details,
    reviewed_at = excluded.reviewed_at,
    review_note = excluded.review_note,
    updated_at = now()
  returning id
),
cleared as (
  delete from visa_reference_sources
  where entry_id in (select id from upserted)
  returning entry_id
)
insert into visa_reference_sources (
  entry_id, source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes
)
select upserted.id, v.source_name, v.source_url, v.source_type, v.source_published_at, v.source_updated_at, v.accessed_at, v.notes
from upserted
cross join (
  values
${sourceRows}
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes);`;
}

function main() {
  if (!existsSync(DATA_ROOT)) {
    console.error(`データディレクトリがありません: ${DATA_ROOT}`);
    process.exit(1);
  }

  const files: string[] = [];
  for (const country of readdirSync(DATA_ROOT, { withFileTypes: true })) {
    if (!country.isDirectory()) continue;
    const dir = join(DATA_ROOT, country.name);
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json") || file.startsWith("_")) continue;
      files.push(join(dir, file));
    }
  }

  if (files.length === 0) {
    console.log("取り込み対象のビザファイルがありません（data/visas/<country>/<visa>.json）。");
    console.log("テンプレート: data/visas/australia/_template.json をコピーして記入してください。");
    return;
  }

  const entries: ValidEntry[] = [];
  const problems: VisaValidationProblem[] = [];

  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"));
    } catch (err) {
      problems.push({
        file,
        visaKey: null,
        category: null,
        field: null,
        reason: `JSON として読めません: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }
    const result = validateVisaDocument(file, parsed);
    entries.push(...result.entries);
    problems.push(...result.problems);
    console.log(`  ${result.entries.length > 0 ? "OK  " : "---"} ${file}（有効な entry: ${result.entries.length}件）`);
  }

  if (problems.length > 0) {
    console.error(`\n検証で問題が見つかりました（${problems.length}件）:`);
    for (const problem of problems) {
      console.error(`  - ${problem.file}`);
      console.error(`    ${formatVisaValidationProblem(problem)}`);
    }
    // **1件でも問題があれば SQL を書き換えない**（不完全なデータから SQL を作らない。
    // 既存の生成済み SQL も壊さない）。
    console.error("\n問題が解消されるまで SQL は生成しません（既存の生成済み SQL も変更していません）。");
    process.exit(1);
  }

  if (entries.length === 0) {
    console.log("\n有効な entry が無いため、SQL は出力しません。");
    console.log("公式情報を確認できていないビザは、未登録のままで構いません（Chat は数値を推測しません）。");
    return;
  }

  if (checkOnly) {
    console.log(`\n--check のため SQL は出力しません（有効な entry: ${entries.length}件）。`);
    return;
  }

  const byVisa = new Map<string, number>();
  for (const entry of entries) byVisa.set(entry.visaKey, (byVisa.get(entry.visaKey) ?? 0) + 1);

  const header = [
    "-- visa_reference_data / visa_reference_sources の登録用 SQL",
    "-- scripts/import-visa-reference-data.ts が data/visas/ の JSON から生成",
    `-- 生成: ${new Date().toISOString()}`,
    `-- entry 数: ${entries.length}（${[...byVisa.entries()].map(([k, n]) => `${k}: ${n}`).join(" / ")}）`,
    "-- 適用方法: 内容を目で確認したうえで、Supabase の SQL エディタで実行する。",
    "-- 対象 entry 以外は変更しない（upsert のみ。DELETE は対象 entry の出典の入れ替えだけ）。",
    "",
  ].join("\n");

  const sql = `${header}\n${entries.map(buildSql).join("\n\n")}\n`;

  if (toStdout) {
    console.log(`\n${sql}`);
  } else {
    if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
    // 検証を通ったあとにだけ書き込む（上の early return / process.exit で保証）。
    writeFileSync(OUT_FILE, sql, "utf8");
    console.log(`\n${entries.length}件ぶんの SQL を書き出しました: ${OUT_FILE}`);
  }
}

/**
 * **CLI として直接実行されたときだけ** main() を動かす。
 *
 * テスト（scripts/test-visa-*.ts）は検証の正本である validateVisaDocument を import する。
 * module 読み込みだけで main() が走ると、テストを実行するだけで
 * supabase/seed/visa_reference_data.generated.sql が書き換わり（生成日時コメント）、
 * 標準出力も汚れる。pure な validator の import として不適切なので、実行経路で切り分ける。
 *
 * tsx / node のどちらでも成り立つよう、`process.argv[1]`（実行されたエントリ）と
 * このファイルのパスを拡張子を外して比較する。
 */
function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const withoutExt = (path: string) => resolve(path).replace(/\.(ts|tsx|mts|cts|js|mjs|cjs)$/, "");
  return withoutExt(entry) === withoutExt(__filename);
}

if (isDirectRun()) main();
