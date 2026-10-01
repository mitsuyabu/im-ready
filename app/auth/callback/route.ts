import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GoogleログインのOAuthコールバック。認可コードをセッションに交換し、/mypage へ遷移する。
 * マイページ機能専用。既存のルートには影響しない。
 *
 * 失敗時は従来どおり /login?error=auth へ戻す（production の挙動は変えていない）。
 * development のときだけ、原因切り分けのために
 *   - server console へ安全な範囲のエラー情報を出す
 *   - URL へ安全な種別（reason）だけを足す
 * という診断を追加している。token・code・code verifier・cookie の値はログに出さない。
 */

/** URL へ載せてよいエラー種別（生の例外文は載せない）。 */
type AuthFailureReason =
  | "missing_code"
  | "exchange_failed"
  | "pkce_verifier_missing"
  | "session_missing";

const isDev = process.env.NODE_ENV !== "production";

/**
 * PKCE の code verifier cookie が callback リクエストに届いているかを、**名前だけ**で確認する。
 * 値は読まない・ログにも出さない。@supabase/ssr は `sb-<project ref>-auth-token-code-verifier`
 * という名前で保存する（実装の変更に備えて、末尾一致で緩く判定する）。
 */
function hasPkceVerifierCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((cookie) => cookie.name.endsWith("-code-verifier"));
}

/** development だけ、秘密情報を含まない範囲で原因を出す。 */
function logFailure(
  request: NextRequest,
  pathname: string,
  reason: AuthFailureReason,
  detail?: { message?: string; status?: number; name?: string; code?: string },
) {
  if (!isDev) return;
  const { origin } = new URL(request.url);
  // Next.js の dev ログファイルは第2引数のオブジェクトを {} に落としてしまうため、
  // 1行の文字列にして出す（ターミナルでもログファイルでも同じ内容が読める）。
  const info = {
    reason,
    origin,
    pathname,
    hasCode: request.nextUrl.searchParams.has("code"),
    hasPkceVerifierCookie: hasPkceVerifierCookie(request),
    // cookie は名前だけ（値は出さない）。どの cookie が来ているかの確認用。
    cookieNames: request.cookies.getAll().map((c) => c.name),
    errorName: detail?.name,
    errorStatus: detail?.status,
    errorCode: detail?.code,
    errorMessage: detail?.message,
  };
  console.error(`[auth/callback] OAuth の処理に失敗しました ${JSON.stringify(info)}`);
}

function failureRedirect(origin: string, reason: AuthFailureReason) {
  // production では従来どおり error=auth のみ。development だけ種別を足す。
  const url = new URL(`${origin}/login`);
  url.searchParams.set("error", "auth");
  if (isDev) url.searchParams.set("reason", reason);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const { searchParams, origin, pathname } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/mypage";

  // Google / Supabase 側がエラーを返してきた場合（ユーザーが許可しなかった等）。
  const providerError = searchParams.get("error") ?? searchParams.get("error_description");

  if (!code) {
    logFailure(request, pathname, "missing_code", {
      message: providerError ?? "code パラメータがありません",
    });
    return failureRedirect(origin, "missing_code");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // code verifier が無いときは「code と verifier の両方が必要」という趣旨のエラーになるため、
    // cookie の有無と合わせて種別を分ける（切り分けを速くするためだけの判定）。
    const verifierMissing =
      !hasPkceVerifierCookie(request) || /verifier/i.test(error.message ?? "");
    const reason: AuthFailureReason = verifierMissing ? "pkce_verifier_missing" : "exchange_failed";
    logFailure(request, pathname, reason, {
      message: error.message,
      status: error.status,
      name: error.name,
      code: (error as { code?: string }).code,
    });
    return failureRedirect(origin, reason);
  }

  if (!data.session) {
    // 交換自体はエラーにならなかったが session が無い（通常は起きない）。
    logFailure(request, pathname, "session_missing", { message: "session が返ってきませんでした" });
    return failureRedirect(origin, "session_missing");
  }

  return NextResponse.redirect(`${origin}${next}`);
}
