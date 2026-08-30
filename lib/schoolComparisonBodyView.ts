/**
 * School Comparison 本文（`{ format: "text", body }`）を、比較 UI が使える表示専用構造へ
 * 分解する pure 層（Step 27）。本文は lib/schoolComparisonFormatter.ts が **決定的に**
 * 生成したプレーンテキストで、構造は次のとおり（formatter は変更しない）:
 *
 *   現在の学校候補の比較                       ← preamble（タイトル）
 *   （金額の免責文）                            ← preamble（費用を表示する場合のみ）
 *
 *   ■ 今回比較する学校
 *
 *   School A
 *   日本語名：〜                                ← 任意
 *   都市：Sydney                                ← 任意
 *   区分：候補 | 参考候補
 *
 *   School B
 *   ...
 *
 *   ■ あなたが大切にしている条件               ← userCriteria がある場合のみ
 *   希望する都市：Sydney
 *   ...
 *
 *   ■ 学校ごとの比較
 *
 *   School A
 *   都市：Sydney
 *   ...
 *   参照先：https://...
 *
 *   School B
 *   ...
 *
 *   ■ 条件との合い方                           ← fit 対象がある場合のみ
 *
 *   School A
 *   希望する都市：条件に合っている
 *   根拠：...
 *
 *   School B
 *   ...
 *
 *   ■ まだ比較できないこと                     ← 該当がある場合のみ
 *   ...
 *
 *   ■ 候補として提示された理由・メモ           ← 該当がある場合のみ
 *   （マッチング説明である旨の免責文）
 *   School A
 *   候補として提示された理由：...
 *
 * このモジュールは「意味を解釈しない」。行分割 / 「■ 」見出し / 「ラベル：値」/
 * `■ 今回比較する学校` で宣言された学校名との **完全一致** だけで学校ブロックを認識する。
 *
 * 安全性の契約（最重要）: 少しでも安全に解釈できない場合は `null` を返し、呼び出し側は
 * 元 body 全文をそのまま表示する（間違った比較表を出すより plain text を優先）。
 *   null になる条件は parseSchoolComparisonBodyView の下のコメントに列挙。
 *
 * やらないこと（禁止）: fuzzy / case-insensitive の学校名対応、name↔nameJa の推測対応、
 * slug / schools master lookup、部分一致、値・ラベルの補完や正規化、budget の適合判定、
 * ranking / recommendation / score の生成。
 *
 * pure / deterministic。入力文字列以外に依存しない（formatter も呼ばない）。
 */

import {
  isBlankLine,
  parseDocumentBodyOutline,
  splitFullwidthKeyValue,
  type DocumentBodySection,
  type DocumentKeyValueItem,
} from "@/lib/documentBodyOutline";

export type { DocumentKeyValueItem };

/** `■ 今回比較する学校` で宣言された 1 校。表記は body のまま（変換しない）。 */
export type SchoolComparisonBodyCandidate = {
  name: string;
  nameJa?: string;
  city?: string;
  /** body に出てくる区分ラベル（例:「候補」「参考候補」）をそのまま。順位ではない。 */
  category?: string;
};

/** `■ 学校ごとの比較` の 1 校ぶん。items は「ラベル：値」を出現順で保持（値は変更しない）。 */
export type SchoolComparisonBodySchool = {
  name: string;
  items: DocumentKeyValueItem[];
};

/** fit の判定ラベルは formatter が出す固定 3 種のみを受け付ける。 */
export type SchoolComparisonFitVerdict = "条件に合っている" | "確認が必要" | "判断材料なし";

export type SchoolComparisonFitItem = {
  label: string;
  verdict: SchoolComparisonFitVerdict;
  /** 直前の fit 項目に対応する「根拠：」の値。無ければ undefined。 */
  basis?: string;
};

/** `■ 条件との合い方` の 1 校ぶん。 */
export type SchoolComparisonFitSchool = {
  name: string;
  fits: SchoolComparisonFitItem[];
};

export type SchoolComparisonBodyView = {
  preamble: string[];
  schools: SchoolComparisonBodyCandidate[];
  criteria: DocumentKeyValueItem[];
  facts: SchoolComparisonBodySchool[];
  fits: SchoolComparisonFitSchool[];
  /** `■ まだ比較できないこと` の非空行を元文のまま。 */
  unresolvedText: string[];
  /** `■ 候補として提示された理由・メモ` の非空行を元文のまま（免責文・学校名行を含む）。 */
  reasonMemoText: string[];
  /** 認識対象外の「■ 」セクション。テキストを捨てないための受け皿。 */
  otherSections: DocumentBodySection[];
};

const HEADING_COMPARE_SCHOOLS = "今回比較する学校";
const HEADING_CRITERIA = "あなたが大切にしている条件";
const HEADING_FACTS = "学校ごとの比較";
const HEADING_FITS = "条件との合い方";
const HEADING_UNRESOLVED = "まだ比較できないこと";
const HEADING_REASON_MEMO = "候補として提示された理由・メモ";

const KNOWN_HEADINGS = new Set<string>([
  HEADING_COMPARE_SCHOOLS,
  HEADING_CRITERIA,
  HEADING_FACTS,
  HEADING_FITS,
  HEADING_UNRESOLVED,
  HEADING_REASON_MEMO,
]);

/** `■ 今回比較する学校` ブロックで許可する属性ラベル。これ以外が来たら構造ドリフト。 */
const ALLOWED_CANDIDATE_ATTRS = new Set<string>(["日本語名", "都市", "区分"]);

function isFitVerdict(value: string): value is SchoolComparisonFitVerdict {
  return value === "条件に合っている" || value === "確認が必要" || value === "判断材料なし";
}

/** `■ 今回比較する学校` → 候補校一覧。曖昧・重複・未知属性なら null。 */
function parseCandidates(lines: string[]): SchoolComparisonBodyCandidate[] | null {
  const out: SchoolComparisonBodyCandidate[] = [];
  const seen = new Set<string>();
  let current: SchoolComparisonBodyCandidate | null = null;

  for (const line of lines) {
    if (isBlankLine(line)) continue;

    const kv = splitFullwidthKeyValue(line);
    if (kv !== null) {
      if (current === null) return null; // 属性行が学校名より先に出た
      if (!ALLOWED_CANDIDATE_ATTRS.has(kv.label)) return null; // 未知の属性
      if (kv.label === "日本語名") current.nameJa = kv.value;
      else if (kv.label === "都市") current.city = kv.value;
      else current.category = kv.value; // 区分
      continue;
    }

    const name = line.trim();
    if (seen.has(name)) return null; // 同名の候補校が複数
    seen.add(name);
    current = { name };
    out.push(current);
  }

  return out.length > 0 ? out : null;
}

/** `■ あなたが大切にしている条件` → 純粋な label/value。KV でない非空行があれば null。 */
function parseCriteria(lines: string[]): DocumentKeyValueItem[] | null {
  const out: DocumentKeyValueItem[] = [];
  for (const line of lines) {
    if (isBlankLine(line)) continue;
    const kv = splitFullwidthKeyValue(line);
    if (kv === null) return null;
    out.push(kv);
  }
  return out;
}

/** `■ 学校ごとの比較` → 学校ごとの label/value。学校名は canonical と完全一致必須。 */
function parseFacts(
  lines: string[],
  canonical: Set<string>,
): SchoolComparisonBodySchool[] | null {
  const out: SchoolComparisonBodySchool[] = [];
  const seen = new Set<string>();
  let current: SchoolComparisonBodySchool | null = null;

  for (const line of lines) {
    if (isBlankLine(line)) continue;

    const kv = splitFullwidthKeyValue(line);
    if (kv !== null) {
      if (current === null) return null; // 値行が学校見出しより先に出た
      current.items.push(kv);
      continue;
    }

    const name = line.trim();
    if (!canonical.has(name)) return null; // 未知 / 対応が取れない学校名
    if (seen.has(name)) return null; // 同一学校ブロックが重複
    seen.add(name);
    current = { name, items: [] };
    out.push(current);
  }

  return out;
}

/** `■ 条件との合い方` → 学校ごとの fit。verdict は固定 3 種のみ。orphan な「根拠：」は null。 */
function parseFits(
  lines: string[],
  canonical: Set<string>,
): SchoolComparisonFitSchool[] | null {
  const out: SchoolComparisonFitSchool[] = [];
  const seen = new Set<string>();
  let currentSchool: SchoolComparisonFitSchool | null = null;
  let currentFit: SchoolComparisonFitItem | null = null;

  for (const line of lines) {
    if (isBlankLine(line)) continue;

    const kv = splitFullwidthKeyValue(line);
    if (kv !== null) {
      if (kv.label === "根拠") {
        if (currentSchool === null || currentFit === null) return null; // 対応先の無い根拠
        if (currentFit.basis !== undefined) return null; // 1 fit に根拠が複数
        currentFit.basis = kv.value;
        continue;
      }
      if (currentSchool === null) return null; // fit 行が学校見出しより先に出た
      if (!isFitVerdict(kv.value)) return null; // 固定 3 種以外の判定ラベル
      currentFit = { label: kv.label, verdict: kv.value };
      currentSchool.fits.push(currentFit);
      continue;
    }

    const name = line.trim();
    if (!canonical.has(name)) return null;
    if (seen.has(name)) return null;
    seen.add(name);
    currentSchool = { name, fits: [] };
    currentFit = null;
    out.push(currentSchool);
  }

  return out;
}

function nonBlankLines(lines: string[]): string[] {
  return lines.filter((line) => !isBlankLine(line));
}

/**
 * School Comparison body を比較 UI 用構造へ。安全に解釈できなければ `null`。
 *
 * null を返す条件:
 *   - 「■ 」見出しが 1 つも無い
 *   - `■ 今回比較する学校` セクションが無い / 候補校を 1 校も取れない
 *   - 候補校ブロックで、属性行が学校名より先に出る / 未知の属性ラベル / 同名の候補校が複数
 *   - 認識対象の「■ 」見出しが本文中に複数回出現する
 *   - `■ あなたが大切にしている条件` に「ラベル：値」でない非空行がある
 *   - `■ 学校ごとの比較` / `■ 条件との合い方` の学校見出しが候補校名と完全一致しない
 *   - 上記セクションで値行が学校見出しより先に出る / 同一学校ブロックが重複する
 *   - fit の判定ラベルが「条件に合っている / 確認が必要 / 判断材料なし」以外
 *   - 対応する fit 項目が無い「根拠：」/ 1 つの fit 項目に「根拠：」が複数
 */
export function parseSchoolComparisonBodyView(body: string): SchoolComparisonBodyView | null {
  const outline = parseDocumentBodyOutline(body);
  if (outline === null) return null;

  let compareSchoolsSection: DocumentBodySection | undefined;
  let criteriaSection: DocumentBodySection | undefined;
  let factsSection: DocumentBodySection | undefined;
  let fitsSection: DocumentBodySection | undefined;
  let unresolvedSection: DocumentBodySection | undefined;
  let reasonMemoSection: DocumentBodySection | undefined;
  const otherSections: DocumentBodySection[] = [];
  const seenKnown = new Set<string>();

  for (const section of outline.sections) {
    const heading = section.heading;
    if (KNOWN_HEADINGS.has(heading)) {
      if (seenKnown.has(heading)) return null; // 認識対象の見出しが重複
      seenKnown.add(heading);
    }
    switch (heading) {
      case HEADING_COMPARE_SCHOOLS:
        compareSchoolsSection = section;
        break;
      case HEADING_CRITERIA:
        criteriaSection = section;
        break;
      case HEADING_FACTS:
        factsSection = section;
        break;
      case HEADING_FITS:
        fitsSection = section;
        break;
      case HEADING_UNRESOLVED:
        unresolvedSection = section;
        break;
      case HEADING_REASON_MEMO:
        reasonMemoSection = section;
        break;
      default:
        otherSections.push(section);
    }
  }

  if (compareSchoolsSection === undefined) return null;

  const schools = parseCandidates(compareSchoolsSection.lines);
  if (schools === null) return null;
  const canonical = new Set(schools.map((s) => s.name));

  const criteria = criteriaSection ? parseCriteria(criteriaSection.lines) : [];
  if (criteria === null) return null;

  const facts = factsSection ? parseFacts(factsSection.lines, canonical) : [];
  if (facts === null) return null;

  const fits = fitsSection ? parseFits(fitsSection.lines, canonical) : [];
  if (fits === null) return null;

  return {
    preamble: outline.preamble,
    schools,
    criteria,
    facts,
    fits,
    unresolvedText: unresolvedSection ? nonBlankLines(unresolvedSection.lines) : [],
    reasonMemoText: reasonMemoSection ? nonBlankLines(reasonMemoSection.lines) : [],
    otherSections,
  };
}
