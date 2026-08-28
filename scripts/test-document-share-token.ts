/**
 * lib/documentShareToken.ts の動作確認用スクリプト（Step 10）。
 * 新しいtest frameworkは導入せず、既にdevDependencyにあるtsxで直接実行するだけ。
 * Node標準のcrypto自体を過剰にテストするのではなく、このプロジェクトでの使い方
 * （token生成・hash化の入出力の形）だけを確認する。
 *
 * 実行方法: npx tsx scripts/test-document-share-token.ts
 */

import { generateShareToken, hashShareToken } from "@/lib/documentShareToken";

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

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const HEX64_PATTERN = /^[0-9a-f]{64}$/;

console.log("Case 1: generateShareToken() is non-empty");
{
  const token = generateShareToken();
  assert(typeof token === "string" && token.length > 0, "non-empty string token");
}

console.log("Case 2: 2回生成したtokenは異なる");
{
  const a = generateShareToken();
  const b = generateShareToken();
  assert(a !== b, "2つのtokenが一致しない");
}

console.log("Case 3: tokenはURL-safeなbase64url（+ / = を含まない）");
{
  const token = generateShareToken();
  assert(BASE64URL_PATTERN.test(token), `token "${token}" がbase64url文字集合のみで構成される`);
  assert(!token.includes("+") && !token.includes("/") && !token.includes("="), "+ / = を含まない");
}

console.log("Case 4: hashShareToken()は16進64文字");
{
  const token = generateShareToken();
  const hash = hashShareToken(token);
  assert(HEX64_PATTERN.test(hash), `hash "${hash}" が16進64文字である`);
}

console.log("Case 5: 同じtoken → 同じhash（決定的であること）");
{
  const token = generateShareToken();
  const hash1 = hashShareToken(token);
  const hash2 = hashShareToken(token);
  assert(hash1 === hash2, "同一tokenのhashは常に同じ値になる");
}

console.log("Case 6: 違うtoken → 違うhash");
{
  const tokenA = generateShareToken();
  const tokenB = generateShareToken();
  assert(hashShareToken(tokenA) !== hashShareToken(tokenB), "異なるtokenのhashは異なる");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
