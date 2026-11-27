/**
 * 新しいデザイン方針（白地 / 黒・濃いグレーの文字 / 白いカード / 機能別カラーは小さく /
 * 主要操作だけ蛍光ライム）が、対象画面に揃って入っていることの確認スクリプト。
 *
 *   npx tsx scripts/test-app-design-system.ts
 *
 * 固定したいこと:
 *   1. 共通トークン（--fn-* / --mk-* / --neon-*）と共通クラス（.btn-primary / .btn-quiet /
 *      .fn-icon）が 1 か所（globals.css）にあり、画面ごとに同じ役割の色・角丸を再定義していない
 *   2. Plan Home / Worksheet 詳細 / My Plan / My Karte がその共通クラスを使っている
 *   3. **保護する画面**（Worksheet 一覧 / AI相談チャット / 匿名チャット /widget）には
 *      今回の変更が漏れていない
 *   4. アプリ全体のトークンの値（--background / --worksheet-*）を書き換えていない
 *
 * ソースを読んで検査する（描画・DB アクセスはしない）。
 */

import { readFileSync } from "node:fs";

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

/** 「もう X をしていない」を検査するとき、説明コメントでの誤検知を避ける。 */
function stripComments(code: string): string {
  return code
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, " ");
}

const css = readFileSync("app/globals.css", "utf8");
const planHome = readFileSync("app/plans/[planId]/page.tsx", "utf8");
const myPlan = readFileSync("components/MyPlan.tsx", "utf8");
const wsDetail = readFileSync("components/WorksheetSectionDetail.tsx", "utf8");
const wsList = readFileSync("components/WorksheetSectionList.tsx", "utf8");
const wsTheme = readFileSync("lib/worksheetSectionTheme.ts", "utf8");
const worksheet = readFileSync("components/Worksheet.tsx", "utf8");
const chat = readFileSync("components/Chat.tsx", "utf8");
const chatPage = readFileSync("app/plans/[planId]/chat/page.tsx", "utf8");
const planMessage = readFileSync("components/PlanChatMessage.tsx", "utf8");
const outline = readFileSync("components/MyPlanOutline.tsx", "utf8");

console.log("Test 1: 機能別カラーは globals.css に 1 回だけ定義する");
{
  const expected: [string, string][] = [
    ["--fn-chat", "#e1efc5"],
    ["--fn-worksheet", "#d5edfc"],
    ["--fn-karte", "#e9e0fa"],
    ["--fn-plan", "#ffeda9"],
  ];
  for (const [name, value] of expected) {
    assert(css.includes(`${name}: ${value};`), `${name} は ${value} で定義されている`);
    assert(
      (css.match(new RegExp(`${name}:`, "g")) ?? []).length === 1,
      `${name} の定義は 1 か所だけ`,
    );
  }
  // 画面側は値ではなく変数を参照する（同じ色を各画面で書き直さない）
  for (const [name, value] of expected) {
    for (const [label, src] of [
      ["Plan Home", planHome],
      ["My Plan", myPlan],
      ["Worksheet 詳細", wsDetail],
    ] as [string, string][]) {
      assert(!src.includes(value), `${label} に ${name} の色コード（${value}）を直書きしていない`);
    }
  }
}

console.log("Test 2: ボタンとアイコン背景の共通クラスがある");
{
  assert(css.includes(".btn-primary {"), ".btn-primary がある");
  assert(css.includes(".btn-quiet {"), ".btn-quiet がある");
  assert(css.includes(".fn-icon {"), ".fn-icon がある");
  // 通常は蛍光ライムの面 + 黒文字、hover で面だけ白
  const primary = css.slice(css.indexOf(".btn-primary {"), css.indexOf(".btn-primary:disabled"));
  assert(
    primary.includes("background-color: var(--neon-lime);") &&
      primary.includes("border: 1.5px solid var(--neon-lime);") &&
      primary.includes("color: var(--neon-ink);"),
    "通常時は蛍光ライムの背景・同色の枠・黒文字",
  );
  assert(
    /\.btn-primary:hover \{\s*background-color: #ffffff;/.test(css),
    "hover では背景だけ白に抜ける（枠線は蛍光ライムのまま）",
  );
  assert(
    /transition:\s*\n?\s*background-color 180ms/.test(css),
    "背景色の切り替えに 150〜200ms の transition を使う",
  );
  // 無効状態に蛍光色を使わない
  const disabled = css.slice(css.indexOf(".btn-primary:disabled"), css.indexOf(".btn-quiet {"));
  assert(!disabled.includes("--neon-lime"), "無効状態では蛍光色を使わない");
  // 副次的な操作は白地
  const quiet = css.slice(css.indexOf(".btn-quiet {"), css.indexOf(".btn-quiet:hover"));
  assert(quiet.includes("background-color: var(--mk-card);"), "副次的な操作は白地");
  assert(!quiet.includes("--neon-lime"), "副次的な操作の通常時に蛍光色は使わない");
}

console.log("Test 3: Plan Home / Worksheet 詳細 / My Plan が共通クラスを使っている");
{
  for (const [label, src] of [
    ["Plan Home", planHome],
    ["My Plan", myPlan],
    ["Worksheet 詳細", wsDetail],
  ] as [string, string][]) {
    assert(src.includes("mk-card"), `${label} は白いカードの共通クラスを使う`);
    assert(/mk-(page|section|card)-title/.test(src), `${label} は共通の見出しクラスを使う`);
    assert(src.includes("btn-primary") || src.includes("btn-quiet"), `${label} は共通のボタンクラスを使う`);
  }
  // 主要操作だけが蛍光ライム（1 画面に何個も置かない）
  assert(
    (planHome.match(/btn-primary/g) ?? []).length === 1,
    "Plan Home の蛍光ライムのボタンは 1 つだけ",
  );
  assert(
    (wsDetail.match(/btn-primary/g) ?? []).length === 1,
    "Worksheet 詳細の蛍光ライムのボタンは 1 つだけ（次のテーマへ）",
  );
}

console.log("Test 4: My Plan は白いカード + 機能別カラーのアイコン背景");
{
  assert(
    readFileSync("app/plans/[planId]/my-plan/page.tsx", "utf8").includes("bg-[var(--mk-canvas)]"),
    "ページの地はごく淡いグレー（カードを白で浮かせる）",
  );
  const code = stripComments(myPlan);
  assert(!/\[#[0-9a-fA-F]{6}\]/.test(code.replace("text-[#eff0ec]", "")), "汎用の色コード直書きは残っていない（共通トークンに寄せた）");
  assert(myPlan.includes('backgroundColor: "var(--fn-plan)"'), "項目のアイコン背景に My Plan の機能色を使う");
  assert(!code.includes("bg-[#e8eee9]") && !code.includes("rgba(150,178,155"), "ヒーローの全面グリーンは廃止した");
  // タイムライン・セクション・保存処理の構造は不変
  assert(myPlan.includes("function MonthScaleTimeline"), "月スケールのタイムラインはそのまま");
  assert(myPlan.includes("packActivityLanes(timedPhases)"), "lane packing のロジックはそのまま");
  assert(myPlan.includes("MY_PLAN_SECTIONS.map"), "セクションの並びはそのまま");
  assert(myPlan.includes("renderSectionBody(s.id, view, planId)"), "各セクションの中身（編集 island）はそのまま");
  assert(
    myPlan.includes('saved: { label: "保存済み"') &&
      myPlan.includes('"ai-suggested": { label: "AI提案"') &&
      myPlan.includes('considering: { label: "検討中"'),
    "状態のラベルは色に関係なく残っている",
  );
}

console.log("Test 5: Worksheet 詳細はテーマ色を保ったまま文字階層だけ整えている");
{
  assert(wsDetail.includes("bg-[var(--ws-tint)] px-5 py-4"), "質問カードのテーマ色の帯は維持");
  assert(wsDetail.includes("worksheetSectionThemeVars(theme)"), "テーマ変数の流し込みは維持");
  assert(wsDetail.includes('className="mk-page-title mt-1.5"'), "ページタイトルは共通クラス");
  assert(wsDetail.includes("mk-text whitespace-pre-line"), "質問の補足説明は共通の本文サイズ");
  assert(wsDetail.includes("[&_textarea]:leading-[1.75]"), "回答欄の行間をこの画面だけ広げている");
  assert(wsDetail.includes("[&_textarea]:text-[var(--mk-body)]"), "回答欄の文字色も共通トークン");
  // 回答欄そのもの（共通コンポーネント）は変更していない
  assert(
    worksheet.includes(
      'className="mt-4 w-full resize-y rounded-xl border-[0.5px] border-worksheet-border bg-worksheet-surface px-3 py-2 text-base leading-relaxed text-worksheet-primary',
    ),
    "共通の QuestionCard（匿名 Worksheet と共用）は変更していない",
  );
  // 進捗の見せ方
  assert(wsDetail.includes("{answeredCount} / {total} 回答済み"), "回答済みの件数表示は維持");
  assert(
    wsDetail.includes('answeredCount === total ? "var(--neon-lime)" : "var(--ws-ink)"'),
    "すべて答えたときだけ進捗ラインが蛍光ライムになる",
  );
}

console.log("Test 6: Worksheet 一覧の承認済みデザインに影響していない");
{
  // 一覧コンポーネントとテーマ定義には一切手を入れない
  assert(!wsList.includes("mk-"), "一覧カードに共通タイポグラフィクラスを持ち込んでいない");
  assert(!wsList.includes("btn-primary") && !wsList.includes("btn-quiet"), "一覧カードに共通ボタンクラスを持ち込んでいない");
  assert(!wsList.includes("--fn-"), "一覧カードに機能別カラーを持ち込んでいない");
  assert(!wsList.includes("--neon-"), "一覧カードに蛍光カラーを持ち込んでいない");
  // 6 テーマの色は唯一の定義元のまま
  for (const [id, tint] of [
    ["motivation", "#fff1ea"],
    ["future", "#edf6f7"],
    ["conditions", "#f0f5e9"],
    ["priorities", "#fff6df"],
    ["anxiety", "#f5f0f8"],
    ["nextstep", "#eef6f4"],
  ] as [string, string][]) {
    assert(wsTheme.includes(`${id}: { tint: "${tint}"`), `${id} のテーマ色は変えていない`);
  }
  // 共通 CSS の変更で間接的に見た目が変わらないこと（一覧が使うトークンは不変）
  assert(css.includes("--worksheet-surface: #ffffff;"), "--worksheet-surface は不変");
  assert(css.includes("--worksheet-border: #e4e4e7;"), "--worksheet-border は不変");
  assert(css.includes("--worksheet-primary: #18181b;"), "--worksheet-primary は不変");
  assert(css.includes("--worksheet-secondary: #71717a;"), "--worksheet-secondary は不変");
  assert(css.includes("--worksheet-sage: #dde8e1;"), "--worksheet-sage は不変");
  assert(css.includes("--background: #ffffff;"), "アプリ全体の背景トークンは不変");
}

console.log("Test 7: AI相談チャット / 匿名チャットに今回の変更が漏れていない");
{
  for (const [label, src] of [
    ["Chat", chat],
    ["PlanChatMessage", planMessage],
  ] as [string, string][]) {
    assert(!src.includes("btn-primary") && !src.includes("btn-quiet"), `${label} に共通ボタンクラスを持ち込んでいない`);
    assert(!src.includes("--fn-"), `${label} に機能別カラーを持ち込んでいない`);
    assert(!src.includes("fn-icon"), `${label} にアイコン背景クラスを持ち込んでいない`);
  }
  // 承認済みの見た目（白地・提案ボタンの配色・会話領域）はそのまま
  assert(chatPage.includes("flex h-dvh min-h-0 flex-1 flex-col bg-white"), "チャット画面の 3 層構造と白背景は不変");
  assert(
    chat.includes(
      '"border-[var(--neon-lime)] bg-[var(--neon-lime)] text-[var(--neon-ink)] hover:bg-white"',
    ),
    "学校提案ボタンの配色は不変",
  );
  assert(chat.includes("const showProposalAction = !showSummary"), "学校提案ボタンの表示条件は不変");
  assert(chat.includes('className="min-h-0 flex-1 overflow-y-auto"') || chat.includes("min-h-0 flex-1 overflow-y-auto"), "会話領域のスクロール構造は不変");
}

console.log("Test 8: My Plan のタイムラインは、蛍光カラーを少量のアクセントとしてだけ使う");
{
  const code = stripComments(myPlan);

  // 1) 役割と色を 1:1 で固定している（同じ役割に別の色を使わない）
  assert(
    /const LANE_NEON = \{[\s\S]*?destinations: "var\(--neon-blue\)"/.test(myPlan),
    "DESTINATIONS（都市・移動）はシアン",
  );
  assert(
    /const LANE_NEON = \{[\s\S]*?accommodation: "var\(--neon-lime\)"/.test(myPlan),
    "ACCOMMODATION（滞在先）はライム",
  );
  assert(
    /const LANE_NEON = \{[\s\S]*?activities: "var\(--neon-yellow\)"/.test(myPlan),
    "ACTIVITIES（活動・予定）はイエロー",
  );
  assert((code.match(/LANE_NEON\./g) ?? []).length >= 8, "蛍光の指定はすべて LANE_NEON 経由");
  assert(!/#d8fb57|#6fdcf7|#fdf25a|#effdc0/.test(code), "蛍光色の色コードを直書きしていない");

  // 2) 期間バー: 蛍光は始点の px 指定だけ。長さ・位置の計算には関与しない
  assert(
    /function barWithNeonStart\(pastel: string, neon: string\): string \{[\s\S]*?\$\{neon\} 0px[\s\S]*?\$\{pastel\} 11px/.test(
      myPlan,
    ),
    "バーの蛍光は始点 7px ぶんだけ（px 指定なので長さに影響しない）",
  );
  assert(
    !/barWithNeonStart\([^)]*%\)/.test(code),
    "バーの蛍光アクセントに % を使っていない（長さを変えない）",
  );
  assert(
    (code.match(/backgroundImage: barWithNeonStart\(/g) ?? []).length === 2,
    "始点アクセントを付けたのは DESTINATIONS と ACCOMMODATION のバーだけ",
  );
  // 位置・長さの計算式は従来のまま
  assert(code.includes("left: `${it.leftPercent}%`") && code.includes("width: `${it.widthPercent}%`"), "都市バーの開始位置・長さの指定は不変");
  assert(
    code.includes("width: `${barWidthPercent(a.durationMonths, totalMonths)}%`") &&
      code.includes("const left = barLeftPercent(a.startMonth, totalMonths)"),
    "滞在先バーの開始位置・長さの計算は不変",
  );
  assert(
    code.includes("gridColumn: `${start} / span ${span}`"),
    "活動カードの月スケール配置（grid）は不変",
  );
  assert(code.includes("packActivityLanes(timedPhases)") && code.includes("packDestinationLanes("), "lane packing は不変");

  // 3) ベタ塗りにしない（パステルの地色は残っている）
  assert(code.includes("backgroundColor: pal.node") && code.includes("backgroundColor: ACCOMMODATION_BAR_COLOR"), "バーの地色は既存のパステルのまま");
  // 蛍光色で「塗る」のは 4px の点だけ（バーやカードの面には使わない）
  const neonFills = code
    .split("\n")
    .map((line, i) => [i, line] as const)
    .filter(([, line]) => /backgroundColor: LANE_NEON\./.test(line));
  assert(neonFills.length === 1, "蛍光色を背景に直接指定しているのは 1 か所だけ");
  assert(
    neonFills.every(([i]) => /h-1 w-1 shrink-0 rounded-full/.test(code.split("\n")[i - 1] ?? "")),
    "その 1 か所は期間ラベルの 4px の点（バー・カードの面は塗っていない）",
  );

  // 4) ACTIVITIES カード: 上端のラインと期間ラベルの点だけ
  assert(
    /linear-gradient\(90deg, \$\{color\} 0%, \$\{color\} 55%, \$\{LANE_NEON\.activities\} 100%\)/.test(myPlan),
    "活動カードの上端だけ、既存の色から蛍光イエローへ抜ける",
  );
  assert(code.includes('className="relative w-full min-w-[100px] overflow-hidden rounded-[11px] border border-[var(--mk-border)] bg-white'), "活動カードは白背景・既存の枠と角丸のまま");
  assert(
    myPlan.includes('saved: { label: "保存済み"') &&
      myPlan.includes('"ai-suggested": { label: "AI提案"') &&
      myPlan.includes('considering: { label: "検討中"'),
    "状態表示のラベルと意味は不変",
  );
  assert(code.includes('color: "var(--mk-body)"') , "期間ラベルの文字は濃いグレーのまま");

  // 5) 軸線: 始点（到着）だけアクセント。架空の現在地・進捗は出さない
  assert(code.includes('absolute inset-x-0 bottom-1 h-px bg-[var(--mk-border)]'), "軸線そのものは従来どおり薄いグレー");
  assert(
    /width: "9%",[\s\S]{0,160}linear-gradient\(90deg, var\(--neon-lime\) 0%/.test(myPlan),
    "軸の始点だけ短い蛍光ライン",
  );
  assert(
    code.includes('className="absolute h-[7px] w-[7px] rounded-full bg-[var(--neon-lime)] ring-2 ring-[var(--mk-card)]"'),
    "到着の位置に小さな蛍光ドット",
  );
  for (const fake of ["現在地", "いまここ", "今ここ", "進捗率", "達成率"]) {
    assert(!code.includes(fake), `架空の現在地・進捗（${fake}）を追加していない`);
  }

  // 6) 見出しまわり: 短いライン 1 本と、実データの期間表示だけ
  assert(
    /className="block h-\[3px\] w-7 rounded-full"[\s\S]{0,200}var\(--neon-lime\) 0%, var\(--neon-yellow\) 100%/.test(
      myPlan,
    ),
    "セクション見出しの上に短いグラデーションラインが 1 本",
  );
  assert(
    /bg-\[var\(--neon-lime-soft\)\][\s\S]{0,260}\{durationLabel\}/.test(myPlan),
    "期間表示は淡いライムの小さな面で、中身は実データ（durationLabel）のまま",
  );
  assert(code.includes("mk-section-title"), "見出しの文字サイズ・太さは共通クラスのまま");
}

console.log("Test 9: My Plan の PLAN OUTLINE は、いま見ているセクションが分かる");
{
  const code = stripComments(outline);

  // 遷移先・項目・番号は従来のまま（新しい route も API も作らない）
  assert(code.includes('href={`#myplan-${s.id}`}'), "アンカーの遷移先は従来どおり");
  assert(
    myPlan.includes("MY_PLAN_SECTIONS.map((s) => ({ id: s.id, enName: s.enName }))"),
    "項目は既存の MY_PLAN_SECTIONS をそのまま渡している",
  );
  assert(code.includes('String(i + 1).padStart(2, "0")'), "番号の出し方は従来どおり");
  assert(!/fetch\(|useRouter|localStorage/.test(code), "新しい通信・保存・遷移処理を持たない");
  assert(
    !myPlan.includes('<p className="mk-eyebrow px-1">PLAN OUTLINE</p>'),
    "旧実装（サーバー側の静的な一覧）は残っていない",
  );

  // 通常 / hover / 選択中
  assert(code.includes("hover:bg-[var(--mk-block)]"), "hover はごく淡いグレーの背景");
  assert(code.includes("transition-colors duration-150"), "自然な transition が付いている");
  assert(
    code.includes('"bg-[var(--neon-lime-soft)] font-semibold text-[var(--mk-ink)]"'),
    "選択中は淡いライムの背景・semibold・黒文字",
  );
  assert(
    code.includes('className="absolute bottom-1 left-0 top-1 w-[3px] rounded-full bg-[var(--neon-lime)]"'),
    "選択中は左端に 3px の蛍光ライムのライン",
  );
  assert(code.includes("rounded-[10px]"), "角丸は共通の見た目に揃っている");
  assert(
    !/bg-\[var\(--neon-lime\)\][^"]*px-2 py-2/.test(code),
    "行全体を蛍光ライムで塗りつぶしていない",
  );
  // キーボード操作
  assert(
    code.includes("focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neon-lime)]"),
    "キーボード操作時の focus 表示がある",
  );
  assert(code.includes('aria-current={active ? "true" : undefined}'), "選択状態を支援技術にも伝える");

  // スクロール追従（ちらつき・端のケース）
  assert(code.includes('"use client"') || outline.includes('"use client"'), "client component として動く");
  assert(
    code.includes('window.addEventListener("scroll", schedule, { passive: true })'),
    "スクロール監視は passive（既存のスクロールを邪魔しない）",
  );
  assert(code.includes("requestAnimationFrame(recompute)"), "計算は 1 フレームに 1 回だけ");
  assert(
    code.includes('window.removeEventListener("scroll", schedule)') &&
      code.includes('window.removeEventListener("resize", schedule)'),
    "リスナーを後片付けしている",
  );
  assert(code.includes('window.addEventListener("resize", schedule)'), "画面サイズ変更でも選び直す");
  assert(
    code.includes("lockedUntilRef.current = Date.now() + CLICK_LOCK_MS"),
    "クリック直後は選択を固定してちらつきを防ぐ",
  );
  assert(code.includes("const atBottom =") && code.includes("sections[sections.length - 1]"), "最下部では最後のセクションを選ぶ");
  assert(code.includes("useState<string>(sections[0]?.id ?? \"\")"), "初期表示は先頭のセクション");
  assert(!code.includes("IntersectionObserver"), "既存のスクロール処理と競合しうる observer は使っていない");
  assert(!code.includes("scrollIntoView") && !code.includes("window.scrollTo"), "スクロール位置そのものは操作していない（アンカーの既定動作のまま）");
}

console.log("");
console.log(`passed: ${pass} / failed: ${fail}`);
if (fail > 0) process.exit(1);
