/**
 * Study Plan 本文（`{ format: "text", body }`）を、表示専用の
 * 「セクション ＋ ラベル/値 ＋ freeText」構造へ分解する pure 層（Step 27）。
 *
 * Study Plan の生成規約（lib/studyPlanPrompt.ts）:
 *   - 本文 1 行目に既定タイトル（記号なし）
 *   - 見出しは「■ 」＋見出し語
 *   - 各セクションの中身は「ラベル：値」（全角コロン、1 行 1 項目）
 *   - 「■ 目的」など一部は短い prose（1〜2 文）
 *
 * このモジュールは lib/documentBodyOutline.ts の generic outline をそのまま使い、
 * 各セクションの行を「ラベル：値」なら items、そうでなければ freeText へ振り分けるだけ。
 * 意味の解釈・並べ替え・補完・要約は一切しない。セクションの並びは body の出現順のまま。
 *
 * 安全性の契約: outline が得られない（「■ 」見出しが無い）body は `null` を返す。
 * 呼び出し側は null のとき必ず元 body 全文をそのまま表示する。
 *
 * pure / deterministic。入力文字列以外に依存しない。
 *
 * 親向け説明資料（parent_explanation）も構造上は同じ（■ 見出し ＋ 概要リストの
 * ラベル：値 ＋ prose）だが、Step 27 では専用 parser を作らず、UI 再利用可否は
 * Step 28 の完了報告で判断する（本ファイルの docstring では約束しない）。
 */

import {
  isBlankLine,
  parseDocumentBodyOutline,
  splitFullwidthKeyValue,
  type DocumentKeyValueItem,
} from "@/lib/documentBodyOutline";

export type { DocumentKeyValueItem };

export type StudyPlanViewSection = {
  heading: string;
  /** 「ラベル：値」として取れた行（出現順）。 */
  items: DocumentKeyValueItem[];
  /** 「ラベル：値」に当てはまらない非空行（出現順）。prose・補足文など。落とさない。 */
  freeText: string[];
};

export type StudyPlanBodyView = {
  preamble: string[];
  sections: StudyPlanViewSection[];
};

/**
 * Study Plan body を表示用構造へ。 「■ 」見出しが無ければ `null`（元 body へ fallback）。
 * セクション順・見出し語・値は body のまま。空行はセクション内容としては扱わない
 * （非空行は items か freeText のいずれかに必ず入る）。
 */
export function parseStudyPlanBodyView(body: string): StudyPlanBodyView | null {
  const outline = parseDocumentBodyOutline(body);
  if (outline === null) return null;

  return {
    preamble: outline.preamble,
    sections: outline.sections.map((section) => {
      const items: DocumentKeyValueItem[] = [];
      const freeText: string[] = [];

      for (const line of section.lines) {
        if (isBlankLine(line)) continue;
        const kv = splitFullwidthKeyValue(line);
        if (kv !== null) {
          items.push(kv);
        } else {
          freeText.push(line.trim());
        }
      }

      return { heading: section.heading, items, freeText };
    }),
  };
}
