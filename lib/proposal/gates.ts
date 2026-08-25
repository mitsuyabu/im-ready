/**
 * ゲート（C）。今回は最小限のみ実装する。
 *
 * 学校提案を出す前に最低限揃っていてほしい項目を判定する。揃っていなければ提案は出さず、
 * 足りない項目名だけを返す（会話側でそれを聞く）。必須項目リストは仮置きであり、
 * 厳密な調整は別ステップで行う。
 */

import type { Karte } from "@/lib/karte";

export interface GateResult {
  ready: boolean;
  missing: string[];
}

export function readyForSchoolProposal(karte: Karte): GateResult {
  const missing: string[] = [];

  if (!karte.schoolPrefs.preferredCity.value) {
    missing.push("schoolPrefs.preferredCity（希望する都市）");
  }
  if (karte.budget.totalCap.value == null && karte.budget.monthlyCap.value == null) {
    missing.push("budget.totalCap または budget.monthlyCap（予算）");
  }
  if (!karte.language.selfLevel.value) {
    missing.push("language.selfLevel（語学レベル）");
  }
  if (!karte.schoolPrefs.courseType.value) {
    missing.push("schoolPrefs.courseType（コース種別の希望）");
  }

  return { ready: missing.length === 0, missing };
}
