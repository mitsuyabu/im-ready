/**
 * Chat の出典（参考情報）の永続化・復元のテスト。
 *
 *   npx tsx scripts/test-chat-source-persistence.ts
 *
 * 見たいこと:
 *   - assistant の回答にだけ出典が保存される（user の発言には付けない）
 *   - reload 相当（loadChatMessages）で同じ出典が戻る
 *   - 出典が無い既存メッセージを壊さない
 *   - 保存済みの値をそのまま信用せず、表示前に再検証する（https 以外・壊れた形・件数超過）
 *   - 内部メタデータ（review_note / unverified / supersededValue / 開発用 snapshot）を保存しない
 *   - 次のターンの LLM へ出典を送り返さない
 * ネットワーク・実 DB へは接続しない（Supabase client は差し替える）。
 */

import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadChatMessages, saveChatMessage } from "@/lib/planChat";
import {
  CHAT_SOURCE_MAX,
  sanitizeStoredChatSources,
  type ChatSource,
} from "@/lib/referenceSources";

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

type Inserted = Record<string, unknown>;

/** insert を記録するだけの Supabase client。`failOn` に含まれる列があるとエラーを返す。 */
function fakeClient(options: { rows?: Inserted[]; failOnColumn?: string; selectError?: string } = {}) {
  const inserts: Inserted[] = [];
  const selects: string[] = [];
  const client = {
    from() {
      return {
        insert(payload: Inserted) {
          if (options.failOnColumn && Object.hasOwn(payload, options.failOnColumn)) {
            return Promise.resolve({
              error: { message: `column "${options.failOnColumn}" does not exist` },
            });
          }
          inserts.push(payload);
          return Promise.resolve({ error: null });
        },
        select(columns: string) {
          selects.push(columns);
          const failing = options.selectError !== undefined && columns.includes("sources");
          const builder = {
            eq: () => builder,
            order: () => builder,
            then: (resolve: (v: unknown) => unknown) =>
              resolve(
                failing
                  ? { data: null, error: { message: options.selectError } }
                  : {
                      data: (options.rows ?? []).map((row) =>
                        failing ? row : { ...row },
                      ),
                      error: null,
                    },
              ),
          };
          return builder;
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, inserts, selects };
}

const SOURCE: ChatSource = {
  name: "Australian Government Department of Home Affairs - Student visa (subclass 500)",
  url: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500",
  label: "一次情報（Department of Home Affairs）",
  reviewedAt: "2026-10-02",
  topic: "学生ビザ（サブクラス500） / 就労の条件",
};

async function main() {
console.log("Test 1: assistant の回答に出典が保存される");
{
  const { client, inserts } = fakeClient();
  await saveChatMessage(client, "s1", "assistant", "授業期間中は2週間で48時間までです。", null, [SOURCE]);
  assert(inserts.length === 1, "1行だけ insert される");
  const row = inserts[0];
  assert(row.role === "assistant" && typeof row.content === "string", "role / content が保存される");
  assert(Array.isArray(row.sources) && (row.sources as unknown[]).length === 1, "sources が保存される");
  const saved = (row.sources as ChatSource[])[0];
  assert(saved.url === SOURCE.url, "URL が保存される");
  assert(saved.label === SOURCE.label, "利用者向けラベルが保存される");
  assert(saved.reviewedAt === "2026-10-02", "確認日が保存される");
}

console.log("Test 2: user の発言には出典を保存しない");
{
  const { client, inserts } = fakeClient();
  await saveChatMessage(client, "s1", "user", "学生ビザで働けますか？", null, [SOURCE]);
  assert(inserts.length === 1, "1行だけ insert される");
  assert(!Object.hasOwn(inserts[0], "sources"), "user の行に sources 列を付けない");
}

console.log("Test 3: reload 相当で同じ出典が戻る");
{
  const { client } = fakeClient({
    rows: [
      { role: "user", content: "学生ビザで働けますか？", proposal_data: null, sources: null },
      { role: "assistant", content: "2週間で48時間までです。", proposal_data: null, sources: [SOURCE] },
    ],
  });
  const messages = await loadChatMessages(client, "s1");
  assert(messages.length === 2, "2件復元される");
  assert(messages[0].sources === undefined, "user のメッセージに出典は付かない");
  assert(messages[1].sources?.length === 1, "assistant のメッセージに出典が戻る");
  assert(messages[1].sources?.[0].name === SOURCE.name, "出典名が一致する");
  assert(messages[1].sources?.[0].label === SOURCE.label, "ラベルが一致する");
  assert(messages[1].content === "2週間で48時間までです。", "本文が壊れていない");
}

console.log("Test 4: 出典が無い既存メッセージも通常どおり動く");
{
  const { client } = fakeClient({
    rows: [
      { role: "assistant", content: "古い回答", proposal_data: null },
      { role: "assistant", content: "null の行", proposal_data: null, sources: null },
      { role: "assistant", content: "空配列の行", proposal_data: null, sources: [] },
    ],
  });
  const messages = await loadChatMessages(client, "s1");
  assert(messages.length === 3, "3件すべて復元される");
  assert(messages.every((m) => m.sources === undefined), "出典が無い行は sources を持たない（パネル非表示）");
  assert(messages.map((m) => m.content).join("|").includes("古い回答"), "本文は従来どおり");
}

console.log("Test 5-6: 安全でない URL は表示前に落とす");
{
  const stored = [
    { name: "http", url: "http://example.gov.au/a", label: "政府の公式情報" },
    { name: "javascript", url: "javascript:alert(1)", label: "政府の公式情報" },
    { name: "data", url: "data:text/html,x", label: "政府の公式情報" },
    { name: "正常", url: "https://example.gov.au/ok", label: "政府の公式情報" },
  ];
  const sanitized = sanitizeStoredChatSources(stored);
  assert(sanitized.length === 1, `https のものだけ残る（${sanitized.length}件）`);
  assert(sanitized[0].name === "正常", "正常な出典だけ残る");

  // 読み出し経路でも同じ（DB が書き換えられていても UI を壊さない）
  const { client } = fakeClient({
    rows: [{ role: "assistant", content: "x", proposal_data: null, sources: stored }],
  });
  const messages = await loadChatMessages(client, "s1");
  assert(messages[0].sources?.length === 1, "読み出し時にも1件へ絞られる");
  assert(
    messages[0].sources?.every((s) => s.url.startsWith("https://")) === true,
    "残るのは https だけ",
  );
}

console.log("Test 7: 5件を超える出典は上限で切る");
{
  const many = Array.from({ length: 11 }, (_, i) => ({
    name: `出典${i}`,
    url: `https://example.gov.au/${i}`,
    label: "政府の公式情報",
  }));
  assert(
    sanitizeStoredChatSources(many).length === CHAT_SOURCE_MAX,
    `上限 ${CHAT_SOURCE_MAX} 件（実際: ${sanitizeStoredChatSources(many).length}）`,
  );
  const { client, inserts } = fakeClient();
  await saveChatMessage(client, "s1", "assistant", "x", null, many as unknown as ChatSource[]);
  assert(
    (inserts[0].sources as unknown[]).length === CHAT_SOURCE_MAX,
    "保存時点でも上限を超えない",
  );
}

console.log("Test 8: 同じ URL は保存前に1件へまとめる");
{
  const dup = [
    { name: "A", url: "https://example.gov.au/a", label: "政府の公式情報" },
    { name: "A", url: "https://example.gov.au/a/", label: "政府の公式情報" },
    { name: "A", url: "https://example.gov.au/a#top", label: "政府の公式情報" },
  ];
  const { client, inserts } = fakeClient();
  await saveChatMessage(client, "s1", "assistant", "x", null, dup as unknown as ChatSource[]);
  assert((inserts[0].sources as unknown[]).length === 1, "重複 URL は1件にまとまる");
}

console.log("Test 9-12: 内部メタデータ・開発用 snapshot を保存しない");
{
  // 仮に内部キーを混ぜて渡しても、保存される形には出てこない。
  const contaminated = [
    {
      ...SOURCE,
      review_note: "人間レビュー待ち。confidence は Medium",
      reviewNote: "内部メモ",
      primarySourceVerified: true,
      supersededValue: { previousValue: "最長5年", previousSource: "Study Australia" },
      unverified: ["家族を伴う場合の金額"],
      devSnapshot: { source: "numbeo", safetyIndex: 66.2 },
      promptInstructions: "数値を推測しないでください",
      categories: ["work_rights"],
    },
  ];
  const { client, inserts } = fakeClient();
  await saveChatMessage(client, "s1", "assistant", "x", null, contaminated as unknown as ChatSource[]);
  const serialized = JSON.stringify(inserts[0].sources);
  for (const banned of [
    "review_note",
    "reviewNote",
    "人間レビュー待ち",
    "primarySourceVerified",
    "supersededValue",
    "最長5年",
    "unverified",
    "numbeo",
    "safetyIndex",
    "devSnapshot",
    "promptInstructions",
    "categories",
  ]) {
    assert(!serialized.includes(banned), `保存された出典に「${banned}」が無い`);
  }
  // 保存されるキーは表示用のものだけ
  const keys = Object.keys((inserts[0].sources as Record<string, unknown>[])[0]).sort();
  assert(
    keys.every((k) => ["name", "url", "label", "reviewedAt", "updatedAt", "note", "topic"].includes(k)),
    `表示用のキーだけが保存される（${keys.join(",")}）`,
  );
  // migration も内部メモを保存しない方針を書いている
  const migration = readFileSync("supabase/migrations/20261006_chat_message_sources.sql", "utf8");
  assert(/review_note/.test(migration) && /保存しない/.test(migration), "migration に保存しない方針が書かれている");
  assert(/add column if not exists sources jsonb/.test(migration), "sources 列を追加するだけの migration");
  assert(!/drop |truncate |delete from/i.test(migration), "破壊的な操作を含まない");
  assert(!/proposal_data/.test(migration.split("--")[0] || ""), "proposal_data を流用していない");
}

console.log("Test 13: 次のターンの LLM へ出典を送り返さない");
{
  const chat = readFileSync("components/Chat.tsx", "utf8");
  assert(
    /function toChatMessages\(list: DisplayMessage\[\]\): ChatMessage\[\] \{\s*return list\.map\(\(\{ role, content \}\) => \(\{ role, content \}\)\);/.test(
      chat,
    ),
    "送信時は role / content だけに戻している",
  );
  assert(
    !/sources/.test(chat.slice(chat.indexOf("body: JSON.stringify("), chat.indexOf("body: JSON.stringify(") + 400)),
    "/api/chat のリクエストボディに sources を入れていない",
  );
}

console.log("Test 14: 匿名 /widget は保存経路を使わない");
{
  const chat = readFileSync("components/Chat.tsx", "utf8");
  assert(
    /if \(!planId \|\| !sessionId\) return;/.test(chat),
    "planId / sessionId が無ければ保存しない（匿名 /widget は保存対象外）",
  );
  const migration = readFileSync("supabase/migrations/20261006_chat_message_sources.sql", "utf8");
  assert(/匿名/.test(migration), "匿名 /widget は対象外である旨が migration に書かれている");
  // 匿名用の新しいテーブルを作っていない
  assert(!/create table/i.test(migration), "匿名用の新規テーブルを作っていない");
}

console.log("Test 15: 本文の保存を出典のために失敗させない");
{
  // sources 列が無い環境（migration 未適用）を再現する
  const { client, inserts } = fakeClient({ failOnColumn: "sources" });
  await saveChatMessage(client, "s1", "assistant", "本文は保存されるべき", null, [SOURCE]);
  assert(inserts.length === 1, "出典付き insert が失敗しても本文だけで再保存される");
  assert(inserts[0].content === "本文は保存されるべき", "本文が保存されている");
  assert(!Object.hasOwn(inserts[0], "sources"), "再保存では sources を付けない");

  // select 側も同様（列が無ければ sources なしで読み直す）
  const { client: readClient, selects } = fakeClient({
    rows: [{ role: "assistant", content: "過去の回答", proposal_data: null }],
    selectError: 'column "sources" does not exist',
  });
  const messages = await loadChatMessages(readClient, "s1");
  assert(messages.length === 1 && messages[0].content === "過去の回答", "列が無くても履歴が読める");
  assert(messages[0].sources === undefined, "その場合は出典なしになる");
  assert(selects.length === 2, `sources 付き → なしの順で2回問い合わせる（${selects.length}回）`);
}

console.log("Test 16: 長すぎる値・壊れた値を落とす");
{
  const long = "あ".repeat(5000);
  const sanitized = sanitizeStoredChatSources([
    { name: long, url: "https://example.gov.au/a", label: long, note: long },
    { name: "名前なし相当", url: "   ", label: "政府の公式情報" },
    { url: "https://example.gov.au/b", label: "政府の公式情報" },
    "文字列",
    null,
    42,
  ]);
  assert(sanitized.length === 1, `正常な1件だけ残る（${sanitized.length}件）`);
  assert(sanitized[0].name.length <= 121, `出典名に長さ上限がある（${sanitized[0].name.length}文字）`);
  assert((sanitized[0].note ?? "").length <= 161, `補足に長さ上限がある（${(sanitized[0].note ?? "").length}文字）`);
  assert(sanitized[0].label.length <= 81, `ラベルに長さ上限がある（${sanitized[0].label.length}文字）`);
  assert(sanitizeStoredChatSources("配列ではない").length === 0, "配列でなければ0件");
  assert(sanitizeStoredChatSources(null).length === 0, "null なら0件");
}

}

void main().then(() => {
console.log("");
console.log(`passed: ${pass} / failed: ${fail}`);
  if (fail > 0) process.exit(1);
});
