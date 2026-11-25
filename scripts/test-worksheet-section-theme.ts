/**
 * Worksheet のテーマ別カラーの整合性チェック。
 *
 *   npx tsx scripts/test-worksheet-section-theme.ts
 *
 * ここで固定するのは「一覧の表紙」と「質問・回答画面」でテーマが繋がっていること:
 *   1. 6 テーマぶん揃っていて、色が重複していない
 *   2. 地色（tint）とイラストの塗り（accent）は一覧カードで決めた値そのまま
 *   3. 文字用の ink は 6 テーマで同じくらいの濃さで、白地・tint 地の両方で AA を満たす
 *   4. 色の定義元は lib/worksheetSectionTheme.ts だけ（一覧・詳細のどちらにも二重定義がない）
 *   5. 詳細画面の色が付く箇所はすべて同じテーマ変数を見ている
 *   6. テーマの外（匿名 Worksheet /worksheet）の見た目は変わっていない
 *
 * DB・ネットワークへは接続しない（ソースと設定だけを見る）。
 */

import { readFileSync } from "node:fs";
import { CATEGORIES } from "@/lib/worksheetQuestions";
import {
  WORKSHEET_SECTION_THEME,
  WORKSHEET_SECTION_THEME_FALLBACK,
  worksheetSectionTheme,
  worksheetSectionThemeVars,
  type WorksheetSectionTheme,
} from "@/lib/worksheetSectionTheme";

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

const list = readFileSync("components/WorksheetSectionList.tsx", "utf8");
const detail = readFileSync("components/WorksheetSectionDetail.tsx", "utf8");
const worksheet = readFileSync("components/Worksheet.tsx", "utf8");
const globals = readFileSync("app/globals.css", "utf8");

/* ---------- WCAG コントラスト ---------- */

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** 一覧カードで決めた 6 テーマの地色（= 詳細画面の質問カードヘッダーの地色）。 */
const EXPECTED_TINT: Record<string, string> = {
  motivation: "#fff1ea",
  future: "#edf6f7",
  conditions: "#f0f5e9",
  priorities: "#fff6df",
  anxiety: "#f5f0f8",
  nextstep: "#eef6f4",
};

/** 一覧カードのイラストの塗り。 */
const EXPECTED_ACCENT: Record<string, string> = {
  motivation: "#f0c9b5",
  future: "#c6dde2",
  conditions: "#c9ddd2",
  priorities: "#ecd8a8",
  anxiety: "#d7cbe6",
  nextstep: "#c3ddd6",
};

const entries = Object.entries(WORKSHEET_SECTION_THEME);

console.log("Test 1: 6 テーマぶん揃っていて、余分も不足もない");
{
  assert(
    entries.length === CATEGORIES.length,
    `テーマは ${CATEGORIES.length} 件（実際: ${entries.length}）`,
  );
  for (const category of CATEGORIES) {
    assert(
      WORKSHEET_SECTION_THEME[category.id] != null,
      `${category.id} のテーマがある`,
    );
  }
  for (const [id] of entries) {
    assert(
      CATEGORIES.some((c) => c.id === id),
      `${id} は実在する設問カテゴリ（孤立したテーマを残していない）`,
    );
  }
  assert(
    worksheetSectionTheme("no-such-section") === WORKSHEET_SECTION_THEME_FALLBACK,
    "未知の sectionId はニュートラルに落ちる（壊れない）",
  );
}

console.log("Test 2: 一覧カードで決めた色をそのまま使っている");
{
  for (const [id, theme] of entries) {
    assert(theme.tint === EXPECTED_TINT[id], `${id} の地色は ${EXPECTED_TINT[id]}（表紙と同じ）`);
    assert(
      theme.accent === EXPECTED_ACCENT[id],
      `${id} のイラストの塗りは ${EXPECTED_ACCENT[id]}（表紙と同じ）`,
    );
  }
}

console.log("Test 3: 色が重複していない / 形式が揃っている");
{
  const hex = /^#[0-9a-f]{6}$/;
  const fields: (keyof WorksheetSectionTheme)[] = ["tint", "tintHover", "accent", "ink"];
  for (const field of fields) {
    const values = entries.map(([, t]) => t[field]);
    assert(values.every((v) => hex.test(v)), `${field} はすべて #rrggbb 形式`);
    assert(
      new Set(values).size === CATEGORIES.length,
      `${field} は 6 テーマすべて違う色`,
    );
  }
  assert(
    fields.every((f) => hex.test(WORKSHEET_SECTION_THEME_FALLBACK[f])),
    "フォールバックも同じ形",
  );
}

console.log("Test 4: 視認性（文字・小さなアイコンに使う ink）");
{
  for (const [id, theme] of entries) {
    const onWhite = contrast(theme.ink, "#ffffff");
    const onTint = contrast(theme.ink, theme.tint);
    const onHover = contrast(theme.ink, theme.tintHover);
    assert(onWhite >= 4.5, `${id}: ink は白地で AA（${onWhite.toFixed(2)}）`);
    assert(onTint >= 4.5, `${id}: ink は地色の上でも AA（${onTint.toFixed(2)}）`);
    assert(onHover >= 4.5, `${id}: ink は hover 時の地色でも AA（${onHover.toFixed(2)}）`);
  }
  // 6 テーマで「見た目の重さ」を揃える（1 つだけ目立つのを防ぐ）
  const onWhite = entries.map(([, t]) => contrast(t.ink, "#ffffff"));
  assert(
    Math.max(...onWhite) - Math.min(...onWhite) <= 1.0,
    `ink の濃さは 6 テーマでほぼ同じ（幅 ${(Math.max(...onWhite) - Math.min(...onWhite)).toFixed(2)}）`,
  );
}

console.log("Test 5: 地色は淡いまま / 見出しは地色の上で十分に読める");
{
  for (const [id, theme] of entries) {
    const vsWhite = contrast(theme.tint, "#ffffff");
    assert(
      vsWhite >= 1.03 && vsWhite <= 1.2,
      `${id}: 地色は白との差がほんのり（${vsWhite.toFixed(2)}）`,
    );
    // 質問見出し（濃いニュートラル）
    assert(
      contrast("#1c1c1c", theme.tint) >= 7,
      `${id}: 質問見出しは地色の上で AAA（${contrast("#1c1c1c", theme.tint).toFixed(2)}）`,
    );
    // hover は「分かるが騒がしくない」範囲
    const hoverStep = contrast(theme.tint, theme.tintHover);
    assert(
      hoverStep >= 1.08 && hoverStep <= 1.3,
      `${id}: hover の変化は控えめ（${hoverStep.toFixed(2)}）`,
    );
    // accent は塗り専用（文字に使えない淡さであることを明示的に固定する）
    assert(
      contrast(theme.accent, "#ffffff") < 3,
      `${id}: accent は塗り専用の淡さ（文字には使わない）`,
    );
  }
}

console.log("Test 6: 色の定義元は 1 か所だけ");
{
  assert(
    list.includes('from "@/lib/worksheetSectionTheme"'),
    "一覧カードは共通モジュールから読む",
  );
  assert(
    detail.includes('from "@/lib/worksheetSectionTheme"'),
    "詳細画面も共通モジュールから読む",
  );
  assert(!list.includes("const SECTION_THEME"), "一覧カードにテーマ色の二重定義がない");
  assert(!detail.includes("const SECTION_HEADER"), "詳細画面に独自のヘッダー色が残っていない");
  assert(!detail.includes("NEUTRAL_HEADER"), "詳細画面に独自のフォールバック色が残っていない");
  assert(list.includes("worksheetSectionTheme(category.id)"), "一覧は既存の category.id で引く");
  assert(detail.includes("worksheetSectionTheme(category.id)"), "詳細も既存の category.id で引く");
  // 6 テーマの hex が component 側に直接書かれていない（変更が片側だけに残らないように）
  for (const [id, theme] of entries) {
    assert(
      !list.includes(theme.tint) && !detail.includes(theme.tint),
      `${id} の地色は component に直接書かれていない`,
    );
    assert(
      !detail.includes(theme.ink),
      `${id} の文字色は component に直接書かれていない`,
    );
  }
}

console.log("Test 7: 詳細画面の色が付く箇所はすべて同じテーマ変数を見ている");
{
  assert(
    detail.includes("style={worksheetSectionThemeVars(theme)}"),
    "テーマは画面の一番外側で 1 回だけ流し込む",
  );
  const vars = worksheetSectionThemeVars(WORKSHEET_SECTION_THEME.motivation) as Record<string, string>;
  for (const name of ["--ws-tint", "--ws-tint-hover", "--ws-ink", "--ws-ink-numeral", "--ws-ink-line", "--ws-ink-dot"]) {
    assert(typeof vars[name] === "string" && vars[name].length > 0, `${name} を渡している`);
  }
  // §仕様の 1〜7 に対応する箇所
  assert(detail.includes("bg-[var(--ws-tint)] px-5 py-4 sm:px-7 sm:py-5"), "1. 質問カード上部の地色");
  assert(
    detail.includes('<p className="text-sm font-medium tracking-wide text-[var(--ws-ink)]">'),
    "2. ページ上部のカテゴリー番号・英語タイトル",
  );
  assert(detail.includes("text-[var(--ws-ink-numeral)]"), "3. 質問番号");
  assert(
    detail.includes('stroke="var(--ws-ink-line)"') && detail.includes('fill="var(--ws-ink-dot)"'),
    "3. ヘッダーの装飾（曲線と点）",
  );
  assert(
    worksheet.includes("bg-[var(--ws-tint)] px-3 py-1.5 text-xs font-medium text-[var(--ws-ink)]"),
    "4. 記入例ボタン",
  );
  assert(detail.includes('<PencilIcon className="h-4 w-4 text-[var(--ws-ink)]" />'), "5. ペンアイコン");
  assert(
    detail.includes(
      "rounded-full bg-[var(--ws-tint)] px-3 py-1.5 text-xs font-medium text-[var(--ws-ink)] transition-colors hover:bg-[var(--ws-tint-hover)]",
    ),
    "6. 「AIと整理する」ボタン",
  );
  assert(
    detail.includes("rounded-full bg-[var(--ws-tint)] px-3 py-1 text-[13px] font-medium text-[var(--ws-ink)]"),
    "7. 回答済み件数のピル",
  );
  assert(
    detail.includes('rounded-full bg-[var(--ws-tint)]">') && detail.includes('<LightbulbIcon className="h-4 w-4 text-[var(--ws-ink)]" />'),
    "7. 「このテーマで見えてきたこと」のアイコン",
  );
  assert(detail.includes("rounded-lg bg-[var(--ws-tint)] px-3 py-1.5"), "7. 「あなたが書いたこと」のチップ");
  assert(detail.includes('<CheckIcon className="h-3.5 w-3.5 text-[var(--ws-ink)]" />'), "7. 自動保存のチェック");
  // 淡い地色の上に白文字は載らない
  const header = detail.slice(detail.indexOf("bg-[var(--ws-tint)] px-5 py-4"), detail.indexOf("{q.supplement}"));
  assert(!/text-white/.test(header), "淡い地色の上に白文字を残していない");
}

console.log("Test 8: テーマの外（匿名 Worksheet /worksheet）の見た目は変わっていない");
{
  assert(globals.includes("--ws-tint: var(--worksheet-sage);"), "既定の地色は従来のセージ");
  assert(globals.includes("--ws-tint-hover: var(--worksheet-sage-hover);"), "既定の hover も従来どおり");
  assert(globals.includes("--ws-ink: var(--worksheet-primary);"), "既定の文字色も従来どおり");
  assert(globals.includes("--worksheet-sage: #dde8e1;"), "--worksheet-sage 自体は変えていない（Chat・AppNav でも使う）");
  assert(globals.includes("--worksheet-sage-hover: #c9ddd2;"), "--worksheet-sage-hover も変えていない");
  assert(
    !worksheet.includes("style={worksheetSectionThemeVars"),
    "匿名 Worksheet 側でテーマ変数を上書きしていない",
  );
}

console.log("Test 9: 進捗・保存・導線のロジックに触れていない");
{
  assert(detail.includes("useWorksheetAnswers(planId, karte, serverWorksheet)"), "回答 state は既存フックのまま");
  assert(detail.includes("isQuestionAnswered(q)"), "回答済み判定は既存のまま");
  assert(detail.includes("category.questions.map((q, i) =>"), "設問の並びは既存のまま");
  assert(
    detail.includes("`/plans/${planId}/worksheet/${nextCategory.id}`"),
    "次のテーマへの遷移先は既存のまま",
  );
  assert(!/\/api\/(?!worksheet-summary)/.test(detail), "新しい API を作っていない");
}

console.log(`\npassed: ${pass} / failed: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
