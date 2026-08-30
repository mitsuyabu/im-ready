/**
 * Documents（My Note / Study Plan / School Comparison / 親向け説明資料）の保存本文は
 * すべて `{ format: "text", body: string }` のプレーンテキストで、共通の表記規約に従う:
 *   - 見出しは行頭「■ 」（半角スペース）または「■　」（全角スペース）＋見出し語
 *   - 構造化項目は「ラベル：値」（全角コロン「：」、1 行 1 項目）
 *   - それ以外は prose（My Note）や補足文
 *
 * このモジュールは、その body を「意味を解釈せずに」表示専用の構造へ分解する pure 層。
 * やることは 行分割 / 「■ 」見出し認識 / 出現順の保持 / 前文（preamble）の保持 だけ。
 *
 * やらないこと（禁止）:
 *   - AI / Anthropic / 意味推論 / 言い換え / 要約 / 翻訳 / 値の補完
 *   - セクションの追加・削除・並べ替え
 *   - ラベルの正規化・別名対応
 *   - ranking / recommendation / score の生成
 *
 * 安全性の契約（最重要）:
 *   `■ ` 見出しが 1 つも無い body は「表示専用構造を安全に作れない」ものとして
 *   `null` を返す。呼び出し側（将来の UI）は null のとき必ず元 body 全文を
 *   そのまま表示する（プレーンテキスト fallback）。構造化表示は outline が
 *   得られたときだけの上乗せであり、非空テキスト行を 1 行も失わせない。
 *
 * pure / deterministic: 入力文字列以外に依存しない。Web / DB / Karte / schools master を
 * 読まない。Date.now / 乱数を使わない。同じ body なら常に同じ結果。
 */

/** 1 つの「■ 見出し」とその配下の行（見出し行は含まない）。行の内容は変更しない。 */
export type DocumentBodySection = {
  heading: string;
  lines: string[];
};

/** 最初の「■ 見出し」より前の前文（preamble）と、見出し単位のセクション列。 */
export type DocumentBodyOutline = {
  preamble: string[];
  sections: DocumentBodySection[];
};

/** 「ラベル：値」1 組。label / value は trim 済みで、いずれも非空であることが保証される。 */
export type DocumentKeyValueItem = {
  label: string;
  value: string;
};

/** trim して長さ 0 の行（空行・空白のみの行）か。 */
export function isBlankLine(line: string): boolean {
  return line.trim().length === 0;
}

/**
 * 行頭「■ 」見出しの認識。`■` の直後に半角スペース or 全角スペースが 1 つ以上あり、
 * その後に非空の見出し語が続く場合のみ見出しとみなす。見出し語は trim だけ行い、
 * 表記は一切変更しない。
 *
 * - "■ 今考えていること"   → "今考えていること"
 * - "■　今回比較する学校"   → "今回比較する学校"（全角スペース）
 * - "■見出し"              → null（スペース無し。prose 中の「■」を誤認しないため）
 * - "■ "                   → null（見出し語が空）
 * - "そのとき■を見た"       → null（行頭でない）
 */
function parseHeadingLine(line: string): string | null {
  if (!line.startsWith("■")) return null;
  const rest = line.slice(1);
  if (!/^[ 　]/.test(rest)) return null;
  const heading = rest.trim();
  return heading.length > 0 ? heading : null;
}

/** 先頭・末尾の空行だけを落とす（内部の空行は保持する）。 */
function trimBlankEdges(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && isBlankLine(lines[start])) start += 1;
  while (end > start && isBlankLine(lines[end - 1])) end -= 1;
  return lines.slice(start, end);
}

/**
 * body を preamble ＋ 見出しセクション列へ分解する。
 * 「■ 」見出しが 1 つも無ければ `null`（呼び出し側は元 body 全文へ fallback）。
 */
export function parseDocumentBodyOutline(body: string): DocumentBodyOutline | null {
  const rawLines = body.split(/\r?\n/);

  const preamble: string[] = [];
  const sections: DocumentBodySection[] = [];
  let current: DocumentBodySection | null = null;

  for (const raw of rawLines) {
    const heading = parseHeadingLine(raw);
    if (heading !== null) {
      current = { heading, lines: [] };
      sections.push(current);
      continue;
    }
    if (current === null) {
      preamble.push(raw);
    } else {
      current.lines.push(raw);
    }
  }

  if (sections.length === 0) return null;

  return {
    preamble: trimBlankEdges(preamble),
    sections: sections.map((s) => ({ heading: s.heading, lines: trimBlankEdges(s.lines) })),
  };
}

/**
 * 1 行を「ラベル：値」へ機械的に分解する。判定は以下だけ:
 *   - 全角コロン「：」を含む（最初の 1 個をセパレータにする）
 *   - 左辺 trim 後が非空
 *   - 右辺 trim 後が非空
 * いずれかを満たさなければ `null`（＝呼び出し側は freeText 等として扱う）。
 *
 * 半角コロン「:」はセパレータにしない（値の中の "https://" 等をそのまま保つため）。
 * 値の中に追加の全角コロンがあっても、分割するのは最初の 1 個だけ。
 */
export function splitFullwidthKeyValue(line: string): DocumentKeyValueItem | null {
  const idx = line.indexOf("：");
  if (idx === -1) return null;
  const label = line.slice(0, idx).trim();
  const value = line.slice(idx + 1).trim();
  if (label.length === 0 || value.length === 0) return null;
  return { label, value };
}
