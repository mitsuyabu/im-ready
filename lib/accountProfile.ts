/**
 * Account（プロフィール設定）の型・選択肢・変換・validation を 1 箇所にまとめる。
 *
 * ここに置くのは「ユーザー本人の、Plan をまたいで共通する情報」だけ。
 * 希望都市・留学時期・期間・予算・学校条件・留学目的・不安・判断軸などの
 * Plan / Karte 側の情報は含めない（役割を分ける）。
 *
 * DB は snake_case（profiles テーブル）、UI 側は camelCase の AccountProfile で扱う。
 * 未回答は DB では NULL、UI では "" で表現する。
 */

export type GenderValue = "male" | "female" | "other" | "prefer_not_to_say";
export type EnglishLevelValue = "beginner" | "elementary" | "intermediate" | "advanced";
export type StudyAbroadExperienceValue =
  | "none"
  | "short_term"
  | "long_term"
  | "working_holiday"
  | "other";

export const GENDER_OPTIONS: { value: GenderValue; label: string }[] = [
  { value: "male", label: "男性" },
  { value: "female", label: "女性" },
  { value: "other", label: "その他" },
  { value: "prefer_not_to_say", label: "回答しない" },
];

export const ENGLISH_LEVEL_OPTIONS: { value: EnglishLevelValue; label: string }[] = [
  { value: "beginner", label: "初心者" },
  { value: "elementary", label: "初級" },
  { value: "intermediate", label: "中級" },
  { value: "advanced", label: "上級" },
];

export const STUDY_ABROAD_EXPERIENCE_OPTIONS: {
  value: StudyAbroadExperienceValue;
  label: string;
}[] = [
  { value: "none", label: "なし" },
  { value: "short_term", label: "短期留学" },
  { value: "long_term", label: "長期留学" },
  { value: "working_holiday", label: "ワーキングホリデー" },
  { value: "other", label: "その他" },
];

/** 表示名 / 居住地 / 職業の最大文字数（§18）。 */
export const MAX_TEXT_LEN = 100;

/** UI 側で扱うプロフィール。avatar_path はフォームでは編集せず AvatarUploader 側で扱う。 */
export type AccountProfile = {
  displayName: string;
  birthDate: string; // "YYYY-MM-DD" または ""
  gender: GenderValue | "";
  residence: string;
  occupation: string;
  englishLevel: EnglishLevelValue | "";
  studyAbroadExperience: StudyAbroadExperienceValue | "";
};

export const EMPTY_ACCOUNT_PROFILE: AccountProfile = {
  displayName: "",
  birthDate: "",
  gender: "",
  residence: "",
  occupation: "",
  englishLevel: "",
  studyAbroadExperience: "",
};

/** profiles テーブル行（存在しうる shape）。未適用 migration でも型だけは持てる。 */
export type ProfileRow = {
  user_id?: string;
  display_name?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  residence?: string | null;
  occupation?: string | null;
  english_level?: string | null;
  study_abroad_experience?: string | null;
  avatar_path?: string | null;
  updated_at?: string | null;
};

const GENDERS = new Set<string>(GENDER_OPTIONS.map((o) => o.value));
const ENGLISH_LEVELS = new Set<string>(ENGLISH_LEVEL_OPTIONS.map((o) => o.value));
const EXPERIENCES = new Set<string>(STUDY_ABROAD_EXPERIENCE_OPTIONS.map((o) => o.value));

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** DB 行（snake_case, NULL 可）→ UI の AccountProfile。想定外の enum 値は "" に落とす。 */
export function rowToAccountProfile(row: ProfileRow | null | undefined): AccountProfile {
  if (!row) return { ...EMPTY_ACCOUNT_PROFILE };
  const gender = str(row.gender);
  const englishLevel = str(row.english_level);
  const experience = str(row.study_abroad_experience);
  return {
    displayName: str(row.display_name),
    birthDate: str(row.birth_date),
    gender: GENDERS.has(gender) ? (gender as GenderValue) : "",
    residence: str(row.residence),
    occupation: str(row.occupation),
    englishLevel: ENGLISH_LEVELS.has(englishLevel) ? (englishLevel as EnglishLevelValue) : "",
    studyAbroadExperience: EXPERIENCES.has(experience)
      ? (experience as StudyAbroadExperienceValue)
      : "",
  };
}

/** UI の AccountProfile → profiles upsert payload。"" は NULL に、text は trim。 */
export function accountProfileToRow(
  profile: AccountProfile,
  userId: string,
): Record<string, string | null> {
  const orNull = (s: string) => {
    const t = s.trim();
    return t.length > 0 ? t : null;
  };
  return {
    user_id: userId,
    display_name: orNull(profile.displayName),
    birth_date: profile.birthDate.trim() || null,
    gender: profile.gender || null,
    residence: orNull(profile.residence),
    occupation: orNull(profile.occupation),
    english_level: profile.englishLevel || null,
    study_abroad_experience: profile.studyAbroadExperience || null,
    updated_at: new Date().toISOString(),
  };
}

/** 今日（ローカル）の YYYY-MM-DD。<input type="date"> の max との整合用。 */
export function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** フォーム全体の必要最低限の validation。問題があれば日本語メッセージ、無ければ null。 */
export function validateAccountProfile(profile: AccountProfile): string | null {
  if (profile.displayName.trim().length > MAX_TEXT_LEN) {
    return `表示名は${MAX_TEXT_LEN}文字以内で入力してください。`;
  }
  if (profile.residence.trim().length > MAX_TEXT_LEN) {
    return `居住地は${MAX_TEXT_LEN}文字以内で入力してください。`;
  }
  if (profile.occupation.trim().length > MAX_TEXT_LEN) {
    return `職業・学年は${MAX_TEXT_LEN}文字以内で入力してください。`;
  }
  const bd = profile.birthDate.trim();
  if (bd) {
    const parsed = new Date(bd);
    if (Number.isNaN(parsed.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(bd)) {
      return "生年月日の形式が正しくありません。";
    }
    if (bd > todayIsoDate()) {
      return "生年月日に未来の日付は指定できません。";
    }
  }
  if (profile.gender && !GENDERS.has(profile.gender)) return "性別の値が不正です。";
  if (profile.englishLevel && !ENGLISH_LEVELS.has(profile.englishLevel)) {
    return "英語レベルの値が不正です。";
  }
  if (profile.studyAbroadExperience && !EXPERIENCES.has(profile.studyAbroadExperience)) {
    return "留学経験の値が不正です。";
  }
  return null;
}

/** 表示名 / email から頭文字 1 文字（avatar 未設定時のフォールバック表示用）。 */
export function initialsFrom(displayName: string, email: string | null): string {
  const name = displayName.trim();
  if (name) return name.slice(0, 1).toUpperCase();
  const e = (email ?? "").trim();
  if (e) return e.slice(0, 1).toUpperCase();
  return "";
}
