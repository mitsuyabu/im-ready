/**
 * lib/parentExplanationShare.ts の Step 13 分（既存 share 状態の分類 + revoke レスポンス
 * 解釈 + 期限日フォーマット）の動作確認。既存 test framework は増やさず tsx で直接実行。
 *
 * Step 12 分（parseShareCreateResponse / interpretShareResponse / formatShareExpiry）は
 * scripts/test-parent-explanation-share.ts が引き続きカバーする（こちらでは重複させない）。
 *
 * React の state 遷移・clipboard・confirmation UI の E2E テストは行わない（§37）。
 * 「revoke 成功後 none」「再発行成功後 issued」「409 後 active へ移れる」は
 * components/ParentExplanationShare.tsx が下記 outcome をどの view にマップするかの
 * コードレビューで確認する（ここでは outcome 種別まで検証）。
 *
 * 実行方法: npx tsx scripts/test-parent-explanation-share-lifecycle.ts
 */

import {
  classifyShareStatus,
  formatShareExpiryDate,
  interpretRevokeResponse,
  interpretShareResponse,
  type ShareStatusRow,
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

const NOW = new Date("2026-09-01T00:00:00.000Z");
const FUTURE = "2026-12-01T00:00:00.000Z";
const PAST = "2026-08-01T00:00:00.000Z";

console.log("Case 1: no share（行なし）→ none");
{
  assert(classifyShareStatus(null, NOW).status === "none", "null → none");
  assert(classifyShareStatus(undefined, NOW).status === "none", "undefined → none");
}

console.log("Case 2: enabled + 未来expiry → active");
{
  const row: ShareStatusRow = { enabled: true, revoked_at: null, expires_at: FUTURE };
  const r = classifyShareStatus(row, NOW);
  assert(r.status === "active", "status = active");
  assert(r.expiresAt === FUTURE, "expiresAt を伴う");
}

console.log("Case 2b: enabled + expiry null → active（無期限）");
{
  const r = classifyShareStatus({ enabled: true, revoked_at: null, expires_at: null }, NOW);
  assert(r.status === "active", "status = active");
  assert(r.expiresAt === undefined, "expiresAt は undefined");
}

console.log("Case 3: enabled + 過去expiry → expired");
{
  const r = classifyShareStatus({ enabled: true, revoked_at: null, expires_at: PAST }, NOW);
  assert(r.status === "expired", "status = expired");
  assert(r.expiresAt === PAST, "expiresAt を伴う（UI で「期限切れ」表示に使う）");
}

console.log("Case 3b: enabled + 不正なexpiry文字列 → expired（none と誤認しない）");
{
  const r = classifyShareStatus({ enabled: true, revoked_at: null, expires_at: "garbage" }, NOW);
  assert(r.status === "expired", "パースできない expires_at は expired 扱い");
}

console.log("Case 4: revoked → none");
{
  // 正常な revoke 済み行（enabled=false）
  assert(
    classifyShareStatus({ enabled: false, revoked_at: PAST, expires_at: FUTURE }, NOW).status === "none",
    "enabled=false → none",
  );
  // 病的ケース: enabled=true のまま revoked_at が入っている行も none 扱い
  assert(
    classifyShareStatus({ enabled: true, revoked_at: PAST, expires_at: FUTURE }, NOW).status === "none",
    "enabled=true でも revoked_at があれば none",
  );
}

console.log("Case 5: revoke API status mapping");
{
  assert(interpretRevokeResponse(200, true).kind === "revoked", "200 → revoked");
  assert(interpretRevokeResponse(409, false).kind === "no_active_share", "409 → no_active_share");

  const e401 = interpretRevokeResponse(401, false);
  assert(e401.kind === "error" && e401.message.includes("ログイン"), "401 → error（ログイン案内）");

  const e404 = interpretRevokeResponse(404, false);
  assert(e404.kind === "error" && e404.message.includes("資料を確認できませんでした"), "404 → error（資料確認できず）");

  const e500 = interpretRevokeResponse(500, false);
  assert(e500.kind === "error" && e500.message.includes("停止できませんでした"), "500 → error（停止できず）");

  const leaked = [e401, e404, e500]
    .filter((o): o is { kind: "error"; message: string } => o.kind === "error")
    .some((o) => /token|hash|DB|RLS|supabase|revoke_failed|no_active_share|document_not_found/i.test(o.message));
  assert(!leaked, "error message に内部用語・エラーコードが漏れていない");
}

console.log("Case 6: revoke 成功 / no_active_share はどちらも none へ戻せる outcome");
{
  // components 側はこの2種をどちらも view="none" + notice に落とす（コードレビューで確認）。
  assert(interpretRevokeResponse(200, true).kind === "revoked", "revoked outcome");
  assert(interpretRevokeResponse(409, false).kind === "no_active_share", "no_active_share outcome");
}

console.log("Case 7: 再発行（= 既存 Step 10 作成 API 成功）→ issued へ");
{
  const ok = interpretShareResponse(200, true, {
    shareUrl: "https://example.com/share/documents/newtoken",
    expiresAt: FUTURE,
  });
  assert(ok.kind === "success" && ok.data.shareUrl.endsWith("newtoken"), "200 + valid → success（新 URL）");
}

console.log("Case 8: 409 後 active UI へ移れる outcome");
{
  const dup = interpretShareResponse(409, false, { error: "share_already_exists" });
  assert(dup.kind === "already_exists", "409 → already_exists（components 側で view=active へ）");
}

console.log("Case 9: formatShareExpiryDate（active/expired 表示用の絶対日付）");
{
  assert(
    formatShareExpiryDate("2026-11-26T00:00:00.000Z") === "2026年11月26日",
    `"2026年11月26日"（実際: "${formatShareExpiryDate("2026-11-26T00:00:00.000Z")}"）`,
  );
  assert(formatShareExpiryDate("garbage") === "不明", "不正な iso は「不明」");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
