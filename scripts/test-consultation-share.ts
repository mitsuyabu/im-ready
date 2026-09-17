/**
 * Consultation Sheet の共有機能（URL / QR / 公開範囲 / 停止）の確認スクリプト。
 *
 *   npx tsx scripts/test-consultation-share.ts
 *
 * 確認するのは環境に依存しない部分:
 *   - share_config の sanitize（未知 / 不正な値は既定へ）
 *   - 共有 URL の組み立て
 *   - 所有者側の共有読み取り（fake Supabase client。停止済み・期限切れは「共有なし」）
 *   - 公開ページ用の変換: OFF の section が出ないこと、項目が {text, completed} だけになること、
 *     サマリーが stated / My Plan / conflict から正しく組み立つこと、不正な戻り値は null
 *   - route の request body validation（parsePlanId）
 *   - token の形式と一意性、hash の一致（既存 lib/documentShareToken.ts）
 *
 * DB そのもの（RLS・SECURITY DEFINER 関数）は SQL 側で別途確認する。remote DB へは接続しない。
 */

import {
  CONSULTATION_SHARE_SECTIONS,
  DEFAULT_CONSULTATION_SHARE_CONFIG,
  consultationShareUrl,
  isEmptyPublicConsultationSheet,
  loadActiveConsultationShare,
  parsePublicConsultationSheet,
  sanitizeConsultationShareConfig,
} from "@/lib/consultationShare";
import { generateShareToken, hashShareToken } from "@/lib/documentShareToken";
import { parsePlanId } from "@/app/api/documents/consultation-sheet/share/route";
import type { SupabaseClient } from "@supabase/supabase-js";

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

/* ------------------------------------------------------------------ */
console.log("Case 1: share_config の sanitize");
{
  const empty = sanitizeConsultationShareConfig(undefined);
  assert(
    empty.showSummary && empty.showTopics && empty.showTodos && !empty.showFindings && !empty.showNextActions,
    "何も渡さないと既定（サマリー・相談したいこと・To Do だけ ON）",
  );

  const partial = sanitizeConsultationShareConfig({ showTopics: false, showFindings: true });
  assert(partial.showTopics === false, "渡した false は尊重される");
  assert(partial.showFindings === true, "渡した true は尊重される");
  assert(partial.showTodos === true, "渡していない key は既定のまま");

  const hostile = sanitizeConsultationShareConfig({
    showSummary: "true",
    showTopics: 1,
    extra: true,
    __proto__: { showTodos: false },
  });
  assert(hostile.showSummary === true, "真偽値でない値は既定へ戻る（文字列 'true' を採用しない）");
  assert(hostile.showTopics === true, "数値 1 も採用しない");
  assert(Object.keys(hostile).length === 5, "既知の5 key 以外は取り込まれない");

  assert(CONSULTATION_SHARE_SECTIONS.length === 5, "UI の section 一覧は config と同じ5件");
  assert(
    CONSULTATION_SHARE_SECTIONS.every((s) => s.key in DEFAULT_CONSULTATION_SHARE_CONFIG),
    "UI の section key はすべて config に存在する",
  );
}

/* ------------------------------------------------------------------ */
console.log("Case 2: 共有 URL と token");
{
  const token = generateShareToken();
  assert(/^[A-Za-z0-9_-]{40,}$/.test(token), "token は URL-safe で十分に長い（base64url 43文字）");
  assert(generateShareToken() !== generateShareToken(), "token は毎回異なる");
  assert(hashShareToken(token) === hashShareToken(token), "同じ token の hash は一致する");
  assert(hashShareToken(token) !== token, "保存する hash は token そのものではない");

  const url = consultationShareUrl("https://example.com", token);
  assert(url === `https://example.com/share/consultation/${token}`, "共有 URL の形");
  assert(
    consultationShareUrl("https://example.com/", token) === url,
    "末尾スラッシュがあっても同じ URL になる",
  );
  assert(!url.includes("plan"), "URL に planId は含まれない");
}

/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
console.log("Case 3: 公開ページ用の変換 — OFF の section は出ない");
{
  const row = {
    plan_title: "オーストラリア留学",
    show_summary: false,
    show_topics: true,
    show_todos: true,
    show_findings: false,
    show_next_actions: false,
    topics: [{ text: "ビザの違いを聞きたい", completed: false }],
    todos: [{ text: "見積もりをもらう", completed: true }],
    // DB 側で既に空になっているが、万一値が入っていても OFF なら表示しない。
    findings: [{ text: "見せてはいけないメモ", completed: false }],
    next_actions: [{ text: "見せてはいけない次の一手", completed: false }],
    summary_source: { karte: { preferredCity: "シドニー" } },
    sheet_updated_at: "2026-09-18T03:00:00Z",
  };
  const sheet = parsePublicConsultationSheet(row);
  assert(sheet !== null, "正常な戻り値は表示できる");
  assert(sheet?.topics.length === 1 && sheet.topics[0].text === "ビザの違いを聞きたい", "ON の section は表示される");
  assert(sheet?.todos[0].completed === true, "To Do の完了状態は残る");
  assert(sheet?.findings.length === 0, "OFF の『相談して分かったこと』は表示されない");
  assert(sheet?.nextActions.length === 0, "OFF の『次にやること』は表示されない");
  assert(sheet?.summary === null, "OFF のサマリーは表示されない");
  assert(sheet?.planTitle === "オーストラリア留学", "Plan のタイトルは表示される");
  assert(sheet?.updatedAt === "2026-09-18T03:00:00Z", "更新日時が読める");
}

console.log("Case 4: 公開ページ用の変換 — 項目の形と不正な値");
{
  const sheet = parsePublicConsultationSheet({
    plan_title: "留学",
    show_topics: true,
    topics: [
      { text: "  前後に空白  ", completed: false },
      { text: "", completed: true },
      { text: "余計な情報つき", completed: true, id: "secret-id", source: "candidate", category: "budget" },
      "文字列はスキップ",
      null,
    ],
    show_summary: false,
    show_todos: false,
    show_findings: false,
    show_next_actions: false,
    sheet_updated_at: "not-a-date",
  });
  assert(sheet?.topics.length === 2, "空文字・非オブジェクトは落とす");
  assert(sheet?.topics[0].text === "前後に空白", "前後の空白は落とす");
  assert(
    sheet !== null && Object.keys(sheet.topics[1]).sort().join(",") === "completed,text",
    "項目は text と completed だけになる（id・source・category は持たない）",
  );
  assert(sheet?.updatedAt === null, "不正な日時は表示しない");

  assert(parsePublicConsultationSheet(null) === null, "戻り値が無ければ null");
  assert(parsePublicConsultationSheet([]) === null, "配列も null");
  assert(parsePublicConsultationSheet({ plan_title: "" }) === null, "タイトルが無ければ null");
}

console.log("Case 5: 基本情報サマリーの組み立て");
{
  const sheet = parsePublicConsultationSheet({
    plan_title: "留学",
    show_summary: true,
    show_topics: false,
    show_todos: false,
    show_findings: false,
    show_next_actions: false,
    topics: [],
    todos: [],
    findings: [],
    next_actions: [],
    summary_source: {
      karte: {
        preferredCountries: ["オーストラリア"],
        preferredCity: "ゴールドコースト",
        durationLabel: "6ヶ月",
        rangeLabel: "200万円以内",
        selfLevel: "初級",
        wantsToWork: true,
      },
      conflicts: [
        {
          block: "timing",
          key: "departureTiming",
          existingValue: "2027年4月",
          incomingValue: "2027年9月",
        },
      ],
      myPlan: { primaryCity: "シドニー", durationMonths: 9, accommodations: [], workInterests: [] },
    },
    sheet_updated_at: "2026-09-18T03:00:00Z",
  });

  const rows = sheet?.summary ?? [];
  const find = (label: string) => rows.find((r) => r.label === label);
  assert(rows.length > 0, "サマリーの行が作られる");
  assert(find("希望都市")?.value === "シドニー", "My Plan の都市が Karte より優先される");
  assert(find("希望国")?.value.includes("オーストラリア") === true, "stated の希望国が出る");
  assert(find("予算")?.value === "200万円以内", "stated の予算が出る");
  assert(find("出発時期")?.value.includes("検討中") === true, "conflict は『検討中』として出る");
  assert(
    find("出発時期")?.value.includes("2027年4月") === true && find("出発時期")?.value.includes("2027年9月") === true,
    "conflict は両方の候補を並べる",
  );
  assert(find("就学希望")?.status === "undecided", "stated でない項目は未定として出る");
  assert(
    JSON.stringify(rows).includes("certainty") === false && JSON.stringify(rows).includes("inferred") === false,
    "certainty / inferred といった内部情報は含まれない",
  );
}

console.log("Case 6: 何も共有されていないシート");
{
  const sheet = parsePublicConsultationSheet({
    plan_title: "留学",
    show_summary: false,
    show_topics: true,
    show_todos: true,
    show_findings: false,
    show_next_actions: false,
    topics: [],
    todos: [],
    findings: [],
    next_actions: [],
    summary_source: null,
    sheet_updated_at: "2026-09-18T03:00:00Z",
  });
  assert(sheet !== null, "中身が空でもページ自体は表示できる");
  assert(sheet !== null && isEmptyPublicConsultationSheet(sheet), "空であることを判定できる");
}

console.log("Case 7: route の planId 検証");
{
  assert(parsePlanId("plan-1") === "plan-1", "文字列はそのまま");
  assert(parsePlanId("  plan-1  ") === "plan-1", "前後の空白は落とす");
  assert(parsePlanId(undefined) === null, "未指定は null（400）");
  assert(parsePlanId("") === null, "空文字は null");
  assert(parsePlanId(123) === null, "文字列以外は null");
  assert(parsePlanId({ planId: "x" }) === null, "オブジェクトは null");
}

/* ------------------------------------------------------------------ */

/** 非同期のためここだけ関数にし、最後に実行する（top-level await を使わない）。 */
async function checkOwnerSideLoading() {
  console.log("Case 8: 所有者側の共有読み取り");
  function fakeClient(row: Record<string, unknown> | null, error?: { message: string }): SupabaseClient {
    const builder = {
      select: () => builder,
      eq: () => builder,
      is: () => builder,
      maybeSingle: async () => ({ data: row, error: error ?? null }),
    };
    return { from: () => builder } as unknown as SupabaseClient;
  }

  const none = await loadActiveConsultationShare(fakeClient(null), "plan-1");
  assert(none.available && none.share === null, "有効な共有が無ければ share は null");

  const active = await loadActiveConsultationShare(
    fakeClient({ token: "tok-1", share_config: { showTodos: false }, created_at: "2026-09-18T00:00:00Z", expires_at: null }),
    "plan-1",
  );
  assert(active.available && active.share?.token === "tok-1", "有効な共有の token が返る");
  assert(active.available && active.share?.config.showTodos === false, "保存された公開範囲が読める");
  assert(active.available && active.share?.config.showSummary === true, "保存されていない key は既定へ");

  const expired = await loadActiveConsultationShare(
    fakeClient({ token: "tok-2", share_config: {}, created_at: null, expires_at: "2000-01-01T00:00:00Z" }),
    "plan-1",
  );
  assert(expired.available && expired.share === null, "期限切れは「共有なし」として扱う");

  const broken = await loadActiveConsultationShare(fakeClient(null, { message: "boom" }), "plan-1");
  assert(!broken.available, "読み取りエラーは available:false（UI は共有中と誤表示しない）");
}

void checkOwnerSideLoading().then(() => {
  console.log("");
  console.log(`passed: ${pass} / failed: ${fail}`);
  if (fail > 0) process.exit(1);
});
