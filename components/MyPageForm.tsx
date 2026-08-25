"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type FactGroup = "A" | "B" | "C";

type FactField = {
  key: string;
  label: string;
  placeholder: string;
  group: FactGroup;
};

/**
 * マイページで保存する現実情報の項目。
 * グループA: 提案に効く（フェーズ3で照合ロジックに使う想定）
 * グループB: 今は保存のみ（フェーズ3で提案に活かす想定）
 * グループC: my noteを深くするための任意情報（提案には使わない）
 */
const FACT_FIELDS: FactField[] = [
  { key: "preferredCountry", label: "希望する国", placeholder: "例: オーストラリア", group: "A" },
  { key: "preferredCity", label: "希望する都市", placeholder: "例: シドニー", group: "A" },
  { key: "budget", label: "予算", placeholder: "例: 200万円くらい", group: "A" },
  { key: "selfLevel", label: "今の英語力", placeholder: "例: 日常会話が少しできる", group: "A" },
  { key: "accommodation", label: "滞在スタイルの希望", placeholder: "例: ホームステイがいいかも", group: "B" },
  { key: "pathwayIntent", label: "進学意向", placeholder: "例: 大学への進学も考えている", group: "B" },
  { key: "age", label: "年齢", placeholder: "例: 25", group: "B" },
  { key: "occupation", label: "職歴", placeholder: "例: 会社員として3年勤務", group: "C" },
  { key: "education", label: "学歴", placeholder: "例: 大学卒業", group: "C" },
  { key: "nationality", label: "国籍", placeholder: "例: 日本", group: "C" },
  { key: "residence", label: "居住地", placeholder: "例: 東京都", group: "C" },
];

const GROUP_META: Record<FactGroup, { title: string; description: string }> = {
  A: {
    title: "提案に効く情報",
    description: "学校・都市の提案の精度を上げるために使います。",
  },
  B: {
    title: "今は保存のみ",
    description: "今回はまだ提案には使いません。次のフェーズで活かす予定です。",
  },
  C: {
    title: "あなたを、もっと深く知るための情報",
    description: "提案には使いません。あなたの留学ノート（my note）をより深くするために使います。",
  },
};

/** 保存済みfactsの1項目の形。source は今は常に "user"（本人入力）で持つ */
type StoredFact = { value: string; source: "user"; updatedAt: string };

function extractInitialValues(initialFacts: Record<string, unknown>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of FACT_FIELDS) {
    const entry = initialFacts[field.key];
    if (entry && typeof entry === "object" && typeof (entry as { value?: unknown }).value === "string") {
      values[field.key] = (entry as { value: string }).value;
    }
  }
  return values;
}

interface MyPageFormProps {
  planId: string;
  initialFacts: Record<string, unknown>;
  userEmail: string | null;
}

export default function MyPageForm({ planId, initialFacts, userEmail }: MyPageFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => extractInitialValues(initialFacts));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  function handleChange(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSavedAt(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    const now = new Date().toISOString();
    const facts: Record<string, StoredFact> = {};
    for (const field of FACT_FIELDS) {
      const trimmed = (values[field.key] ?? "").trim();
      if (trimmed) {
        facts[field.key] = { value: trimmed, source: "user", updatedAt: now };
      }
    }

    try {
      const supabase = createClient();
      const { error: upsertError } = await supabase
        .from("profile_facts")
        .upsert({ plan_id: planId, facts }, { onConflict: "plan_id" });

      if (upsertError) {
        setError("保存できませんでした。しばらくしてから再度お試しください。");
        return;
      }

      setSavedAt(now);
    } catch {
      setError("通信エラーが発生しました。ネットワーク状態を確認してください。");
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const groups: FactGroup[] = ["A", "B", "C"];

  return (
    <div className="mx-auto max-w-[600px] px-4 py-12 sm:py-16">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-medium leading-snug text-worksheet-primary">
            マイページ
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-worksheet-secondary">
            分かっている範囲でかまいません。まだ決めていないことは、空欄のままで大丈夫です。
          </p>
          {userEmail && (
            <p className="mt-1 text-xs text-worksheet-secondary">{userEmail} でログイン中</p>
          )}
          <Link
            href="/plans"
            className="mt-1 inline-block text-xs text-worksheet-accent underline decoration-worksheet-accent/40 underline-offset-2 transition-colors hover:decoration-worksheet-accent"
          >
            プラン一覧を見る
          </Link>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="shrink-0 text-xs text-worksheet-accent underline decoration-worksheet-accent/40 underline-offset-2 transition-colors hover:decoration-worksheet-accent"
        >
          ログアウト
        </button>
      </div>

      <div className="mt-8 space-y-8">
        {groups.map((group) => (
          <div key={group}>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full border-[0.5px] border-worksheet-border px-3 py-1 text-xs font-medium text-worksheet-secondary">
                {GROUP_META[group].title}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-worksheet-secondary">
              {GROUP_META[group].description}
            </p>

            <div className="mt-4 space-y-3">
              {FACT_FIELDS.filter((field) => field.group === group).map((field) => (
                <div
                  key={field.key}
                  className="rounded-[20px] border-[0.5px] border-worksheet-border bg-worksheet-surface-2 p-4"
                >
                  <label
                    htmlFor={field.key}
                    className="block text-sm font-medium text-worksheet-primary"
                  >
                    {field.label}
                  </label>
                  <input
                    id={field.key}
                    type="text"
                    value={values[field.key] ?? ""}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="mt-2 w-full rounded-xl border-[0.5px] border-worksheet-border bg-worksheet-surface px-3 py-2 text-sm text-worksheet-primary transition-shadow focus:outline-none focus:ring-2 focus:ring-worksheet-accent/30 dark:focus:ring-worksheet-accent/20"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-full bg-worksheet-accent px-5 py-3 text-sm font-medium text-worksheet-accent-contrast transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
        >
          {saving ? "保存しています…" : "保存する"}
        </button>
        {savedAt && !saving && (
          <span className="text-xs text-worksheet-secondary">保存しました</span>
        )}
      </div>

      {error && <p className="mt-3 text-center text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
