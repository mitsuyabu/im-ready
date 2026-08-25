/**
 * ワークシート「優先順位」カテゴリの問1〜3（評価・順位・妥協）で共有する10項目。
 * クライアント（components/Worksheet.tsx）とサーバー（/api/worksheet-summary）の
 * 両方から参照する唯一の定義元。ここを直せば両方に反映される。
 */

export type PriorityItem = { id: string; label: string };

export const PRIORITY_ITEMS: PriorityItem[] = [
  { id: "english", label: "英語力をしっかり伸ばせる" },
  { id: "diversity", label: "いろいろな国の人と交流できる" },
  { id: "lifestyle", label: "海外らしい生活を経験できる" },
  { id: "work", label: "現地で働く経験ができる" },
  { id: "cost", label: "費用を抑えられる" },
  { id: "safety", label: "安心して生活できる" },
  { id: "support", label: "学校や周囲のサポートが充実している" },
  { id: "fewJapanese", label: "日本人が少ない環境に行ける" },
  { id: "location", label: "都市や立地が自分の好みに合う" },
  { id: "futureLink", label: "帰国後や将来につながる経験ができる" },
];

/** 「反対に妥協できるものは？」で、明示的に「無い」を選んだことを表すsentinel id */
export const COMPROMISE_NONE_ID = "none";
