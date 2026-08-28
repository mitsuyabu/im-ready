/**
 * lib/publicDocumentShare.ts の動作確認用スクリプト（Step 11）。
 * 新しいtest frameworkは導入せず、既にdevDependencyにあるtsxで直接実行するだけ。
 * 公開ページ（app/share/documents/[token]/page.tsx）が表示前に通す
 * token形式チェック・RPC戻り値のruntime validation・更新日フォーマットの
 * 入出力の形だけを確認する。
 *
 * page module自体はテストしない（BrandLogo→next/image、lib/supabase/server→next/headers を
 * import するため、pure testへNext.js固有依存が波及する）。純粋関数だけをこのlibへ
 * 切り出してあるのでここから直接importできる。
 *
 * body内のHTML文字列がエスケープされる件は、page.tsxが {document.body} をJSXの
 * 文字列展開のみで描画し dangerouslySetInnerHTML を使っていない（Reactが自動エスケープ
 * する）ことをコードレビューで確認する。React描画のテスト環境は新設しない。
 *
 * 実行方法: npx tsx scripts/test-public-document-share.ts
 */

import {
  formatShareUpdatedAt,
  isValidTokenFormat,
  parsePublicDocument,
} from "@/lib/publicDocumentShare";

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

const VALID_ROW = {
  title: "留学の説明",
  body: "本文です。\n2行目。",
  document_updated_at: "2026-08-28T09:00:00.000Z",
};

console.log("Case 1: 正常なRPC shape → parse成功");
{
  const parsed = parsePublicDocument(VALID_ROW);
  assert(parsed !== null, "nullでない");
  assert(parsed?.title === "留学の説明", "titleがそのまま取れる");
  assert(parsed?.body === "本文です。\n2行目。", "bodyがそのまま取れる（改行保持）");
  assert(parsed?.documentUpdatedAt === "2026-08-28T09:00:00.000Z", "documentUpdatedAtへマップされる");
  assert(
    !("document_updated_at" in (parsed as object)),
    "snake_caseのdocument_updated_atは結果に残らない",
  );
}

console.log("Case 2: title欠損 → parse失敗");
{
  assert(parsePublicDocument({ body: "x", document_updated_at: VALID_ROW.document_updated_at }) === null, "title無しはnull");
  assert(parsePublicDocument({ ...VALID_ROW, title: "" }) === null, "空titleはnull");
  assert(parsePublicDocument({ ...VALID_ROW, title: "   " }) === null, "空白のみのtitleはnull");
  assert(parsePublicDocument({ ...VALID_ROW, title: 123 }) === null, "文字列でないtitleはnull");
}

console.log("Case 3: body欠損 / 空文字 → parse失敗");
{
  assert(parsePublicDocument({ title: "x", document_updated_at: VALID_ROW.document_updated_at }) === null, "body無しはnull");
  assert(parsePublicDocument({ ...VALID_ROW, body: "" }) === null, "空bodyはnull");
  assert(parsePublicDocument({ ...VALID_ROW, body: "  \n  " }) === null, "空白のみのbodyはnull");
  assert(parsePublicDocument({ ...VALID_ROW, body: null }) === null, "nullのbodyはnull");
}

console.log("Case 4: document_updated_at欠損 / 不正 → parse失敗");
{
  assert(parsePublicDocument({ title: "x", body: "y" }) === null, "document_updated_at無しはnull");
  assert(parsePublicDocument({ ...VALID_ROW, document_updated_at: "" }) === null, "空文字はnull");
  assert(parsePublicDocument({ ...VALID_ROW, document_updated_at: "not-a-date" }) === null, "日付にならない文字列はnull");
  assert(parsePublicDocument({ ...VALID_ROW, document_updated_at: 20260828 }) === null, "文字列でない値はnull");
}

console.log("Case 4b: そもそもobjectでない → parse失敗");
{
  assert(parsePublicDocument(null) === null, "nullはnull");
  assert(parsePublicDocument(undefined) === null, "undefinedはnull");
  assert(parsePublicDocument("string") === null, "文字列はnull");
  assert(parsePublicDocument(42) === null, "数値はnull");
}

console.log("Case 5: token正常 → valid");
{
  assert(isValidTokenFormat("abc123") === true, "短めの通常tokenはvalid");
  assert(isValidTokenFormat("x".repeat(43)) === true, "Step 10相当の43文字はvalid");
  assert(isValidTokenFormat("x".repeat(512)) === true, "上限ちょうど512文字はvalid");
}

console.log("Case 6: 空token → invalid");
{
  assert(isValidTokenFormat("") === false, "空文字はinvalid");
}

console.log("Case 7: 極端に長いtoken → invalid");
{
  assert(isValidTokenFormat("x".repeat(513)) === false, "513文字はinvalid");
  assert(isValidTokenFormat("x".repeat(10000)) === false, "1万文字はinvalid");
}

console.log("Case 8: 日付format helperが想定形式を返す");
{
  const formatted = formatShareUpdatedAt("2026-08-28T09:00:00.000Z");
  // Asia/Tokyoでは 2026-08-28 18:00 なので日付は 8月28日 のまま。
  assert(formatted === "2026年8月28日 更新", `"2026年8月28日 更新" を返す（実際: "${formatted}"）`);

  // UTCの日付境界を跨ぐケース: 2026-08-27T15:30Z は JST では 2026-08-28 00:30。
  const crossing = formatShareUpdatedAt("2026-08-27T15:30:00.000Z");
  assert(crossing === "2026年8月28日 更新", `JST変換で日付が繰り上がる（実際: "${crossing}"）`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
