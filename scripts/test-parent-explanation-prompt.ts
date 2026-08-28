/**
 * lib/parentExplanationPrompt.ts の動作確認用スクリプト（Step 3で作成、実生成結果の
 * 2回のレビューを踏まえたprompt改善でCase 6〜16、Case 17〜29を追加）。
 * 新しいtest frameworkは導入せず、既にdevDependencyにあるtsxで直接実行するだけ。
 * Anthropic SDKは一切importしない・呼ばない。
 *
 * 実行方法: npx tsx scripts/test-parent-explanation-prompt.ts
 */

import { createEmptyKarte, type Karte } from "@/lib/karte";
import { buildDocumentsKarteView } from "@/lib/documentsKarteView";
import {
  buildParentExplanationSystemPrompt,
  canGenerateParentExplanation,
  PARENT_EXPLANATION_DEFAULT_TITLE,
  PARENT_EXPLANATION_USER_MESSAGE,
} from "@/lib/parentExplanationPrompt";

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

console.log("Case 1: stated motivation + stated timing/budget + decisionLeaning=going + inferred trueGoalHypothesis");
console.log("  → stated/inferredが明確に別区画になる");
{
  const karte = freshKarte();
  karte.motivation.statedGoal = { value: "海外で自分の英語力を試したい", certainty: "stated", source: "chat" };
  karte.motivation.trueGoalHypothesis = {
    value: "今の環境から一度離れて自信を取り戻したいのかもしれない",
    certainty: "inferred",
    source: "chat",
  };
  karte.timing.durationWeeks = { value: 24, certainty: "stated", source: "worksheet" };
  karte.budget.totalCap = { value: 1500000, certainty: "stated", source: "chat" };
  karte.decision.leaning = { value: "going", certainty: "stated", source: "chat" };

  const view = buildDocumentsKarteView(karte);
  assert(view.hasEnoughContext, "前提: hasEnoughContext = true");

  const prompt = buildParentExplanationSystemPrompt(view);
  const statedIdx = prompt.indexOf("## 本人が明示した情報");
  const inferredIdx = prompt.indexOf("## 会話から見えてきた可能性");
  assert(statedIdx !== -1, "「本人が明示した情報」区画が存在する");
  assert(inferredIdx !== -1, "「会話から見えてきた可能性」区画が存在する");
  assert(statedIdx < inferredIdx, "stated区画がinferred区画より前にある");

  const statedSection = prompt.slice(statedIdx, inferredIdx);
  const inferredSection = prompt.slice(inferredIdx);
  assert(statedSection.includes("留学を考えている理由: 海外で自分の英語力を試したい"), "statedのmotivationがstated区画内にある");
  assert(statedSection.includes("期間: 24"), "statedのtimingがstated区画内にある");
  assert(!statedSection.includes("今の環境から一度離れて"), "inferredの値がstated区画に混入していない");
  assert(
    inferredSection.includes("今の環境から一度離れて自信を取り戻したいのかもしれない"),
    "trueGoalHypothesisの値がinferred区画内にある",
  );

  console.log("\n  --- 生成されたsystem prompt（Case 1） ---\n");
  console.log(prompt);
  console.log(`\n  --- user message ---\n  ${PARENT_EXPLANATION_USER_MESSAGE}`);
  console.log(`\n  --- default title ---\n  ${PARENT_EXPLANATION_DEFAULT_TITLE}\n`);
}

console.log("Case 2: decisionLeaning = not_going → 留学推奨方向への誘導指示が入っていない");
{
  const karte = freshKarte();
  karte.motivation.statedGoal = { value: "自分の可能性を試したい", certainty: "stated", source: "chat" };
  karte.timing.departureTiming = { value: "来年の春頃", certainty: "stated", source: "worksheet" };
  karte.decision.leaning = { value: "not_going", certainty: "stated", source: "chat" };

  const view = buildDocumentsKarteView(karte);
  const prompt = buildParentExplanationSystemPrompt(view);

  assert(
    prompt.includes("対等で尊重されるべき意思決定") && prompt.includes("留学を勧める方向へ文章を修正"),
    "not_goingを尊重する指示が入っている",
  );
  assert(
    !prompt.includes("本人は現時点で、留学・ワーキングホリデーに前向きな気持ちを明示している"),
    "goingの指示文は含まれない（3値が排他的に切り替わる）",
  );
}

console.log("Case 3: excludedConflictあり → conflict値自体を本文生成材料として渡さない");
{
  const karte = freshKarte();
  karte.motivation.statedGoal = { value: "視野を広げたい", certainty: "stated", source: "chat" };
  karte.timing.durationWeeks = { value: 12, certainty: "stated", source: "worksheet" };
  karte.schoolPrefs.preferredCity = { value: "シドニー", certainty: "stated", source: "chat" };
  karte.handoff.conflicts = [
    {
      block: "schoolPrefs",
      key: "preferredCity",
      existingValue: "オークランド",
      existingSource: "worksheet",
      incomingValue: "シドニー",
      incomingSource: "chat",
    },
  ];

  const view = buildDocumentsKarteView(karte);
  const prompt = buildParentExplanationSystemPrompt(view);

  assert(!prompt.includes("シドニー"), "conflict対象の値（シドニー）が本文へ渡されていない");
  assert(!prompt.includes("オークランド"), "conflict対象の値（オークランド）が本文へ渡されていない");
  assert(prompt.includes("希望する都市"), "除外されたfieldのlabelは制御目的で渡されている");
  assert(
    prompt.includes("他の情報から推測して書いたり、間接的にでも触れたりしないこと"),
    "conflict対象に触れない旨の制御指示がプロンプトに含まれている",
  );
}

console.log("Case 4: hasEnoughContext = false（Whyのみ）→ 次Stepで生成させない設計になっている");
{
  const karte = freshKarte();
  karte.motivation.statedGoal = { value: "自分を試したい", certainty: "stated", source: "chat" };
  const view = buildDocumentsKarteView(karte);
  assert(view.hasEnoughContext === false, "前提: hasEnoughContext = false");
  assert(canGenerateParentExplanation(view) === false, "canGenerateParentExplanation = false（呼び出し側が生成をブロックできる）");
}

console.log("Case 5: inferredのみ → 生成可能扱いにならない");
{
  const karte = freshKarte();
  karte.motivation.statedGoal = { value: "自分を試したい", certainty: "inferred", source: "chat" };
  karte.timing.durationWeeks = { value: 12, certainty: "inferred", source: "worksheet" };
  const view = buildDocumentsKarteView(karte);
  assert(view.hasEnoughContext === false, "前提: hasEnoughContext = false（inferredのみ）");
  assert(canGenerateParentExplanation(view) === false, "canGenerateParentExplanation = false");
}

// --- ここから、実生成結果のレビューを踏まえたprompt改善（宛名削除・概要リスト追加・
// Markdown禁止強化・期限/一般知識の創作防止・締めの言葉の非強制）の確認 ---

function buildReviewSampleView() {
  const karte = freshKarte();
  karte.motivation.statedGoal = {
    value: "ケアンズへの旅行がきっかけで、違う文化の中で生活してみたいと思った",
    certainty: "stated",
    source: "chat",
  };
  karte.schoolPrefs.preferredCity = { value: "ゴールドコースト", certainty: "stated", source: "chat" };
  karte.timing.departureTiming = { value: "来年", certainty: "stated", source: "worksheet" };
  karte.timing.durationWeeks = { value: 52, certainty: "stated", source: "worksheet" };
  karte.work.workingHolidayInterest = { value: true, certainty: "stated", source: "chat" };
  return buildDocumentsKarteView(karte);
}

console.log("Case 6: 「お父さん、お母さんへ」が出力すべき指示としては存在しない（禁止例としての言及はOK）");
{
  const view = buildReviewSampleView();
  const prompt = buildParentExplanationSystemPrompt(view);
  // 「お父さん、お母さんへ」という文字列自体は、禁止例として言及されることを許容する
  // （「こう書かないこと」という否定文脈での例示は、単なる不在より効果的な防御であるため）。
  // 確認すべきは、その言及が肯定的な出力指示ではなく禁止文脈にあること。
  const idx = prompt.indexOf("お父さん、お母さんへ");
  assert(idx !== -1, "禁止例としての言及自体は存在する（否定文脈の確認用）");
  const surrounding = prompt.slice(Math.max(0, idx - 20), idx + 60);
  assert(surrounding.includes("書かない"), "その言及が「書かない」という禁止文脈の中にある");
  assert(
    prompt.includes("宛名") && prompt.includes("一切書かない"),
    "宛名を書かない旨の明示的な禁止指示がある",
  );
}

console.log("Case 7: 概要sectionを生成する指示が存在");
{
  const view = buildReviewSampleView();
  const prompt = buildParentExplanationSystemPrompt(view);
  assert(prompt.includes("概要リスト"), "概要リストという語がプロンプトに含まれる");
  assert(prompt.includes("今考えている留学・ワーホリ"), "概要セクションの見出し例が含まれる");
}

console.log("Case 8: 概要はstatedのみ / inferredを概要へ使わない指示");
{
  const view = buildReviewSampleView();
  const prompt = buildParentExplanationSystemPrompt(view);
  assert(
    prompt.includes("使ってよいのは view.stated のデータだけ"),
    "概要にstatedのみ使う旨の指示がある",
  );
  assert(
    prompt.includes("inferredの情報は概要リストに含めないこと"),
    "概要にinferredを含めない旨の明示的な指示がある",
  );
}

console.log("Case 9: unknown項目を「未定」と表示しない");
{
  const view = buildReviewSampleView();
  const prompt = buildParentExplanationSystemPrompt(view);
  assert(
    prompt.includes("学校：検討中") && prompt.includes("予算：未定"),
    "「未定」等の穴埋め例が禁止例として言及されている",
  );
  assert(
    prompt.includes("その行自体を書かないこと"),
    "データが無い項目は行ごと書かない旨の指示がある",
  );
}

console.log("Case 10: 「項目名：値」形式を指定");
{
  const view = buildReviewSampleView();
  const prompt = buildParentExplanationSystemPrompt(view);
  assert(prompt.includes("項目名：値"), "「項目名：値」形式の指定がある");
}

console.log("Case 11: Markdown # heading禁止");
{
  const view = buildReviewSampleView();
  const prompt = buildParentExplanationSystemPrompt(view);
  assert(
    prompt.includes("マークダウン記法を一切使わないこと"),
    "マークダウン記法全体を禁止する見出しがある",
  );
  assert(prompt.includes("#、##、###"), "見出し記号#が明示的に禁止列挙に含まれる");
}

console.log("Case 12: Markdown箇条書き禁止");
{
  const view = buildReviewSampleView();
  const prompt = buildParentExplanationSystemPrompt(view);
  assert(
    prompt.includes("行頭に-や*を付けないこと"),
    "箇条書き記号（-, *）が概要リストとの関係で明示的に禁止されている",
  );
}

console.log("Case 13: 家族向け締めの言葉を創作しない");
{
  const view = buildReviewSampleView();
  const prompt = buildParentExplanationSystemPrompt(view);
  assert(
    prompt.includes("よろしくお願いします") && prompt.includes("勝手に作らないこと"),
    "定型の締め言葉を創作しない旨の指示がある",
  );
  assert(
    prompt.includes("必ず入れる必要はない"),
    "締めの言葉が必須ではない旨が明示されている",
  );
}

console.log("Case 14: 入力に無い期限・準備スケジュールを作らない");
{
  const view = buildReviewSampleView();
  const prompt = buildParentExplanationSystemPrompt(view);
  assert(
    prompt.includes("今からやること") && prompt.includes("一般的な留学準備の常識・スケジュール感をあなたの知識から補完しないこと"),
    "「今からやること」で一般知識のスケジュールを補完しない旨の指示がある",
  );
}

console.log("Case 15: 都市・国の一般知識を補完しない");
{
  const view = buildReviewSampleView();
  const prompt = buildParentExplanationSystemPrompt(view);
  assert(
    prompt.includes("観光地として有名") && prompt.includes("治安が良い"),
    "都市・国についての一般知識の具体例が禁止列挙されている",
  );
}

console.log("Case 16: 概要リストと本文の重複を減らす指示");
{
  const view = buildReviewSampleView();
  const prompt = buildParentExplanationSystemPrompt(view);
  assert(
    prompt.includes("概要リストとの重複を避ける"),
    "重複防止の見出しがある",
  );
  assert(
    prompt.includes("同じ形でもう一度列挙しないこと"),
    "本文で条件を再掲しない旨の具体的な指示がある",
  );
}

// --- ここから、実生成結果の2回目のレビュー（「言い足し」抑制の最終調整）の確認 ---

console.log("Case 17: trueGoalHypothesisを原則本文に使わない指示");
{
  const view = buildReviewSampleView();
  const prompt = buildParentExplanationSystemPrompt(view);
  assert(
    prompt.includes("この項目は、親向け説明資料の本文では原則として一切使用しないこと"),
    "trueGoalHypothesisを本文で原則使用しない旨の明示的な指示がある",
  );
  assert(
    prompt.includes("深層動機を第三者（家族）に見せるためのものではない"),
    "理由（第三者へ見せる資料ではない）が明記されている",
  );
}

console.log("Case 18: statedだけで足りる場合はinferredを使わない指示");
{
  const view = buildReviewSampleView();
  const prompt = buildParentExplanationSystemPrompt(view);
  assert(
    prompt.includes("statedの情報だけで自然な文章が作れる場合は、inferredを使わないこと"),
    "stated単独で足りるならinferredを使わない旨の指示がある",
  );
  assert(
    prompt.includes("あくまでstatedの内容を理解する補助としてのみ利用すること"),
    "inferredをstated理解の補助としてのみ使う旨の指示がある",
  );
}

console.log("Case 19: 出発時期から準備期限を逆算しない指示");
{
  const view = buildReviewSampleView();
  const prompt = buildParentExplanationSystemPrompt(view);
  assert(
    prompt.includes("準備スケジュールを逆算して作ってはいけない"),
    "時期からの逆算を禁止する指示がある",
  );
  assert(prompt.includes("2か月前にビザを取る"), "逆算の具体例が禁止例として言及されている");
}

console.log("Case 20: statedのNext Actionが無ければ「今からやること」を省略する指示");
{
  const view = buildReviewSampleView();
  const prompt = buildParentExplanationSystemPrompt(view);
  assert(
    prompt.includes(
      "このセクションを生成してよいのは、view.statedの中に、本人が明示した具体的なNext Action・期限・予定が存在する場合だけである",
    ),
    "statedの具体的Next Actionが無ければ生成しない旨の条件が明示されている",
  );
}

console.log("Case 21: 「現在〜段階にいる」とAIが勝手に推測しない指示");
{
  const view = buildReviewSampleView();
  const prompt = buildParentExplanationSystemPrompt(view);
  assert(
    prompt.includes("本人が明言していない現在の状態・フェーズを推測してラベル付けしないこと"),
    "状態・フェーズの推測を禁止する指示がある",
  );
}

console.log("Case 22: 本人の意味を越えて価値観・目的を追加しない指示");
{
  const view = buildReviewSampleView();
  const prompt = buildParentExplanationSystemPrompt(view);
  assert(
    prompt.includes("本人が述べた意味の範囲を越えて、新しい価値観・目的・感情を追加しないこと"),
    "意味の拡張を禁止する明示的な指示がある",
  );
  assert(
    prompt.includes("その場所に本当に根ざす感覚を得たい"),
    "意味拡張の具体例が禁止例として言及されている",
  );
}

console.log("Case 23: 文章の美しさより事実性を優先する指示");
{
  const view = buildReviewSampleView();
  const prompt = buildParentExplanationSystemPrompt(view);
  assert(prompt.includes("文章の質の優先順位"), "優先順位の見出しがある");
  assert(
    prompt.includes("1. 事実性") && prompt.includes("4. 文章の美しさ"),
    "事実性が最優先・美しさが最下位という順序が明示されている",
  );
}

console.log("Case 24: 不安にAIが勝手な解決策を足さない指示");
{
  const view = buildReviewSampleView();
  const prompt = buildParentExplanationSystemPrompt(view);
  assert(
    prompt.includes("学校で学べば大丈夫") && prompt.includes("AIが作って付け加えないこと"),
    "不安への解決策創作を禁止する具体的な指示がある",
  );
}

console.log("Case 25: 本人が言っていない因果関係を作らない指示");
{
  const view = buildReviewSampleView();
  const prompt = buildParentExplanationSystemPrompt(view);
  assert(prompt.includes("因果関係を作らない"), "因果関係禁止の見出しがある");
  assert(
    prompt.includes("多国籍な環境だから英語が伸びる"),
    "因果関係の具体例が禁止例として言及されている",
  );
}

console.log("Case 26: 「この場所を考えている理由」セクションの条件付き生成");
{
  const view = buildReviewSampleView();
  const prompt = buildParentExplanationSystemPrompt(view);
  assert(prompt.includes("この場所を考えている理由"), "セクション名がプロンプトに含まれる");
  assert(
    prompt.includes("材料が無ければこのセクション自体を省略すること"),
    "材料が無ければ省略する旨が明示されている",
  );
}

console.log("Case 27: 場所理由もstated優先");
{
  const view = buildReviewSampleView();
  const prompt = buildParentExplanationSystemPrompt(view);
  assert(
    prompt.includes("この場所についてもstatedの情報を優先し"),
    "場所理由セクションでもstated優先の指示がある",
  );
}

console.log("Case 28: 文字数を満たすために情報を足さない指示");
{
  const view = buildReviewSampleView();
  const prompt = buildParentExplanationSystemPrompt(view);
  assert(
    prompt.includes("500〜700文字程度になっても構わない"),
    "情報が少ない場合の短文化が具体的に許容されている",
  );
  assert(
    prompt.includes("事実性や本人の意味を保つことより優先しないこと"),
    "文字数を事実性・本人の意味より優先しない旨が明示されている",
  );
}

console.log("Case 29: 材料のないsectionを省略する指示");
{
  const view = buildReviewSampleView();
  const prompt = buildParentExplanationSystemPrompt(view);
  assert(
    prompt.includes("すべてのセクションを埋めることを目的にせず、資料の見栄えのために水増ししないこと"),
    "セクションを無理に埋めない旨の指示がある",
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
