import type { CSSProperties } from "react";

/**
 * Worksheet のテーマ別カラー（一覧カードと詳細画面の**唯一の定義元**）。
 *
 * 以前は同じ 6 テーマの色が 2 か所にあった:
 *   - components/WorksheetSectionList.tsx の SECTION_THEME（淡いフッター帯 + イラストの塗り）
 *   - components/WorksheetSectionDetail.tsx の SECTION_HEADER（濃い帯 + 白文字）
 * 後者は前者と別系統の色だったため、一覧の表紙と質問画面でテーマが繋がっていなかった。
 * ここに集約したので、色を変えれば一覧カードと詳細画面の両方に同時に反映される。
 *
 * 4 つの役割を分けているのは、1 つの色では「面」と「文字」の両方を満たせないため:
 *   - tint      : 面として敷く地色。白との差が約 1.1 倍しかない淡さなので、文字色には使えない。
 *                 一覧カードのフッター帯 と 詳細画面の質問カードヘッダーの地色。
 *   - tintHover : tint を 7% 暗くしたもの。tint を敷いたボタンの hover。
 *   - accent    : 塗り（面）として見せるアクセント。一覧カードのイラストの塗りに使う。
 *                 白とのコントラストは 1.40〜1.55 なので、**文字や細い線には使わない**。
 *   - ink       : 文字・小さなアイコン用。accent と同系の色相を保ったまま、白地でも tint 地でも
 *                 AA（4.5:1）を満たす濃さにしてある（白地 6.20〜6.71 / tint 地 5.65〜5.99）。
 *
 * 6 テーマで「見た目の重さ」を揃えるため、ink は白地コントラストを 6.2〜6.7 の幅に収めている。
 * 色を足す・変えるときもこの幅を外さないこと（片方のテーマだけ目立つ原因になる）。
 */

export type WorksheetSectionTheme = {
  /** 面として敷く地色（淡い）。文字色には使わない。 */
  tint: string;
  /** tint を敷いたボタンの hover（tint を 7% 暗くしたもの）。 */
  tintHover: string;
  /** 塗りとして見せるアクセント（淡い）。文字・細線には使わない。 */
  accent: string;
  /** 文字・小さなアイコン用。白地 / tint 地のどちらでも AA を満たす。 */
  ink: string;
};

export const WORKSHEET_SECTION_THEME: Record<string, WorksheetSectionTheme> = {
  // 01 WHY — 淡いピーチ
  motivation: { tint: "#fff1ea", tintHover: "#ede0da", accent: "#f0c9b5", ink: "#8a4f33" },
  // 02 MY FUTURE — 淡いブルー
  future: { tint: "#edf6f7", tintHover: "#dce5e6", accent: "#c6dde2", ink: "#2f6473" },
  // 03 CONDITIONS — 淡いセージ
  conditions: { tint: "#f0f5e9", tintHover: "#dfe4d9", accent: "#c9ddd2", ink: "#456648" },
  // 04 MY PRIORITIES — 淡いクリーム
  priorities: { tint: "#fff6df", tintHover: "#ede5cf", accent: "#ecd8a8", ink: "#7a5a1e" },
  // 05 WORRIES — 淡いラベンダー
  anxiety: { tint: "#f5f0f8", tintHover: "#e4dfe7", accent: "#d7cbe6", ink: "#685284" },
  // 06 NEXT STEP — 淡いブルーグリーン
  nextstep: { tint: "#eef6f4", tintHover: "#dde5e3", accent: "#c3ddd6", ink: "#2f6b5e" },
};

/**
 * 未知の sectionId 用のニュートラル。CATEGORIES は 6 テーマ固定なので通常は使われないが、
 * テーマが増えたときに「色が付かないだけ」で壊れないようにしておく。
 */
export const WORKSHEET_SECTION_THEME_FALLBACK: WorksheetSectionTheme = {
  tint: "#f4f2ed",
  tintHover: "#e3e1dc",
  accent: "#d8d4cb",
  ink: "#5b5a55",
};

export function worksheetSectionTheme(sectionId: string): WorksheetSectionTheme {
  return WORKSHEET_SECTION_THEME[sectionId] ?? WORKSHEET_SECTION_THEME_FALLBACK;
}

/** #rrggbb に alpha を付けて rgba() にする（装飾の薄い塗り用）。 */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 詳細画面側でテーマを CSS 変数として流し込むための style。
 * hover を Tailwind のクラスで書けるようにするため、inline の色指定ではなく変数で渡している
 * （変数なので、ネストした子コンポーネント＝共通の QuestionExamples にもそのまま届く）。
 *
 * 装飾の alpha は従来のデザインの考え方（大きな番号・曲線・点を地色に薄く沈ませる）を維持する。
 * 白→濃色に反転したぶん、同じ alpha では弱く見えるので番号だけ 0.26 に揃えてあり、
 * 地色に対する見え方は従来（1.35〜1.63）と同じ 1.44〜1.46 に収まっている。
 */
export function worksheetSectionThemeVars(theme: WorksheetSectionTheme): CSSProperties {
  return {
    "--ws-tint": theme.tint,
    "--ws-tint-hover": theme.tintHover,
    "--ws-accent": theme.accent,
    "--ws-ink": theme.ink,
    /** 質問カードの大きな番号 */
    "--ws-ink-numeral": withAlpha(theme.ink, 0.26),
    /** ヘッダー右側の曲線 */
    "--ws-ink-line": withAlpha(theme.ink, 0.26),
    /** 曲線の先の点 */
    "--ws-ink-dot": withAlpha(theme.ink, 0.45),
  } as CSSProperties;
}
