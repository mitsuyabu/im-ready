/**
 * lib/parentExplanationPrompt.ts の動作確認用スクリプト（Step 3）。
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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
