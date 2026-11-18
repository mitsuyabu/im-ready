/**
 * Plan 削除（物理削除）の確認スクリプト。
 *
 *   npx tsx scripts/test-plan-delete.ts
 *
 * ここで見るのは、DB を使わずに確認できる部分:
 *   1. 削除結果の判定（**エラーが無いことを成功にしない** / 0 行は失敗）
 *   2. localStorage の後片付けが「この Plan に属すると確認できるキー」だけであること
 *   3. ダイアログの文言（取消不能・関連データ・共有リンク。相手の手元のコピーまで消せるとは書かない）
 *   4. 画面側の実装（本人の権限で id ＋ user_id を条件に削除 / 失敗時は何も消さない / a11y）
 *   5. 連動削除の対象一覧が、実 migration の外部キーと一致していること
 *
 * RLS と cascade そのものの挙動（他人の Plan を消せない・関連データが連動して消える・
 * 共有リンクが引けなくなる）は、使い捨ての Postgres に実 migration を適用して SQL で確認している
 * （このスクリプトからは DB へ接続しない）。
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import {
  PLAN_DELETE_CASCADE_TABLES,
  PLAN_DELETE_IRREVERSIBLE_NOTE,
  PLAN_DELETE_ITEMS,
  PLAN_DELETE_SHARE_NOTE,
  clearPlanLocalStorage,
  interpretPlanDeleteResult,
  planLocalStorageKeys,
} from "@/lib/planDelete";
import { savePendingConsultationChange } from "@/lib/consultationSheetSync";
import { savePendingWorksheetChange, saveWorksheetState } from "@/lib/worksheetStorage";

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

const PLAN_ID = "aaaaaaa1-0000-0000-0000-000000000001";
const OTHER_PLAN_ID = "bbbbbbb1-0000-0000-0000-000000000003";

const dialogSource = readFileSync("components/DeletePlanDialog.tsx", "utf8");
const cardMenuSource = readFileSync("components/PlanCardMenu.tsx", "utf8");
const planHomeButtonSource = readFileSync("components/DeletePlanButton.tsx", "utf8");
const myPageSource = readFileSync("app/mypage/page.tsx", "utf8");
const planHomeSource = readFileSync("app/plans/[planId]/page.tsx", "utf8");
const CASCADE_MIGRATION = "supabase/migrations/20261118_profile_facts_plan_cascade.sql";
const cascadeMigrationSource = readFileSync(CASCADE_MIGRATION, "utf8");
/** 「していないこと」の検査は、説明コメントを除いた実行される SQL だけを見る。 */
const cascadeMigrationSql = cascadeMigrationSource
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

/** テスト用の localStorage。 */
function fakeStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    api: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    } as Storage,
  };
}

console.log("Test 1: 削除結果の判定（エラーが無いことを成功にしない）");
{
  const ok = interpretPlanDeleteResult({ planId: PLAN_ID, error: null, rows: [{ id: PLAN_ID }] });
  assert(ok.ok === true, "1 行かつ id が一致 → 成功");
  assert(ok.ok === true && ok.deletedId === PLAN_ID, "成功時は削除された id を返す");

  // RLS で対象外だった場合、Postgres はエラーを返さず 0 行になる。ここを成功にしてはいけない。
  const zero = interpretPlanDeleteResult({ planId: PLAN_ID, error: null, rows: [] });
  assert(zero.ok === false, "error が null でも 0 行なら失敗");
  assert(zero.ok === false && zero.reason === "not_deleted", "0 行の理由は not_deleted");
  assert(
    zero.ok === false && zero.message.includes("削除できませんでした"),
    "0 行のときは本人に失敗が伝わる文言",
  );

  const nullRows = interpretPlanDeleteResult({ planId: PLAN_ID, error: null, rows: null });
  assert(nullRows.ok === false && nullRows.reason === "not_deleted", "rows が null でも失敗");

  const errored = interpretPlanDeleteResult({ planId: PLAN_ID, error: { message: "boom" }, rows: null });
  assert(errored.ok === false && errored.reason === "error", "DB エラーは失敗");

  const wrongId = interpretPlanDeleteResult({ planId: PLAN_ID, error: null, rows: [{ id: OTHER_PLAN_ID }] });
  assert(wrongId.ok === false && wrongId.reason === "unexpected", "別の id が返ったら失敗（安全側）");

  const tooMany = interpretPlanDeleteResult({
    planId: PLAN_ID,
    error: null,
    rows: [{ id: PLAN_ID }, { id: OTHER_PLAN_ID }],
  });
  assert(tooMany.ok === false && tooMany.reason === "unexpected", "複数行が返ったら失敗（安全側）");

  // 失敗の文言は原因を断定しない（「権限がありません」等と言い切らない）
  assert(
    zero.ok === false && !zero.message.includes("権限がありません"),
    "失敗の理由を断定しない文言になっている",
  );
}

console.log("Test 2: localStorage は、この Plan に属すると確認できるキーだけ消す");
{
  const keys = planLocalStorageKeys(PLAN_ID);
  assert(keys.length === 3, `対象キーは 3 件（実際: ${keys.length}）`);
  assert(
    keys.every((k) => k.includes(PLAN_ID)),
    "すべてのキーに planId が含まれている（前方一致で広く消さない）",
  );
  assert(keys.includes(`ryugaku-worksheet-answers:plan:${PLAN_ID}`), "Plan のワークシート回答のキー");
  assert(keys.includes(`ryugaku-worksheet-pending:plan:${PLAN_ID}`), "Plan のワークシート未保存控えのキー");
  assert(keys.includes(`ryugaku-consultation-pending:plan:${PLAN_ID}`), "Plan の相談シート未保存控えのキー");
  assert(planLocalStorageKeys("  ").length === 0, "planId が空なら 1 件も対象にしない");

  // 列挙したキーが、実際に各モジュールが書き込むキーと一致していること（列挙漏れ・ずれの検出）
  const written = fakeStorage();
  const originalWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = { localStorage: written.api };
  try {
    saveWorksheetState(
      {
        answers: { q1: "a" },
        ratings: {},
        rankings: {},
        compromises: {},
        singleSelections: {},
        multiSelections: {},
      },
      PLAN_ID,
    );
    savePendingWorksheetChange(PLAN_ID, {
      baseRevision: 1,
      base: { answers: {}, ratings: {}, rankings: {}, compromises: {}, singleSelections: {}, multiSelections: {} },
      local: { answers: { q1: "a" }, ratings: {}, rankings: {}, compromises: {}, singleSelections: {}, multiSelections: {} },
    });
    savePendingConsultationChange(PLAN_ID, {
      baseRevision: 1,
      base: { topics: [], todos: [], findings: [], nextActions: [], handledCandidateKeys: [] },
      local: { topics: [], todos: [], findings: [], nextActions: [], handledCandidateKeys: [] },
    });
  } finally {
    (globalThis as { window?: unknown }).window = originalWindow;
  }
  const actuallyWritten = [...written.store.keys()].sort();
  assert(
    JSON.stringify(actuallyWritten) === JSON.stringify([...keys].sort()),
    `実際に書き込まれるキーと列挙が一致する（実際: ${actuallyWritten.join(", ")}）`,
  );
}

console.log("Test 3: 他の Plan・匿名利用・ログイン情報のキーは消さない");
{
  const other = fakeStorage({
    [`ryugaku-worksheet-answers:plan:${PLAN_ID}`]: "1",
    [`ryugaku-worksheet-pending:plan:${PLAN_ID}`]: "1",
    [`ryugaku-consultation-pending:plan:${PLAN_ID}`]: "1",
    // 消してはいけないもの
    [`ryugaku-worksheet-answers:plan:${OTHER_PLAN_ID}`]: "keep",
    [`ryugaku-consultation-pending:plan:${OTHER_PLAN_ID}`]: "keep",
    "ryugaku-worksheet-answers": "keep", // 匿名 Worksheet（/worksheet）の保存
    "sb-zuscwwfhijndfovlnjdj-auth-token": "keep", // ログイン情報
    "some-other-app-key": "keep",
  });

  const removed = clearPlanLocalStorage(PLAN_ID, other.api);
  assert(removed.length === 3, `消したのは 3 件だけ（実際: ${removed.length}）`);
  assert(other.store.get(`ryugaku-worksheet-answers:plan:${OTHER_PLAN_ID}`) === "keep", "他の Plan の回答は残る");
  assert(other.store.get(`ryugaku-consultation-pending:plan:${OTHER_PLAN_ID}`) === "keep", "他の Plan の控えは残る");
  assert(other.store.get("ryugaku-worksheet-answers") === "keep", "匿名 Worksheet の保存は残る");
  assert(other.store.get("sb-zuscwwfhijndfovlnjdj-auth-token") === "keep", "ログイン情報は残る");
  assert(other.store.get("some-other-app-key") === "keep", "無関係なキーは残る");
  assert(other.store.size === 5, `残ったキーは 5 件（実際: ${other.store.size}）`);

  // localStorage が使えない環境でも例外を投げない
  const throwing = {
    removeItem: () => {
      throw new Error("blocked");
    },
  } as unknown as Storage;
  let threw = false;
  try {
    clearPlanLocalStorage(PLAN_ID, throwing);
  } catch {
    threw = true;
  }
  assert(!threw, "localStorage が使えなくても例外にしない（削除自体は完了している）");
}

console.log("Test 4: ダイアログの文言");
{
  assert(PLAN_DELETE_IRREVERSIBLE_NOTE.includes("取り消せません"), "取り消せないことを明記している");
  assert(PLAN_DELETE_ITEMS.length >= 5, "消えるものを列挙している");
  for (const needle of ["チャット", "カルテ", "My Plan", "ワークシート", "My Karte"]) {
    assert(
      PLAN_DELETE_ITEMS.some((item) => item.includes(needle)),
      `消えるものに「${needle}」が含まれている`,
    );
  }
  assert(PLAN_DELETE_SHARE_NOTE.includes("共有リンク"), "共有リンクについて説明している");
  assert(PLAN_DELETE_SHARE_NOTE.includes("開けなくなります"), "共有リンクが無効になることを書いている");
  assert(
    PLAN_DELETE_SHARE_NOTE.includes("相手がすでに保存") && PLAN_DELETE_SHARE_NOTE.includes("取り消すことはできません"),
    "相手の手元に残ったコピーまで消せるとは書かない",
  );
  // 「復元できる」と誤解させる言い方をしない
  for (const forbidden of ["復元", "元に戻せ", "やり直せ"]) {
    assert(
      !PLAN_DELETE_IRREVERSIBLE_NOTE.includes(forbidden) &&
        !PLAN_DELETE_SHARE_NOTE.includes(forbidden) &&
        !PLAN_DELETE_ITEMS.some((i) => i.includes(forbidden)),
      `「${forbidden}」という言い方をしていない`,
    );
  }
  // ダイアログがこの文言を実際に使っている
  for (const symbol of ["PLAN_DELETE_IRREVERSIBLE_NOTE", "PLAN_DELETE_ITEMS", "PLAN_DELETE_SHARE_NOTE"]) {
    assert(dialogSource.includes(symbol), `ダイアログが ${symbol} を表示している`);
  }
  assert(dialogSource.includes("を削除しますか？"), "Plan 名を含む確認見出しがある");
}

console.log("Test 5: 削除クエリは本人の権限で id ＋ user_id を条件にする");
{
  assert(dialogSource.includes('.from("plans")'), "plans に対して削除する");
  assert(dialogSource.includes('.eq("id", planId)'), "id を条件にしている");
  assert(dialogSource.includes('.eq("user_id", userId)'), "user_id も条件にしている（RLS 任せにしない）");
  assert(dialogSource.includes('.select("id")'), "削除された id を返させている");
  assert(dialogSource.includes("interpretPlanDeleteResult"), "結果を判定関数に通している");
  assert(!/service_?role/i.test(dialogSource), "service role を使っていない");
  assert(dialogSource.includes('from "@/lib/supabase/client"'), "通常の（本人の）Supabase client を使っている");

  // 失敗したら何もしない: clearPlanLocalStorage / 遷移は、失敗時の early return より後にしかない
  const guardAt = dialogSource.indexOf("if (!outcome.ok)");
  const returnAt = dialogSource.indexOf("return;", guardAt);
  assert(guardAt > 0, "失敗時の分岐がある");
  assert(dialogSource.indexOf("clearPlanLocalStorage(planId)") > returnAt, "localStorage の後片付けは成功後だけ");
  assert(dialogSource.indexOf('router.push("/mypage")') > returnAt, "画面遷移は成功後だけ");
  assert(dialogSource.indexOf("router.refresh()") > returnAt, "一覧の更新は成功後だけ");
  assert(
    dialogSource.slice(guardAt, returnAt).includes("setError(outcome.message)"),
    "失敗時は理由を表示する",
  );

  // 二重実行の防止
  assert(dialogSource.includes("runningRef"), "同期フラグで二重実行を防いでいる");
  assert(dialogSource.includes("if (runningRef.current) return;"), "実行中の再クリックを無視する");
  assert(dialogSource.includes("disabled={busy}"), "削除中はボタンを無効化する");
  assert(dialogSource.includes('{busy ? "削除中…"'), "削除中であることを表示する");
}

console.log("Test 6: ダイアログの a11y（フォーカス・Tab・Escape・復帰）");
{
  assert(dialogSource.includes('role="dialog"'), "role=dialog");
  assert(dialogSource.includes('aria-modal="true"'), "aria-modal");
  assert(dialogSource.includes('aria-labelledby="delete-plan-title"'), "aria-labelledby で見出しを指している");
  assert(dialogSource.includes('aria-describedby="delete-plan-description"'), "aria-describedby で説明を指している");
  assert(dialogSource.includes("cancelRef.current?.focus()"), "開いたらキャンセルへフォーカス（破壊的操作を初期フォーカスにしない）");
  assert(dialogSource.includes("previous?.focus?.()"), "閉じたら元の要素へフォーカスを戻す");
  assert(dialogSource.includes("returnFocusRef"), "フォーカス復帰先を呼び出し側から受け取れる");
  assert(dialogSource.includes('e.key === "Escape"'), "Escape で閉じる");
  assert(dialogSource.includes('e.key !== "Tab"') && dialogSource.includes("last.focus()") && dialogSource.includes("first.focus()"), "Tab / Shift+Tab がダイアログ内で循環する");
  assert(dialogSource.includes("if (runningRef.current) return;\n    setError(null);"), "削除中は Escape・キャンセルで閉じない");
  assert(dialogSource.includes('role="alert"'), "エラーは role=alert で伝える");
  assert(!/\bdark:/.test(dialogSource), "dark: クラスを使っていない（light-only）");
}

console.log("Test 7: 2 つの導線（一覧のカード / Plan Home）");
{
  // 一覧のカード
  assert(cardMenuSource.includes('after="refresh"'), "一覧からの削除は画面を更新する");
  assert(cardMenuSource.includes("returnFocusRef={triggerRef}"), "一覧ではメニューの「…」へフォーカスを戻す");
  assert(cardMenuSource.includes('aria-haspopup="menu"') && cardMenuSource.includes("aria-expanded={menuOpen}"), "メニューの a11y 属性がある");
  assert(cardMenuSource.includes('e.key !== "Escape"') || cardMenuSource.includes('e.key === "Escape"'), "メニューも Escape で閉じる");
  assert(cardMenuSource.includes("e.stopPropagation()"), "カード全面のリンクへクリックを伝播させない");
  assert(cardMenuSource.includes("このPlanを削除"), "メニュー項目のラベルがある");

  // Plan Home
  assert(planHomeButtonSource.includes('after="mypage"'), "Plan Home からの削除後はマイページへ戻る");
  assert(planHomeButtonSource.includes("returnFocusRef={triggerRef}"), "Plan Home でもフォーカスを戻す");

  // ページ側の配線
  assert(myPageSource.includes("import PlanCardMenu"), "マイページがメニューを読み込んでいる");
  assert(myPageSource.includes("<PlanCardMenu planId={plan.id} planTitle={plan.title} userId={user.id} />"), "マイページが planId / title / userId を渡している");
  assert(myPageSource.includes('<div key={plan.id} className="relative">'), "カードのセルを relative で包んでメニューを重ねている");
  assert(!myPageSource.includes("HomePlanCard.tsx"), "カード本体（HomePlanCard）の実装は変更していない");
  assert(planHomeSource.includes("import DeletePlanButton"), "Plan Home がボタンを読み込んでいる");
  assert(
    planHomeSource.includes("<DeletePlanButton planId={typedPlan.id} planTitle={typedPlan.title} userId={user.id} />"),
    "Plan Home が planId / title / userId を渡している",
  );
}

console.log("Test 8: 連動削除の対象一覧が実 migration の外部キーと一致する");
{
  const files = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql"));
  const sql = files.map((f) => readFileSync(`supabase/migrations/${f}`, "utf8")).join("\n");

  /** `create table X (... references <parent>(id) on delete cascade ...)` から X を集める。 */
  function childrenOf(parent: string): string[] {
    const found = new Set<string>();
    const tableBlocks = sql.split(/create table\s+/).slice(1);
    for (const block of tableBlocks) {
      const name = block.split(/[\s(]/)[0]?.replace(/^public\./, "");
      const body = block.slice(0, block.indexOf(");") + 2);
      if (!name) continue;
      const re = new RegExp(`references\\s+(public\\.)?${parent}\\s*\\(id\\)\\s*on delete cascade`, "i");
      if (re.test(body)) found.add(name);
    }
    return [...found];
  }

  const firstLevel = childrenOf("plans");
  const secondLevel = [...new Set(firstLevel.flatMap((t) => childrenOf(t)))];
  const expected = [...new Set([...firstLevel, ...secondLevel])].sort();
  const declared: string[] = [...PLAN_DELETE_CASCADE_TABLES].sort();

  assert(firstLevel.length > 0, "plans を参照する cascade の子 table を検出できた（テストの前提）");
  assert(
    JSON.stringify(declared) === JSON.stringify(expected),
    `連動削除の一覧が migration と一致する（migration: ${expected.join(", ")}）`,
  );
  for (const table of ["plan_karte", "chat_sessions", "chat_messages", "plan_documents", "document_shares", "plan_blueprint", "plan_worksheet", "plan_consultation_sheet", "consultation_sheet_shares"]) {
    assert(declared.includes(table), `${table} が連動削除の対象に入っている`);
  }
}

console.log("Test 9: migration は profile_facts の外部キーだけを張り替える");
{
  // plans には既に本人向けの DELETE policy（own_plans_delete / using (auth.uid() = user_id)）が
  // 実 DB に存在するため、新しい DELETE policy は作らない（以前作った
  // 20261118_plans_delete_policy.sql は不要になったので削除した）。
  // 残っていた DB 側の課題は profile_facts の外部キーが NO ACTION だったことだけ。
  assert(
    !existsSync("supabase/migrations/20261118_plans_delete_policy.sql"),
    "不要になった plans の DELETE policy migration が残っていない",
  );
  const policyMigrations = readdirSync("supabase/migrations").filter((f) =>
    /plans_delete|delete_policy/i.test(f),
  );
  assert(policyMigrations.length === 0, `plans の DELETE policy を作る migration が無い（実際: ${policyMigrations.join(", ")}）`);

  assert(existsSync(CASCADE_MIGRATION), "profile_facts の cascade migration がある");
  assert(
    /alter table\s+public\.profile_facts/i.test(cascadeMigrationSource),
    "profile_facts に対する ALTER である",
  );
  assert(
    /drop constraint profile_facts_plan_id_fkey/i.test(cascadeMigrationSource),
    "既存の外部キー profile_facts_plan_id_fkey を drop する",
  );
  assert(
    /add\s+constraint profile_facts_plan_id_fkey/i.test(cascadeMigrationSource),
    "同じ制約名で作り直す",
  );
  assert(
    /references\s+public\.plans\(id\)\s*\n?\s*on delete cascade/i.test(cascadeMigrationSource),
    "参照先は plans(id) で ON DELETE CASCADE",
  );
  // drop と add が 1 文の ALTER に入っている（途中状態を作らない）
  const alterStatement = cascadeMigrationSql.slice(cascadeMigrationSql.lastIndexOf("alter table"));
  assert(
    alterStatement.indexOf("drop constraint") < alterStatement.indexOf("add  constraint") &&
      alterStatement.split(";").length === 2,
    "drop と add が 1 文の ALTER TABLE にまとまっている",
  );
  // 前提の確認（想定と違う定義なら止まる）
  assert(cascadeMigrationSource.includes("pg_get_constraintdef"), "適用前に既存の定義を確認している");
  assert(cascadeMigrationSource.includes("raise exception"), "想定と異なれば何も変更せず停止する");

  // 触ってはいけないもの
  assert(!/create policy|drop policy|alter policy/i.test(cascadeMigrationSql), "policy を変更しない");
  assert(!/grant |revoke /i.test(cascadeMigrationSql), "grant / revoke をしない");
  assert(!/row level security/i.test(cascadeMigrationSql), "RLS の設定を変更しない");
  assert(!/add column|drop column|alter column/i.test(cascadeMigrationSql), "列を変更しない");
  assert(!/drop constraint profile_facts_pkey|drop constraint profile_facts_plan_id_key/i.test(cascadeMigrationSql), "PK / UNIQUE を変更しない");
  assert(!/delete from|update .* set |truncate|insert into/i.test(cascadeMigrationSql), "データを変更しない（DELETE / UPDATE / backfill なし）");
  assert(!/create table|drop table/i.test(cascadeMigrationSql), "table を作らない・消さない");
  assert(!/service_?role/i.test(cascadeMigrationSql), "service role を使わない");
  // 他 table を対象にしていない
  const alteredTables = [...cascadeMigrationSql.matchAll(/alter table\s+(\S+)/gi)].map((m) => m[1]);
  assert(
    alteredTables.every((t) => t === "public.profile_facts"),
    `ALTER の対象は profile_facts だけ（実際: ${alteredTables.join(", ")}）`,
  );
  // 適用前後の確認方法が書かれている
  assert(cascadeMigrationSource.includes("confdeltype"), "適用前後を確認する読み取り専用 SQL が添えられている");
}

console.log("Test 10: モーダルが背景のカード・メニューより前面に出る（重なり順）");
{
  // 呼び出し元（PlanCardMenu）は `absolute … z-20` で**独自の重なり文脈**を作るため、
  // その中で描画すると、DOM 上で後ろにある別カードの「…」（同じ z-20）や
  // mobile の AppNav（z-30）がモーダルより前面に出る（実機で再現）。
  // body 直下へ portal し、アプリ内で最も高い z-index を使う。
  assert(dialogSource.includes('from "react-dom"') && dialogSource.includes("createPortal"), "モーダルを portal で描画している");
  assert(dialogSource.includes("document.body"), "portal 先は body 直下");
  assert(
    dialogSource.includes('if (!open || typeof document === "undefined") return null;'),
    "SSR では描画しない（document を触らない）",
  );
  // 早期 return はすべての hook より後ろ（hook の呼び出し順を変えない）
  assert(
    dialogSource.indexOf("if (!open || typeof document") > dialogSource.lastIndexOf("useEffect("),
    "早期 return は hook の後ろにある",
  );
  const overlay = dialogSource.split("\n").find((l) => l.includes("fixed inset-0")) ?? "";
  assert(overlay.includes("z-[100]"), `オーバーレイの z-index が z-[100]（実際: ${overlay.trim().slice(0, 60)}）`);
  assert(!overlay.includes("z-50"), "以前の z-50 が残っていない");

  // アプリ内に z-index 100 以上を使う箇所が他に無い（モーダルが最前面であることの担保）
  const sources = [
    ...readdirSync("components").filter((f) => f.endsWith(".tsx")).map((f) => `components/${f}`),
    ...readdirSync("components/chat", { withFileTypes: true }).filter((d) => d.isFile() && d.name.endsWith(".tsx")).map((d) => `components/chat/${d.name}`),
  ];
  const higher: string[] = [];
  for (const file of sources) {
    if (file.endsWith("DeletePlanDialog.tsx")) continue;
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/z-\[(\d+)\]|z-(\d+)/g)) {
      const value = Number(m[1] ?? m[2]);
      if (value >= 100) higher.push(`${file}: ${m[0]}`);
    }
  }
  assert(higher.length === 0, `他に z-index 100 以上を使っている箇所が無い（実際: ${higher.slice(0, 3).join(", ")}）`);

  // 背景側の z-index は上げない（カードのレイアウトを壊さない）
  assert(cardMenuSource.includes('className="absolute right-3 top-3 z-20"'), "カードメニューの z-index は z-20 のまま");
  assert(!/z-\[?[3-9]\d\]?/.test(cardMenuSource), "背景カード側の z-index を不必要に上げていない");

  // focus trap / Escape / focus restore は維持（Test 6 と同じ不変条件を portal 後も確認）
  assert(dialogSource.includes('e.key === "Escape"'), "portal 後も Escape で閉じる");
  assert(dialogSource.includes("cancelRef.current?.focus()"), "portal 後も初期フォーカスはキャンセル");
  assert(dialogSource.includes("previous?.focus?.()"), "portal 後もフォーカスを戻す");
  assert(dialogSource.includes('e.key !== "Tab"'), "portal 後も Tab を循環させる");
}

console.log("");
console.log(`passed: ${pass} / failed: ${fail}`);
if (fail > 0) process.exit(1);
