/**
 * lib/parentExplanationShare.ts の動作確認用スクリプト（Step 12）。
 * 新しい test framework は導入せず、既に devDependency にある tsx で直接実行するだけ。
 * 共有導線の Client Component（components/ParentExplanationShare.tsx）が使う
 * レスポンス解釈・期限フォーマットの入出力の形だけを確認する。
 *
 * React の clipboard UI 自体の E2E テストは行わない（§32）。
 * clipboard 失敗時に share URL を消さないこと・console へ出さないこと・storage へ
 * 保存しないことは components/ParentExplanationShare.tsx のコードレビューで確認する。
 *
 * 実行方法: npx tsx scripts/test-parent-explanation-share.ts
 */

import {
  formatShareExpiry,
  interpretShareResponse,
  parseShareCreateResponse,
} from "@/lib/parentExplanationShare";

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

const VALID = {
  shareUrl: "https://example.com/share/documents/abcDEF123-_",
  expiresAt: "2026-11-26T00:00:00.000Z",
};

console.log("Case 1: valid API response → parse成功");
{
  const parsed = parseShareCreateResponse(VALID);
  assert(parsed !== null, "null でない");
  assert(parsed?.shareUrl === VALID.shareUrl, "shareUrl がそのまま取れる");
  assert(parsed?.expiresAt === VALID.expiresAt, "expiresAt がそのまま取れる");
}

console.log("Case 2: shareUrl欠損 → invalid");
{
  assert(parseShareCreateResponse({ expiresAt: VALID.expiresAt }) === null, "shareUrl 無しは null");
  assert(parseShareCreateResponse({ ...VALID, shareUrl: "" }) === null, "空 shareUrl は null");
  assert(parseShareCreateResponse({ ...VALID, shareUrl: "   " }) === null, "空白のみの shareUrl は null");
  assert(parseShareCreateResponse({ ...VALID, shareUrl: 123 }) === null, "文字列でない shareUrl は null");
}

console.log("Case 3: expiresAt欠損 → invalid");
{
  assert(parseShareCreateResponse({ shareUrl: VALID.shareUrl }) === null, "expiresAt 無しは null");
  assert(parseShareCreateResponse({ ...VALID, expiresAt: "" }) === null, "空 expiresAt は null");
  assert(parseShareCreateResponse({ ...VALID, expiresAt: null }) === null, "null の expiresAt は null");
}

console.log("Case 4: invalid expiresAt → invalid");
{
  assert(parseShareCreateResponse({ ...VALID, expiresAt: "not-a-date" }) === null, "日付にならない文字列は null");
  assert(parseShareCreateResponse({ ...VALID, expiresAt: 20261126 }) === null, "文字列でない expiresAt は null");
}

console.log("Case 4b: 非objectレスポンス → invalid");
{
  assert(parseShareCreateResponse(null) === null, "null は null");
  assert(parseShareCreateResponse(undefined) === null, "undefined は null");
  assert(parseShareCreateResponse("ok") === null, "文字列は null");
}

console.log("Case 5: expiry formatter");
{
  // 2026-11-26T00:00Z は JST では 2026-11-26 09:00。
  assert(
    formatShareExpiry("2026-11-26T00:00:00.000Z") === "このリンクは2026年11月26日まで有効です",
    `"このリンクは2026年11月26日まで有効です"（実際: "${formatShareExpiry("2026-11-26T00:00:00.000Z")}"）`,
  );
  // UTC→JST で日付が繰り上がるケース: 2026-11-25T15:30Z → JST 2026-11-26 00:30。
  assert(
    formatShareExpiry("2026-11-25T15:30:00.000Z") === "このリンクは2026年11月26日まで有効です",
    "JST 変換で日付が繰り上がる",
  );
  // 壊れた入力でも例外を投げず無害な文字列を返す。
  assert(
    formatShareExpiry("garbage") === "このリンクには有効期限があります。",
    "不正な iso でも throw せず fallback 文言",
  );
}

console.log("Case 6: error status mapping（401 / 404 / 409 / 500）");
{
  const ok = interpretShareResponse(200, true, VALID);
  assert(ok.kind === "success" && ok.data.shareUrl === VALID.shareUrl, "200 + valid body → success");

  const okButBadBody = interpretShareResponse(200, true, { shareUrl: "" });
  assert(okButBadBody.kind === "error", "200 だが body 不正 → error");

  const e401 = interpretShareResponse(401, false, { error: "認証が必要です" });
  assert(e401.kind === "error" && e401.message.includes("ログイン"), "401 → error（ログイン案内）");

  const e404 = interpretShareResponse(404, false, { error: "document_not_found" });
  assert(e404.kind === "error" && e404.message.includes("資料を確認できませんでした"), "404 → error（資料確認できず）");

  const e409 = interpretShareResponse(409, false, { error: "share_already_exists" });
  assert(e409.kind === "already_exists", "409 → already_exists（error でも success でもない）");

  const e500 = interpretShareResponse(500, false, { error: "share_create_failed" });
  assert(e500.kind === "error" && e500.message.includes("時間をおいて"), "500 → error（時間をおいて再試行）");

  // 内部用語がユーザー向け message に出ていないこと。
  const leaked = [e401, e404, e500]
    .filter((o): o is { kind: "error"; message: string } => o.kind === "error")
    .some((o) => /token|hash|DB|RLS|supabase|share_create_failed|document_not_found/i.test(o.message));
  assert(!leaked, "error message に内部用語（token/hash/DB/RLS/エラーコード）が漏れていない");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
