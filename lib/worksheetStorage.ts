/**
 * ワークシートの回答をブラウザのlocalStorageに保存・復元する薄いユーティリティ。
 * ここでは保存形式のバージョンだけを見る。質問id・項目idレベルの妥当性チェック
 * （カテゴリ・項目が将来増減した場合の後方互換）は sanitizeWorksheetState が担う。
 * ログイン・DB・サーバー保存は行わない（このブラウザだけに閉じた保存）。
 */

const STORAGE_KEY = "ryugaku-worksheet-answers";
const STORAGE_VERSION = 1;

/**
 * planId未指定時は既存の固定キーをそのまま返す（/worksheetの匿名利用に影響を与えない）。
 * planIdがあれば、そのPlan専用の別名前空間キーを返す（/plans/[planId]/worksheet用）。
 */
function getStorageKey(planId?: string): string {
  return planId ? `${STORAGE_KEY}:plan:${planId}` : STORAGE_KEY;
}

export type WorksheetPersistedData = {
  answers: Record<string, string>;
  ratings: Record<string, Record<string, 1 | 2 | 3 | 4 | 5>>;
  rankings: Record<string, string[]>;
  compromises: Record<string, string[]>;
  singleSelections: Record<string, string>;
  multiSelections: Record<string, string[]>;
};

type StoredPayload = WorksheetPersistedData & { version: number };

function emptyData(): WorksheetPersistedData {
  return {
    answers: {},
    ratings: {},
    rankings: {},
    compromises: {},
    singleSelections: {},
    multiSelections: {},
  };
}

/** 保存に失敗しても（プライベートブラウジング等）例外を投げず、静かに諦める */
export function saveWorksheetState(data: WorksheetPersistedData, planId?: string): void {
  try {
    const payload: StoredPayload = { version: STORAGE_VERSION, ...data };
    window.localStorage.setItem(getStorageKey(planId), JSON.stringify(payload));
  } catch {
    // 保存できなくても入力自体は継続できるため、握りつぶす
  }
}

/**
 * 壊れたデータ・バージョン不一致なら null を返す。呼び出し側はその場合、
 * 復元をスキップして初期状態のまま続行すればよい。
 */
export function loadWorksheetState(planId?: string): WorksheetPersistedData | null {
  try {
    const raw = window.localStorage.getItem(getStorageKey(planId));
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const { version } = parsed as Record<string, unknown>;
    if (version !== STORAGE_VERSION) return null;

    const data = parsed as Partial<StoredPayload>;
    const empty = emptyData();
    return {
      answers: isRecord(data.answers) ? data.answers : empty.answers,
      ratings: isRecord(data.ratings) ? data.ratings : empty.ratings,
      rankings: isRecord(data.rankings) ? data.rankings : empty.rankings,
      compromises: isRecord(data.compromises) ? data.compromises : empty.compromises,
      singleSelections: isRecord(data.singleSelections) ? data.singleSelections : empty.singleSelections,
      multiSelections: isRecord(data.multiSelections) ? data.multiSelections : empty.multiSelections,
    };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** 復元時に「今のカテゴリ・項目に存在するid」だけを残すために渡す集合 */
export type WorksheetValidIds = {
  questionIds: Set<string>;
  priorityItemIds: Set<string>;
  compromiseNoneId: string;
  readinessOptionIds: Set<string>;
  topicOptionIds: Set<string>;
};

/**
 * 存在しない質問id・項目idのデータを黙って捨てる。
 * カテゴリ・項目が将来増減しても、保存済みデータと齟齬が出た分だけ安全に無視できるようにする。
 */
export function sanitizeWorksheetState(
  data: WorksheetPersistedData,
  valid: WorksheetValidIds,
): WorksheetPersistedData {
  const answers: Record<string, string> = {};
  for (const [questionId, value] of Object.entries(data.answers)) {
    if (valid.questionIds.has(questionId) && typeof value === "string") {
      answers[questionId] = value;
    }
  }

  const ratings: WorksheetPersistedData["ratings"] = {};
  for (const [questionId, itemRatings] of Object.entries(data.ratings)) {
    if (!valid.questionIds.has(questionId) || !isRecord(itemRatings)) continue;
    const cleaned: Record<string, 1 | 2 | 3 | 4 | 5> = {};
    for (const [itemId, value] of Object.entries(itemRatings)) {
      if (valid.priorityItemIds.has(itemId) && [1, 2, 3, 4, 5].includes(value as number)) {
        cleaned[itemId] = value as 1 | 2 | 3 | 4 | 5;
      }
    }
    ratings[questionId] = cleaned;
  }

  const rankings = sanitizeIdListMap(data.rankings, valid.questionIds, valid.priorityItemIds);
  const compromises = sanitizeIdListMap(
    data.compromises,
    valid.questionIds,
    valid.priorityItemIds,
    valid.compromiseNoneId,
  );
  const multiSelections = sanitizeIdListMap(data.multiSelections, valid.questionIds, valid.topicOptionIds);

  const singleSelections: Record<string, string> = {};
  for (const [questionId, optionId] of Object.entries(data.singleSelections)) {
    if (
      valid.questionIds.has(questionId) &&
      typeof optionId === "string" &&
      valid.readinessOptionIds.has(optionId)
    ) {
      singleSelections[questionId] = optionId;
    }
  }

  return { answers, ratings, rankings, compromises, singleSelections, multiSelections };
}

function sanitizeIdListMap(
  record: Record<string, string[]>,
  validQuestionIds: Set<string>,
  validItemIds: Set<string>,
  extraAllowedId?: string,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [questionId, ids] of Object.entries(record)) {
    if (!validQuestionIds.has(questionId) || !Array.isArray(ids)) continue;
    result[questionId] = ids.filter(
      (id) => typeof id === "string" && (validItemIds.has(id) || id === extraAllowedId),
    );
  }
  return result;
}
