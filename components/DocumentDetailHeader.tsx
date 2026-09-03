import Link from "next/link";
import type { ReactNode } from "react";
import { formatLastUpdated } from "@/lib/planActivity";

/**
 * 各 Document detail 共通のヘッダー（Step 28）。
 *   ← My Karte へ戻る
 *   役割（考える / 整理する / 比べる / 伝える）  ← 控えめな eyebrow
 *   タイトル
 *   1 行説明（常時表示）
 *   状態（最終更新 8月30日 / まだ作成されていません）
 *
 * hooks を持たない純粋な表示コンポーネント。Server Component（detail page）から
 * 描画する。役割・タイトル・説明は lib/documentRoles.ts の
 * DOCUMENT_ROLE_DEFINITIONS から渡す。
 *
 * action スロットは PC で右上に置ける任意要素（Step 28 では未使用。生成／作り直しの
 * 操作は confirmation state を持つため Generator 内・本文下に残す。§51）。
 *
 * fake status は出さない（§58/§59）: updatedAt が無い created 状態は「作成済み」、
 * 未 created は「まだ作成されていません」だけ。「新しい情報があります」等は出さない。
 */
export default function DocumentDetailHeader({
  planId,
  role,
  title,
  description,
  updatedAt,
  isCreated = false,
  action,
}: {
  planId: string;
  role: string;
  title: string;
  description: string;
  updatedAt?: string;
  isCreated?: boolean;
  action?: ReactNode;
}) {
  const status = isCreated
    ? updatedAt
      ? `最終更新 ${formatLastUpdated(updatedAt)}`
      : "作成済み"
    : "まだ作成されていません";

  return (
    <div className="border-b border-worksheet-border pb-6">
      <Link
        href={`/plans/${planId}/documents`}
        className="text-xs text-worksheet-secondary underline decoration-worksheet-secondary/40 underline-offset-2 transition-colors hover:text-worksheet-primary hover:decoration-worksheet-primary/40"
      >
        ← My Karte へ戻る
      </Link>

      <div className="mt-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs tracking-wide text-worksheet-secondary">{role}</p>
          <h1 className="mt-1 text-2xl font-bold text-worksheet-primary sm:text-3xl">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-worksheet-secondary">{description}</p>
          <p className="mt-3 text-xs text-worksheet-secondary">{status}</p>
        </div>
        {action ? <div className="hidden shrink-0 sm:block">{action}</div> : null}
      </div>
    </div>
  );
}
