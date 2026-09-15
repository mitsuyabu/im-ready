/**
 * Worksheetの回答から、Karteへdeterministicに反映できる項目だけを抽出する。
 * AI解釈は行わない（LLMを呼ばない）。設問文とKarte Fieldの定義を突き合わせ、
 * 「意味が同じ」と確認できたものだけに限定している（詳細は設計時の検討記録を参照）。
 *
 * ここで作るのは通常の KartePatch（Chat側の抽出結果と同じ型）。source は
 * kartePatchToFieldPatches(patch, "worksheet") で呼び出し側が付与する。
 */

import type { FieldPatch, Karte, KartePatch } from "@/lib/karte";
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
  isCourseTypeOptionId,
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

  // 「学校には通わない予定」は学び方の種類ではないので courseType に入れない
  // （入れると学校提案の gate が「コース種別あり」と誤判定する）。
  const selectedFormats = data.multiSelections["study-format"] ?? [];
  const studyFormats = STUDY_FORMAT_OPTIONS.filter(
    (o) => selectedFormats.includes(o.id) && isCourseTypeOptionId(o.id),
  ).map((o) => o.label);
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

/**
 * Karte に **すでに同じ内容で入っている** Worksheet 由来の書き込みを取り除く。
 *
 * Worksheet 画面を開くたびに全項目を apply_karte_patch へ送り直すと、値は変わらないのに
 * meta.updatedAt だけが進み、不要な write になる。そこで「その field が stated・source=worksheet・
 * 値が完全一致」のものだけを送らない。1 つでも条件が違えば（Chat 側が別の値を持つ・conflict 中・
 * inferred 等）送る。裁定そのものは従来どおり RPC に任せ、ここでは判断を増やさない。
 */
export function dropUnchangedWorksheetPatches(fieldPatches: FieldPatch[], karte: Karte | null): FieldPatch[] {
  if (!karte) return fieldPatches;
  const conflictKeys = new Set((karte.handoff?.conflicts ?? []).map((c) => `${c.block}.${c.key}`));
  return fieldPatches.filter((p) => {
    if (conflictKeys.has(`${p.block}.${p.key}`)) return true;
    const block = karte[p.block] as Record<string, { value?: unknown; certainty?: string; source?: string }> | undefined;
    const field = block?.[p.key];
    if (!field || field.certainty !== "stated" || field.source !== "worksheet") return true;
    return JSON.stringify(field.value) !== JSON.stringify(p.value);
  });
}
