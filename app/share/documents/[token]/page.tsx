import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { hashShareToken } from "@/lib/documentShareToken";
import {
  formatShareUpdatedAt,
  isValidTokenFormat,
  parsePublicDocument,
} from "@/lib/publicDocumentShare";
import BrandLogo from "@/components/BrandLogo";

/**
 * 親向け説明資料の公開閲覧ページ（Step 11）。ログイン不要・read-only・snapshot表示のみ。
 * Sidebar/AppNav/Workspace UIは一切表示しない（このrouteは`/plans`等の配下に無いため、
 * 既存のAppNav入りlayoutを継承しない。app/layout.tsxの素のroot layoutだけを継承する
 * 構造で、専用のapp/share/layout.tsxは今回作らなかった。noindex等はこのファイルの
 * metadataで完結するため、layoutを追加する理由が無いと判断した）。
 *
 * 責務: URL pathからraw tokenを取得 → Server Component内でのみSHA-256 hash化
 * （lib/documentShareToken.tsのhashShareTokenを再利用、新しいhash処理は作らない）→
 * 既存のServer Supabase client（anon session、service role不使用）で
 * get_public_document_by_token_hash RPC（Step 9のSECURITY DEFINER関数）を呼ぶ →
 * RPCが返す title/body/document_updated_at の3fieldだけをruntime validationしてから
 * 表示する。raw tokenはこのServer Component内の変数として存在するだけで、
 * Client Component・DOM・metadata・console.log/errorのいずれにも一切出さない。
 *
 * token不正・RPC 0件・revoked・disabled・expired・snapshot shapeが不正、のいずれも
 * 理由を区別せず同じ汎用表示（「この資料は表示できません。」）にする。HTTP status自体は
 * 200のままとし、Next.jsのnotFound()（デフォルトの汎用404ページ）は使わない
 * （ご指示の「無理に複雑化しない」第一候補を採用。noindexにより検索露出も防いでいるため、
 * 200/404のどちらでも実害は無いと判断した）。
 *
 * token形式チェック・RPC戻り値のruntime validation・更新日フォーマットの純粋関数は
 * lib/publicDocumentShare.tsへ切り出してある（テストからNext.js固有依存を持ち込まずに
 * import できるようにするため）。
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "共有された資料 | I'm ready!",
  robots: { index: false, follow: false },
};

interface SharedDocumentPageProps {
  params: Promise<{ token: string }>;
}

export default async function SharedDocumentPage({ params }: SharedDocumentPageProps) {
  const { token: rawToken } = await params;

  if (!isValidTokenFormat(rawToken)) {
    return <UnavailableNotice />;
  }

  // raw tokenはここでhash化した時点で役目を終える。以降、raw token自体を
  // 変数として保持し続けない（tokenHashだけを使う）。
  const tokenHash = hashShareToken(rawToken);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_document_by_token_hash", {
    p_token_hash: tokenHash,
  });

  if (error) {
    // DB内部のエラーメッセージはログにのみ出す。raw tokenはこのログにも含めない。
    console.error("get_public_document_by_token_hash rpc error:", error.message);
    return <UnavailableNotice />;
  }

  // returns table(...) のRPCはarrayで返る。0件・想定外の複数件はどちらも「不明」として扱う。
  const row = Array.isArray(data) ? data[0] : undefined;
  const document = parsePublicDocument(row);

  if (!document) {
    return <UnavailableNotice />;
  }

  return (
    <div className="min-h-dvh bg-white">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
        <BrandLogo className="h-8 w-auto" />

        <h1 className="mt-8 text-2xl leading-snug font-bold text-worksheet-primary sm:text-3xl">
          {document.title}
        </h1>
        <p className="mt-2 text-xs text-worksheet-secondary">
          {formatShareUpdatedAt(document.documentUpdatedAt)}
        </p>

        {/* whitespace-pre-wrapのプレーンテキスト表示。dangerouslySetInnerHTMLは使わず、
            {document.body}はJSX内の文字列展開のみ（Reactが自動エスケープするためHTMLとして
            解釈されない）。 */}
        <div className="mt-8 whitespace-pre-wrap text-base leading-loose text-worksheet-primary">
          {document.body}
        </div>

        <p className="mt-12 border-t border-worksheet-border pt-6 text-xs text-worksheet-secondary">
          この資料は I&apos;m ready! で作成されました。
        </p>
      </div>
    </div>
  );
}

/** token不正・RPC 0件・revoked・expired・shape不正のすべてに共通する汎用表示。
 *  内部状態を一切区別しない。 */
function UnavailableNotice() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-white px-4">
      <div className="max-w-sm text-center">
        <BrandLogo className="mx-auto h-8 w-auto" />
        <p className="mt-8 text-base font-medium text-worksheet-primary">この資料は表示できません。</p>
        <p className="mt-3 text-sm leading-relaxed text-worksheet-secondary">
          リンクが無効になっているか、有効期限が切れている可能性があります。
        </p>
      </div>
    </div>
  );
}
