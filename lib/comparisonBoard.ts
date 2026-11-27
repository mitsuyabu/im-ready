/**
 * Comparison Board（比較ボード）の **データモデルだけ** を持つ pure レイヤー。
 *
 * Comparison Board は「迷っている留学プランの候補案を、同じ項目で並べて見比べる」ための機能。
 * 例: シドニーに 1 年行く案 / メルボルンに半年行く案 / カナダに半年行く案。
 *
 * ここに置かないもの（意図的な分離。将来 DB 保存・AI 連携を足すときにここを変えずに済ませる）:
 *   - localStorage の読み書き        → lib/comparisonBoardStorage.ts
 *   - React の state・画面           → components/ComparisonBoard.tsx
 *   - Supabase / API / Anthropic     → 一切呼ばない（このファイルは pure function のみ）
 *
 * 重要な前提:
 *   - ここでいう「候補案（ComparisonOption）」は **plans テーブルの Plan とは別概念**。
 *     案を増やしても新しい Plan は作らない。Plan 1 件の中の検討メモとして閉じている。
 *   - AI による自動生成・評価・ランキング・予算推定・都市やビザ情報の補完は一切しない。
 *     順位・スコア・適合率にあたる field をモデルに持たせない（持たせれば UI がいつか出してしまう）。
 *   - Karte からのコピーは **ユーザーが明示的に選んだときだけ** 呼ばれる関数として提供する
 *     （buildOptionFromConditionSlots）。読み込み時に自動で既存データを候補案へ確定しない。
 */

import type { ConditionSlot, ConditionSlotId } from "@/lib/karteConditionSlots";

/** 比較表の行（比較項目）。縦軸。 */
export type ComparisonFieldId =
  | "country"
  | "city"
  | "visa"
  | "departure"
  | "duration"
  | "budget"
  | "study"
  | "accommodation"
  | "work"
  | "appeal"
  | "concern";

export type ComparisonFieldDef = {
  id: ComparisonFieldId;
  label: string;
  /** 入力欄の種類。long は複数行（魅力・気になる点のような自由記述）。 */
  kind: "short" | "long";
  /** 入力欄の placeholder。例示であって初期値ではない（値としては保存しない）。 */
  placeholder: string;
};

/**
 * 比較項目の定義と並び順。**ここが唯一の定義元**で、表のヘッダー行・入力欄・
 * Karte からのコピー対象はすべてこの配列から導出する。
 *
 * placeholder は「どう書けばよいか」を示す例示で、値ではない。空欄のまま保存すれば
 * 「未定」として表示される（架空の国名・金額・学校名を実データとして出さない）。
 */
export const COMPARISON_FIELDS: ComparisonFieldDef[] = [
  { id: "country", label: "国", kind: "short", placeholder: "例: オーストラリア" },
  { id: "city", label: "都市", kind: "short", placeholder: "例: シドニー" },
  { id: "visa", label: "ビザ", kind: "short", placeholder: "例: 学生ビザ / ワーホリ" },
  { id: "departure", label: "出発時期", kind: "short", placeholder: "例: 来年の春ごろ" },
  { id: "duration", label: "期間", kind: "short", placeholder: "例: 1年" },
  { id: "budget", label: "予算", kind: "short", placeholder: "例: 200万円くらい" },
  { id: "study", label: "語学学校", kind: "short", placeholder: "例: 3か月通う" },
  { id: "accommodation", label: "滞在方法", kind: "short", placeholder: "例: シェアハウス" },
  { id: "work", label: "現地での仕事", kind: "short", placeholder: "例: 働きたい" },
  { id: "appeal", label: "魅力", kind: "long", placeholder: "この案のどこが魅力的か" },
  { id: "concern", label: "気になる点", kind: "long", placeholder: "不安なこと・引っかかること" },
];

export const COMPARISON_FIELD_IDS: ComparisonFieldId[] = COMPARISON_FIELDS.map((f) => f.id);

/** 比較表の列（候補案）。横軸。 */
export type ComparisonOption = {
  /** 画面内で一意。localStorage 上の識別子でもある。 */
  id: string;
  /** ユーザーが付ける案の名前。空文字も許す（UI 側で「案 1」等の既定表示にする）。 */
  name: string;
  /** 比較項目ごとの値。未入力の項目はキーを持たないか空文字（＝未定）。 */
  values: Partial<Record<ComparisonFieldId, string>>;
};

export type ComparisonBoardState = {
  options: ComparisonOption[];
};

/** 初期実装の上限。3 案までに留める（PC で 3 案を同時に見られる幅に収めるため）。 */
export const MAX_COMPARISON_OPTIONS = 3;

/** 1 つの値の最大長。壊れた・極端に長い保存データで画面が壊れないようにする安全弁。 */
export const MAX_COMPARISON_VALUE_LENGTH = 2000;
/** 案の名前の最大長。 */
export const MAX_COMPARISON_NAME_LENGTH = 60;

/** 未入力の比較項目に出す文言。 */
export const COMPARISON_UNDECIDED_TEXT = "未定";

export function emptyComparisonBoard(): ComparisonBoardState {
  return { options: [] };
}

/** 名前が空の案に出す既定の見出し（1 始まり）。架空の国名・都市名は使わない。 */
export function comparisonOptionDisplayName(option: ComparisonOption, index: number): string {
  const trimmed = option.name.trim();
  return trimmed.length > 0 ? trimmed : `案${index + 1}`;
}

/**
 * 新しい案の id。crypto.randomUUID が使えない環境でも衝突しにくい値にフォールバックする
 * （古い Safari・一部の埋め込み WebView 対策）。
 */
function newOptionId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // randomUUID が使えない環境。下のフォールバックへ。
  }
  return `opt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 空欄の案を 1 件作る（値は何も入れない）。 */
export function createEmptyOption(name = ""): ComparisonOption {
  return { id: newOptionId(), name: name.slice(0, MAX_COMPARISON_NAME_LENGTH), values: {} };
}

/**
 * 上限に達していなければ案を 1 件足した新しい state を返す（達していれば入力をそのまま返す）。
 * 既存の案は一切書き換えない（入力中の内容を失わせない）。
 */
export function addOption(
  state: ComparisonBoardState,
  option: ComparisonOption = createEmptyOption(),
): ComparisonBoardState {
  if (state.options.length >= MAX_COMPARISON_OPTIONS) return state;
  return { options: [...state.options, option] };
}

export function removeOption(state: ComparisonBoardState, optionId: string): ComparisonBoardState {
  return { options: state.options.filter((o) => o.id !== optionId) };
}

export function renameOption(
  state: ComparisonBoardState,
  optionId: string,
  name: string,
): ComparisonBoardState {
  return {
    options: state.options.map((o) =>
      o.id === optionId ? { ...o, name: name.slice(0, MAX_COMPARISON_NAME_LENGTH) } : o,
    ),
  };
}

export function setOptionValue(
  state: ComparisonBoardState,
  optionId: string,
  field: ComparisonFieldId,
  value: string,
): ComparisonBoardState {
  return {
    options: state.options.map((o) =>
      o.id === optionId
        ? { ...o, values: { ...o.values, [field]: value.slice(0, MAX_COMPARISON_VALUE_LENGTH) } }
        : o,
    ),
  };
}

/** 表示用の値。未入力・空白だけなら null（UI 側が「未定」を出す）。 */
export function optionValue(option: ComparisonOption, field: ComparisonFieldId): string | null {
  const raw = option.values[field];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** その案に 1 つでも入力があるか（名前だけの案と区別する）。 */
export function hasAnyValue(option: ComparisonOption): boolean {
  return COMPARISON_FIELD_IDS.some((id) => optionValue(option, id) !== null);
}

/* ------------------------------------------------------------------ */
/* Karte の希望・条件から案を作る（ユーザーが明示的に選んだときだけ）        */
/* ------------------------------------------------------------------ */

/**
 * ConditionSlotId → ComparisonFieldId の対応。
 * 「就学期間」は比較表では「語学学校」欄にまとめるため、study へ寄せる前に
 * study 欄が空のときだけ使う（下の buildOptionFromConditionSlots を参照）。
 */
const SLOT_TO_FIELD: Partial<Record<ConditionSlotId, ComparisonFieldId>> = {
  country: "country",
  city: "city",
  visa: "visa",
  departure: "departure",
  duration: "duration",
  budget: "budget",
  study: "study",
  accommodation: "accommodation",
  work: "work",
};

/**
 * 現在の Karte の希望・条件（ConditionSlot）を**コピーして**案を 1 件作る。
 *
 * 呼ばれるのはユーザーが「今の条件からコピーして作る」を選んだときだけ。
 * コピーするのは state === "stated" のスロットのみで、unknown / undecided / conflict は
 * コピーしない（AI の仮説・未確定の値を候補案として確定させない）。
 * 複数候補は「、」で連結してそのまま入れる（1 つに絞らない）。
 * 魅力・気になる点は Karte に対応する事実が無いので空欄のまま（AI に書かせない）。
 */
export function buildOptionFromConditionSlots(
  slots: readonly ConditionSlot[],
  name: string,
): ComparisonOption {
  const option = createEmptyOption(name);
  const bySlot = new Map(slots.map((s) => [s.id, s] as const));

  for (const [slotId, fieldId] of Object.entries(SLOT_TO_FIELD) as [
    ConditionSlotId,
    ComparisonFieldId,
  ][]) {
    const slot = bySlot.get(slotId);
    if (!slot || slot.state !== "stated" || slot.values.length === 0) continue;
    option.values[fieldId] = slot.values.join("、").slice(0, MAX_COMPARISON_VALUE_LENGTH);
  }

  // 就学期間は専用の列を持たないので、語学学校欄が空のときだけそこへ入れる。
  const studyDuration = bySlot.get("studyDuration");
  if (!option.values.study && studyDuration?.state === "stated" && studyDuration.values.length > 0) {
    option.values.study = studyDuration.values.join("、").slice(0, MAX_COMPARISON_VALUE_LENGTH);
  }

  return option;
}

/** コピー元になる stated なスロットが 1 つでもあるか（コピーボタンの出し分けに使う）。 */
export function canCopyFromConditionSlots(slots: readonly ConditionSlot[]): boolean {
  return slots.some(
    (s) => s.state === "stated" && s.values.length > 0 && SLOT_TO_FIELD[s.id] !== undefined,
  );
}

/* ------------------------------------------------------------------ */
/* sanitize（壊れた保存データでも画面を落とさない）                       */
/* ------------------------------------------------------------------ */

function sanitizeOption(raw: unknown): ComparisonOption | null {
  if (typeof raw !== "object" || raw === null) return null;
  const rec = raw as Record<string, unknown>;

  const id = typeof rec.id === "string" && rec.id.trim().length > 0 ? rec.id : newOptionId();
  const name = typeof rec.name === "string" ? rec.name.slice(0, MAX_COMPARISON_NAME_LENGTH) : "";

  const values: Partial<Record<ComparisonFieldId, string>> = {};
  const rawValues = rec.values;
  if (typeof rawValues === "object" && rawValues !== null) {
    const valueRec = rawValues as Record<string, unknown>;
    // 既知の比較項目だけを採用する（将来項目が減ったときに未知のキーを持ち回らない）。
    for (const field of COMPARISON_FIELD_IDS) {
      const v = valueRec[field];
      if (typeof v === "string" && v.length > 0) {
        values[field] = v.slice(0, MAX_COMPARISON_VALUE_LENGTH);
      }
    }
  }

  return { id, name, values };
}

/**
 * 任意の値（localStorage から読んだ JSON 等）を安全な ComparisonBoardState へ変換する。
 * 壊れていれば空のボードを返す。例外は投げない。
 * 上限を超える案は切り捨てる（保存形式が変わっても画面が壊れないようにする）。
 */
export function sanitizeComparisonBoard(raw: unknown): ComparisonBoardState {
  if (typeof raw !== "object" || raw === null) return emptyComparisonBoard();
  const rec = raw as Record<string, unknown>;
  if (!Array.isArray(rec.options)) return emptyComparisonBoard();

  const options: ComparisonOption[] = [];
  const seenIds = new Set<string>();
  for (const entry of rec.options) {
    if (options.length >= MAX_COMPARISON_OPTIONS) break;
    const option = sanitizeOption(entry);
    if (!option) continue;
    // id の重複は React の key と編集対象の特定を壊すため、後から来たものに新しい id を振る。
    if (seenIds.has(option.id)) option.id = newOptionId();
    seenIds.add(option.id);
    options.push(option);
  }
  return { options };
}
