/**
 * lib/parentExplanationShare.ts の Step 14 分（buildLineShareUrl）の動作確認。
 * 既存 test framework は増やさず tsx で直接実行。
 *
 * ここで確認するのは「公開 share URL → LINE 共有 URL」の組み立てだけ。
 * 実際に LINE アプリ / LINE 共有ページが開くか、window.open / anchor の挙動、
 * popup blocker 等は E2E（ユーザー実機）で確認する（§40）。
 *
 * 実行方法: npx tsx scripts/test-parent-explanation-line-share.ts
 */

import { buildLineShareUrl, LINE_SHARE_MESSAGE } from "@/lib/parentExplanationShare";

let pass = 0;
let fail = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    pass++;
    console.log(`  OK   ${message}`);
  } else {
    fail++;
    console.error(`  FAIL ${message}`);
  }
}

const BASE = "https://line.me/R/share?text=";
// 実際の Step 10/11 の URL 形（base64url token、クエリなし）に近いサンプル。
const SHARE_URL = "https://ryugaku.example.com/share/documents/abcDEF-_123xyz";

console.log("Case 1: valid shareUrl → LINE 共有 URL 生成");
{
  const out = buildLineShareUrl(SHARE_URL);
  assert(typeof out === "string" && out !== null, "文字列が返る");
  assert(out!.startsWith(BASE), `LINE 公式 URL スキーム (${BASE}...) で始まる`);
}

console.log("Case 2: shareUrl が正しく encode される");
{
  const out = buildLineShareUrl(SHARE_URL)!;
  const encoded = out.slice(BASE.length);
  // raw の URL をそのまま連結していないこと（":" "/" が生で出ていない）。
  assert(!encoded.includes("https://"), "生の https:// が URL に出ていない");
  assert(encoded.includes(encodeURIComponent(SHARE_URL)), "encodeURIComponent(shareUrl) を内包する");
  // decode すると元の shareUrl を復元できる。
  const decoded = decodeURIComponent(encoded);
  assert(decoded.includes(SHARE_URL), "decode すると元の shareUrl が現れる");
}

console.log("Case 3: 固定メッセージが encode される");
{
  const out = buildLineShareUrl(SHARE_URL)!;
  const decoded = decodeURIComponent(out.slice(BASE.length));
  assert(decoded.startsWith(LINE_SHARE_MESSAGE), "decode 後テキストは固定案内文で始まる");
  const encoded = out.slice(BASE.length);
  // 日本語がそのまま生で出ていない（percent-encode されている）。
  assert(encoded.includes(encodeURIComponent(LINE_SHARE_MESSAGE)), "案内文が percent-encode されている");
}

console.log("Case 4: document 本文が LINE 共有 URL に含まれない");
{
  const bodyText = "予算は300万円、英語力に不安、2027年春に出発予定";
  const out = buildLineShareUrl(SHARE_URL)!;
  const decoded = decodeURIComponent(out.slice(BASE.length));
  assert(!decoded.includes(bodyText), "本文らしき文字列は含まれない");
  // テキストは「固定案内文 + 改行 + shareUrl」ちょうどで、それ以外を含まない。
  assert(decoded === `${LINE_SHARE_MESSAGE}\n${SHARE_URL}`, "テキストは案内文 + 改行 + shareUrl ちょうど");
}

console.log("Case 5: planId / tokenHash / internal ID を別途付加していない");
{
  const out = buildLineShareUrl(SHARE_URL)!;
  const url = new URL(out);
  assert(url.origin + url.pathname === "https://line.me/R/share", "パスは /R/share のみ");
  assert([...url.searchParams.keys()].join(",") === "text", "クエリは text ただ1つ");
  const decoded = url.searchParams.get("text")!;
  assert(decoded === `${LINE_SHARE_MESSAGE}\n${SHARE_URL}`, "text の中身も案内文 + shareUrl だけ");
  assert(!/plan|user|hash|token_hash|uuid/i.test(decoded), "plan/user/hash 等の語が混ざっていない");
}

console.log("Case 6: invalid / empty URL は共有 URL を作らない（null）");
{
  assert(buildLineShareUrl("") === null, "空文字 → null");
  assert(buildLineShareUrl("   ") === null, "空白のみ → null");
  assert(buildLineShareUrl("not a url") === null, "URL でない文字列 → null");
  assert(buildLineShareUrl("/share/documents/abc") === null, "相対パス → null");
  assert(buildLineShareUrl("ftp://example.com/x") === null, "http(s) 以外のスキーム → null");
  assert(buildLineShareUrl("javascript:alert(1)") === null, "javascript: スキーム → null");
  // @ts-expect-error 実行時の防御も確認
  assert(buildLineShareUrl(null) === null, "null 入力 → null");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
