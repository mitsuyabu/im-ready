/**
 * Consultation Sheet（留学相談シート）の動作確認用スクリプト。
 * 対象: lib/consultationCandidates.ts / lib/consultationSummary.ts / lib/consultationSheet.ts /
 *       lib/consultationSheetSync.ts
 *
 * DB・Anthropic には触れない pure test。DB は RLS 付きの疑似 Supabase クライアント（メモリ上）で代用し、
 * 端末ごとに別インスタンスの同期器を作って「PC で編集 → スマホで開く」を再現する。
 *
 * 実行方法: npx tsx scripts/test-consultation-sheet.ts
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createEmptyKarte, type Karte } from "@/lib/karte";
import { createEmptyBlueprintData } from "@/lib/planBlueprint";
import type { WorksheetPersistedData } from "@/lib/worksheetStorage";
import { buildConsultationCandidates, visibleConsultationCandidates } from "@/lib/consultationCandidates";
import { buildConsultationSummary } from "@/lib/consultationSummary";
import {
  coerceConsultationSheet,
  createEmptyConsultationSheet,
  loadConsultationSheet,
  mergeConsultationSheets,
  type ConsultationItem,
  type ConsultationSheetState,
} from "@/lib/consultationSheet";
import { createConsultationSheetSync } from "@/lib/consultationSheetSync";

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

function stated(k: Karte, block: string, key: string, value: unknown, source = "chat") {
  (k as unknown as Record<string, Record<string, unknown>>)[block][key] = { value, certainty: "stated", source };
}
function inferred(k: Karte, block: string, key: string, value: unknown) {
  (k as unknown as Record<string, Record<string, unknown>>)[block][key] = { value, certainty: "inferred", source: "chat" };
}
function ws(mut: (d: WorksheetPersistedData) => void): WorksheetPersistedData {
  const d: WorksheetPersistedData = { answers: {}, ratings: {}, rankings: {}, compromises: {}, singleSelections: {}, multiSelections: {} };
  mut(d);
  return d;
}
function item(id: string, text: string, extra: Partial<ConsultationItem> = {}): ConsultationItem {
  return { id, text, source: "user", createdAt: "2026-09-17T00:00:00.000Z", updatedAt: "2026-09-17T00:00:00.000Z", ...extra };
}
const texts = (cs: { text: string }[]) => cs.map((c) => c.text).join(" | ");

/* ------------------------------------------------------------------ */
console.log("Test case 1: conflict・予算・英語の不安 → 都市 / 予算 / 英語・学校の候補（都市は確定しない）");
{
  const k = createEmptyKarte("p");
  stated(k, "schoolPrefs", "preferredCity", "Melbourne");
  k.handoff.conflicts = [
    { block: "schoolPrefs", key: "preferredCity", existingValue: "Gold Coast", existingSource: "worksheet", incomingValue: "Melbourne", incomingSource: "chat" } as never,
  ];
  stated(k, "budget", "rangeLabel", "100〜150万円", "worksheet");
  stated(k, "decision", "topConcern", "英語が話せるか不安");
  stated(k, "schoolPrefs", "accommodation", "ホームステイ", "worksheet");
  stated(k, "work", "wantsToWork", true, "worksheet");
  const c = buildConsultationCandidates(k, null);
  const topics = c.filter((x) => x.list === "topics");
  const todos = c.filter((x) => x.list === "todos");
  assert(topics.some((x) => x.text === "「Gold Coast」と「Melbourne」のどちらが自分に合うか相談する"), "都市: 両方を並べて相談（一方を選ばない）");
  assert(topics.some((x) => x.text.includes("予算（100〜150万円）")), "予算の範囲でできるプランを相談");
  assert(topics.some((x) => x.category === "英語"), "英語力に合う学校・準備を相談");
  assert(todos.some((x) => x.text === "ホームステイの費用を確認する"), "確認: ホームステイ費用");
  assert(todos.some((x) => x.text === "現地で働けるビザの条件を確認する"), "確認: 就労できるビザ条件");
  assert(!texts(c).includes("Melbourneを") && !texts(c).includes("Gold Coastに決"), "どちらかの都市に決めた表現が無い");
  assert(c.every((x) => x.basis.length > 0), "すべての候補に根拠の短い説明がある");
}

console.log("Test case 6: 情報がほぼない Plan → 候補を作らない");
{
  assert(buildConsultationCandidates(createEmptyKarte("p"), null).length === 0, "空の Karte から候補ゼロ");
  assert(
    buildConsultationCandidates(createEmptyKarte("p"), ws(() => {})).length === 0,
    "空の Worksheet でも候補ゼロ",
  );
}

console.log("Case: inferred / trueGoalHypothesis は候補にしない");
{
  const k = createEmptyKarte("p");
  inferred(k, "motivation", "trueGoalHypothesis", "今の環境から逃げたい");
  inferred(k, "decision", "topConcern", "お金が足りるか");
  inferred(k, "budget", "rangeLabel", "100〜150万円");
  const c = buildConsultationCandidates(k, null);
  assert(c.length === 0, "inferred しか無ければ候補ゼロ");
  assert(!texts(c).includes("本当の目的"), "「本当の目的」の相談を作らない");
}

console.log("Case: 本人が問題にしていないテーマを作らない（家族）");
{
  const k = createEmptyKarte("p");
  stated(k, "decision", "familySharingStatus", "まだ話していない", "worksheet");
  stated(k, "decision", "topConcern", "英語が話せるか不安");
  const c = buildConsultationCandidates(k, null);
  assert(!c.some((x) => x.category === "家族"), "家族の不安を述べていなければ家族の候補は出ない");
  const k2 = createEmptyKarte("p");
  stated(k2, "decision", "topConcern", "親をどう説得するか悩んでいる");
  assert(buildConsultationCandidates(k2, null).some((x) => x.category === "家族"), "本人が家族のことを不安として述べた場合だけ出る");
}

console.log("Case: 未定は「本人が未定と答えたもの」だけ");
{
  const w = ws((d) => {
    d.multiSelections["destination-city"] = ["city-undecided"];
    d.singleSelections["budget"] = "budget-unknown";
    d.singleSelections["stay-duration"] = "dur-undecided";
  });
  const c = buildConsultationCandidates(createEmptyKarte("p"), w);
  assert(c.some((x) => x.text === "希望条件に合う国・都市を相談する"), "都市未定 → 国・都市を相談");
  assert(c.some((x) => x.list === "todos" && x.text === "留学に必要な費用の目安を確認する"), "予算未定 → 費用の目安を確認");
  assert(c.some((x) => x.text === "自分に合う留学期間を相談する"), "期間未定 → 期間を相談");
  assert(!c.some((x) => x.category === "出発時期"), "出発時期に何も答えていなければ候補にしない（値が無い ≠ 未定）");
}

console.log("Case: Next Step で選んだ「知りたいこと」");
{
  const w = ws((d) => { d.multiSelections["nextstep-topics"] = ["cost", "visa", "school"]; });
  const c = buildConsultationCandidates(createEmptyKarte("p"), w);
  assert(c.some((x) => x.list === "todos" && x.category === "予算") && c.some((x) => x.category === "ビザ") && c.some((x) => x.category === "学校"), "費用・ビザ・学校");
  const k = createEmptyKarte("p");
  k.handoff.openQuestions = ["語学レベル"];
  assert(buildConsultationCandidates(k, null).some((x) => x.text === "「語学レベル」について相談する"), "未回答の論点も候補に");
}

console.log("Case: 候補の表示（追加済み・非表示・同じ文面の項目があるものは出さない）");
{
  const k = createEmptyKarte("p");
  stated(k, "budget", "rangeLabel", "100〜150万円");
  stated(k, "decision", "topConcern", "英語が話せるか不安");
  const cands = buildConsultationCandidates(k, null);
  const budget = cands.find((x) => x.category === "予算")!;
  const english = cands.find((x) => x.category === "英語")!;
  const sheet = createEmptyConsultationSheet();
  sheet.handledCandidateKeys = [budget.key];
  sheet.topics = [item("t1", english.text)];
  const visible = visibleConsultationCandidates(cands, sheet);
  assert(!visible.some((x) => x.key === budget.key), "扱い済み（追加・非表示）の候補は出ない");
  assert(!visible.some((x) => x.key === english.key), "同じ文面の項目が既にあれば出ない");
}

/* ------------------------------------------------------------------ */
console.log("Case: 上部サマリー（My Plan > Karte stated > 未定、conflict は検討中）");
{
  const k = createEmptyKarte("p");
  stated(k, "schoolPrefs", "preferredCity", "シドニー");
  stated(k, "timing", "durationLabel", "1年");
  stated(k, "budget", "rangeLabel", "まだ分からない");
  stated(k, "schoolPrefs", "accommodation", "ホームステイ");
  k.handoff.conflicts = [
    { block: "timing", key: "departureTiming", existingValue: "半年以内", existingSource: "worksheet", incomingValue: "来年の春", incomingSource: "chat" } as never,
  ];
  const bp = createEmptyBlueprintData();
  bp.destinations.primary = { id: "d", label: "ゴールドコースト", createdAt: "x" } as never;
  bp.planSettings.durationMonths = 12;
  const rows = buildConsultationSummary(k, bp);
  const get = (label: string) => rows.find((r) => r.label === label)!;
  assert(get("希望都市").value === "ゴールドコースト", "都市は My Plan を優先");
  assert(get("留学期間").value === "約12ヶ月", "期間も My Plan を優先");
  assert(get("出発時期").status === "considering" && get("出発時期").value.includes("半年以内") && get("出発時期").value.includes("来年の春"), "conflict は検討中（両方）");
  assert(get("予算").status === "undecided", "「まだ分からない」は未定として控えめに");
  assert(get("滞在希望").value === "ホームステイ", "My Plan に無ければ Karte stated");
  assert(get("希望国").value === "未定" && get("希望国").status === "undecided", "どこにも無ければ未定");
  assert(rows.length === 9, "9 項目の短い一覧（Study Plan の全文ではない）");
  const k2 = createEmptyKarte("p");
  inferred(k2, "schoolPrefs", "preferredCity", "パース");
  assert(buildConsultationSummary(k2, null).find((r) => r.label === "希望都市")!.value === "未定", "inferred は使わない");
}

/* ------------------------------------------------------------------ */
console.log("Case: sanitize と項目単位マージ");
{
  const coerced = coerceConsultationSheet({ topics: [{ id: "a", text: "OK" }, { id: "a", text: "dup" }, { text: "no id" }, "x"], todos: "bad", handledCandidateKeys: ["k", 1] });
  assert(coerced.topics.length === 1 && coerced.todos.length === 0 && coerced.handledCandidateKeys.join() === "k", "壊れた要素は捨て、重複 id は1つ");
  const base = createEmptyConsultationSheet();
  base.todos = [item("x", "見積もり")];
  const local = coerceConsultationSheet(base);
  local.todos = [item("x", "見積もり", { completed: true })];
  local.findings = [item("f", "PC で追加")];
  const server = coerceConsultationSheet(base);
  server.topics = [item("t", "スマホで追加")];
  const merged = mergeConsultationSheets(base, local, server);
  assert(merged.todos[0].completed === true && merged.findings.length === 1 && merged.topics.length === 1, "別端末の別々の変更が両方残る");
  const del = coerceConsultationSheet(base);
  del.todos = [];
  assert(mergeConsultationSheets(base, del, server).todos.length === 0, "削除もマージで保たれる");
}

/* ------------------------------------------------------------------ */
/* 疑似 DB（RLS: plans.user_id = 現在のユーザー）と同期器 */
type Row = { plan_id: string; state: unknown; revision: number; updated_at: string };
class FakeDb {
  rows = new Map<string, Row>();
  owners = new Map<string, string>();
  offline = false;
}
function fakeClient(db: FakeDb, userId: string): SupabaseClient {
  const visible = (planId: string) => db.owners.get(planId) === userId;
  const err = (message: string, code?: string) => ({ data: null, error: { message, code } });
  const from = () => {
    const q: { filters: [string, unknown][]; op: "select" | "insert" | "update"; payload?: Record<string, unknown> } = { filters: [], op: "select" };
    const exec = async (mode: "maybe" | "single") => {
      if (db.offline) return err("network");
      if (q.op === "insert") {
        const r = q.payload as unknown as Row;
        if (!visible(r.plan_id)) return err("rls", "42501");
        if (db.rows.has(r.plan_id)) return err("dup", "23505");
        db.rows.set(r.plan_id, { plan_id: r.plan_id, state: JSON.parse(JSON.stringify(r.state)), revision: r.revision, updated_at: new Date().toISOString() });
        return { data: { revision: r.revision }, error: null };
      }
      let rows = [...db.rows.values()].filter((r) => visible(r.plan_id));
      for (const [col, val] of q.filters) rows = rows.filter((r) => (r as unknown as Record<string, unknown>)[col] === val);
      if (q.op === "update") for (const r of rows) Object.assign(r, { state: JSON.parse(JSON.stringify(q.payload!.state)), revision: q.payload!.revision });
      const data = rows.map((r) => ({ state: JSON.parse(JSON.stringify(r.state)), revision: r.revision, updated_at: r.updated_at }));
      if (mode === "single" && data.length !== 1) return err("no rows");
      return { data: data[0] ?? null, error: null };
    };
    const b = {
      select: () => b,
      insert: (p: Record<string, unknown>) => { q.op = "insert"; q.payload = p; return b; },
      update: (p: Record<string, unknown>) => { q.op = "update"; q.payload = p; return b; },
      eq: (c: string, v: unknown) => { q.filters.push([c, v]); return b; },
      maybeSingle: () => exec("maybe"),
      single: () => exec("single"),
    };
    return b;
  };
  return { from } as unknown as SupabaseClient;
}
function timers() {
  const q: { fn: () => void; ms: number }[] = [];
  return {
    setTimer: (fn: () => void, ms: number) => { const h = { fn, ms }; q.push(h); return h; },
    clearTimer: (h: unknown) => { const i = q.indexOf(h as never); if (i >= 0) q.splice(i, 1); },
    async run() {
      for (let i = 0; i < 30; i++) {
        const idx = q.findIndex((h) => h.ms < 3000);
        if (idx < 0) break;
        q.splice(idx, 1)[0].fn();
        for (let k = 0; k < 6; k++) await new Promise((r) => setTimeout(r, 0));
      }
    },
  };
}
async function openDevice(db: FakeDb, user: string, planId: string) {
  const client = fakeClient(db, user);
  const loaded = await loadConsultationSheet(client, planId);
  const t = timers();
  let ui: ConsultationSheetState = loaded.available && loaded.row ? loaded.row.state : createEmptyConsultationSheet();
  const statuses: string[] = [];
  const sync = createConsultationSheetSync({
    planId,
    getClient: () => client,
    initialRow: loaded.available ? loaded.row : null,
    onMerged: (s) => { ui = s; },
    onStatus: (s) => statuses.push(s),
    setTimer: t.setTimer,
    clearTimer: t.clearTimer,
  });
  const edit = async (fn: (s: ConsultationSheetState) => ConsultationSheetState) => {
    ui = fn(ui);
    sync.notifyChange(ui);
    await t.run();
  };
  return { get ui() { return ui; }, edit, statuses, loaded };
}

void (async () => {
  const db = new FakeDb();
  db.owners.set("plan-a", "user-a");
  db.owners.set("plan-b", "user-a");
  db.owners.set("plan-c", "user-b");

  console.log("Test case 2 / 7: 自分で追加した相談事項が保存され、別端末でも見える");
  {
    const pc = await openDevice(db, "user-a", "plan-a");
    await pc.edit((s) => ({ ...s, topics: [...s.topics, item("t-visa", "学生ビザとワーホリの違いを聞きたい")] }));
    assert(pc.statuses.at(-1) === "saved", "保存済み");
    const phone = await openDevice(db, "user-a", "plan-a");
    assert(phone.ui.topics.some((i) => i.text === "学生ビザとワーホリの違いを聞きたい"), "再読み込み・別端末でも残る");
  }

  console.log("Test case 3: To Do の追加 → 完了状態の保存");
  {
    const pc = await openDevice(db, "user-a", "plan-a");
    await pc.edit((s) => ({ ...s, todos: [...s.todos, item("todo-a", "学校Aの見積もりをもらう")] }));
    await pc.edit((s) => ({ ...s, todos: s.todos.map((i) => (i.id === "todo-a" ? { ...i, completed: true } : i)) }));
    const phone = await openDevice(db, "user-a", "plan-a");
    assert(phone.ui.todos.find((i) => i.id === "todo-a")?.completed === true, "完了状態が別端末でも保たれる");
  }

  console.log("Test case 4: 相談後メモは書いた内容のまま");
  {
    const pc = await openDevice(db, "user-a", "plan-a");
    await pc.edit((s) => ({ ...s, findings: [...s.findings, item("f-1", "ホームステイは最初の4週間だけでOK")] }));
    const phone = await openDevice(db, "user-a", "plan-a");
    assert(phone.ui.findings.find((i) => i.id === "f-1")?.text === "ホームステイは最初の4週間だけでOK", "メモの文面が変わらない");
  }

  console.log("Test case 5: 候補を作り直してもユーザー項目・完了状態・メモは消えない");
  {
    const k = createEmptyKarte("plan-a");
    stated(k, "decision", "topConcern", "英語が話せるか不安");
    const pc = await openDevice(db, "user-a", "plan-a");
    const first = buildConsultationCandidates(k, null);
    const english = first.find((x) => x.category === "英語")!;
    await pc.edit((s) => ({
      ...s,
      topics: [...s.topics, item("t-cand", english.text, { source: "candidate", category: "英語" })],
      handledCandidateKeys: [...s.handledCandidateKeys, english.key],
    }));
    await pc.edit((s) => ({ ...s, topics: s.topics.map((i) => (i.id === "t-cand" ? { ...i, text: "英語力に合う学校を3校ほど教えてほしい" } : i)) }));
    stated(k, "budget", "rangeLabel", "100〜150万円");
    const regenerated = buildConsultationCandidates(k, null); // Karte が更新されて候補を作り直した状態
    const reopened = await openDevice(db, "user-a", "plan-a");
    const visible = visibleConsultationCandidates(regenerated, reopened.ui);
    assert(reopened.ui.topics.find((i) => i.id === "t-cand")?.text === "英語力に合う学校を3校ほど教えてほしい", "候補から追加した項目の編集が上書きされない");
    assert(!visible.some((x) => x.key === english.key), "追加済みの候補は出し直さない（文面を変えていても）");
    assert(visible.some((x) => x.category === "予算"), "新しい根拠の候補だけが増える");
    assert(reopened.ui.todos.find((i) => i.id === "todo-a")?.completed === true && reopened.ui.findings.length === 1, "To Do の完了・メモも残る");
  }

  console.log("Case: 同時編集（別端末の別々の変更は両方残る）");
  {
    const pc = await openDevice(db, "user-a", "plan-a");
    const phone = await openDevice(db, "user-a", "plan-a");
    await pc.edit((s) => ({ ...s, nextActions: [...s.nextActions, item("n-pc", "パスポート更新")] }));
    await phone.edit((s) => ({ ...s, nextActions: [...s.nextActions, item("n-phone", "次回相談を予約")] }));
    const again = await openDevice(db, "user-a", "plan-a");
    assert(again.ui.nextActions.some((i) => i.id === "n-pc") && again.ui.nextActions.some((i) => i.id === "n-phone"), "両端末の追加が両方残る");
    assert(phone.ui.nextActions.some((i) => i.id === "n-pc"), "後から保存した端末の画面にも相手の追加が反映");
  }

  console.log("Case: Plan / アカウントの分離と保存失敗");
  {
    const planB = await openDevice(db, "user-a", "plan-b");
    assert(planB.ui.topics.length === 0, "Plan B に Plan A の内容は出ない");
    const other = await openDevice(db, "user-b", "plan-a");
    assert(other.loaded.available && other.loaded.row === null, "別アカウントからは見えない");
    await other.edit((s) => ({ ...s, topics: [item("evil", "上書き")] }));
    const owner = await openDevice(db, "user-a", "plan-a");
    assert(!owner.ui.topics.some((i) => i.id === "evil") && other.statuses.includes("error"), "別アカウントの保存は拒否され、所有者のシートは不変");
    const pc = await openDevice(db, "user-a", "plan-a");
    db.offline = true;
    await pc.edit((s) => ({ ...s, findings: [...s.findings, item("f-off", "オフライン中のメモ")] }));
    assert(pc.statuses.at(-1) === "error" && pc.ui.findings.some((i) => i.id === "f-off"), "保存失敗でも画面の入力は消えない");
    db.offline = false;
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
})();
