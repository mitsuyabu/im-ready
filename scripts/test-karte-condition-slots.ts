/**
 * lib/karteConditionSlots.ts の動作確認用スクリプト。
 * 新しい test framework は導入せず、既に devDependency にある tsx で直接実行するだけの、
 * DB・Anthropic に一切触れない pure test。
 *
 *   npx tsx scripts/test-karte-condition-slots.ts
 *
 * ここで固定するのは、My Karte の Study Plan セクションが**守らなければいけない安全性**:
 *   1. stated だけを値にする（inferred = AI の仮説を希望として表示しない）
 *   2. 未回答を推測で埋めない（unknown は unknown のまま）
 *   3. 「まだ決めていない」（undecided）と「未回答」（unknown）を混同しない
 *   4. 複数候補を 1 つに絞らない
 *   5. conflict（相談とワークシートの食い違い）をどちらか一方に寄せない
 *   6. Karte に値が無いときだけ Worksheet を見る（同じ事実を 2 回出さない）
 */

import { createEmptyKarte, type Karte } from "@/lib/karte";
import {
  CONDITION_SLOT_ORDER,
  buildKarteConditionSlots,
  countFilledConditionSlots,
  hasAnyConditionValue,
  type ConditionSlot,
  type ConditionSlotId,
} from "@/lib/karteConditionSlots";
import type { WorksheetPersistedData } from "@/lib/worksheetStorage";

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

function freshKarte(): Karte {
  return createEmptyKarte("test-karte");
}

function emptyWorksheet(): WorksheetPersistedData {
  return {
    answers: {},
    ratings: {},
    rankings: {},
    compromises: {},
    singleSelections: {},
    multiSelections: {},
  };
}

function slot(slots: ConditionSlot[], id: ConditionSlotId): ConditionSlot {
  const found = slots.find((s) => s.id === id);
  if (!found) throw new Error(`slot ${id} が無い（テストの前提が壊れている）`);
  return found;
}

console.log("Test 1: スロットは常に固定の 10 項目・固定の順序で返る");
{
  const slots = buildKarteConditionSlots(freshKarte(), null);
  assert(slots.length === 10, `10 項目（実際: ${slots.length}）`);
  assert(
    JSON.stringify(slots.map((s) => s.id)) === JSON.stringify(CONDITION_SLOT_ORDER),
    "並び順は CONDITION_SLOT_ORDER のとおり",
  );
  assert(
    slots.every((s) => s.label.length > 0),
    "すべてのスロットに表示ラベルがある",
  );
  assert(
    new Set(slots.map((s) => s.id)).size === slots.length,
    "同じスロットが二重に出ない",
  );
}

console.log("Test 2: 空カルテ（全 unknown）→ 値を作らない");
{
  const slots = buildKarteConditionSlots(freshKarte(), null);
  assert(
    slots.every((s) => s.state === "unknown"),
    "すべて unknown",
  );
  assert(
    slots.every((s) => s.values.length === 0),
    "値は 1 件も作らない（未回答を推測で埋めない）",
  );
  assert(hasAnyConditionValue(slots) === false, "hasAnyConditionValue = false");
  assert(countFilledConditionSlots(slots) === 0, "埋まっているスロットは 0 件");
}

console.log("Test 3: stated は値になる / inferred は値にならない");
{
  const karte = freshKarte();
  karte.schoolPrefs.preferredCity = { value: "シドニー", certainty: "stated", source: "chat" };
  karte.timing.departureTiming = { value: "来年の春", certainty: "inferred", source: "chat" };
  const slots = buildKarteConditionSlots(karte, null);

  assert(slot(slots, "city").state === "stated", "stated な都市は stated");
  assert(slot(slots, "city").values.join(",") === "シドニー", "値は Karte の表記そのまま");

  assert(
    slot(slots, "departure").state === "unknown",
    "inferred な出発時期は unknown のまま（AI の仮説を希望として出さない）",
  );
  assert(slot(slots, "departure").values.length === 0, "inferred の値は出さない");
  assert(countFilledConditionSlots(slots) === 1, "埋まっているのは 1 件だけ");
}

console.log("Test 4: 複数候補を 1 つに絞らない");
{
  const karte = freshKarte();
  karte.schoolPrefs.preferredCountries = {
    value: ["オーストラリア", "カナダ"],
    certainty: "stated",
    source: "worksheet",
  };
  const slots = buildKarteConditionSlots(karte, null);
  const country = slot(slots, "country");
  assert(country.state === "stated", "国は stated");
  assert(
    country.values.length === 1 && country.values[0] === "オーストラリア、カナダ",
    "既存の整形（getKarteSummaryItems）どおり両方を保持する",
  );
  assert(
    country.values[0].includes("オーストラリア") && country.values[0].includes("カナダ"),
    "どちらの候補も落とさない",
  );
}

console.log("Test 5: 「まだ決めていない」は undecided（未回答とは区別する）");
{
  const karte = freshKarte();
  karte.timing.durationLabel = { value: "まだ決めていない", certainty: "stated", source: "chat" };
  const slots = buildKarteConditionSlots(karte, null);
  const duration = slot(slots, "duration");
  assert(duration.state === "undecided", "state は undecided");
  assert(duration.values.length === 0, "「まだ決めていない」を値として表示しない");
  assert(
    slot(slots, "city").state === "unknown",
    "回答していない項目は unknown のまま（undecided と別）",
  );
}

console.log("Test 6: conflict はどちらか一方に寄せず、両方を並べる");
{
  const karte = freshKarte();
  karte.schoolPrefs.preferredCity = { value: "シドニー", certainty: "stated", source: "chat" };
  karte.handoff.conflicts = [
    {
      block: "schoolPrefs",
      key: "preferredCity",
      existingValue: "シドニー",
      existingSource: "chat",
      incomingValue: "メルボルン",
      incomingSource: "worksheet",
    },
  ];
  const slots = buildKarteConditionSlots(karte, null);
  const city = slot(slots, "city");
  assert(city.state === "conflict", "state は conflict");
  assert(city.values.length === 2, `両方の値を持つ（実際: ${city.values.length} 件）`);
  assert(
    city.values.includes("シドニー") && city.values.includes("メルボルン"),
    "どちらの値も残る（勝手に片方を採用しない）",
  );
}

console.log("Test 7: Karte が unknown のときだけ Worksheet を見る");
{
  // 7-1: Karte に無く Worksheet にある → Worksheet の回答を使う
  const karte = freshKarte();
  const ws = emptyWorksheet();
  ws.multiSelections["destination-country"] = ["country-au"];
  ws.singleSelections["timing"] = "depart-6m";
  const slots = buildKarteConditionSlots(karte, ws);
  assert(slot(slots, "country").state === "stated", "Worksheet の国の回答が使われる");
  assert(slot(slots, "country").values.includes("オーストラリア"), "選択肢のラベルで出る");
  assert(slot(slots, "departure").values.includes("半年以内"), "Worksheet の出発時期が使われる");

  // 7-2: Karte に stated があるときは Karte 側を使う（同じ事実を 2 回出さない）
  const karte2 = freshKarte();
  karte2.schoolPrefs.preferredCountries = {
    value: ["ニュージーランド"],
    certainty: "stated",
    source: "chat",
  };
  const slots2 = buildKarteConditionSlots(karte2, ws);
  const country2 = slot(slots2, "country");
  assert(
    country2.values.length === 1 && country2.values[0] === "ニュージーランド",
    "Karte の値が優先され、Worksheet の値と混ざらない",
  );
}

console.log("Test 8: Worksheet の「まだ決まっていない」選択は undecided になる");
{
  const ws = emptyWorksheet();
  ws.multiSelections["destination-city"] = ["city-undecided"];
  const slots = buildKarteConditionSlots(freshKarte(), ws);
  const city = slot(slots, "city");
  assert(city.state === "undecided", "state は undecided");
  assert(city.values.length === 0, "「まだ決まっていない」をそのまま値にしない");
}

console.log("Test 9: 「その他」だけの選択は値にしない（自由記入があればそれを使う）");
{
  const ws = emptyWorksheet();
  ws.multiSelections["destination-city"] = ["city-other"];
  const slotsNoNote = buildKarteConditionSlots(freshKarte(), ws);
  assert(
    slot(slotsNoNote, "city").values.length === 0,
    "「その他」というラベル自体は値にしない",
  );

  ws.answers["destination-city"] = "ホバート";
  const slotsWithNote = buildKarteConditionSlots(freshKarte(), ws);
  assert(
    slot(slotsWithNote, "city").values.includes("ホバート"),
    "自由記入があればその内容を使う",
  );
}

console.log("Test 10: 数値・真偽値は意味を足さずに読める表記にする");
{
  const karte = freshKarte();
  karte.budget.totalCap = { value: 2000000, certainty: "stated", source: "chat" };
  karte.timing.durationWeeks = { value: 24, certainty: "stated", source: "chat" };
  karte.work.wantsToWork = { value: true, certainty: "stated", source: "worksheet" };
  const slots = buildKarteConditionSlots(karte, null);

  assert(slot(slots, "budget").values[0] === "2,000,000円", "金額は円で出す（推定・換算はしない）");
  assert(
    slot(slots, "duration").values[0] === "24週間",
    "週は週間のまま（「半年」などへ言い換えない）",
  );
  assert(
    slot(slots, "work").values[0] === "現地で働きたい",
    "真偽値は読める日本語にする",
  );
}

console.log("Test 11: ビザ欄に、ビザ以外の事実を流し込まない");
{
  const karte = freshKarte();
  // ワーホリへの「関心」はビザの希望ではない。ビザ欄は unknown のままであるべき。
  karte.work.workingHolidayInterest = { value: true, certainty: "stated", source: "chat" };
  const slots = buildKarteConditionSlots(karte, null);
  assert(
    slot(slots, "visa").state === "unknown",
    "ワーホリへの関心からビザの希望を作らない（存在しない事実を作らない）",
  );

  karte.constraints.visaConstraints = {
    value: "学生ビザを検討している",
    certainty: "stated",
    source: "chat",
  };
  const slots2 = buildKarteConditionSlots(karte, null);
  assert(
    slot(slots2, "visa").values[0] === "学生ビザを検討している",
    "本人が述べたビザの内容はそのまま出す",
  );
}

console.log("Test 12: profile / personality / motivation は条件グリッドに出さない");
{
  const karte = freshKarte();
  karte.profile.age = { value: 24, certainty: "stated", source: "profile" };
  karte.profile.occupation = { value: "会社員", certainty: "stated", source: "profile" };
  karte.personality.introExtro = { value: "内向的", certainty: "stated", source: "chat" };
  karte.motivation.statedGoal = { value: "英語力を伸ばしたい", certainty: "stated", source: "chat" };
  const slots = buildKarteConditionSlots(karte, null);

  assert(
    slots.every((s) => s.values.length === 0),
    "希望・条件ではない情報は 1 件もグリッドに出さない",
  );
  const joined = JSON.stringify(slots);
  for (const leaked of ["24", "会社員", "内向的", "英語力を伸ばしたい"]) {
    assert(!joined.includes(leaked), `「${leaked}」がグリッドへ漏れていない`);
  }
}

console.log("Test 13: 入力の Karte / Worksheet を書き換えない");
{
  const karte = freshKarte();
  karte.schoolPrefs.preferredCity = { value: "パース", certainty: "stated", source: "chat" };
  const karteBefore = JSON.stringify(karte);
  const ws = emptyWorksheet();
  ws.singleSelections["budget"] = "budget-100";
  const wsBefore = JSON.stringify(ws);

  buildKarteConditionSlots(karte, ws);

  assert(JSON.stringify(karte) === karteBefore, "Karte を mutate しない");
  assert(JSON.stringify(ws) === wsBefore, "Worksheet を mutate しない");
}

console.log("Test 14: 壊れた・想定外の値でも例外にしない");
{
  const karte = freshKarte();
  // 型を外れた値が DB に入っていた場合（旧データ・手修正）でも落ちないこと。
  (karte.schoolPrefs as unknown as Record<string, unknown>).preferredCity = {
    value: { unexpected: true },
    certainty: "stated",
  };
  (karte.handoff as unknown as Record<string, unknown>).conflicts = [];
  let threw = false;
  try {
    buildKarteConditionSlots(karte, null);
  } catch {
    threw = true;
  }
  assert(!threw, "想定外の値でも例外を投げない");
}

console.log("");
console.log(`passed: ${pass} / failed: ${fail}`);
if (fail > 0) process.exit(1);
