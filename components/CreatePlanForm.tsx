"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const DEFAULT_TITLE = "私の留学プラン";

interface CreatePlanFormProps {
  userId: string;
}

/**
 * 新しいPlanを作成する。新規APIは作らず、profile_facts保存と同じパターンで
 * クライアントから直接 plans に insert する（RLSで本人のみ書き込み可能）。
 * AIによるタイトル生成は行わない。空欄なら plans.title の既存デフォルトを使う。
 */
export default function CreatePlanForm({ userId }: CreatePlanFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setCreating(true);
    setError(null);

    try {
      const supabase = createClient();
      const trimmed = title.trim();
      const { data, error: insertError } = await supabase
        .from("plans")
        .insert(trimmed ? { user_id: userId, title: trimmed } : { user_id: userId })
        .select("id")
        .single();

      if (insertError || !data?.id) {
        setError("プランを作成できませんでした。しばらくしてから再度お試しください。");
        setCreating(false);
        return;
      }

      router.push(`/plans/${data.id}`);
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。ネットワーク状態を確認してください。");
      setCreating(false);
    }
  }

  return (
    <div className="rounded-[20px] border-[0.5px] border-worksheet-border bg-worksheet-surface-2 p-4">
      <label htmlFor="plan-title" className="block text-sm font-medium text-worksheet-primary">
        新しいプランを作る
      </label>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
        名前は後からでも構いません。空欄なら「{DEFAULT_TITLE}」という名前で作成されます。
      </p>
      <input
        id="plan-title"
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="例: シドニー1年ワーホリ"
        className="mt-3 w-full rounded-xl border-[0.5px] border-worksheet-border bg-worksheet-surface px-3 py-2 text-sm text-worksheet-primary transition-shadow focus:outline-none focus:ring-2 focus:ring-worksheet-accent/30 dark:focus:ring-worksheet-accent/20"
      />
      <button
        type="button"
        onClick={handleCreate}
        disabled={creating}
        className="mt-3 inline-flex items-center gap-2 rounded-full bg-worksheet-accent px-5 py-2.5 text-sm font-medium text-worksheet-accent-contrast transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
      >
        {creating ? "作成しています…" : "プランを作成する"}
      </button>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
