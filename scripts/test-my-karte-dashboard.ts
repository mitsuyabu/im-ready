/**
 * My Karte トップ（/plans/[planId]/documents）のダッシュボード化の確認スクリプト。
 * DB・Anthropic・ネットワークへは一切接続しない（ソースと pure な変換層だけを見る）。
 *
 *   npx tsx scripts/test-my-karte-dashboard.ts
 *
 * ここで固定するのは、**壊してはいけないこと**と、今回の作り替えで**戻してはいけないこと**:
 *   1. 認証・所有者確認・別 Plan の混在防止がそのまま
 *   2. 既存の詳細画面・資料生成・共有への導線が 1 つも消えていない
 *   3. ページ表示時に AI 生成を呼ばない
 *   4. inferred を希望として出さない / 未回答を推測で埋めない
 *   5. 親向け説明資料と Consultation Sheet は既存のカード形式のまま
 *   6. セクションの順序が仕様どおり
 *   7. 全体を 1 枚の大きなカードで囲っていない
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createEmptyKarte } from "@/lib/karte";
import { buildMyNoteBuckets, MY_NOTE_CARDS } from "@/lib/myNoteBuckets";
import { buildKarteConditionSlots } from "@/lib/karteConditionSlots";
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

const page = readFileSync("app/plans/[planId]/documents/page.tsx", "utf8");
const noteSection = readFileSync("components/MyKarteNoteSection.tsx", "utf8");
const conditionsSection = readFileSync("components/MyKarteConditionsSection.tsx", "utf8");
const schoolsSection = readFileSync("components/MyKarteSchoolsSection.tsx", "utf8");
const sectionHeader = readFileSync("components/MyKarteSectionHeader.tsx", "utf8");
const workspaceHeader = readFileSync("components/DocumentsWorkspaceHeader.tsx", "utf8");
const summaryTiles = readFileSync("components/MyKarteSummaryTiles.tsx", "utf8");
const globalsCss = readFileSync("app/globals.css", "utf8");
const workspaceCard = readFileSync("components/DocumentWorkspaceCard.tsx", "utf8");
const comparisonBoard = readFileSync("components/ComparisonBoard.tsx", "utf8");

/** 「していないこと」の検査は、説明コメントを除いた実際に動くコードだけを見る。 */
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}
const pageCode = stripComments(page);
const allSectionCode = stripComments(noteSection + conditionsSection + schoolsSection);

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

console.log("Test 1: 認証・所有者確認・エラー処理は変えていない");
{
  assert(page.includes("await supabase.auth.getUser()"), "ログイン確認がある");
  assert(page.includes('redirect("/login")'), "未ログインは /login へ");
  assert(
    page.includes('.eq("id", planId)') && page.includes('.eq("user_id", user.id)'),
    "Plan は id と user_id の両方で絞る（他人の Plan を開けない）",
  );
  assert(page.includes("notFound()"), "対象外の Plan は notFound");
  assert(
    page.includes('.eq("plan_id", planId)'),
    "資料も plan_id で絞る（別 Plan の資料が混ざらない）",
  );
  assert(page.includes("documentsError"), "資料の読み込みエラーを扱っている");
  assert(
    page.includes("資料を読み込めませんでした。"),
    "エラー時の文言はそのまま（原因を断定しない）",
  );
  // Karte / Worksheet も同じ planId で読む（所有者確認を通ったあと）
  assert(
    page.includes("loadPlanKarte(supabase, planId)") &&
      page.includes("loadPlanWorksheet(supabase, planId)"),
    "Karte / Worksheet も同じ planId で読む",
  );
  const idxPlanCheck = page.indexOf("notFound()");
  const idxKarte = page.indexOf("loadPlanKarte(supabase, planId)");
  assert(idxKarte > idxPlanCheck, "所有者確認のあとで Karte を読む");
}

console.log("Test 2: ページ表示時に AI 生成を呼ばない");
{
  for (const forbidden of ["anthropic", "Anthropic", "/api/documents/", "generateMyNote", "fetch("]) {
    assert(!pageCode.includes(forbidden), `ページは ${forbidden} を呼ばない`);
  }
  assert(
    !allSectionCode.includes("fetch(") && !/anthropic/i.test(allSectionCode),
    "各セクションも AI・API を呼ばない",
  );
  // 使うのは既存の pure な変換層だけ
  for (const builder of [
    "buildMyNoteBuckets(karte, worksheetState)",
    "buildKarteConditionSlots(karte, worksheetState)",
    "buildSchoolComparisonView(",
  ]) {
    assert(page.includes(builder), `既存の変換層 ${builder} を使っている`);
  }
}

console.log("Test 3: セクションの順序が仕様どおり");
{
  const order = [
    ["DocumentsWorkspaceHeader", "ヘッダー（タイトル・説明・Current Plan）"],
    ["MyKarteNoteSection", "My Note"],
    ["MyKarteConditionsSection", "Study Plan"],
    ["ComparisonBoard", "Comparison Board"],
    ["MyKarteSchoolsSection", "School Comparison"],
    ["伝える・相談する", "伝える・相談する"],
  ] as const;
  let prev = -1;
  for (const [needle, label] of order) {
    const tag = pageCode.indexOf(`<${needle}`);
    const idx = tag >= 0 ? tag : pageCode.indexOf(needle);
    assert(idx > prev, `${label} が正しい位置にある（実際の位置: ${idx}）`);
    prev = idx;
  }
}

console.log("Test 4: 既存の詳細画面・資料機能への導線が消えていない");
{
  const routes = [
    "documents/my-note",
    "documents/study-plan",
    "documents/school-comparison",
    "documents/consultation-sheet",
  ];
  for (const route of routes) {
    assert(
      page.includes(route) ||
        noteSection.includes(route) ||
        conditionsSection.includes(route) ||
        schoolsSection.includes(route),
      `${route} への導線が残っている`,
    );
  }
  // 親向けは ROLE_ROUTE_SLUG 経由
  assert(
    page.includes("ROLE_ROUTE_SLUG.parent_explanation"),
    "親向け説明資料への導線が残っている",
  );
  assert(
    page.includes("DOCUMENT_ROLE_DEFINITIONS.parent_explanation"),
    "親向けの role metadata（lib/documentRoles.ts）をそのまま使っている",
  );
  // 各ダッシュボードセクションに詳細への導線がある
  assert(noteSection.includes("/documents/my-note"), "My Note セクションから詳細へ行ける");
  assert(
    conditionsSection.includes("/documents/study-plan"),
    "Study Plan セクションから詳細へ行ける",
  );
  assert(
    schoolsSection.includes("/documents/school-comparison"),
    "School Comparison セクションから詳細へ行ける",
  );
  assert(
    schoolsSection.includes("学校を比較する →"),
    "School Comparison の導線の文言が仕様どおり",
  );
  // その他の資料の一覧も残っている
  assert(page.includes("その他の資料") && page.includes("otherRows"), "その他の資料の一覧は残っている");
  assert(page.includes("planDocumentTypeLabel"), "その他の資料の type ラベルもそのまま");
}

console.log("Test 5: 親向け・Consultation Sheet は既存のカード形式のまま");
{
  assert(
    (page.match(/<DocumentWorkspaceCard/g) ?? []).length === 2,
    "カードは 2 枚だけ（親向け・Consultation Sheet）",
  );
  assert(page.includes('variant: "parent"'), "親向けカードの variant はそのまま");
  assert(page.includes('variant="consult"'), "Consultation Sheet の variant はそのまま");
  assert(page.includes("shareBadge"), "親向けの共有バッジはそのまま");
  assert(
    page.includes("loadConsultationSheet(supabase, planId)"),
    "Consultation Sheet の更新日の取得はそのまま",
  );
  assert(
    page.includes("整理した内容を、相手に合わせた資料に。"),
    "セクションの説明文が仕様どおり",
  );
  assert(
    page.includes("sm:grid-cols-2"),
    "PC は 2 列・スマートフォンは 1 列",
  );
  assert(
    page.includes("相談シートをひらく →") && page.includes("内容をみる →"),
    "カードの CTA 文言は従来のまま",
  );
}

console.log("Test 6: 大きな資料作成カードの一覧には戻っていない");
{
  assert(
    !page.includes("const CARD_PRESENTATION"),
    "旧 5 枚カードの presentation 設定（CARD_PRESENTATION）は残っていない",
  );
  assert(
    !/Record<\s*DocumentRoleKey,\s*\{\s*variant/.test(page),
    "role ごとにカードを作る map は残っていない",
  );
  assert(!page.includes("DOCUMENT_ORDER"), "旧カードの並び順定義は残っていない");
  assert(
    !/<DocumentWorkspaceCard[\s\S]*?variant="note"/.test(page),
    "My Note は大きなカードに戻っていない",
  );
  assert(
    !/variant="plan"|variant: "plan"/.test(page),
    "Study Plan は大きなカードに戻っていない",
  );
  assert(
    !/variant="compare"|variant: "compare"/.test(page),
    "School Comparison は大きなカードに戻っていない",
  );
  // 全体を 1 枚の大きなカードで囲っていない（セクションは余白と見出しで区切る）
  assert(
    page.includes("space-y-11") || page.includes("space-y-12"),
    "セクションは余白で区切っている",
  );
  // 見出しは「カード」ではない。下の hairline と件数の小さな pill は、
  // セクションの区切りと実データの件数を示すものなので持ってよい。
  const headerMarkup = sectionHeader.split("return (")[1] ?? "";
  assert(sectionHeader.includes("<h2"), "セクション見出しは h2 で出している");
  assert(
    !/rounded-\[|shadow-card/.test(headerMarkup),
    "セクション見出しをカード（角丸・影）にしていない",
  );
  assert(
    !/bg-\[var\(--mk-card\)\]|bg-white/.test(headerMarkup),
    "セクション見出しは地色を持たない（淡いグレーの canvas の上に直接置く）",
  );
}

console.log("Test 7: My Note セクションは既存の振り分け（stated のみ）をそのまま出す");
{
  assert(
    noteSection.includes('from "@/lib/myNoteBuckets"'),
    "既存の振り分け層（myNoteBuckets）から受け取る",
  );
  // 4 つの話題はすべて MY_NOTE_CARDS に実在するキー
  for (const key of ["reasons", "future", "priorities", "worries"]) {
    assert(
      MY_NOTE_CARDS.some((c) => c.key === key),
      `${key} は MY_NOTE_CARDS に実在するキー`,
    );
    assert(noteSection.includes(`key: "${key}"`), `${key} を画面に出している`);
  }
  assert(
    noteSection.includes("line-clamp-4") && noteSection.includes("line-clamp-5"),
    "長文は表示行数を抑える（原文は切り詰めない）",
  );
  assert(
    noteSection.includes("whitespace-pre-wrap break-words"),
    "改行と長い単語を崩さずに出す",
  );
  assert(
    noteSection.includes("AI相談やワークシートで考えを整理すると、ここに内容が表示されます。"),
    "空状態の文言が仕様どおり",
  );
  assert(
    noteSection.includes("items.length > 0"),
    "材料が無い話題はカードを出さない（空のカードを並べない）",
  );
  assert(
    !noteSection.includes("worksheetSectionTheme("),
    "My Note は Worksheet のテーマ色の面を使わない（白いカードに作り替えた）",
  );
  assert(
    noteSection.includes("mk-card") && noteSection.includes("mk-card-title"),
    "色・文字はダッシュボード用の共通クラス / トークン（mk-*）から引く",
  );
}

console.log("Test 8: Study Plan セクションは未整理・未定・複数候補を正しく出す");
{
  assert(
    conditionsSection.includes('from "@/lib/karteConditionSlots"'),
    "値は pure な変換層から受け取る",
  );
  assert(
    conditionsSection.includes("CONDITION_SLOT_UNKNOWN_TEXT") &&
      conditionsSection.includes("CONDITION_SLOT_UNDECIDED_TEXT"),
    "「未整理」と「未定」を区別して出す",
  );
  assert(
    conditionsSection.includes("slot.values.join(\"、\")"),
    "複数候補は 1 つに絞らず全部出す",
  );
  assert(
    conditionsSection.includes('slot.state === "conflict"'),
    "相談とワークシートの食い違いを示す",
  );
  assert(
    conditionsSection.includes("grid-cols-2") && conditionsSection.includes("lg:grid-cols-3"),
    "スマートフォン 2 列・PC 3 列",
  );
  assert(conditionsSection.includes("SlotIcon"), "項目ごとに小さなアイコンがある");
  // グラフ・達成率は出さない
  for (const forbidden of ["%", "達成", "progress", "chart", "Chart"]) {
    assert(
      !stripComments(conditionsSection).includes(forbidden),
      `${forbidden} のような BI 的表示をしない`,
    );
  }
}

console.log("Test 9: School Comparison セクションは保存済みの候補校だけを出す");
{
  assert(
    page.includes("buildSchoolComparisonView(") && page.includes("AUSTRALIA_SCHOOLS"),
    "候補校は既存の変換層＋学校マスタから取る",
  );
  assert(
    page.includes("school.nameJa?.trim() ? school.nameJa : school.name"),
    "学校名はマスタの表記をそのまま使う",
  );
  // 件数はセクション見出しの meta（pill）として出す。
  // ここは docblock のコメントではなく**実際に描画されるコード**で確認する。
  const schoolsCode = stripComments(schoolsSection);
  assert(
    schoolsCode.includes("meta={schools.length > 0 ? `${schools.length}校` : undefined}"),
    "学校数を見出しの件数 pill として出す",
  );
  assert(schoolsCode.includes("{school.name}"), "学校名を出す");
  assert(schoolsCode.includes("mk-card"), "一覧は白いカード（共通カードクラス）");
  assert(schoolsSection.includes("school.city ?? \"—\""), "都市が無ければ推測せず「—」");
  assert(
    schoolsSection.includes("schools.length === 0"),
    "候補が無いときは空状態を出す",
  );
  // 順位・評価は出さない
  for (const forbidden of ["おすすめ", "ランキング", "適合", "スコア", "1位"]) {
    assert(
      !stripComments(schoolsSection).includes(forbidden),
      `${forbidden} のような評価を出さない`,
    );
  }
}

console.log("Test 10: データが無い / 一部しかない場合も壊れない");
{
  // 10-1: 完全に空（Karte も Worksheet も無い）
  const emptyKarte = createEmptyKarte("k-empty");
  const emptyBuckets = buildMyNoteBuckets(emptyKarte, null);
  const emptySlots = buildKarteConditionSlots(emptyKarte, null);
  assert(
    MY_NOTE_CARDS.every((c) => emptyBuckets[c.key].length === 0),
    "空カルテでは My Note の材料が 1 件も作られない",
  );
  assert(
    emptySlots.every((s) => s.values.length === 0),
    "空カルテでは条件の値が 1 件も作られない",
  );
  assert(emptySlots.length === 10, "それでもスロットの枠は 10 項目そろう（表が崩れない）");

  // 10-2: 一部だけある（Worksheet に 1 問だけ答えた状態）
  const ws = emptyWorksheet();
  ws.answers["trigger"] = "海外ドラマがきっかけ";
  const partialBuckets = buildMyNoteBuckets(createEmptyKarte("k2"), ws);
  assert(
    partialBuckets.reasons.length === 1,
    "1 問だけでも、その話題の材料になる",
  );
  assert(
    partialBuckets.future.length === 0 && partialBuckets.priorities.length === 0,
    "答えていない話題は空のまま（推測で埋めない）",
  );

  // 10-3: Karte に inferred しかない
  const inferredKarte = createEmptyKarte("k3");
  inferredKarte.schoolPrefs.preferredCity = {
    value: "シドニー",
    certainty: "inferred",
    source: "chat",
  };
  const inferredSlots = buildKarteConditionSlots(inferredKarte, null);
  assert(
    inferredSlots.every((s) => s.values.length === 0),
    "inferred だけのときは条件を 1 件も表示しない（AI の仮説を希望にしない）",
  );
  const inferredBuckets = buildMyNoteBuckets(inferredKarte, null);
  assert(
    MY_NOTE_CARDS.every((c) => inferredBuckets[c.key].length === 0),
    "inferred だけのときは My Note の材料にもしない",
  );
}

console.log("Test 11: ヘッダーと Current Plan はそのまま");
{
  assert(workspaceHeader.includes("My Karte"), "タイトルは My Karte");
  assert(workspaceHeader.includes("Current Plan"), "Current Plan のラベルがある");
  assert(workspaceHeader.includes("{title}"), "出すのは実際の plan.title だけ");
  assert(
    page.includes("planTitle={plan.title}"),
    "plan.title をそのまま渡している（国名・留学タイプを作らない）",
  );
  assert(
    page.includes("lastUpdatedText={rows.length > 0 ? formatLastUpdated(rows[0].updated_at) : null}"),
    "最終更新の出し方は従来のまま",
  );
  assert(
    workspaceHeader.includes("確認・整理・比較"),
    "説明文がダッシュボードの役割を説明している",
  );
}

console.log("Test 12: My Plan（確定した実行計画）と混同しない");
{
  assert(
    !pageCode.includes("loadPlanBlueprint") && !pageCode.includes("plan_blueprint"),
    "My Karte トップは blueprint を読まない",
  );
  assert(
    !pageCode.includes("buildMyPlanView"),
    "My Plan の view builder は使わない",
  );
  assert(
    !allSectionCode.includes("myPlanView") && !allSectionCode.includes("planBlueprint"),
    "各セクションも My Plan のデータに触れない",
  );
}

console.log("Test 13: ページ冒頭のサマリータイルは、実データの件数だけを出す");
{
  assert(page.includes("<MyKarteSummaryTiles"), "ページ冒頭にサマリータイルがある");
  assert(
    page.includes("conditionsFilled={countFilledConditionSlots(conditionSlots)}"),
    "整理した条件の件数は、条件スロットを数えた実データ",
  );
  assert(page.includes("schoolCount={schoolRows.length}"), "学校候補の件数は実データ");
  assert(
    summaryTiles.includes("getComparisonBoardCountSnapshot"),
    "比較中の案の件数は比較ボードの実データ",
  );
  // 根拠のない指標を作らない
  // グラデーションの色停止（0% / 45%）を誤検出しないよう、style の中身を除いてから見る。
  const tileCode = stripComments(summaryTiles)
    .replace(/style=\{\{[\s\S]*?\}\}/g, "")
    .replace(/background:[\s\S]*?,\n/g, "");
  for (const forbidden of ["%", "達成", "スコア", "score", "progress", "chart", "率"]) {
    assert(!tileCode.includes(forbidden), `タイルに ${forbidden} のような指標を作っていない`);
  }
  assert(
    !/<svg|<canvas/.test(tileCode),
    "グラフ（svg / canvas）を置いていない",
  );
  // サーバー側では端末の件数を知らないので 0 と断定しない
  assert(
    summaryTiles.includes('comparisonCount === null ? "—"'),
    "復元前は 0 ではなく「—」を出す（数字が入れ替わって見えないようにする）",
  );
}

console.log("Test 14: 情報の強弱（同じ見た目の箱が並ぶだけになっていない）");
{
  // My Note: 4 枚のカードは**同じ作り**（NoteCard 1 つだけで描く）。
  // 以前は HeroCard / SubCard の 2 種類あり、見出しの形も本文サイズも違っていた。
  assert(
    !noteSection.includes("function HeroCard(") && !noteSection.includes("function SubCard("),
    "My Note のカードを 2 種類に作り分けていない（4 枚で共通の作り）",
  );
  assert(
    (noteSection.match(/function NoteCard\(/g) ?? []).length === 1,
    "My Note のカードは NoteCard 1 つだけで描いている",
  );
  assert(
    noteSection.includes("lg:grid-cols-5") &&
      noteSection.includes("lg:col-span-3") &&
      noteSection.includes("lg:col-span-2"),
    "PC は 5 列の Bento Grid（3 : 2 で大小を組み合わせる）",
  );
  assert(
    noteSection.includes("const SPANS") && /4: \[/.test(noteSection),
    "カードの枚数に応じて列幅を決めている（4 枚なら 2 段 Bento）",
  );
  assert(
    noteSection.includes("grid-cols-1"),
    "スマートフォンでは 1 列に戻る",
  );
  assert(
    noteSection.includes("items-start"),
    "高さを引き伸ばさない（カード下部に余分な空白を作らない）",
  );
  assert(
    !/h-\[\d+px\]|min-h-\[\d+px\]/.test(stripComments(noteSection)),
    "固定の高さを持たせない（長文が切れないようにする）",
  );
  assert(
    noteSection.includes("const MAX_ITEMS = 3") &&
      !noteSection.includes("MAX_ITEMS_HERO") &&
      !noteSection.includes("MAX_ITEMS_SUB"),
    "出す件数は 4 枚で共通（カードごとに変えない）",
  );
  // 本文・項目名・カードタイトルは共通クラスだけで組み、このファイルで px を決めない
  const noteCode = stripComments(noteSection);
  assert(
    !/text-\[\d+px\]/.test(noteCode),
    "My Note は文字サイズを px で直書きしていない（共通クラスに集約）",
  );
  assert(
    noteCode.includes("mk-item-label") &&
      noteCode.includes("mk-text-lead") &&
      noteCode.includes("mk-text"),
    "項目名・本文は My Karte 共通クラスを使う",
  );
  assert(
    (noteCode.match(/mk-item-label/g) ?? []).length === 1 &&
      (noteCode.match(/mk-card-title/g) ?? []).length === 1,
    "項目名とカードタイトルの指定は 1 か所だけ（4 枚で必ず同じ）",
  );
  assert(
    !/w-full[^"`]*bg-\[var\(--mk-pale|bg-\[var\(--mk-pale[^"`]*px-\d/.test(noteCode),
    "カードタイトルを横幅いっぱいのパステルの帯で出していない",
  );
  assert(
    noteCode.includes("function NoteIcon(") && noteCode.includes("h-4 w-4"),
    "カードタイトルには小さなアイコン（16px）を添える（4 枚で同じサイズ）",
  );
  // Study Plan: 表のセルに見えないよう、格子の罫線を引いていない
  const condCode = stripComments(conditionsSection);
  assert(
    !/border-l border-t/.test(condCode),
    "条件グリッドに格子の罫線を引いていない（表のセルに見せない）",
  );
  assert(
    /gap-x-\d+ gap-y-\d+/.test(condCode),
    "区切りは余白で作っている",
  );
  assert(
    condCode.includes("grid-cols-2") && condCode.includes("lg:grid-cols-3"),
    "スマートフォン 2 列・PC 3 列は維持",
  );
  // Study Plan の文字は My Note と同じ共通クラスで組む（セクションごとに px を決めない）
  assert(
    !/text-\[\d+px\]/.test(condCode),
    "Study Plan は文字サイズを px で直書きしていない（共通クラスに集約）",
  );
  assert(
    condCode.includes("mk-item-label"),
    "Study Plan の項目名は My Note の項目名と同じクラス",
  );
  assert(
    condCode.includes("mk-value") && condCode.includes("mk-value-empty"),
    "値と「未定・未整理」は共通クラスで出す",
  );
  assert(
    !/size: "lg" \| "sm"/.test(condCode) && !condCode.includes('size="lg"'),
    "主要 4 項目とその他 6 項目で値の文字サイズを変えていない",
  );
  // 各セクションに役割を示す eyebrow がある
  for (const eyebrow of ['eyebrow="Note"', 'eyebrow="Conditions"', 'eyebrow="Schools"']) {
    assert(
      noteSection.includes(eyebrow) ||
        conditionsSection.includes(eyebrow) ||
        schoolsSection.includes(eyebrow),
      `${eyebrow} でセクションの役割を示している`,
    );
  }
}

console.log("Test 15: 下段は「行動」エリアとして分けている");
{
  assert(
    page.includes("伝える・相談する") &&
      page.includes('className="mk-eyebrow"') &&
      page.includes('className="mk-section-title mt-1.5"'),
    "伝える・相談するは他セクションと同じ見出しクラスで下段に置く",
  );
  assert(
    !pageCode.includes("bg-[#fbfaf7]"),
    "下段を淡いアイボリーの面で囲うのはやめた（白いカードを canvas に置く構成へ）",
  );
  assert(
    pageCode.includes("bg-[var(--mk-canvas)]"),
    "ページの地は淡いグレーの canvas",
  );
  assert(
    !pageCode.includes("bg-worksheet-surface"),
    "My Karte の地はアプリ全体の背景トークンではなく、この画面専用の canvas を使う",
  );
  assert(
    (page.match(/surface="#ffffff"/g) ?? []).length === 2,
    "面の上のカードは白にして背景に溶けないようにしている",
  );
  assert(
    page.includes("整理した内容を、相手に合わせた資料に。"),
    "説明文は仕様どおり",
  );
}

console.log("Test 16: 蛍光アクセントは「面」ではなく「アクセント」として使う");
{
  // 色の定義は globals.css の 1 か所だけ
  for (const token of ["--neon-lime:", "--neon-lime-soft:", "--neon-yellow:", "--neon-blue:", "--neon-ink:"]) {
    assert(globalsCss.includes(token), `${token} が globals.css に定義されている`);
  }

  const neonFiles: [string, string][] = [
    ["MyKarteSummaryTiles", summaryTiles],
    ["MyKarteSectionHeader", sectionHeader],
    ["MyKarteNoteSection", noteSection],
    ["MyKarteConditionsSection", conditionsSection],
    ["MyKarteSchoolsSection", schoolsSection],
    ["ComparisonBoard", comparisonBoard],
    ["DocumentWorkspaceCard", workspaceCard],
  ];

  // 各コンポーネントは変数経由で使い、蛍光色の hex をベタ書きしない
  for (const [name, src] of neonFiles) {
    assert(
      !/#(d8fb57|effdc0|fdf25a|6fdcf7)/i.test(stripComments(src)),
      `${name} は蛍光色の hex をベタ書きしていない（変数経由で使う）`,
    );
  }

  // **カード大の面を蛍光で塗らない**。角丸の大きい容器 = カード/パネルとみなす。
  for (const [name, src] of neonFiles) {
    const code = stripComments(src);
    for (const radius of ["rounded-\\[16px\\]", "rounded-\\[20px\\]", "rounded-\\[22px\\]"]) {
      const re = new RegExp(`${radius}[^"\`]*bg-\\[var\\(--neon|bg-\\[var\\(--neon[^"\`]*${radius}`);
      assert(!re.test(code), `${name} はカード大の面（${radius}）を蛍光で塗っていない`);
    }
  }

  // 蛍光の上に白文字を載せない（必ず near-black）
  for (const [name, src] of neonFiles) {
    const code = stripComments(src);
    const re = /bg-\[var\(--neon[^"`]*text-(white|\[#f)/;
    assert(!re.test(code), `${name} は蛍光面の上に白文字を置いていない`);
  }
  assert(
    sectionHeader.includes("text-[var(--neon-ink)]"),
    "蛍光 pill の文字は near-black（--neon-ink）",
  );

  // 使っている場所が「小さなもの」であることを型で示す
  // タイル: 主役の 1 枚だけが蛍光のグラデーション。残り 2 枚は白のまま。
  assert(
    (summaryTiles.match(/radial-gradient/g) ?? []).length === 1,
    "蛍光のグラデーションは主役のタイル 1 枚だけ",
  );
  assert(summaryTiles.includes("lead: true"), "主役のタイルを明示している");
  assert(
    (summaryTiles.match(/lead: true/g) ?? []).length === 1,
    "主役のタイルは 1 枚だけ",
  );
  assert(
    summaryTiles.includes("rgba(255,255,255,0)"),
    "グラデーションは白へ溶け込ませる（面のベタ塗りにしない）",
  );
  // 見出しの件数 pill は蛍光のまま
  assert(
    sectionHeader.includes("bg-[var(--neon-lime)]") &&
      sectionHeader.includes("text-[var(--neon-ink)]"),
    "見出しの件数 pill は蛍光ライム + near-black",
  );
  // 蛍光ライムは「理由・目的」のカードのグラデーションにだけ使う（帯や pill では塗らない）
  assert(
    noteSection.includes('wash: "var(--neon-lime)"'),
    "蛍光ライムは 1 枚目のカードのグラデーションに使う",
  );
  assert(
    (noteSection.match(/var\(--neon-lime\)/g) ?? []).length === 1,
    "My Note の蛍光は 1 か所だけ（カードごとの塗り分けにしない）",
  );

  // My Note の hero は**パステルの面のまま**（蛍光で塗らない）
  // **ピーチ色の全面ベタ塗りは廃止**。hero の地は白で、色は右上のグラデーションとチップだけ。
  assert(
    !noteSection.includes("backgroundColor: theme.tint"),
    "hero をテーマ色で全面塗りしていない（ピーチ一色の面は廃止）",
  );
  assert(
    /function NoteCard\([\s\S]{0,900}"mk-card mk-pad/.test(noteSection),
    "4 枚ともカードの地は白（共通カードクラス）",
  );
  assert(
    /function NoteCard\([\s\S]{0,1400}radial-gradient/.test(noteSection),
    "色は右上のグラデーションで差す",
  );
  assert(
    noteSection.includes("rgba(255,255,255,0) 68%"),
    "グラデーションは白へ自然に溶け込ませる",
  );
  assert(
    (noteSection.match(/radial-gradient/g) ?? []).length === 1,
    "グラデーションの指定は 1 か所（4 枚で同じ作り。色だけ変える）",
  );
  // 長文が載る領域は白のまま（チップ以外に色面を敷かない）
  assert(
    !/line-clamp-5[^"]*bg-/.test(noteSection),
    "長文が表示される領域に色面を敷いていない",
  );

  // Study Plan は表に戻していない / 値は落ち着いた色のまま
  const condCode = stripComments(conditionsSection);
  assert(!/border-l border-t/.test(condCode), "条件グリッドに罫線を戻していない");
  assert(
    condCode.includes("mk-value") && !/bg-\[var\(--neon/.test(condCode),
    "条件の値は落ち着いた濃色のまま（蛍光を本文・面に使わない）",
  );
  assert(
    condCode.includes("PRIMARY_SLOT_IDS"),
    "よく見る 4 項目を大きく、残りをコンパクトに出し分けている",
  );
  assert(
    condCode.includes("bg-[var(--mk-block)]"),
    "情報のまとまりは薄いグレーのブロックで作る",
  );
  assert(
    !/bg-\[var\(--mk-pale-(blue|sage)\)\]/.test(condCode),
    "項目ごとにパステルで塗り分けていない",
  );
}

console.log("Test 17: My Karte 全体のデザイン・タイポグラフィが統一されている");
{
  /*
   * 「同じ役割の文字には同じスタイル」を担保する。以前はセクションごとに px と色を
   * 決めていたため、項目名が 10px の薄いグレーの場所と 14px の場所が混在していた。
   */

  // 1) 共通クラスとトークンは globals.css の 1 か所に定義されている
  for (const cls of [
    ".mk-page-title",
    ".mk-section-title",
    ".mk-card-title",
    ".mk-eyebrow",
    ".mk-item-label",
    ".mk-item-label-sm",
    ".mk-text",
    ".mk-text-lead",
    ".mk-value",
    ".mk-value-empty",
    ".mk-sub-text",
    ".mk-link",
    ".mk-card",
    ".mk-card-sm",
    ".mk-card-empty",
    ".mk-pad",
    ".mk-pad-lg",
  ]) {
    assert(globalsCss.includes(`${cls} {`), `${cls} が globals.css に定義されている`);
  }
  for (const token of ["--mk-label: #515650", "--mk-body: #262626", "--mk-sub: #737873", "--mk-radius:", "--mk-radius-sm:"]) {
    assert(globalsCss.includes(token), `${token} が globals.css に定義されている`);
  }

  // 2) 項目名は「薄すぎるグレー」ではなく専用の文字色を使う
  assert(
    /--mk-label: #515650/.test(globalsCss),
    "項目名の色は #515650（薄すぎるグレーを使わない）",
  );
  assert(
    /\.mk-item-label \{[^}]*font-size: 14px/.test(globalsCss) &&
      /\.mk-item-label \{[^}]*font-weight: 600/.test(globalsCss),
    "項目名は 14px / 600 以上（以前の 10〜11px から大きく・太くした）",
  );
  assert(
    /@media \(min-width: 640px\)[\s\S]*?\.mk-item-label \{\s*font-size: 15px/.test(globalsCss),
    "PC では項目名を 15px にする",
  );

  // 3) 同じ役割の文字を各コンポーネントが px で決め直していない
  const mkFiles: [string, string][] = [
    ["MyKarteNoteSection", noteSection],
    ["MyKarteConditionsSection", conditionsSection],
    ["MyKarteSectionHeader", sectionHeader],
    ["DocumentsWorkspaceHeader", workspaceHeader],
    ["MyKarteSchoolsSection", schoolsSection],
    ["DocumentWorkspaceCard", workspaceCard],
  ];
  for (const [name, src] of mkFiles) {
    const code = stripComments(src);
    // pill・連番バッジのような小さな部品は役割が違うので専用サイズを持ってよい（§8）。
    // 文章（項目名・本文・補足情報）だけを見るため、それらの行は外す。
    const textLines = code
      .split("\n")
      .filter((line) => !line.includes("rounded-full"))
      .join("\n");
    assert(
      !/text-\[1[0-3]px\]/.test(textLines),
      `${name} の文章に 13px 以下の直書き文字サイズが残っていない（補足情報は .mk-sub-text）`,
    );
    assert(
      !/text-\[var\(--mk-muted\)\]/.test(code),
      `${name} は文字色を共通トークン（--mk-label / --mk-body / --mk-sub）に寄せている`,
    );
  }

  // 4) セクション見出しは 1 つのコンポーネントに集約されている
  for (const [name, src] of [
    ["MyKarteNoteSection", noteSection],
    ["MyKarteConditionsSection", conditionsSection],
    ["MyKarteSchoolsSection", schoolsSection],
  ] as [string, string][]) {
    assert(
      src.includes("<MyKarteSectionHeader"),
      `${name} はセクション見出しを共通コンポーネントで出す`,
    );
  }
  assert(
    sectionHeader.includes("mk-section-title") &&
      comparisonBoard.includes("mk-section-title") &&
      page.includes("mk-section-title"),
    "Comparison Board と「伝える・相談する」も同じセクション見出しクラスを使う",
  );

  // 5) 角丸・影・内余白も共通クラス経由（カードごとにバラバラの rounded を持たない）
  for (const [name, src] of mkFiles) {
    const code = stripComments(src);
    assert(
      !/rounded-\[(18|20|22|24)px\]/.test(code),
      `${name} はカードの角丸を直書きしていない（.mk-card / .mk-card-sm に集約）`,
    );
  }
  assert(
    workspaceCard.includes("mk-card mk-pad"),
    "親向け・Consultation Sheet のカードも共通のカードクラスを使う（カード形式自体は維持）",
  );

  // 6) 共通クラスを使ってよい画面の一覧。
  //    新しいデザイン方針で、Plan Home / Worksheet 詳細 / My Plan も同じ文字階層へ合流した。
  //    **承認済みの見た目を保護する画面**（Worksheet 一覧 / 匿名 Worksheet / 匿名チャット /
  //    My Page の Plan カード）へは引き続き漏らさない。
  const mkOwners = new Set([
    // My Karte
    "app/plans/[planId]/documents/page.tsx",
    "app/globals.css",
    "components/DocumentWorkspaceCard.tsx",
    "components/DocumentsWorkspaceHeader.tsx",
    "components/MyKarteNoteSection.tsx",
    "components/MyKarteConditionsSection.tsx",
    "components/MyKarteSchoolsSection.tsx",
    "components/MyKarteSectionHeader.tsx",
    "components/MyKarteSummaryTiles.tsx",
    "components/ComparisonBoard.tsx",
    // Plan Chat（AI相談）。Chat.tsx / KarteSummary.tsx は /widget と共用のため、
    // Plan 専用の variant の中だけで使う（variant の分岐自体は test-plan-chat-ui.ts が見る）。
    "components/Chat.tsx",
    "components/PlanChatMessage.tsx",
    "components/ChatStartScreen.tsx",
    "components/PlanChatInsightNote.tsx",
    "components/KarteSummary.tsx",
    "components/proposal/ProposalMessage.tsx",
    // Plan Home / Worksheet 詳細 / My Plan（今回の新デザインで合流した画面）
    "app/plans/[planId]/page.tsx",
    "components/PlanJourneyRibbon.tsx",
    "components/WorksheetSectionDetail.tsx",
    "components/MyPlan.tsx",
  ]);
  const users = execFileSync(
    "grep",
    ["-rl", "-e", "mk-card-title", "-e", "mk-item-label", "-e", "mk-section-title", "app", "components", "lib"],
    { encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean);
  for (const file of users) {
    assert(mkOwners.has(file), `${file} は共通クラスを使ってよいファイル`);
  }
  // 承認済みデザインの画面には入っていないことを明示的にも確認する
  for (const guarded of [
    "components/Worksheet.tsx",
    "components/WorksheetSectionList.tsx",
    "components/PlanCard.tsx",
    "components/HomePlanCard.tsx",
    "app/widget/page.tsx",
    "components/Message.tsx",
  ]) {
    assert(!users.includes(guarded), `${guarded} には共通クラスを持ち込んでいない`);
  }

  // 7) アプリ全体のスタイルは変えていない
  assert(
    globalsCss.includes("--background: #ffffff") &&
      globalsCss.includes("--worksheet-sage: #dde8e1"),
    "アプリ全体の背景と Worksheet の承認済みカラーは変えていない",
  );
  assert(
    /body \{\s*\n\s*\/\* アプリ全体の背景/.test(globalsCss),
    "body の既存スタイルに手を入れていない",
  );
  assert(
    globalsCss.includes("@layer components {"),
    "My Karte 用クラスは components レイヤーに置き、utility で上書きできるようにしている",
  );
}

console.log("");
console.log(`passed: ${pass} / failed: ${fail}`);
if (fail > 0) process.exit(1);
