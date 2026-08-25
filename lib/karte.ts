/**
 * カルテのスキーマ。
 *
 * 各項目は値そのものではなく確度付きの Field<T> で持つ。
 * - "stated": 本人が明言した
 * - "inferred": 対話からAIが仮説として立てた（潜在ニーズ等。事実として引き継がない）
 * - "unknown": 未取得
 *
 * ブロックごとの項目一覧は *_SPEC 定数が唯一の情報源で、
 * 型・空カルテの初期値・tool use のスキーマ・入力サニタイズのすべてをここから導出する
 * （lib/prompt.ts の UPDATE_KARTE_TOOL もこの定数を参照する）。
 */

export type Certainty = "stated" | "inferred";
export type FieldCertainty = Certainty | "unknown";

/**
 * このFieldの値をどの経路が書いたか。
 * モデルには書かせない（tool schemaには含めない）。mergeKarte/Worksheet同期/DB側のapply_karte_patchが
 * システム側で機械的に付与する。source未設定（既存データ）はchat起源とみなす（後方互換）。
 */
export type FieldSource = "chat" | "worksheet" | "profile";

export type Field<T> = {
  value: T | null;
  certainty: FieldCertainty;
  source?: FieldSource;
};

function unknownField<T>(): Field<T> {
  return { value: null, certainty: "unknown" };
}

type FieldSpec =
  | { kind: "string"; description: string }
  | { kind: "number"; description: string }
  | { kind: "boolean"; description: string }
  | { kind: "string[]"; description: string }
  | { kind: "enum"; description: string; values: readonly string[] };

type BlockSpec = Record<string, FieldSpec>;

type FieldValueOf<S extends FieldSpec> = S extends { kind: "string" }
  ? string
  : S extends { kind: "number" }
    ? number
    : S extends { kind: "boolean" }
      ? boolean
      : S extends { kind: "string[]" }
        ? string[]
        : S extends { kind: "enum"; values: readonly (infer U)[] }
          ? U
          : never;

type BlockFromSpec<S extends BlockSpec> = {
  -readonly [K in keyof S]: Field<FieldValueOf<S[K]>>;
};

// ---- ブロック定義（14ブロックのうち、meta/proposals/handoffは §「非Field項目」参照） ----

export const PROFILE_SPEC = {
  age: { kind: "number", description: "年齢" },
  nationality: { kind: "string", description: "国籍" },
  residence: { kind: "string", description: "居住地" },
  occupation: { kind: "string", description: "職業（学生/社会人 等）" },
  status: { kind: "string", description: "現在の状況（在学中/離職中 等、自由記述）" },
} as const satisfies BlockSpec;

export const MOTIVATION_SPEC = {
  statedGoal: { kind: "string", description: "本人が明言した、留学を考え始めた理由・目標" },
  trueGoalHypothesis: {
    kind: "string",
    description: "対話から読み取れる本当の動機の仮説。必ず inferred として送ること",
  },
  regretIfNotGo: { kind: "string", description: "今行かなかったら後悔しそうか、についての整理" },
  desiredOutcome: { kind: "string", description: "留学で得たいこと" },
} as const satisfies BlockSpec;

export const LANGUAGE_SPEC = {
  selfLevel: { kind: "string", description: "自己申告の語学レベル" },
  testScores: { kind: "string", description: "保有スコア（TOEIC/IELTS 等）" },
  weakSkills: { kind: "string", description: "苦手なスキル（会話/リスニング 等）" },
  education: { kind: "string", description: "最終学歴・在学状況" },
  pathwayIntent: { kind: "boolean", description: "大学・専門学校等への進学意向があるか" },
} as const satisfies BlockSpec;

export const BUDGET_SPEC = {
  totalCap: { kind: "number", description: "総予算上限（円）" },
  monthlyCap: { kind: "number", description: "月あたり予算上限（円）" },
  fundingSource: { kind: "string", description: "資金源（自己資金/親の支援/ローン 等）" },
  flexibility: { kind: "string", description: "予算の融通のきき具合" },
} as const satisfies BlockSpec;

export const TIMING_SPEC = {
  durationWeeks: { kind: "number", description: "留学期間（週）" },
  departureTiming: { kind: "string", description: "希望渡航時期" },
  deadline: { kind: "string", description: "決めなければならない締め切り" },
  flexibility: { kind: "string", description: "時期の融通のきき具合" },
} as const satisfies BlockSpec;

export const WORK_SPEC = {
  wantsToWork: { kind: "boolean", description: "現地で働きたいか" },
  workingHolidayInterest: { kind: "boolean", description: "ワーキングホリデーへの関心" },
  postReturnCareer: { kind: "string", description: "帰国後のキャリアの希望・見通し" },
} as const satisfies BlockSpec;

export const LIFESTYLE_SPEC = {
  cityVsNature: { kind: "string", description: "都会派か自然派か" },
  climate: { kind: "string", description: "気候の好み" },
  safetyImportance: { kind: "string", description: "治安の重視度" },
  priceSensitivity: { kind: "string", description: "物価・生活費への敏感さ" },
  japaneseRatioPref: { kind: "string", description: "日本人の多さ・少なさの希望" },
} as const satisfies BlockSpec;

export const PERSONALITY_SPEC = {
  introExtro: { kind: "string", description: "内向的か外向的か" },
  needsHandholding: { kind: "string", description: "自走できるタイプか、伴走してほしいタイプか" },
  learningStyle: { kind: "string", description: "学び方の好み" },
} as const satisfies BlockSpec;

export const CONSTRAINTS_SPEC = {
  nonNegotiables: { kind: "string[]", description: "譲れない条件" },
  avoidCountries: { kind: "string[]", description: "避けたい国・地域" },
  health: { kind: "string", description: "健康上の配慮事項" },
  visaConstraints: { kind: "string", description: "ビザ上の制約" },
} as const satisfies BlockSpec;

export const SUPPORT_SPEC = {
  scope: { kind: "string[]", description: "サポートしてほしい範囲（出願/ビザ/住居/渡航後 等）" },
  needJapaneseSupport: { kind: "boolean", description: "日本語でのサポートが必要か" },
  contactPref: { kind: "string", description: "連絡手段の希望" },
} as const satisfies BlockSpec;

export const SCHOOL_PREFS_SPEC = {
  preferredCity: { kind: "string", description: "希望する都市名（例: シドニー）。自由記述" },
  courseType: { kind: "string", description: "コースの種類の希望" },
  accommodation: { kind: "string", description: "滞在スタイルの希望（ホームステイ/学生寮 等）" },
  sizeNationality: { kind: "string", description: "学校規模・国籍構成の希望" },
  startFlexibility: { kind: "string", description: "開始時期の融通" },
} as const satisfies BlockSpec;

export const DECISION_SPEC = {
  stage: {
    kind: "string",
    description: "検討段階（情報収集/比較中/N月以内に決めたい/ほぼ決定 等、自由記述）",
  },
  leaning: { kind: "enum", values: ["going", "not_going", "undecided"], description: "現時点の意向" },
  topConcern: { kind: "string", description: "いま一番の懸念点" },
  decisionOwner: {
    kind: "enum",
    values: ["self", "parent", "partner_consent_needed"],
    description: "意思決定者",
  },
} as const satisfies BlockSpec;

export const BLOCK_SPECS = {
  profile: PROFILE_SPEC,
  motivation: MOTIVATION_SPEC,
  language: LANGUAGE_SPEC,
  budget: BUDGET_SPEC,
  timing: TIMING_SPEC,
  work: WORK_SPEC,
  lifestyle: LIFESTYLE_SPEC,
  personality: PERSONALITY_SPEC,
  constraints: CONSTRAINTS_SPEC,
  support: SUPPORT_SPEC,
  schoolPrefs: SCHOOL_PREFS_SPEC,
  decision: DECISION_SPEC,
} as const;

export type BlockName = keyof typeof BLOCK_SPECS;

export type Profile = BlockFromSpec<typeof PROFILE_SPEC>;
export type Motivation = BlockFromSpec<typeof MOTIVATION_SPEC>;
export type Language = BlockFromSpec<typeof LANGUAGE_SPEC>;
export type Budget = BlockFromSpec<typeof BUDGET_SPEC>;
export type Timing = BlockFromSpec<typeof TIMING_SPEC>;
export type Work = BlockFromSpec<typeof WORK_SPEC>;
export type Lifestyle = BlockFromSpec<typeof LIFESTYLE_SPEC>;
export type Personality = BlockFromSpec<typeof PERSONALITY_SPEC>;
export type Constraints = BlockFromSpec<typeof CONSTRAINTS_SPEC>;
export type Support = BlockFromSpec<typeof SUPPORT_SPEC>;
export type SchoolPrefs = BlockFromSpec<typeof SCHOOL_PREFS_SPEC>;
export type Decision = BlockFromSpec<typeof DECISION_SPEC>;

// ---- 非Field項目 ----
// meta: システム管理項目（karteId/createdAt/updatedAt/mode）と、AIが書く要約文。
// 「本人が言った/AIが仮説を立てた」という確度の概念になじまないため Field でラップしない。
export type KarteMeta = {
  karteId: string;
  createdAt: string;
  updatedAt: string;
  mode: "text" | "voice";
  /** 3〜5行の要約。これが新規に埋まったことをUI側で「要約確認」表示のトリガーにする */
  summary: string | null;
};

// proposals: 提案パイプライン（lib/proposal/ が生成する）の結果を保存する。
// リッチ版（学校カード・地図等）で流用するため、表示用に間引かず構造化データのまま持つ。
export type ProposalCategory = "match" | "reference";

export type ProposalRecord = {
  type: "area" | "school" | "agent";
  id: string;
  category: ProposalCategory;
  reason: string;
  /** category="match"で2番手以降の見送り理由、または category="reference"の希望との相違点。1番手matchなら空文字 */
  caveat: string;
  placeId?: string;
};
export type RejectedProposalRecord = { type: "area" | "school" | "agent"; id: string; whyNot: string };
export type KarteProposals = {
  presented: ProposalRecord[];
  rejected: RejectedProposalRecord[];
  /** 第3層が match候補0件のときに書く、正直な前置き文 */
  introNote: string | null;
};

/**
 * 異なるsourceの stated 情報同士が食い違った場合にだけ作られる（AIのinferred仮説とstated情報の
 * 違いはここに含めない）。DB側のapply_karte_patchが唯一の書き手。値が一致すれば自動的に取り除かれる。
 */
export type KarteConflict = {
  block: BlockName;
  key: string;
  existingValue: unknown;
  existingSource: FieldSource;
  incomingValue: unknown;
  incomingSource: FieldSource;
};

// handoff: 確認・引き継ぎ用の状態。confirmKarte() / flagOpenQuestions() が更新する。
export type KarteHandoff = {
  confirmedItems: string[];
  openQuestions: string[];
  /** Chat由来・Worksheet由来のstated情報が食い違っている項目。Plan Chatのsystem promptへ別区画で渡す */
  conflicts: KarteConflict[];
  nextAction: string | null;
  consents: {
    infoSharing: boolean | null;
    recontact: boolean | null;
    personalData: boolean | null;
  };
  /**
   * ユーザーが条件確認の質問に答えず学校の推薦を求め続けている、と抽出LLMが判断したときに立つ内部シグナル。
   * ユーザーの事実・仮説ではないため Field でラップしない（certainty概念を持たない）。
   * /api/proposal が暫定提案を処理した時点で必ず false に戻す（lib/proposal/applyResult.ts）。
   */
  immediateProposalRequested: boolean;
};

export type Karte = {
  meta: KarteMeta;
  profile: Profile;
  motivation: Motivation;
  language: Language;
  budget: Budget;
  timing: Timing;
  work: Work;
  lifestyle: Lifestyle;
  personality: Personality;
  constraints: Constraints;
  support: Support;
  schoolPrefs: SchoolPrefs;
  decision: Decision;
  // TODO: 提案パイプライン（lib/proposal/engine.ts）実装後、ここに提示履歴を格納する
  proposals: KarteProposals;
  handoff: KarteHandoff;
};

function emptyBlock<S extends BlockSpec>(spec: S): BlockFromSpec<S> {
  const block: Record<string, Field<unknown>> = {};
  for (const key of Object.keys(spec)) {
    block[key] = unknownField();
  }
  return block as BlockFromSpec<S>;
}

export function createEmptyKarte(karteId: string, mode: "text" | "voice" = "text"): Karte {
  const now = new Date().toISOString();
  return {
    meta: { karteId, createdAt: now, updatedAt: now, mode, summary: null },
    profile: emptyBlock(PROFILE_SPEC),
    motivation: emptyBlock(MOTIVATION_SPEC),
    language: emptyBlock(LANGUAGE_SPEC),
    budget: emptyBlock(BUDGET_SPEC),
    timing: emptyBlock(TIMING_SPEC),
    work: emptyBlock(WORK_SPEC),
    lifestyle: emptyBlock(LIFESTYLE_SPEC),
    personality: emptyBlock(PERSONALITY_SPEC),
    constraints: emptyBlock(CONSTRAINTS_SPEC),
    support: emptyBlock(SUPPORT_SPEC),
    schoolPrefs: emptyBlock(SCHOOL_PREFS_SPEC),
    decision: emptyBlock(DECISION_SPEC),
    proposals: { presented: [], rejected: [], introNote: null },
    handoff: {
      confirmedItems: [],
      openQuestions: [],
      conflicts: [],
      nextAction: null,
      consents: { infoSharing: null, recontact: null, personalData: null },
      immediateProposalRequested: false,
    },
  };
}

// ---- update_karte ツール入力のサニタイズ ----
// tool use の入力は unknown として届くため、*_SPEC と照合しながら安全な KartePatch に変換する。
// certainty は "stated" | "inferred" のみ許可する（"unknown" は「まだ判明していない」を意味するため、
// パッチとして送る対象にはならない）。

export type KartePatch = {
  profile?: Partial<Profile>;
  motivation?: Partial<Motivation>;
  language?: Partial<Language>;
  budget?: Partial<Budget>;
  timing?: Partial<Timing>;
  work?: Partial<Work>;
  lifestyle?: Partial<Lifestyle>;
  personality?: Partial<Personality>;
  constraints?: Partial<Constraints>;
  support?: Partial<Support>;
  schoolPrefs?: Partial<SchoolPrefs>;
  decision?: Partial<Decision>;
  /** 3〜5行の要約。会話の区切りでAIが要約と確認を求めたターンにのみ含まれる */
  summary?: string;
  /** ユーザーが条件確認に答えず学校の推薦を求め続けている、と判断したターンにのみ含まれる（true固定） */
  immediateProposalRequested?: boolean;
};

function isPatchCertainty(value: unknown): value is Certainty {
  return value === "stated" || value === "inferred";
}

const PLACEHOLDER_TOKENS = new Set(["unknown", "n/a", "none", "null", "undefined"]);

/**
 * モデルが出力しがちな明らかなプレースホルダー値（例: "<UNKNOWN>"）を弾く。
 * 内容語の禁止リストは作らず、構造的に判定できるものだけに絞る:
 * - 山括弧で丸ごと囲まれている（<UNKNOWN> 等）
 * - unknown/n-a/none/null/undefined そのもの（大文字小文字を区別しない）
 */
function isPlaceholderValue(trimmed: string): boolean {
  if (/^<[^>]*>$/.test(trimmed)) return true;
  return PLACEHOLDER_TOKENS.has(trimmed.toLowerCase());
}

function extractField(raw: unknown, spec: FieldSpec): Field<unknown> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const { value, certainty } = raw as Record<string, unknown>;
  if (!isPatchCertainty(certainty)) return undefined;

  switch (spec.kind) {
    case "string": {
      if (typeof value !== "string" || value.trim().length === 0) return undefined;
      const trimmed = value.trim();
      if (isPlaceholderValue(trimmed)) return undefined;
      return { value: trimmed, certainty };
    }
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
      return { value, certainty };
    }
    case "boolean": {
      if (typeof value !== "boolean") return undefined;
      return { value, certainty };
    }
    case "string[]": {
      if (!Array.isArray(value)) return undefined;
      const arr = value.filter(
        (v): v is string => typeof v === "string" && v.trim().length > 0 && !isPlaceholderValue(v.trim()),
      );
      if (arr.length === 0) return undefined;
      return { value: arr, certainty };
    }
    case "enum": {
      if (typeof value !== "string" || !spec.values.includes(value)) return undefined;
      return { value, certainty };
    }
  }
}

function sanitizeBlock<S extends BlockSpec>(raw: unknown, spec: S): Partial<BlockFromSpec<S>> {
  if (!raw || typeof raw !== "object") return {};
  const src = raw as Record<string, unknown>;
  const out: Record<string, Field<unknown>> = {};
  for (const key of Object.keys(spec)) {
    const field = extractField(src[key], spec[key]);
    if (field) out[key] = field;
  }
  return out as Partial<BlockFromSpec<S>>;
}

/** モデルのツール入力（unknown）を検証し、安全な KartePatch に変換する */
export function sanitizeKartePatch(input: unknown): KartePatch {
  if (!input || typeof input !== "object") return {};
  const src = input as Record<string, unknown>;
  const patch: KartePatch = {};

  for (const block of Object.keys(BLOCK_SPECS) as BlockName[]) {
    const sanitized = sanitizeBlock(src[block], BLOCK_SPECS[block]);
    if (Object.keys(sanitized).length > 0) {
      (patch as Record<string, unknown>)[block] = sanitized;
    }
  }

  // 潜在ニーズ（trueGoalHypothesis）はモデルの出力に関わらず必ず inferred として扱う。
  // 事実として引き継がないための最後の砦なので、プロンプトでの指示に加えてコード側でも強制する。
  if (patch.motivation?.trueGoalHypothesis) {
    patch.motivation.trueGoalHypothesis = {
      ...patch.motivation.trueGoalHypothesis,
      certainty: "inferred",
    };
  }

  if (typeof src.summary === "string" && src.summary.trim().length > 0) {
    patch.summary = src.summary.trim();
  }

  if (typeof src.immediateProposalRequested === "boolean") {
    patch.immediateProposalRequested = src.immediateProposalRequested;
  }

  return patch;
}

/** 既存のカルテに、新たに判明した項目だけを差分マージする */
export function mergeKarte(current: Karte, patch: KartePatch): Karte {
  const merged: Karte = { ...current };

  for (const block of Object.keys(BLOCK_SPECS) as BlockName[]) {
    const blockPatch = patch[block];
    if (blockPatch) {
      (merged as Record<string, unknown>)[block] = {
        ...(current[block] as object),
        ...blockPatch,
      };
    }
  }

  merged.meta = {
    ...current.meta,
    updatedAt: new Date().toISOString(),
    summary: patch.summary ?? current.meta.summary,
  };

  if (patch.immediateProposalRequested !== undefined) {
    merged.handoff = {
      ...current.handoff,
      immediateProposalRequested: patch.immediateProposalRequested,
    };
  }

  return merged;
}

// ---- Plan Chat永続化向け: Field単位のpatchリスト ----
// DB側のapply_karte_patch RPCへ送る最小単位。KartePatch（block単位）を、
// このRPCが期待するFieldひとつずつのリストへ平坦化する。Chat由来・Worksheet由来どちらの
// KartePatchもこの関数を通してRPCへ渡す（sourceだけが呼び出し側で変わる）。

export type FieldPatch = {
  block: BlockName;
  key: string;
  value: unknown;
  certainty: Certainty;
  source: FieldSource;
};

export function kartePatchToFieldPatches(patch: KartePatch, source: FieldSource): FieldPatch[] {
  const result: FieldPatch[] = [];
  for (const block of Object.keys(BLOCK_SPECS) as BlockName[]) {
    const blockPatch = patch[block] as Record<string, Field<unknown>> | undefined;
    if (!blockPatch) continue;
    for (const [key, field] of Object.entries(blockPatch)) {
      if (field.certainty === "unknown") continue;
      result.push({ block, key, value: field.value, certainty: field.certainty, source });
    }
  }
  return result;
}

/** Plan Chatのsystem promptで「Fieldラベル」を表示するためのヘルパー（buildConflictsTextが使う） */
export function getFieldLabel(block: BlockName, key: string): string {
  return FIELD_LABELS[block]?.[key] ?? key;
}

// ---- カルテ確認ステップ（KarteSummary）向けヘルパー ----

export type SummaryItem = { block: BlockName; key: string; label: string; value: string; certainty: Certainty };

const FIELD_LABELS: Record<BlockName, Record<string, string>> = {
  profile: { age: "年齢", nationality: "国籍", residence: "居住地", occupation: "職業", status: "現在の状況" },
  motivation: {
    statedGoal: "留学を考えている理由",
    trueGoalHypothesis: "本当に求めていそうなこと",
    regretIfNotGo: "行かなかった場合の後悔",
    desiredOutcome: "留学で得たいこと",
  },
  language: {
    selfLevel: "語学レベル",
    testScores: "保有スコア",
    weakSkills: "苦手なスキル",
    education: "学歴・在学状況",
    pathwayIntent: "進学意向",
  },
  budget: {
    totalCap: "総予算",
    monthlyCap: "月あたり予算",
    fundingSource: "資金源",
    flexibility: "予算の融通",
  },
  timing: {
    durationWeeks: "期間",
    departureTiming: "渡航時期",
    deadline: "締め切り",
    flexibility: "時期の融通",
  },
  work: {
    wantsToWork: "現地就労希望",
    workingHolidayInterest: "ワーキングホリデーへの関心",
    postReturnCareer: "帰国後のキャリア",
  },
  lifestyle: {
    cityVsNature: "都会/自然志向",
    climate: "気候の好み",
    safetyImportance: "治安の重視度",
    priceSensitivity: "物価への敏感さ",
    japaneseRatioPref: "日本人比率の希望",
  },
  personality: {
    introExtro: "内向/外向",
    needsHandholding: "自走/伴走志向",
    learningStyle: "学び方の好み",
  },
  constraints: {
    nonNegotiables: "譲れない条件",
    avoidCountries: "避けたい国",
    health: "健康上の配慮",
    visaConstraints: "ビザ上の制約",
  },
  support: {
    scope: "サポート希望範囲",
    needJapaneseSupport: "日本語サポートの要否",
    contactPref: "連絡手段の希望",
  },
  schoolPrefs: {
    preferredCity: "希望する都市",
    courseType: "コース種類",
    accommodation: "滞在スタイル",
    sizeNationality: "学校規模・国籍構成",
    startFlexibility: "開始時期の融通",
  },
  decision: {
    stage: "検討段階",
    leaning: "現時点の意向",
    topConcern: "いま一番の懸念",
    decisionOwner: "意思決定者",
  },
};

const LEANING_LABELS: Record<string, string> = {
  going: "行く方向に気持ちが傾いている",
  not_going: "行かない方向に気持ちが傾いている",
  undecided: "まだ保留",
};

const DECISION_OWNER_LABELS: Record<string, string> = {
  self: "自分ひとりで決められる",
  parent: "親の意向も関わる",
  partner_consent_needed: "パートナーの同意が必要",
};

function formatFieldValue(block: BlockName, key: string, value: unknown): string {
  if (block === "decision" && key === "leaning" && typeof value === "string") {
    return LEANING_LABELS[value] ?? value;
  }
  if (block === "decision" && key === "decisionOwner" && typeof value === "string") {
    return DECISION_OWNER_LABELS[value] ?? value;
  }
  if (Array.isArray(value)) return value.join("、");
  if (typeof value === "boolean") return value ? "あり" : "なし";
  return String(value);
}

/** カルテのうち、値が埋まっている項目を KarteSummary 表示用に一覧化する */
export function getKarteSummaryItems(karte: Karte): SummaryItem[] {
  const items: SummaryItem[] = [];
  for (const block of Object.keys(BLOCK_SPECS) as BlockName[]) {
    const blockData = karte[block] as Record<string, Field<unknown>>;
    for (const key of Object.keys(BLOCK_SPECS[block])) {
      const field = blockData[key];
      if (!field || field.value == null || field.certainty === "unknown") continue;
      items.push({
        block,
        key,
        label: FIELD_LABELS[block][key],
        value: formatFieldValue(block, key, field.value),
        certainty: field.certainty,
      });
    }
  }
  return items;
}

/**
 * ユーザーが要約を「間違いありません」と確認した際に呼ぶ。
 * inferred だった項目は、本人が確認した時点で stated に格上げする。
 * 確認済み項目は handoff.confirmedItems に積み、openQuestions はクリアする。
 * 戻り値の fieldPatches は、Plan Chatでの永続化（apply_karte_patch）にそのまま渡す
 * （certainty格上げの1件ずつを表す。sourceは常に"chat"＝本人がChat上で確認した操作のため）。
 */
export function confirmKarte(karte: Karte): { karte: Karte; fieldPatches: FieldPatch[] } {
  const confirmed: Karte = { ...karte };
  const newlyConfirmedLabels: string[] = [];
  const fieldPatches: FieldPatch[] = [];

  for (const block of Object.keys(BLOCK_SPECS) as BlockName[]) {
    const blockData: Record<string, Field<unknown>> = { ...(karte[block] as Record<string, Field<unknown>>) };
    let changed = false;
    for (const key of Object.keys(BLOCK_SPECS[block])) {
      // motivation.trueGoalHypothesisは「必ずinferredとして送ること」という仕様のフィールドであり、
      // 本人が要約を確認しただけで確定事実(stated)へ格上げしてはいけない（ユーザーが言っていない
      // 内容をstatedにしない、という原則の一部）。ここだけ他の項目と違い昇格対象から除外する。
      if (block === "motivation" && key === "trueGoalHypothesis") continue;

      const field = blockData[key];
      if (field && field.value != null && field.certainty === "inferred") {
        blockData[key] = { ...field, certainty: "stated" };
        newlyConfirmedLabels.push(FIELD_LABELS[block][key]);
        fieldPatches.push({ block, key, value: field.value, certainty: "stated", source: "chat" });
        changed = true;
      }
    }
    if (changed) {
      (confirmed as Record<string, unknown>)[block] = blockData;
    }
  }

  confirmed.handoff = {
    ...karte.handoff,
    confirmedItems: Array.from(new Set([...karte.handoff.confirmedItems, ...newlyConfirmedLabels])),
    openQuestions: [],
  };

  confirmed.meta = { ...karte.meta, updatedAt: new Date().toISOString() };

  return { karte: confirmed, fieldPatches };
}

/**
 * ユーザーが要約に「修正したい点がある」を選んだ際に呼ぶ。
 * その時点で inferred だった項目を openQuestions（未確認）として残す。
 */
export function flagOpenQuestions(karte: Karte): Karte {
  const openQuestions = getKarteSummaryItems(karte)
    .filter((item) => item.certainty === "inferred")
    .map((item) => item.label);

  return {
    ...karte,
    handoff: { ...karte.handoff, openQuestions },
    meta: { ...karte.meta, updatedAt: new Date().toISOString() },
  };
}
