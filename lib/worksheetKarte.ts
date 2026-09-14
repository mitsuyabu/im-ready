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
import type { ChoiceOption } from "@/lib/worksheetNextStep";
import {
  ACCOMMODATION_OPTIONS,
  CITY_OPTIONS,
  DEPARTURE_TIMING_OPTIONS,
  ENGLISH_LEVEL_OPTIONS,
  OCCUPATION_OPTIONS,
  STUDY_FORMAT_OPTIONS,
  concreteLabels,
  optionLabel,
} from "@/lib/worksheetConditions";

const READINESS_TO_LEANING: Record<string, "going" | "not_going" | "undecided"> = {
  asap: "going",
  leaningNo: "not_going",
  undecided: "undecided",
};

/**
 * 「選択 + 自由記入」設問を 1 つの文字列にする。
 *   - 「その他」だけは値を持たないので、自由記入があればそれだけを使い、無ければ値なし
 *   - それ以外は「ラベル（自由記入）」。自由記入が無ければラベルだけ
 * 選択が無く自由記入だけの場合は自由記入をそのまま使う（旧 freeText 設問の保存済み回答との互換）。
 * 言い換え・要約・単位変換はしない。
 */
function selectionWithNote(
  options: ChoiceOption[],
  selectedId: string | undefined,
  rawNote: string | undefined,
): string | undefined {
  const note = rawNote?.trim() ? rawNote.trim() : undefined;
  if (!selectedId) return note;
  if (selectedId.endsWith("-other")) return note;
  const label = optionLabel(options, selectedId);
  if (!label) return note;
  return note ? `${label}（${note}）` : label;
}

/** "ぜひ働きたい / できれば働きたい" → true、"働く予定はない" → false。曖昧な選択肢は写さない。 */
const LOCAL_WORK_TO_WANTS_TO_WORK: Record<string, boolean> = {
  "work-strong": true,
  "work-prefer": true,
  "work-none": false,
};

export function deriveWorksheetKartePatch(data: WorksheetPersistedData): KartePatch {
  const patch: KartePatch = {};

  const regret = data.answers["regret"]?.trim();
  if (regret) {
    patch.motivation = { ...patch.motivation, regretIfNotGo: { value: regret, certainty: "stated" } };
  }

  // 英語力: 選択ラベル ＋ 自由記入（スコアや得意・苦手）。選択式化する前の自由記入だけの
  // 保存済み回答も、そのまま同じ値になる（既存の同期結果を変えない）。
  const englishLevel = selectionWithNote(
    ENGLISH_LEVEL_OPTIONS,
    data.singleSelections["english-level"],
    data.answers["english-level"],
  );
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

  /* ---- 現実条件（conditions）。意味が完全に一致する Karte field にだけ写す ----
   * 写さないもの（対応 field が無い / 変換に解釈が要る）:
   *   希望する国      … Karte に「希望国」field が無い（constraints.avoidCountries は逆の意味）
   *   留学期間 / 就学期間 … timing.durationWeeks は「週」の数値。「半年」を週へ換算しない
   *   予算            … budget.totalCap は円の数値。「100〜150万円」を1つの数値にしない
   *   学校・仕事の調整 / 家族への共有 … 対応する field が無い
   * これらは Worksheet にだけ保存する（近い意味の field へ無理に入れない）。 */

  const departureTiming = selectionWithNote(
    DEPARTURE_TIMING_OPTIONS,
    data.singleSelections["timing"],
    data.answers["timing"],
  );
  if (departureTiming) {
    patch.timing = { ...patch.timing, departureTiming: { value: departureTiming, certainty: "stated" } };
  }

  const ageRaw = data.answers["age"]?.trim();
  if (ageRaw && /^\d{1,3}$/.test(ageRaw)) {
    const age = Number(ageRaw);
    if (age >= 10 && age <= 99) {
      patch.profile = { ...patch.profile, age: { value: age, certainty: "stated" } };
    }
  }

  const occupation = selectionWithNote(
    OCCUPATION_OPTIONS,
    data.singleSelections["occupation"],
    data.answers["occupation"],
  );
  if (occupation) {
    patch.profile = { ...patch.profile, occupation: { value: occupation, certainty: "stated" } };
  }

  // 都市は「具体的な都市を1つだけ選んでいる」ときだけ写す。複数候補のうちどれが希望かは
  // 決まっていないため、schoolPrefs.preferredCity（単数）へは入れない。
  const selectedCities = concreteLabels(CITY_OPTIONS, data.multiSelections["destination-city"] ?? []);
  if (selectedCities.length === 1) {
    patch.schoolPrefs = {
      ...patch.schoolPrefs,
      preferredCity: { value: selectedCities[0], certainty: "stated" },
    };
  }

  const studyFormats = concreteLabels(STUDY_FORMAT_OPTIONS, data.multiSelections["study-format"] ?? []);
  if (studyFormats.length > 0) {
    patch.schoolPrefs = {
      ...patch.schoolPrefs,
      courseType: { value: studyFormats.join("／"), certainty: "stated" },
    };
  }

  const stays = concreteLabels(ACCOMMODATION_OPTIONS, data.multiSelections["accommodation"] ?? []);
  if (stays.length > 0) {
    patch.schoolPrefs = {
      ...patch.schoolPrefs,
      accommodation: { value: stays.join("／"), certainty: "stated" },
    };
  }

  const localWork = data.singleSelections["local-work"];
  const wantsToWork = localWork ? LOCAL_WORK_TO_WANTS_TO_WORK[localWork] : undefined;
  if (wantsToWork !== undefined) {
    patch.work = { ...patch.work, wantsToWork: { value: wantsToWork, certainty: "stated" } };
  }

  const readiness = data.singleSelections["nextstep-readiness"];
  const leaning = readiness ? READINESS_TO_LEANING[readiness] : undefined;
  if (leaning) {
    patch.decision = { ...patch.decision, leaning: { value: leaning, certainty: "stated" } };
  }

  return patch;
}
