/**
 * Plan Chat（/plans/[planId]/chat）のデザイン統一のテスト。
 *
 *   npx tsx scripts/test-plan-chat-ui.ts
 *
 * 見たいこと（見た目の約束ごとだけ。会話ロジックは別テストの担当）:
 *   - My Karte と同じトークン / 共通クラスを使っている（色と px を各所で決め直していない）
 *   - 蛍光ライムは「主操作」にだけ使い、AI / ユーザーの発言を塗りつぶしていない
 *   - 本文が読みやすい大きさ・濃さで出る（項目名・補足情報が薄すぎない）
 *   - 匿名チャット（/widget）の見た目を変えていない
 *   - Markdown ライブラリを足していない（この画面は素のテキスト表示のまま）
 *   - 送信まわりの既存の挙動（Enter 送信・二重送信防止・無効化）を壊していない
 *   - 出典パネルの仕様（assistant のみ・初期は閉じている・リンクの安全属性）を弱めていない
 * ソースコードを読んで確認する静的テスト（ブラウザは起動しない）。
 */

import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    pass++;
  } else {
    fail++;
    console.log(`  FAIL ${message}`);
  }
}

const chat = readFileSync("components/Chat.tsx", "utf8");
const chatPage = readFileSync("app/plans/[planId]/chat/page.tsx", "utf8");
const planMessage = readFileSync("components/PlanChatMessage.tsx", "utf8");
const startScreen = readFileSync("components/ChatStartScreen.tsx", "utf8");
const insightNote = readFileSync("components/PlanChatInsightNote.tsx", "utf8");
const sourceDisclosure = readFileSync("components/chat/SourceDisclosure.tsx", "utf8");
const karteSummary = readFileSync("components/KarteSummary.tsx", "utf8");
const message = readFileSync("components/Message.tsx", "utf8");
const globalsCss = readFileSync("app/globals.css", "utf8");
const pkg = readFileSync("package.json", "utf8");

/** コメント（docblock・行コメント）を外す。「〜していない」の確認を説明文に引っかけないため。 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const chatCode = stripComments(chat);
const planMessageCode = stripComments(planMessage);

console.log("Test 1: Plan Chat の地は白（読む画面）。境界は border とラインで示す");
{
  assert(chatPage.includes("bg-white"), "ページの地は白");
  assert(
    !chatPage.includes("bg-[var(--mk-canvas)]"),
    "My Karte の canvas はチャットには敷かない（本文の明度差をなくす）",
  );
  assert(
    !chatPage.includes("bg-worksheet-surface"),
    "アプリ全体の背景トークンを地には使っていない",
  );
  assert(
    chatCode.includes('? "relative flex h-full min-h-0 flex-col bg-white"'),
    "Chat 本体も Plan Chat のときだけ白を敷く（/widget の分岐は従来のまま）",
  );
  assert(
    !/bg-\[var\(--mk-canvas\)\]/.test(chatCode),
    "チャット側に canvas の面が残っていない",
  );
  assert(
    globalsCss.includes("--mk-canvas: #f4f5f3"),
    "My Karte の canvas トークン自体は変えていない",
  );
  assert(
    chatCode.includes("bg-white/95 pt-2.5 backdrop-blur-sm"),
    "入力欄の帯も白（会話と地続きに見せる）",
  );
  // AI の回答はカードを持たない（白地に本文を直接置く）
  assert(
    !/border|shadow|rounded/.test(planMessageCode.split("return (")[2] ?? ""),
    "AI の回答は枠・影・角丸を持たない（カードレス）",
  );
  assert(
    planMessageCode.includes("bg-[var(--mk-pale-sage)]"),
    "ユーザーの発言は淡いセージで、白地の上でも区別できる",
  );
  assert(
    !chatCode.includes("radial-gradient(rgba(120,100,60,0.025) 1px, transparent 1px)"),
    "紙のドット地は廃止した（canvas + 白いパネルの構成へ）",
  );
  // ヘッダー・入力欄・パネルの色はすべてトークン経由
  for (const [name, src] of [
    ["Chat", chatCode],
    ["PlanChatMessage", planMessageCode],
    ["ChatStartScreen", stripComments(startScreen)],
    ["PlanChatInsightNote", stripComments(insightNote)],
  ] as [string, string][]) {
    assert(
      !/#(e7dfce|fdfcf8|f1f5ec|dde7d2|fffdf9|ef8069|e2694f|efccc0)/i.test(src),
      `${name} に以前の生成り / ピーチ / セージの hex が残っていない`,
    );
  }
}

console.log("Test 2: 文字は My Karte の共通クラスに揃えている");
{
  assert(planMessage.includes('className="mk-text'), "会話本文は .mk-text（15〜16px / 行間 1.7）");
  assert(
    (planMessageCode.match(/mk-text/g) ?? []).length === 1,
    "本文のクラス指定は 1 か所だけ（user と assistant で必ず同じ）",
  );
  assert(
    globalsCss.includes("--mk-body: #262626"),
    "本文の色は共通トークン（#262626）",
  );
  assert(chat.includes('className="mk-card-title truncate"'), "ヘッダーのタイトルは .mk-card-title");
  assert(chat.includes('className="mk-sub-text truncate"'), "Plan 名は補足情報のクラス");
  assert(startScreen.includes("mk-page-title"), "初期画面の見出しはページタイトルのクラス");
  assert(insightNote.includes("mk-card-title"), "サマリーカードの見出しも共通クラス");
  assert(insightNote.includes("mk-item-label-sm"), "サマリーの項目名は My Karte の項目名と同じ扱い");
  assert(karteSummary.includes("mk-item-label-sm"), "確認カードの項目名も共通クラス");
  // 補足情報が薄すぎる色のまま残っていない
  for (const [name, src] of [
    ["Chat", chatCode],
    ["PlanChatInsightNote", stripComments(insightNote)],
  ] as [string, string][]) {
    assert(!/text-\[#a7a08f\]|text-\[#8a857d\]/.test(src), `${name} に薄すぎる補足文字色が残っていない`);
  }
}

console.log("Test 3: 蛍光ライムは主操作だけ（発言そのものは塗らない）");
{
  // 送信ボタン: 送れるときだけ蛍光。空・生成中は淡いグレー。
  assert(chat.includes("const canSend = !isSending && input.trim().length > 0"), "送信可否で見た目を出し分けている");
  assert(
    /canSend[\s\S]{0,160}bg-\[var\(--neon-lime\)\][\s\S]{0,120}bg-\[var\(--mk-block\)\]/.test(chat),
    "送信できるときだけ蛍光、できないときは淡いグレー",
  );
  assert(
    chat.includes("text-[var(--neon-ink)]"),
    "蛍光の面に載せる文字・アイコンは near-black",
  );
  assert(
    chat.includes("PendingDotsIcon") && chat.includes('aria-label={isSending ? "送信中" : "送信"}'),
    "生成中は色だけでなくアイコンと aria-label でも分かる",
  );
  // メッセージ本体を蛍光で塗っていない
  assert(
    !/bg-\[var\(--neon-lime\)\]/.test(planMessageCode),
    "AI・ユーザーの発言を蛍光で塗っていない",
  );
  assert(
    planMessage.includes("bg-[var(--mk-pale-sage)]"),
    "ユーザーの発言は淡いセージの面",
  );
  assert(
    !planMessageCode.includes("bg-[var(--mk-card)]"),
    "AI の回答に面（カード）を持たせていない",
  );
  assert(
    planMessage.includes("ring-[var(--neon-lime-soft)]"),
    "AI avatar は既存のブランド画像のまま、淡いライムのリングでアクセントを付ける",
  );
  // 蛍光のベタ塗りが広い面に出ていないこと（カード大の角丸 + 蛍光の組み合わせを禁止）
  for (const [name, src] of [
    ["Chat", chatCode],
    ["PlanChatMessage", planMessageCode],
    ["ChatStartScreen", stripComments(startScreen)],
  ] as [string, string][]) {
    assert(
      !/rounded-\[(18|20|22)px\][^"`]*bg-\[var\(--neon-lime\)\]/.test(src),
      `${name} はカード大の面を蛍光で塗っていない`,
    );
  }
}

console.log("Test 4: /widget（匿名チャット）の見た目を変えていない");
{
  // Chat.tsx の非 Plan 分岐は従来のクラスのまま
  assert(
    chat.includes('className="flex items-end gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800"'),
    "/widget の入力欄は従来のまま",
  );
  assert(
    chat.includes("bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"),
    "/widget の送信ボタンは従来のまま",
  );
  assert(
    chat.includes('variant={isPlanChat ? "plan" : "default"}'),
    "確認カードは Plan Chat のときだけ新しい見た目にする",
  );
  assert(
    karteSummary.includes("border-blue-200 bg-blue-50") && karteSummary.includes('variant = "default"'),
    "確認カードの既定（/widget）は従来の青いカードのまま",
  );
  assert(
    sourceDisclosure.includes('variant = "default"') && sourceDisclosure.includes("text-slate-500 hover:bg-slate-100"),
    "出典パネルの既定（/widget）は従来の色のまま",
  );
  assert(
    message.includes("bg-blue-600 text-white") && message.includes("bg-zinc-100 text-zinc-900"),
    "/widget のメッセージ（Message.tsx の bubble）は従来のまま",
  );
  assert(
    !/mk-(text|card|card-title|item-label)/.test(message),
    "Message.tsx（/widget 共用）には My Karte のクラスを持ち込んでいない",
  );
}

console.log("Test 5: Markdown 表示の仕様を変えていない");
{
  assert(
    !/react-markdown|remark|rehype|marked|markdown-it/.test(pkg),
    "Markdown ライブラリを新しく足していない（この画面は素のテキスト表示のまま）",
  );
  assert(
    planMessage.includes("stripMarkdownBold") && planMessage.includes("splitParagraphs"),
    "既存のテキスト整形（** の除去 + 空行での段落分け）を残している",
  );
  assert(
    planMessage.includes("whitespace-pre-wrap") && planMessage.includes("break-words"),
    "箇条書きや改行をそのまま見せ、長い単語でも横に溢れさせない",
  );
  assert(
    message.includes("stripMarkdownBold"),
    "/widget 側の整形も従来どおり",
  );
}

console.log("Test 6: 送信まわりの既存の挙動を壊していない");
{
  assert(
    chat.includes('if (e.key === "Enter" && !e.shiftKey)') && chat.includes("submitText(input)"),
    "Enter 送信・Shift+Enter 改行の判定は従来のまま",
  );
  assert(
    chat.includes("disabled={isSending || !input.trim()}"),
    "送信中・空のときは送信ボタンを無効にする（二重送信防止）",
  );
  assert(
    chat.includes("onChange={(e) => setInput(e.target.value)}"),
    "入力の state 更新は従来のまま",
  );
  assert(
    chat.includes('style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}'),
    "モバイルで入力欄がホームバーに隠れないよう safe-area を足している",
  );
  assert(
    chat.includes('aria-label="メッセージを入力"'),
    "入力欄のラベルを残している",
  );
}

console.log("Test 7: 出典パネルの仕様を弱めていない");
{
  assert(
    chat.includes('m.role === "assistant" && m.sources && m.sources.length > 0'),
    "出典は assistant の回答にだけ出す",
  );
  assert(
    sourceDisclosure.includes("<details") && !/<details[^>]*\bopen\b/.test(sourceDisclosure),
    "初期状態は閉じている",
  );
  assert(
    sourceDisclosure.includes('rel="noopener noreferrer"') && sourceDisclosure.includes('target="_blank"'),
    "外部リンクの安全属性を残している",
  );
  assert(
    sourceDisclosure.includes("text-[13px]"),
    "出典の文字サイズを小さくしていない（13px のまま）",
  );
  assert(
    sourceDisclosure.includes("内容は変わることがあります。申請や契約の前に各公式ページで確認してください。"),
    "確認を促す注意書きを残している",
  );
  assert(
    sourceDisclosure.includes("参考情報 {sources.length}件"),
    "開閉の見出しと件数表示を残している",
  );
  assert(
    chat.includes('<SourceDisclosure sources={m.sources} variant="plan"'),
    "Plan Chat では色だけを差し替えた variant を使う",
  );
}

console.log("Test 8: 会話の読みやすさ（幅・余白・状態）");
{
  assert(
    chat.includes("max-w-[860px]") && chat.includes("max-w-[1240px]"),
    "本文は 860px、外枠は 1240px（会話が窮屈に見えないように広げた）",
  );
  assert(
    (chat.match(/max-w-\[860px\]/g) ?? []).length === 4,
    "会話・下部の枠・SP のサイド情報・初期画面の入力欄で同じ幅を使う",
  );
  assert(
    (chat.match(/max-w-6xl/g) ?? []).length === 0,
    "旧い外枠（max-w-6xl）が残っていない",
  );
  assert(
    planMessage.includes("max-w-[85%]"),
    "ユーザーの発言は画面いっぱいに広げない",
  );
  assert(
    chat.includes("showStartScreen") && startScreen.includes("今日は、何から整理する？"),
    "初期状態の画面を残している",
  );
  assert(
    chat.includes("hasPlanChatInsights(karte)"),
    "「いま分かっていること」の出し分けは従来のまま",
  );
  assert(
    insightNote.includes("statedInsights") && insightNote.includes("items.length < 2"),
    "要点が 2 件未満ならパネルを出さない仕様は従来のまま",
  );
}

console.log("Test 9: 蛍光は「面」ではなく「ライン・縁・小さな光」として使う");
{
  const proposalMessage = readFileSync("components/proposal/ProposalMessage.tsx", "utf8");
  const files: [string, string][] = [
    ["Chat", chatCode],
    ["PlanChatMessage", planMessageCode],
    ["ChatStartScreen", stripComments(startScreen)],
    ["PlanChatInsightNote", stripComments(insightNote)],
    ["KarteSummary", stripComments(karteSummary)],
    ["SourceDisclosure", stripComments(sourceDisclosure)],
    ["ProposalMessage", stripComments(proposalMessage)],
  ];

  // 1) 蛍光で「塗る」のは**次の行動を渡す 2 つのボタン（送信 / 学校提案）だけ**。
  //    ほかは線（3px 以下）か小さな点としてしか使わない（本文・長文の背景には使わない）。
  const SMALL = /h-\[[123]px\]|w-\[3px\]|h-1\.5 w-1\.5/;
  const SEND_BUTTON = /\? "bg-\[var\(--neon-lime\)\] text-\[var\(--neon-ink\)\]/;
  const PROPOSAL_BUTTON = /bg-\[var\(--neon-lime\)\] text-\[var\(--neon-ink\)\] hover:bg-white/;
  const fills: string[] = [];
  for (const [name, src] of files) {
    for (const line of src.split("\n")) {
      if (!/bg-\[var\(--neon-(lime|yellow|blue)\)\]/.test(line)) continue;
      if (SMALL.test(line) || SEND_BUTTON.test(line) || PROPOSAL_BUTTON.test(line)) continue;
      fills.push(`${name}: ${line.trim().slice(0, 60)}`);
    }
  }
  assert(
    fills.length === 0,
    `蛍光の面は送信ボタンと学校提案ボタンだけ（線・点以外の塗りが残っていない）: ${fills.join(" / ")}`,
  );
  assert(
    SEND_BUTTON.test(chatCode),
    "送信ボタンは蛍光ライムの面のまま（画面の主操作）",
  );
  assert(
    PROPOSAL_BUTTON.test(chatCode),
    "学校提案ボタンも蛍光ライムの面で塗る（面塗りが許容されるのはこの 2 つだけ）",
  );

  // 2) ライン系アクセントが入っている
  assert(
    /absolute inset-x-0 bottom-0 h-\[2px\][\s\S]{0,260}linear-gradient\(90deg, var\(--neon-lime\)/.test(chat),
    "ヘッダーの下端に蛍光ライムのラインが入っている",
  );
  assert(
    chat.includes('className="h-6 w-[3px] shrink-0 rounded-full bg-[var(--neon-lime)]"'),
    "ヘッダーの見出し横に細いアクセントバーがある",
  );
  assert(
    !planMessage.includes("border-l-[3px]"),
    "長文の回答全体に沿って蛍光ラインを伸ばさない（カードレスにしたので縦線も外した）",
  );
  assert(
    planMessage.includes("ring-[var(--neon-lime-soft)]"),
    "AI 側の蛍光は avatar のリングだけに残す",
  );
  assert(
    !planMessageCode.includes("bg-[var(--neon-lime)]"),
    "AI の回答・ユーザーの発言に蛍光の面を使っていない",
  );
  assert(
    /top-0 h-\[2px\][\s\S]{0,240}var\(--neon-blue\)/.test(insightNote),
    "「いま分かっていること」の上端はシアンのライン",
  );
  assert(
    /top-0 h-\[2px\][\s\S]{0,240}var\(--neon-lime\)/.test(karteSummary),
    "確認カードの上端はライムのライン",
  );
  assert(
    sourceDisclosure.includes("border-l-2 border-[var(--neon-blue)]"),
    "参考情報の一覧は左端のシアンの線で示す",
  );
  assert(
    /h-\[3px\] w-5 shrink-0 rounded-full bg-\[var\(--neon-(lime|blue)\)\]/.test(proposalMessage),
    "提案の見出しの前に細いラインが入る",
  );
  assert(
    /h-\[3px\] w-10 rounded-full[\s\S]{0,200}var\(--neon-yellow\)/.test(startScreen),
    "初期画面の見出し上はライム→イエローの細いライン",
  );

  // 3) hover / focus は面ではなく縁
  assert(
    !/hover:bg-\[var\(--neon-lime-soft\)\]/.test(stripComments(startScreen)),
    "初期画面のチップは hover で面を塗らない（縁だけ変える）",
  );
  assert(
    chatCode.includes("hover:border-[var(--neon-lime)]"),
    "サジェストチップ・再送信は hover で縁が光る",
  );
  assert(
    chat.includes("focus-within:ring-[var(--neon-lime)]"),
    "入力欄の focus は蛍光のリング（線）",
  );

  // 4) 色数を増やしていない（新しい蛍光 hex を直書きしていない）
  for (const [name, src] of files) {
    assert(
      !/#(d8fb57|effdc0|fdf25a|6fdcf7)/i.test(src.replace(/rgba\(216,251,87/g, "")),
      `${name} は蛍光色の hex をベタ書きしていない（トークン経由で使う）`,
    );
  }
  assert(
    !/--neon-orange|#ff[0-9a-f]{4}/i.test(files.map(([, src]) => src).join("")),
    "新しい蛍光トークンを増やしていない（既存の lime / yellow / blue だけ）",
  );
}

console.log("Test 10: 「学校を提案してもらう」は会話カラムに揃えた専用の行に置く");
{
  assert(
    chat.includes("function planBottomShell("),
    "画面下部を会話カラムと同じ骨格に揃える枠がある",
  );
  assert(
    chat.includes("const showInsightAside = isPlanChat && hasPlanChatInsights(karte)") &&
      /showInsightAside && <div aria-hidden className="hidden w-\[264px\] shrink-0 lg:block"/.test(chat),
    "右カラムを出しているときは、下部にも同じ幅の余白を取って境目に寄らないようにする",
  );
  assert(
    !/max-w-\[760px\] justify-end/.test(chat),
    "提案ボタンを画面の右端に貼り付ける配置はやめた",
  );
  assert(
    chat.includes("const proposalButton = (") &&
      (chat.match(/学校を提案してもらう\n/g) ?? []).length === 2,
    "提案ボタンの定義は 1 つ（Plan 用）＋ /widget 用の 1 つだけ（PC と SP で二重定義しない）",
  );
  assert(
    !/aria-hidden\s+className="h-px flex-1"/.test(chat),
    "ボタンの左に伸びる長いグラデーションのラインは廃止した",
  );
  // 配色: 通常は蛍光ライムの面＋同色の縁＋黒文字、hover で面だけが白に抜ける
  assert(
    chat.includes(
      '"border-[var(--neon-lime)] bg-[var(--neon-lime)] text-[var(--neon-ink)] hover:bg-white"',
    ),
    "通常時は蛍光ライムの背景・同色の縁・黒文字で、hover で背景だけが白になる",
  );
  assert(
    /const proposalButtonColor = isSending\n\s+\? "border-\[var\(--mk-border\)\] bg-\[var\(--mk-block\)\] text-\[#b4b7b1\]"/.test(
      chat,
    ),
    "押せないとき（送信中）は蛍光色を使わない",
  );
  assert(
    /transition-colors duration-200[\s\S]{0,200}\$\{proposalButtonColor\}/.test(chat),
    "背景色の切り替えに 150〜200ms の transition を使っている",
  );
  assert(
    chat.includes('className="h-1.5 w-1.5 rounded-full bg-[var(--neon-ink)] group-disabled:bg-[#d7d9d4]"'),
    "小さな点は黒にして、ライム地でも白地でも読める",
  );
  // 入力欄・確認カード・エラーも同じ枠に載せて、下部の横位置が揃っている
  assert(
    (chat.match(/planBottomShell\(/g) ?? []).length === 4,
    "確認カード・エラー・入力欄・定義の 4 か所で同じ枠を使う（提案用の行は廃止）",
  );
}

console.log("Test 11: 「学校を提案してもらう」は PC では会話の右上、SP では入力欄の上");
{
  assert(
    chat.includes("const showProposalAction = !showSummary && Boolean(karte.schoolPrefs.preferredCity.value)"),
    "出す条件（確認カード非表示 & 希望の都市あり）は従来のまま",
  );
  // 専用の行を作らず、クイックアクションと同じ行の右端に置く
  assert(
    !/sticky top-0 z-10 hidden bg-white lg:block/.test(chat),
    "会話領域上部の sticky な専用行は廃止した",
  );
  assert(
    /<div className="mb-2 flex flex-wrap items-center gap-2">[\s\S]{0,1200}\{showProposalAction && <div className="ml-auto">\{proposalButton\}<\/div>\}/.test(chat),
    "クイックアクションと同じ行の右端に置いている",
  );
  assert(
    (chat.match(/\{proposalButton\}/g) ?? []).length === 1,
    "提案ボタンの出し場所は 1 か所だけ（PC / SP で出し分けない）",
  );
  assert(
    chat.includes("PLAN_CHAT_SUGGESTIONS.map((label) => (") &&
      chat.indexOf("PLAN_CHAT_SUGGESTIONS.map") < chat.indexOf("{showProposalAction && <div className=\"ml-auto\">"),
    "左にクイックアクション、右に学校提案という並び",
  );
  assert(
    chat.includes("flex-wrap"),
    "狭い画面では自然に折り返す",
  );
  assert(
    !/max-w-\[760px\]/.test(chat),
    "旧い本文幅（760px）は残っていない",
  );
}

console.log("Test 12: 縦方向は「ヘッダー / 会話 / 入力欄」の 3 層で、会話が残りを使い切る");
{
  // 高さの連鎖（viewport → ページ → Chat → スクロール領域）が途切れていない
  assert(
    chatPage.includes("flex h-dvh min-h-0 flex-1 flex-col"),
    "ページは viewport の高さを使い、min-h-0 で子に高さを渡す",
  );
  assert(
    (chatPage.match(/h-dvh|h-screen|100vh/g) ?? []).length === 1,
    "画面高さの指定は 1 か所だけ（二重指定で画面からはみ出さない）",
  );
  assert(
    chatCode.includes('? "relative flex h-full min-h-0 flex-col bg-white"'),
    "Chat 本体も h-full + min-h-0 の flex-col",
  );
  assert(
    /<header className="sticky top-0 z-20 shrink-0/.test(chat),
    "ヘッダーは shrink-0（縮まない）",
  );
  assert(
    chatCode.includes('? "min-h-0 flex-1 overflow-y-auto"'),
    "会話領域は flex-1 + min-h-0 + overflow-y-auto で残りの高さを全部使う",
  );
  assert(
    /className="shrink-0 border-t border-\[var\(--mk-border\)\] bg-white\/95/.test(chat),
    "入力欄の帯は shrink-0",
  );
  assert(
    (chatCode.match(/overflow-y-auto/g) ?? []).length === 3,
    "縦スクロールするのは会話領域（Plan / widget）と右カラムだけ（ページ全体との二重スクロールを作らない）",
  );

  // ヘッダーと下部をコンパクトにした
  assert(
    /px-3 py-2 sm:gap-3 sm:px-6"/.test(chat),
    "ヘッダーの上下 padding を詰めた（56〜64px を狙う）",
  );
  assert(
    chat.includes("sm:h-10 sm:w-10") && chat.includes("h-10 w-10 shrink-0 overflow-hidden"),
    "ヘッダーの都市サムネイルを 40px に",
  );
  assert(
    chat.includes("style={{ minHeight: 60 }}"),
    "入力カプセルの通常時の高さは 60px（56〜72px の範囲）",
  );
  assert(
    chat.includes("max-h-40") && chat.includes("min-h-[40px]"),
    "複数行の入力では自然に伸びる（上限 max-h-40 は従来どおり）",
  );
  assert(
    chat.includes('text-[16px] leading-[1.7] text-[var(--mk-body)]'),
    "入力文字は 16px のまま（小さくしない）",
  );
  assert(
    chat.includes("h-11 w-11 shrink-0 items-center justify-center rounded-full"),
    "送信ボタンは 44px を確保（操作性を落とさない）",
  );
  assert(
    chat.includes('className="mk-sub-text mt-1.5 flex items-center justify-center gap-1.5"'),
    "補足メッセージの上の余白を詰めた",
  );

  // 開発用 UI が会話の高さを奪っていない
  assert(
    /isDev &&\s*\(isPlanChat \? \(\s*<div className="pointer-events-none absolute right-2 top-\[60px\] z-40/.test(chat),
    "dev: karte は通常フローから外して浮かせる（会話の高さを奪わない）",
  );
  assert(
    chat.includes('<KarteDebugPanel karte={karte} variant="corner" />') &&
      chat.includes('<KarteDebugPanel karte={karte} variant="inline" />'),
    "開発用パネル自体は削除していない（/widget 側も従来どおり）",
  );
  assert(
    chat.includes("const isDev = process.env.NODE_ENV !== \"production\"") ||
      /isDev =/.test(chat),
    "本番で出さない条件は従来のまま",
  );

  // 右カラムは会話を圧迫しない
  assert(
    chat.includes('className="sticky top-3 max-h-[70vh] overflow-y-auto pr-0.5"'),
    "右カラムは長くなってもその中だけスクロールする",
  );

  // 自動スクロール・履歴まわりは従来どおり
  assert(
    chat.includes("bottomRef.current?.scrollIntoView({ behavior: \"smooth\" })"),
    "最新メッセージへの自動スクロールは従来のまま",
  );
  assert(chat.includes("<div ref={bottomRef} />"), "スクロール位置の目印を残している");
}

console.log("");
console.log(`passed: ${pass} / failed: ${fail}`);
if (fail > 0) process.exit(1);
