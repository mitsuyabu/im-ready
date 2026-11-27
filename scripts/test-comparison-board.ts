/**
 * lib/comparisonBoard.ts（データモデル）と lib/comparisonBoardStorage.ts（この端末への保存）の
 * 動作確認用スクリプト。DB・Anthropic・ネットワークへは一切接続しない pure test。
 *
 *   npx tsx scripts/test-comparison-board.ts
 *
 * ここで固定するのは、Comparison Board が**守らなければいけないこと**:
 *   1. 候補案は plans テーブルの Plan とは別概念（Plan を作らない / Plan に書き込まない）
 *   2. AI の評価・順位・スコア・適合率・予算推定を持たない
 *   3. Karte からのコピーは stated だけ・明示的に呼ばれたときだけ
 *   4. 編集（追加・改名・値の変更・削除）が他の案を壊さない
 *   5. 上限（3 案）を超えない
 *   6. 壊れた保存データでも例外を投げず、空のボードとして続行する
 *   7. localStorage キーが Plan ごとに分かれ、既存キーを上書きしない
 */

import { readFileSync } from "node:fs";
import {
  COMPARISON_FIELDS,
  COMPARISON_FIELD_IDS,
  MAX_COMPARISON_NAME_LENGTH,
  MAX_COMPARISON_OPTIONS,
  MAX_COMPARISON_VALUE_LENGTH,
  addOption,
  buildOptionFromConditionSlots,
  canCopyFromConditionSlots,
  comparisonOptionDisplayName,
  createEmptyOption,
  emptyComparisonBoard,
  hasAnyValue,
  optionValue,
  removeOption,
  renameOption,
  sanitizeComparisonBoard,
  setOptionValue,
  type ComparisonBoardState,
} from "@/lib/comparisonBoard";
import {
  clearComparisonBoard,
  comparisonBoardStorageKey,
  loadComparisonBoard,
  planComparisonBoardStorageKeys,
  saveComparisonBoard,
} from "@/lib/comparisonBoardStorage";
import {
  getComparisonBoardServerSnapshot,
  getComparisonBoardSnapshot,
  resetComparisonBoardStoreForTest,
  subscribeComparisonBoard,
  updateComparisonBoard,
} from "@/lib/comparisonBoardStore";
import { buildKarteConditionSlots } from "@/lib/karteConditionSlots";
import { createEmptyKarte } from "@/lib/karte";

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

const PLAN_ID = "a3207d63-ca43-44cc-9dd6-e8e53b63558a";
const OTHER_PLAN_ID = "11111111-2222-3333-4444-555555555555";

/** window.localStorage の代わり。実ブラウザに依存せず保存の挙動を確認する。 */
function fakeStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  const api = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  } as unknown as Storage;
  return { store, api };
}

function withStorage<T>(api: Storage, fn: () => T): T {
  const original = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = { localStorage: api };
  try {
    return fn();
  } finally {
    (globalThis as { window?: unknown }).window = original;
  }
}

const boardSource = readFileSync("lib/comparisonBoard.ts", "utf8");
const componentSource = readFileSync("components/ComparisonBoard.tsx", "utf8");
const pageSource = readFileSync("app/plans/[planId]/documents/page.tsx", "utf8");

/**
 * 「していないこと」の検査は、説明コメントを除いた**実際に動くコード**だけを見る
 * （既存の scripts/test-worksheet-section-cards.ts と同じ方針。docblock で
 * 「順位は出さない」「AI は呼ばない」と説明している文章に反応させない）。
 */
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}
const boardCode = stripComments(boardSource);
const componentCode = stripComments(componentSource);
const pageCode = stripComments(pageSource);

console.log("Test 1: 比較項目は固定の定義 1 か所から導出される");
{
  assert(COMPARISON_FIELDS.length === 11, `比較項目は 11 件（実際: ${COMPARISON_FIELDS.length}）`);
  assert(
    COMPARISON_FIELD_IDS.length === COMPARISON_FIELDS.length,
    "COMPARISON_FIELD_IDS は COMPARISON_FIELDS から導出されている",
  );
  assert(
    new Set(COMPARISON_FIELD_IDS).size === COMPARISON_FIELD_IDS.length,
    "項目 id は重複していない",
  );
  assert(
    COMPARISON_FIELDS.every((f) => f.label.length > 0 && f.placeholder.length > 0),
    "すべての項目にラベルと placeholder がある",
  );
  // 仕様で挙がっている比較項目がそろっている
  for (const label of [
    "国",
    "都市",
    "ビザ",
    "出発時期",
    "期間",
    "予算",
    "語学学校",
    "滞在方法",
    "現地での仕事",
    "魅力",
    "気になる点",
  ]) {
    assert(
      COMPARISON_FIELDS.some((f) => f.label === label),
      `比較項目に「${label}」がある`,
    );
  }
  assert(
    componentSource.includes("COMPARISON_FIELDS.map("),
    "表はこの定義をそのまま並べている（画面側で項目を持たない）",
  );
}

console.log("Test 2: 評価・順位・スコアにあたる概念をモデルに持たない");
{
  for (const forbidden of ["score", "rank", "rating", "fitPercent", "recommend", "bestOption"]) {
    assert(
      !new RegExp(`\\b${forbidden}\\b`, "i").test(boardCode),
      `モデルに ${forbidden} を持たない`,
    );
  }
  assert(
    !/おすすめ|適合率|総合評価|点数/.test(boardCode + componentCode),
    "おすすめ・適合率・総合評価・点数のような表示をしない",
  );
}

console.log("Test 3: 空のボードから始まり、案を追加できる");
{
  const empty = emptyComparisonBoard();
  assert(empty.options.length === 0, "初期状態は 0 件");

  const one = addOption(empty, createEmptyOption("シドニー1年案"));
  assert(one.options.length === 1, "1 件追加できる");
  assert(one.options[0].name === "シドニー1年案", "名前を付けて作れる");
  assert(empty.options.length === 0, "元の state は書き換えない（immutable）");
  assert(
    COMPARISON_FIELD_IDS.every((id) => optionValue(one.options[0], id) === null),
    "空欄から作られる（値を勝手に埋めない）",
  );
  assert(hasAnyValue(one.options[0]) === false, "入力はまだ無い");
}

console.log("Test 4: 上限は 3 案");
{
  assert(MAX_COMPARISON_OPTIONS === 3, "初期実装の上限は 3 案");
  let board: ComparisonBoardState = emptyComparisonBoard();
  for (let i = 0; i < 5; i++) board = addOption(board, createEmptyOption(`案${i + 1}`));
  assert(board.options.length === 3, `3 案で止まる（実際: ${board.options.length}）`);
  assert(
    board.options.map((o) => o.name).join(",") === "案1,案2,案3",
    "先に作った案が残る（後から来たものに入れ替わらない）",
  );
}

console.log("Test 5: 編集が他の案を壊さない");
{
  let board = addOption(emptyComparisonBoard(), createEmptyOption("A"));
  board = addOption(board, createEmptyOption("B"));
  const [a, b] = board.options;

  board = setOptionValue(board, a.id, "city", "シドニー");
  board = setOptionValue(board, b.id, "city", "メルボルン");
  assert(optionValue(board.options[0], "city") === "シドニー", "A の値が入る");
  assert(optionValue(board.options[1], "city") === "メルボルン", "B の値は A に影響されない");

  board = renameOption(board, a.id, "シドニー案");
  assert(board.options[0].name === "シドニー案", "改名できる");
  assert(board.options[1].name === "B", "改名が他の案に波及しない");
  assert(
    optionValue(board.options[0], "city") === "シドニー",
    "改名しても入力済みの値が消えない",
  );

  board = removeOption(board, a.id);
  assert(board.options.length === 1, "削除できる");
  assert(board.options[0].name === "B", "残るのは削除していない案");
  assert(optionValue(board.options[0], "city") === "メルボルン", "残った案の値は保たれる");
}

console.log("Test 6: 値は未入力・空白だけなら null（＝未定表示）");
{
  let board = addOption(emptyComparisonBoard(), createEmptyOption());
  const id = board.options[0].id;
  assert(optionValue(board.options[0], "budget") === null, "未入力は null");
  board = setOptionValue(board, id, "budget", "   ");
  assert(optionValue(board.options[0], "budget") === null, "空白だけも null");
  board = setOptionValue(board, id, "budget", "  200万円  ");
  assert(optionValue(board.options[0], "budget") === "200万円", "前後の空白は表示時に落とす");
}

console.log("Test 7: 名前が空の案には既定の見出しを出す（架空の地名を使わない）");
{
  const option = createEmptyOption("");
  assert(comparisonOptionDisplayName(option, 0) === "案1", "1 件目は「案1」");
  assert(comparisonOptionDisplayName(option, 2) === "案3", "3 件目は「案3」");
  assert(
    comparisonOptionDisplayName({ ...option, name: "  カナダ案  " }, 0) === "カナダ案",
    "名前があればそれを使う",
  );
  assert(
    comparisonOptionDisplayName({ ...option, name: "   " }, 1) === "案2",
    "空白だけの名前は既定の見出しにする",
  );
}

console.log("Test 8: Karte からのコピーは stated だけ・明示的に呼んだときだけ");
{
  const karte = createEmptyKarte("k");
  karte.schoolPrefs.preferredCity = { value: "シドニー", certainty: "stated", source: "chat" };
  karte.schoolPrefs.preferredCountries = {
    value: ["オーストラリア"],
    certainty: "stated",
    source: "chat",
  };
  // inferred・未定・未回答はコピーされないこと
  karte.budget.rangeLabel = { value: "200万円くらい", certainty: "inferred", source: "chat" };
  karte.timing.durationLabel = { value: "まだ決めていない", certainty: "stated", source: "chat" };
  const slots = buildKarteConditionSlots(karte, null);

  assert(canCopyFromConditionSlots(slots) === true, "コピー元がある場合は true");
  const option = buildOptionFromConditionSlots(slots, "いまの条件");
  assert(option.name === "いまの条件", "名前を付けて作れる");
  assert(optionValue(option, "city") === "シドニー", "stated な都市はコピーされる");
  assert(optionValue(option, "country") === "オーストラリア", "stated な国はコピーされる");
  assert(optionValue(option, "budget") === null, "inferred な予算はコピーしない");
  assert(optionValue(option, "duration") === null, "「まだ決めていない」はコピーしない");
  assert(optionValue(option, "visa") === null, "未回答のビザはコピーしない");
  assert(
    optionValue(option, "appeal") === null && optionValue(option, "concern") === null,
    "魅力・気になる点は AI に書かせず空欄のまま",
  );

  // 空カルテならコピー元が無い
  assert(
    canCopyFromConditionSlots(buildKarteConditionSlots(createEmptyKarte("k2"), null)) === false,
    "コピー元が無ければ false（ボタンを出さない）",
  );

  // 画面側は、ユーザー操作のハンドラの中でだけコピーを呼んでいる
  assert(
    componentSource.includes("const handleAddFromKarte = useCallback(") &&
      componentSource.includes("buildOptionFromConditionSlots("),
    "コピーはボタンのハンドラから呼ばれる",
  );
  assert(
    !componentCode.includes("useEffect"),
    "画面は effect を持たない（読み込み時に自動でコピー・自動生成が走る余地が無い）",
  );
}

console.log("Test 9: 複数候補は 1 つに絞らずコピーされる");
{
  const karte = createEmptyKarte("k");
  karte.schoolPrefs.preferredCountries = {
    value: ["オーストラリア", "カナダ"],
    certainty: "stated",
    source: "worksheet",
  };
  const option = buildOptionFromConditionSlots(buildKarteConditionSlots(karte, null), "x");
  const value = optionValue(option, "country") ?? "";
  assert(
    value.includes("オーストラリア") && value.includes("カナダ"),
    "両方の候補が残る",
  );
}

console.log("Test 10: sanitize は壊れた保存データでも例外にしない");
{
  const cases: { label: string; input: unknown }[] = [
    { label: "null", input: null },
    { label: "undefined", input: undefined },
    { label: "数値", input: 42 },
    { label: "文字列", input: "broken" },
    { label: "配列", input: [1, 2, 3] },
    { label: "options が配列でない", input: { options: "x" } },
    { label: "options の中身が null", input: { options: [null, undefined] } },
    { label: "values が配列", input: { options: [{ id: "a", name: "A", values: [] }] } },
    { label: "name が数値", input: { options: [{ id: "a", name: 1, values: {} }] } },
    { label: "未知のキーだけ", input: { options: [{ id: "a", values: { nope: "x" } }] } },
  ];
  for (const c of cases) {
    let threw = false;
    let result: ComparisonBoardState = emptyComparisonBoard();
    try {
      result = sanitizeComparisonBoard(c.input);
    } catch {
      threw = true;
    }
    assert(!threw, `${c.label} でも例外を投げない`);
    assert(Array.isArray(result.options), `${c.label} でも options は配列`);
  }

  // 未知のキーは落ち、既知の項目だけが残る
  const cleaned = sanitizeComparisonBoard({
    options: [{ id: "a", name: "A", values: { city: "シドニー", nope: "x" } }],
  });
  assert(cleaned.options.length === 1, "正しい案は残る");
  assert(optionValue(cleaned.options[0], "city") === "シドニー", "既知の項目は残る");
  assert(
    !Object.keys(cleaned.options[0].values).includes("nope"),
    "未知のキーは持ち回らない",
  );

  // 上限超過は切り捨て
  const tooMany = sanitizeComparisonBoard({
    options: Array.from({ length: 9 }, (_, i) => ({ id: `o${i}`, name: `案${i}`, values: {} })),
  });
  assert(tooMany.options.length === MAX_COMPARISON_OPTIONS, "上限を超える案は切り捨てる");

  // id の重複は振り直す（React の key と編集対象の特定が壊れないように）
  const dup = sanitizeComparisonBoard({
    options: [
      { id: "same", name: "A", values: {} },
      { id: "same", name: "B", values: {} },
    ],
  });
  assert(dup.options.length === 2, "両方残る");
  assert(dup.options[0].id !== dup.options[1].id, "id の重複は解消される");

  // 長すぎる値は切り詰める（画面が壊れないための安全弁）
  const long = sanitizeComparisonBoard({
    options: [{ id: "a", name: "x".repeat(500), values: { appeal: "y".repeat(9999) } }],
  });
  assert(
    long.options[0].name.length === MAX_COMPARISON_NAME_LENGTH,
    "名前の長さは上限で切る",
  );
  assert(
    (long.options[0].values.appeal ?? "").length === MAX_COMPARISON_VALUE_LENGTH,
    "値の長さは上限で切る",
  );
}

console.log("Test 11: localStorage キーは Plan ごとに分かれ、既存キーを上書きしない");
{
  assert(
    comparisonBoardStorageKey(PLAN_ID) === `ryugaku-comparison-board:plan:${PLAN_ID}`,
    "キーは Plan ごとの名前空間を持つ",
  );
  assert(
    comparisonBoardStorageKey(PLAN_ID) !== comparisonBoardStorageKey(OTHER_PLAN_ID),
    "Plan が違えばキーも違う",
  );
  for (const existing of [
    "ryugaku-worksheet-answers",
    `ryugaku-worksheet-answers:plan:${PLAN_ID}`,
    `ryugaku-worksheet-pending:plan:${PLAN_ID}`,
    `ryugaku-consultation-pending:plan:${PLAN_ID}`,
  ]) {
    assert(
      comparisonBoardStorageKey(PLAN_ID) !== existing,
      `既存キー（${existing}）と衝突しない`,
    );
  }
  assert(
    planComparisonBoardStorageKeys(PLAN_ID).length === 1,
    "Plan 削除で消す対象は 1 件",
  );
  assert(
    planComparisonBoardStorageKeys("  ").length === 0,
    "planId が空なら 1 件も対象にしない（前方一致で広く消さない）",
  );
  assert(
    planComparisonBoardStorageKeys(PLAN_ID)[0].includes(PLAN_ID),
    "キーには planId が含まれる",
  );
}

console.log("Test 12: 保存と復元（Plan 間でデータが混ざらない）");
{
  const fake = fakeStorage();
  const board = addOption(emptyComparisonBoard(), createEmptyOption("シドニー1年案"));
  const withValue = setOptionValue(board, board.options[0].id, "city", "シドニー");

  withStorage(fake.api, () => {
    assert(saveComparisonBoard(PLAN_ID, withValue) === true, "保存できる");
  });
  assert(
    fake.store.has(comparisonBoardStorageKey(PLAN_ID)),
    "この Plan のキーに書かれている",
  );
  assert(fake.store.size === 1, "ほかのキーは作らない");

  const loaded = withStorage(fake.api, () => loadComparisonBoard(PLAN_ID));
  assert(loaded.options.length === 1, "復元できる");
  assert(loaded.options[0].name === "シドニー1年案", "名前が復元される");
  assert(optionValue(loaded.options[0], "city") === "シドニー", "値が復元される");

  // 別 Plan からは見えない
  const otherLoaded = withStorage(fake.api, () => loadComparisonBoard(OTHER_PLAN_ID));
  assert(otherLoaded.options.length === 0, "別 Plan のボードは空（データが混ざらない）");

  // 消すのはこの Plan のぶんだけ
  withStorage(fake.api, () => {
    fake.store.set(comparisonBoardStorageKey(OTHER_PLAN_ID), "keep");
    fake.store.set("ryugaku-worksheet-answers", "keep");
    clearComparisonBoard(PLAN_ID);
  });
  assert(!fake.store.has(comparisonBoardStorageKey(PLAN_ID)), "この Plan のぶんは消える");
  assert(
    fake.store.get(comparisonBoardStorageKey(OTHER_PLAN_ID)) === "keep",
    "別 Plan のぶんは残る",
  );
  assert(fake.store.get("ryugaku-worksheet-answers") === "keep", "匿名 Worksheet の保存は残る");
}

console.log("Test 13: 保存データが壊れていても画面は空のボードで続行する");
{
  const broken = fakeStorage({ [comparisonBoardStorageKey(PLAN_ID)]: "{ not json" });
  const loaded = withStorage(broken.api, () => loadComparisonBoard(PLAN_ID));
  assert(loaded.options.length === 0, "壊れた JSON → 空のボード");

  const wrongVersion = fakeStorage({
    [comparisonBoardStorageKey(PLAN_ID)]: JSON.stringify({ version: 99, options: [{ id: "a" }] }),
  });
  const loaded2 = withStorage(wrongVersion.api, () => loadComparisonBoard(PLAN_ID));
  assert(loaded2.options.length === 0, "version 不一致 → 空のボード（推測で読み替えない）");

  // localStorage 自体が使えない環境（プライベートブラウジング等）
  const throwing = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  } as unknown as Storage;
  const result = withStorage(throwing, () => ({
    loaded: loadComparisonBoard(PLAN_ID),
    saved: saveComparisonBoard(PLAN_ID, emptyComparisonBoard()),
  }));
  assert(result.loaded.options.length === 0, "読めない環境でも空のボードを返す");
  assert(result.saved === false, "保存できない環境では false を返す（例外にしない）");
}

console.log("Test 14: 画面の開閉仕様（別ページへ遷移しない / aria / 初期は閉じている）");
{
  assert(componentSource.includes("const [open, setOpen] = useState(false)"), "初期状態は閉じている");
  assert(componentSource.includes('aria-expanded={open}'), "aria-expanded で開閉状態を伝える");
  assert(componentSource.includes("aria-controls={panelId}"), "aria-controls で対象を示す");
  assert(componentSource.includes("{open && ("), "閉じている間は中身を描画しない");
  assert(
    !componentCode.includes('from "next/link"') && !componentCode.includes("<Link"),
    "開閉に Link を使わない（別ページへ遷移しない・ページ上部へ跳ばない）",
  );
  assert(
    !/href=/.test(componentCode),
    "href を持たない（hash 遷移でスクロール位置を飛ばさない）",
  );
  assert(
    (componentSource.match(/type="button"/g) ?? []).length >= 5,
    "操作はすべて type=\"button\"（フォーム送信・遷移を起こさない）",
  );
  assert(
    componentSource.includes("focus-visible:outline"),
    "キーボード操作時の focus リングがある",
  );
  assert(
    !/animate-|transition-all|duration-[5-9]00/.test(componentCode),
    "過剰なアニメーションを使わない（色の transition だけ）",
  );
}

console.log("Test 15: 表は横スクロールを表の領域だけに閉じる / 項目列を固定する");
{
  assert(
    componentSource.includes("overflow-x-auto"),
    "横スクロールする領域がある",
  );
  assert(
    componentSource.includes("sticky left-0"),
    "左端の比較項目列を固定している",
  );
  assert(
    componentSource.includes("whitespace-pre-wrap break-words"),
    "長文は折り返す",
  );
  assert(componentSource.includes("min-w-["), "各列の幅をそろえている");
  assert(
    !/overflow-x-scroll|w-screen|100vw/.test(componentCode),
    "ページ全体に横 overflow を起こす指定を使わない",
  );
  assert(
    componentSource.includes('scope="col"') && componentSource.includes('scope="row"'),
    "表のヘッダーに scope を付けている（読み上げ対応）",
  );
  assert(componentSource.includes("<caption"), "表に説明（caption）がある");
}

console.log("Test 16: 架空のユーザーデータを実データとして表示しない");
{
  // 例示は placeholder（入力前のヒント）だけで、値として保存・表示しない。
  assert(
    COMPARISON_FIELDS.every((f) => f.placeholder.startsWith("例:") || f.kind === "long"),
    "短い項目の placeholder は「例:」で始まる（値ではないと分かる）",
  );
  assert(
    componentSource.includes("placeholder={field.placeholder}"),
    "例示は placeholder として渡している",
  );
  // 初期値としては一切使わない
  assert(
    !/values:\s*\{\s*(city|country|budget)/.test(boardCode),
    "モデルの初期値に地名・金額を入れていない",
  );
  assert(
    createEmptyOption().values.city === undefined,
    "新しい案は空欄から始まる",
  );
}

console.log("Test 17: ページへの組み込み（Study Plan と School Comparison の間）");
{
  assert(pageSource.includes("<ComparisonBoard"), "My Karte トップに組み込まれている");
  const idxConditions = pageSource.indexOf("<MyKarteConditionsSection");
  const idxBoard = pageSource.indexOf("<ComparisonBoard");
  const idxSchools = pageSource.indexOf("<MyKarteSchoolsSection");
  assert(idxConditions > 0 && idxBoard > idxConditions, "Study Plan の後ろにある");
  assert(idxSchools > idxBoard, "School Comparison の前にある");
  assert(
    pageSource.includes("conditionSlots={conditionSlots}"),
    "Karte の希望・条件をコピー元として渡している",
  );
  assert(
    !pageCode.includes("plan_blueprint") && !pageCode.includes("loadPlanBlueprint"),
    "My Plan（確定した実行計画）は読まない（Karte の希望・条件と混同しない）",
  );
}

console.log("Test 18: Plan とは別概念であることを壊していない");
{
  assert(
    !/from\("plans"\)/.test(boardCode) && !/from\("plans"\)/.test(componentCode),
    "候補案の追加で plans テーブルに触れない",
  );
  for (const forbidden of ["supabase", "createClient", "fetch(", "/api/"]) {
    assert(
      !boardCode.includes(forbidden),
      `モデルは ${forbidden} を使わない（pure のまま）`,
    );
  }
  assert(
    !componentCode.includes("/api/"),
    "画面も新しい API を呼ばない（初期実装はこの端末に閉じる）",
  );
  assert(
    !/anthropic|Anthropic/.test(boardCode + componentCode),
    "AI は呼ばない（自動生成・評価を実装しない）",
  );
}

console.log("Test 19: 外部ストア（開閉しても入力内容を失わない仕組み）");
{
  const storeSource = readFileSync("lib/comparisonBoardStore.ts", "utf8");
  assert(
    componentSource.includes("useSyncExternalStore("),
    "画面は外部ストアを購読している（effect で復元していない）",
  );
  assert(
    componentSource.includes("getComparisonBoardServerSnapshot"),
    "SSR / hydration 用のスナップショットを渡している（hydration mismatch を避ける）",
  );
  assert(
    getComparisonBoardServerSnapshot() === getComparisonBoardServerSnapshot(),
    "server snapshot は常に同じ参照（再レンダリングのループを防ぐ）",
  );
  assert(
    getComparisonBoardServerSnapshot().options.length === 0,
    "server snapshot は空のボード（サーバーでは端末の内容を知らない）",
  );
  assert(
    storeSource.includes('typeof window === "undefined"'),
    "window が無い環境でも安全に空を返す",
  );

  const fake = fakeStorage();
  withStorage(fake.api, () => {
    resetComparisonBoardStoreForTest();

    // 同じ値には同じ参照を返す（useSyncExternalStore の要件）
    const first = getComparisonBoardSnapshot(PLAN_ID);
    assert(getComparisonBoardSnapshot(PLAN_ID) === first, "同じ値なら同じ参照を返す");
    assert(first.options.length === 0, "最初は空のボード");

    // 購読している画面へ通知が飛ぶ
    let notified = 0;
    const unsubscribe = subscribeComparisonBoard(PLAN_ID, () => {
      notified++;
    });

    updateComparisonBoard(PLAN_ID, (prev) => addOption(prev, createEmptyOption("シドニー1年案")));
    assert(notified === 1, "更新で 1 回通知される");
    assert(getComparisonBoardSnapshot(PLAN_ID).options.length === 1, "値が反映される");
    assert(
      fake.store.has(comparisonBoardStorageKey(PLAN_ID)),
      "更新はこの端末へ保存される",
    );

    // 変更が無いときは通知も保存もしない（上限に達した追加など）
    let board = getComparisonBoardSnapshot(PLAN_ID);
    for (let i = 0; i < 3; i++) {
      updateComparisonBoard(PLAN_ID, (prev) => addOption(prev, createEmptyOption()));
    }
    board = getComparisonBoardSnapshot(PLAN_ID);
    assert(board.options.length === MAX_COMPARISON_OPTIONS, "上限までは増える");
    const notifiedAtCap = notified;
    updateComparisonBoard(PLAN_ID, (prev) => addOption(prev, createEmptyOption()));
    assert(notified === notifiedAtCap, "上限到達後の追加では通知しない（変更が無い）");

    // 値を入れてから「閉じる」= 画面の unmount を模しても、ストアの内容は残る
    const target = getComparisonBoardSnapshot(PLAN_ID).options[0];
    updateComparisonBoard(PLAN_ID, (prev) => setOptionValue(prev, target.id, "city", "シドニー"));
    unsubscribe();
    const reopened = getComparisonBoardSnapshot(PLAN_ID);
    assert(
      optionValue(reopened.options[0], "city") === "シドニー",
      "購読をやめても（閉じても）入力内容が残る",
    );

    // Plan 間で混ざらない
    assert(
      getComparisonBoardSnapshot(OTHER_PLAN_ID).options.length === 0,
      "別 Plan のストアは空（Plan をまたいで混ざらない）",
    );
    updateComparisonBoard(OTHER_PLAN_ID, (prev) => addOption(prev, createEmptyOption("別Plan案")));
    assert(
      getComparisonBoardSnapshot(PLAN_ID).options.length === MAX_COMPARISON_OPTIONS,
      "別 Plan の更新が元の Plan に影響しない",
    );

    resetComparisonBoardStoreForTest();
  });
}

console.log("Test 20: 比較ボードの見た目（1 つのモジュールとして見せる）");
{
  assert(
    componentSource.includes("function CompareIcon()"),
    "閉じていてもモジュールだと分かる目印（アイコン）がある",
  );
  assert(
    componentSource.includes('Compare'),
    "セクションの役割を示す eyebrow がある",
  );
  // ボード全体が白いカード（淡いグレーの canvas の上に浮く）
  assert(
    componentSource.includes('className="mk-card overflow-hidden"'),
    "ボードは白いカード（My Karte 共通のカードクラス）",
  );
  // 比較表全体が 1 つの白いカードに入っている（面の上で浮く）
  assert(
    componentSource.includes("mt-4 overflow-hidden rounded-[var(--mk-radius-sm)] border bg-[var(--mk-card)]"),
    "比較表は 1 つのカードとしてまとまっている（角丸は共通トークン）",
  );
  // 横スクロールは表のカードの中だけ
  assert(
    componentSource.includes('<div className="overflow-x-auto">'),
    "横スクロールする領域は表のカードの内側に閉じている",
  );
  assert(
    !componentCode.includes("-mx-5 overflow-x-auto"),
    "スクロール領域をセクションの外へはみ出させていない",
  );
  // 行ラベル列は固定したまま、本文と重ならないよう区切り線を持つ
  assert(
    componentSource.includes("sticky left-0") &&
      componentSource.includes("border-r border-[var(--mk-border)]"),
    "固定した比較項目列に区切り線がある（スクロール時に本文と重ならない）",
  );
  assert(
    (componentSource.match(/bg-\[var\(--mk-block\)\]/g) ?? []).length >= 2,
    "比較項目の列は薄いグレーで、値の列（白）と区別する",
  );
  // 列ヘッダーは白 + 黒の下線でメリハリを付ける（パステルの塗り分けは廃止）
  assert(
    !componentSource.includes("OPTION_TINTS"),
    "列ヘッダーのパステル塗り分けは廃止した",
  );
  assert(
    componentSource.includes("OPTION_RULES[index % OPTION_RULES.length]"),
    "列の見分けはヘッダー上の細いアクセント線で付ける",
  );
  assert(
    componentSource.includes("border-b-2 border-[var(--mk-ink)] bg-[var(--mk-card)]"),
    "列ヘッダーは白地 + 黒の下線（メリハリ）",
  );
  assert(
    componentSource.includes('className="mk-card-title block break-words"'),
    "案の名前は他のカードタイトルと同じクラス（統一した強さ）",
  );
  assert(
    componentSource.includes("mk-item-label-sm"),
    "比較項目名は My Note / Study Plan の項目名と同じ色・太さに揃えている",
  );
  assert(
    componentSource.includes('className="mk-section-title mt-1"') &&
      componentSource.includes('className="mk-eyebrow"'),
    "セクション見出しは他セクションと同じクラス",
  );
  // 縞模様はやめ、行間の細い線だけで区切る
  assert(
    !componentSource.includes("bg-[#fbfaf8]"),
    "縞模様の塗りは使っていない",
  );
  assert(
    componentSource.includes('rowIndex > 0 ? "border-t border-[#f0f1ee]" : undefined'),
    "行の区切りは細い線 1 本だけ",
  );
}

console.log("Test 21: 蛍光アクセントは操作要素にだけ使う（表の中身は落ち着かせる）");
{
  // ボタンの段階が 1 か所で定義されている
  assert(componentSource.includes("const BTN_PRIMARY"), "主ボタンの見た目は 1 か所で定義");
  assert(componentSource.includes("const BTN_SECONDARY"), "副ボタンの見た目は 1 か所で定義");
  assert(
    componentSource.includes("bg-[var(--neon-lime)] text-[var(--neon-ink)]"),
    "主ボタンは蛍光ライム + near-black（コントラストを確保）",
  );
  assert(
    !/BTN_SECONDARY[\s\S]{0,160}bg-\[var\(--neon-lime\)\]/.test(componentSource),
    "副ボタンの通常時は蛍光で塗らない（hover のときだけ差す）",
  );
  assert(
    componentSource.includes("hover:bg-[var(--neon-lime-soft)]"),
    "副ボタンは hover でだけ蛍光がうっすら差す",
  );

  // 開閉ボタン: 閉じているときだけ主ボタン（いま押す操作）
  assert(
    componentSource.includes("${open ? BTN_SECONDARY : BTN_PRIMARY}"),
    "閉じているときの開閉ボタンが主ボタン、開いたら副ボタンに戻る",
  );
  // 編集モードは「アクティブ状態」として蛍光
  assert(
    componentSource.includes("${editing ? BTN_PRIMARY : BTN_SECONDARY}"),
    "編集モード中だけボタンが蛍光になる（アクティブ状態の表現）",
  );
  assert(
    componentSource.includes('editing ? "border-[#bfe24a]" : "border-[var(--mk-border)]"'),
    "編集中は表の枠にも蛍光が差す",
  );
  // 入力の focus
  assert(componentSource.includes("const FIELD_FOCUS"), "入力欄の focus は 1 か所で定義");
  assert(
    componentSource.includes("focus:ring-2 focus:ring-[var(--neon-lime)]"),
    "入力欄の focus は蛍光のリングで示す",
  );
  assert(
    (componentSource.match(/\$\{FIELD_FOCUS\}/g) ?? []).length === 3,
    "名前・短文・長文の 3 つの入力すべてに同じ focus を当てている",
  );

  // 表の中身は落ち着いた色のまま（蛍光を本文・行ラベル・セルに使わない）
  const tableBlock = componentCode.slice(
    componentCode.indexOf("<table"),
    componentCode.indexOf("</table>"),
  );
  assert(tableBlock.length > 0, "表の範囲を特定できた（テストの前提）");
  assert(
    !/bg-\[var\(--neon[^"`]*px-4 py-3/.test(tableBlock),
    "セルの地色を蛍光にしていない",
  );
  assert(
    tableBlock.includes("text-[var(--mk-body)]") && tableBlock.includes("mk-item-label-sm"),
    "セル本文と行ラベルは落ち着いた色のまま（共通の文字色トークン）",
  );
  assert(
    !/<th[\s\S]{0,400}bg-\[var\(--neon/.test(tableBlock),
    "列ヘッダーを蛍光で塗りつぶしていない",
  );
  // 蛍光色のベタ書きをしない
  assert(
    !/#(d8fb57|effdc0|fdf25a|6fdcf7)/i.test(componentCode),
    "蛍光色の hex をベタ書きしていない",
  );
}

console.log("");
console.log(`passed: ${pass} / failed: ${fail}`);
if (fail > 0) process.exit(1);
