import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { hashShareToken } from "@/lib/documentShareToken";
import { isValidTokenFormat, formatShareUpdatedAt } from "@/lib/publicDocumentShare";
import {
  isEmptyPublicConsultationSheet,
  parsePublicConsultationSheet,
  type PublicConsultationItem,
} from "@/lib/consultationShare";
import BrandLogo from "@/components/BrandLogo";

/**
 * Consultation Sheet の公開閲覧ページ。ログイン不要・閲覧専用。
 *
 * 親向け説明資料の `/share/documents/[token]` と同じ構造:
 *   URL の raw token を Server Component 内でだけ SHA-256 hash 化 → anon session の
 *   Supabase client（service role 不使用）で SECURITY DEFINER 関数を呼ぶ → 戻り値を
 *   runtime validation してから表示する。raw token は Client Component・DOM・metadata・
 *   console のいずれにも出さない。
 *
 * 親向けとの違い: snapshot ではなく **その時点の最新のシート**を表示する（共有後に本人が
 * 更新すれば、共有先にも反映される）。何を見せるかは共有時に選ばれた share_config で決まり、
 * OFF の section は DB 関数の時点で空になっているため、このページには届かない。
 *
 * token 不正・存在しない・停止済み・期限切れ・shape 不正は、理由を区別せず同じ汎用表示にする
 * （HTTP status は 200 のまま。noindex により検索露出も防ぐ）。
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "共有された相談シート | I'm ready!",
  robots: { index: false, follow: false },
};

interface SharedConsultationPageProps {
  params: Promise<{ token: string }>;
}

export default async function SharedConsultationPage({ params }: SharedConsultationPageProps) {
  const { token: rawToken } = await params;

  if (!isValidTokenFormat(rawToken)) {
    return <UnavailableNotice />;
  }

  const tokenHash = hashShareToken(rawToken);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_consultation_sheet", {
    p_token_hash: tokenHash,
  });

  if (error) {
    // DB のエラーメッセージはログにのみ出す。raw token はログにも含めない。
    console.error("get_public_consultation_sheet rpc error:", error.message);
    return <UnavailableNotice />;
  }

  const row = Array.isArray(data) ? data[0] : undefined;
  const sheet = parsePublicConsultationSheet(row);

  if (!sheet) {
    return <UnavailableNotice />;
  }

  return (
    <div className="min-h-dvh bg-white">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
        <BrandLogo className="h-8 w-auto" />

        <p className="mt-8 text-xs font-medium tracking-wide text-[#5f7050]">留学相談シート</p>
        <h1 className="mt-1 text-2xl leading-snug font-bold text-worksheet-primary sm:text-3xl">
          {sheet.planTitle}
        </h1>
        {sheet.updatedAt && (
          <p className="mt-2 text-xs text-worksheet-secondary">{formatShareUpdatedAt(sheet.updatedAt)}</p>
        )}
        <p className="mt-4 text-sm leading-relaxed text-worksheet-secondary">
          留学を検討している本人が、相談のために用意したシートです。本人が選んだ内容だけが表示されています。
        </p>

        {isEmptyPublicConsultationSheet(sheet) ? (
          <p className="mt-10 rounded-2xl border border-worksheet-border bg-[#fbfaf6] p-6 text-sm leading-relaxed text-worksheet-secondary">
            まだ共有されている内容はありません。
          </p>
        ) : (
          <div className="mt-10 space-y-8">
            {sheet.summary && sheet.summary.length > 0 && (
              <section>
                <SectionHeading>相談時に共有する基本情報</SectionHeading>
                <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
                  {sheet.summary.map((r) => (
                    <div key={r.label} className="flex items-baseline gap-3 border-b border-worksheet-border pb-2">
                      <dt className="w-20 shrink-0 text-[13px] text-worksheet-secondary">{r.label}</dt>
                      <dd
                        className={`min-w-0 text-[14px] leading-snug ${
                          r.status === "set" ? "font-medium text-worksheet-primary" : "text-[#9a948a]"
                        }`}
                      >
                        {r.value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs leading-relaxed text-worksheet-secondary">
                  「検討中」「未定」は、本人がまだ決めていない項目です。
                </p>
              </section>
            )}

            <ItemList title="相談したいこと" items={sheet.topics} />
            <ItemList title="確認したいこと / To Do" items={sheet.todos} showCheck />
            <ItemList title="相談して分かったこと" items={sheet.findings} />
            <ItemList title="次にやること" items={sheet.nextActions} />
          </div>
        )}

        <p className="mt-12 border-t border-worksheet-border pt-6 text-xs leading-relaxed text-worksheet-secondary">
          このシートは I&apos;m ready! で作成されました。閲覧専用のため、このページからは編集できません。
          学費・ビザ・為替などは変わることがあるため、正確な最新情報は各機関でご確認ください。
        </p>
      </div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[15px] font-semibold text-worksheet-primary">{children}</h2>;
}

/** 共有 OFF・項目なしの section は、見出しごと出さない（「空です」も出さない）。 */
function ItemList({
  title,
  items,
  showCheck,
}: {
  title: string;
  items: PublicConsultationItem[];
  showCheck?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <SectionHeading>{title}</SectionHeading>
      <ul className="mt-3 space-y-2">
        {items.map((item, i) => (
          <li
            key={i}
            className="flex items-start gap-2.5 rounded-xl border border-worksheet-border bg-[#fbfaf6] px-3.5 py-2.5"
          >
            {showCheck && (
              <span aria-hidden className="mt-0.5 shrink-0 text-[13px] text-[#8a8578]">
                {item.completed ? "☑" : "☐"}
              </span>
            )}
            <span
              className={`min-w-0 text-[14px] leading-relaxed ${
                showCheck && item.completed ? "text-[#9a948a] line-through" : "text-worksheet-primary"
              }`}
            >
              {item.text}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** token 不正・0 件・停止済み・期限切れ・shape 不正に共通の汎用表示（内部状態を区別しない）。 */
function UnavailableNotice() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-white px-4">
      <div className="max-w-sm text-center">
        <BrandLogo className="mx-auto h-8 w-auto" />
        <p className="mt-8 text-base font-medium text-worksheet-primary">このシートは表示できません。</p>
        <p className="mt-3 text-sm leading-relaxed text-worksheet-secondary">
          リンクが無効になっているか、共有が停止された可能性があります。
        </p>
      </div>
    </div>
  );
}
