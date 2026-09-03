"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import SignOutButton from "@/components/SignOutButton";
import AvatarUploader from "@/components/AvatarUploader";
import {
  type AccountProfile,
  accountProfileToRow,
  ENGLISH_LEVEL_OPTIONS,
  GENDER_OPTIONS,
  MAX_TEXT_LEN,
  STUDY_ABROAD_EXPERIENCE_OPTIONS,
  todayIsoDate,
  validateAccountProfile,
} from "@/lib/accountProfile";

/**
 * Account（プロフィール設定）の編集フォーム。
 *
 * - プロフィール項目（表示名・生年月日・性別・居住地・職業/学年・英語レベル・留学経験）は
 *   明示保存式（「変更を保存」ボタン）。入力のたびに DB を更新しない。
 * - 変更が無いときは保存ボタンを disabled にする（複雑な navigation blocker は付けない）。
 * - 保存は client から直接 profiles を upsert（RLS で本人のみ・onConflict user_id）。
 * - 保存失敗時は入力値を保持し、エラー表示のみ（見せかけの成功はしない）。
 * - avatar は AvatarUploader 側で独立して即時保存される（このフォームの保存対象外）。
 * - メールアドレス / ログイン方法は表示のみ（編集不可）。
 *
 * ここで保存する情報は Plan / Karte へ自動同期しない（別タスク）。
 */

const CARD = "rounded-2xl border border-[#e5dfd6] bg-white p-5 sm:p-7";
const LABEL = "block text-sm font-medium text-[#172033]";
const FIELD =
  "mt-2 w-full rounded-xl border border-[#e6e2d8] bg-white px-3 py-2.5 text-sm text-[#172033] placeholder:text-[#a7a08f] transition-shadow focus:outline-none focus:ring-2 focus:ring-worksheet-accent/30";

export default function AccountProfileForm({
  userId,
  email,
  providerLabel,
  initialProfile,
  initialAvatarPath,
  initialAvatarUrl,
}: {
  userId: string;
  email: string | null;
  providerLabel: string | null;
  initialProfile: AccountProfile;
  initialAvatarPath: string | null;
  initialAvatarUrl: string | null;
}) {
  const [values, setValues] = useState<AccountProfile>(initialProfile);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = useMemo(
    () => JSON.stringify(values) !== JSON.stringify(initialProfile),
    [values, initialProfile],
  );

  function set<K extends keyof AccountProfile>(key: K, value: AccountProfile[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setError(null);
  }

  async function handleSave() {
    const message = validateAccountProfile(values);
    if (message) {
      setError(message);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: upsertError } = await supabase
        .from("profiles")
        .upsert(accountProfileToRow(values, userId), { onConflict: "user_id" });

      if (upsertError) {
        setError("保存できませんでした。しばらくしてから再度お試しください。");
        return;
      }
      setSaved(true);
    } catch {
      setError("通信エラーが発生しました。ネットワーク状態を確認してください。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-8 space-y-6">
      {/* Profile card: avatar ＋ 表示名プレビュー ＋ email */}
      <section className={CARD}>
        <h2 className="text-sm font-semibold text-[#172033]">プロフィール画像</h2>
        <div className="mt-4">
          <AvatarUploader
            userId={userId}
            initialAvatarPath={initialAvatarPath}
            initialAvatarUrl={initialAvatarUrl}
            displayName={values.displayName}
            email={email}
          />
        </div>
        <div className="mt-4 border-t border-[#ece7dd] pt-4">
          <p className="text-sm font-medium text-[#172033]">
            {values.displayName.trim() || "表示名未設定"}
          </p>
          {email && <p className="mt-0.5 break-all text-xs text-[#817b71]">{email}</p>}
        </div>
      </section>

      {/* Basic information */}
      <section className={CARD}>
        <h2 className="text-sm font-semibold text-[#172033]">基本情報</h2>
        <p className="mt-1 text-xs text-[#817b71]">すべて任意です。空欄のままで問題ありません。</p>

        <div className="mt-5 space-y-5">
          <div>
            <label htmlFor="displayName" className={LABEL}>
              表示名
            </label>
            <input
              id="displayName"
              type="text"
              value={values.displayName}
              maxLength={MAX_TEXT_LEN}
              onChange={(e) => set("displayName", e.target.value)}
              placeholder="例: みつ"
              className={FIELD}
            />
          </div>

          <div>
            <label htmlFor="birthDate" className={LABEL}>
              生年月日
            </label>
            <input
              id="birthDate"
              type="date"
              value={values.birthDate}
              max={todayIsoDate()}
              onChange={(e) => set("birthDate", e.target.value)}
              className={FIELD}
            />
          </div>

          <div>
            <label htmlFor="gender" className={LABEL}>
              性別
            </label>
            <select
              id="gender"
              value={values.gender}
              onChange={(e) => set("gender", e.target.value as AccountProfile["gender"])}
              className={FIELD}
            >
              <option value="">未選択</option>
              {GENDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="residence" className={LABEL}>
              居住地
            </label>
            <input
              id="residence"
              type="text"
              value={values.residence}
              maxLength={MAX_TEXT_LEN}
              onChange={(e) => set("residence", e.target.value)}
              placeholder="例: 東京都"
              className={FIELD}
            />
          </div>
        </div>
      </section>

      {/* Study profile */}
      <section className={CARD}>
        <h2 className="text-sm font-semibold text-[#172033]">留学に関するプロフィール</h2>
        <p className="mt-1 text-xs text-[#817b71]">
          特定の留学プランではなく、あなた自身についての情報です。
        </p>

        <div className="mt-5 space-y-5">
          <div>
            <label htmlFor="occupation" className={LABEL}>
              職業・学年
            </label>
            <input
              id="occupation"
              type="text"
              value={values.occupation}
              maxLength={MAX_TEXT_LEN}
              onChange={(e) => set("occupation", e.target.value)}
              placeholder="例: 大学生 / 会社員"
              className={FIELD}
            />
          </div>

          <div>
            <label htmlFor="englishLevel" className={LABEL}>
              英語レベル（本人申告）
            </label>
            <select
              id="englishLevel"
              value={values.englishLevel}
              onChange={(e) =>
                set("englishLevel", e.target.value as AccountProfile["englishLevel"])
              }
              className={FIELD}
            >
              <option value="">未選択</option>
              {ENGLISH_LEVEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="studyAbroadExperience" className={LABEL}>
              留学経験
            </label>
            <select
              id="studyAbroadExperience"
              value={values.studyAbroadExperience}
              onChange={(e) =>
                set(
                  "studyAbroadExperience",
                  e.target.value as AccountProfile["studyAbroadExperience"],
                )
              }
              className={FIELD}
            >
              <option value="">未選択</option>
              {STUDY_ABROAD_EXPERIENCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Account information（表示のみ） */}
      <section className={CARD}>
        <h2 className="text-sm font-semibold text-[#172033]">アカウント情報</h2>
        <dl className="mt-4 space-y-4">
          {email && (
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
              <dt className="w-32 shrink-0 text-xs text-[#817b71]">メールアドレス</dt>
              <dd className="text-sm text-[#3f3a34]">
                <span className="break-all">{email}</span>
                <span className="mt-0.5 block text-xs text-[#817b71]">
                  ログインに使用しているメールアドレス
                </span>
              </dd>
            </div>
          )}
          {providerLabel && (
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
              <dt className="w-32 shrink-0 text-xs text-[#817b71]">ログイン方法</dt>
              <dd className="text-sm text-[#3f3a34]">{providerLabel}</dd>
            </div>
          )}
        </dl>
        <div className="mt-6 border-t border-[#ece7dd] pt-5">
          <SignOutButton variant="button" />
        </div>
      </section>

      {/* Save CTA */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-[#161616] px-6 py-2.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#000] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
        >
          {saving ? "保存しています…" : "変更を保存"}
        </button>
        {saved && !saving && !dirty && (
          <span className="text-sm text-[#5f7050]">保存しました</span>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
