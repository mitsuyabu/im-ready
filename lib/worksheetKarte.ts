/**
 * Worksheetの回答から、Karteへdeterministicに反映できる項目だけを抽出する。
 * AI解釈は行わない（LLMを呼ばない）。設問文とKarte Fieldの定義を突き合わせ、
 * 「意味が同じ」と確認できたものだけに限定している（詳細は設計時の検討記録を参照）。
 *
 * ここで作るのは通常の KartePatch（Chat側の抽出結果と同じ型）。source は
 * kartePatchToFieldPatches(patch, "worksheet") で呼び出し側が付与する。
 */

import type { KartePatch } from "@/lib/karte";
import type { WorksheetPersistedData } from "@/lib/worksheetStorage";

const READINESS_TO_LEANING: Record<string, "going" | "not_going" | "undecided"> = {
  asap: "going",
  leaningNo: "not_going",
  undecided: "undecided",
};

export function deriveWorksheetKartePatch(data: WorksheetPersistedData): KartePatch {
  const patch: KartePatch = {};

  const regret = data.answers["regret"]?.trim();
  if (regret) {
    patch.motivation = { ...patch.motivation, regretIfNotGo: { value: regret, certainty: "stated" } };
  }

  const englishLevel = data.answers["english-level"]?.trim();
  if (englishLevel) {
    patch.language = { ...patch.language, selfLevel: { value: englishLevel, certainty: "stated" } };
  }

  const anxietyBiggest = data.answers["anxiety-biggest"]?.trim();
  if (anxietyBiggest) {
    patch.decision = { ...patch.decision, topConcern: { value: anxietyBiggest, certainty: "stated" } };
  }

  const safetyRating = data.ratings["priority-rating"]?.["safety"];
  if (safetyRating != null && safetyRating >= 4) {
    patch.lifestyle = { ...patch.lifestyle, safetyImportance: { value: "重視する", certainty: "stated" } };
  }

  const fewJapaneseRating = data.ratings["priority-rating"]?.["fewJapanese"];
  if (fewJapaneseRating != null && fewJapaneseRating >= 4) {
    patch.lifestyle = {
      ...patch.lifestyle,
      japaneseRatioPref: { value: "少なめが良い", certainty: "stated" },
    };
  }

  const readiness = data.singleSelections["nextstep-readiness"];
  const leaning = readiness ? READINESS_TO_LEANING[readiness] : undefined;
  if (leaning) {
    patch.decision = { ...patch.decision, leaning: { value: leaning, certainty: "stated" } };
  }

  return patch;
}
