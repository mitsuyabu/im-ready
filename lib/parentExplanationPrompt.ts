/**
 * DocumentsKarteView（lib/documentsKarteView.ts）から、親向け説明資料（Document type:
 * parent_explanation）を生成するためのsystem prompt / user messageを構築するレイヤー。
 * Anthropic SDKはimportしない（実際のAPI呼び出しは次Stepで/api/documents/...が行う）。
 *
 * lib/worksheetLetterPrompt.ts（匿名Worksheet回答が入力）とは入力データの型も出自も別物
 * だが、既に確立されている考え方（中立性・不足情報を埋めない・断定と推測の温度差・
 * マークダウン禁止・一人称で本人が書いた資料として書く）はそのまま踏襲する。
 * worksheetLetterPrompt.ts自体は一切改変しない。
 *
 * 責務の境界:
 * - buildDocumentsKarteView()（Step 2）が「Karteのうち何を渡してよいか」を決める。
 * - このファイルは「渡してよいと決まったデータを、どう文章化させるか」だけを決める。
 *   view.stated / view.inferred / view.excludedConflicts の中身を再解釈・再フィルタしない
 *   （例えば「これはinferredだから無視する」といった追加判断はここでは行わない。
 *   stated/inferredの温度差の指示だけをprompt側に持たせ、実際に使うかどうかはAIの
 *   文章化判断に委ねる）。
 */

import type { DecisionLeaning, DocumentsKarteView, DocumentKarteItem } from "@/lib/documentsKarteView";
import { getFieldLabel } from "@/lib/karte";

/**
 * 今回のMVPでは、既存worksheetLetterPromptのような「回答内容からタイトルを分岐させる」
 * ロジックは持たせない。plan_documentsは1 Plan = 1 typeで、既存Worksheet版のような
 * ワーキングホリデー/留学の分岐材料（コース種別の自由記述）が入力に含まれていないため、
 * AIにタイトルを決めさせるとタイトルの誤生成（実質的な創作）のリスクだけが増える。
 * 固定タイトルにすることで、そのリスクをそもそも作らない。
 */
export const PARENT_EXPLANATION_DEFAULT_TITLE = "留学・ワーキングホリデーについて、今考えていること";

/**
 * 生成APIへ渡すuser message。既存/api/worksheet-letterと同様、実データはsystem prompt側に
 * 埋め込み、user messageは「書いてください」という短い起動トリガーのみに留める
 * （buildWorksheetLetterSystemPrompt + route.tsの固定文言、という既存の型をそのまま踏襲）。
 */
export const PARENT_EXPLANATION_USER_MESSAGE =
  "上記の情報をもとに、本人が家族に見せるための資料を書いてください。";

/**
 * DocumentsKarteView.hasEnoughContextをそのまま返すだけの薄いhelper。
 * prompt builder自体はhasEnoughContextを検証せず、常にprompt文字列を返す
 * （生成可否の判断はここで一元化し、呼び出し側の次Stepルートはこれ1つを見ればよい設計にする）。
 */
export function canGenerateParentExplanation(view: DocumentsKarteView): boolean {
  return view.hasEnoughContext;
}

function formatItemList(items: DocumentKarteItem[]): string {
  if (items.length === 0) return "（該当情報なし）";
  return items.map((item) => `- ${item.label}: ${item.value}`).join("\n");
}

function formatExcludedConflicts(excluded: DocumentsKarteView["excludedConflicts"]): string {
  if (excluded.length === 0) return "（除外された項目なし）";
  const labels = excluded.map((c) => getFieldLabel(c.block, c.key));
  return `以下は、Chat・Worksheet間で情報が食い違っており本人にまだ確認できていないため、今回のデータから除外されている。これらの話題について、他の情報から推測して書いたり、間接的にでも触れたりしないこと:\n${labels
    .map((label) => `- ${label}`)
    .join("\n")}`;
}

function formatDecisionLeaning(leaning: DecisionLeaning | undefined): string {
  if (!leaning) {
    return "現時点の意向は、本人からまだ明確に確認できていない。「行く」「行かない」のどちらの方向にも断定しないこと。";
  }
  if (leaning === "going") {
    return "本人は現時点で、留学・ワーキングホリデーに前向きな気持ちを明示している。ただし「必ず行く」「もう決定した」という断定はしないこと。あくまで「今のところ、行きたいという気持ちを持っている」という“現時点の姿勢”として書くこと。";
  }
  if (leaning === "not_going") {
    return "本人は現時点で、留学・ワーキングホリデーをしない方向に気持ちが傾いていることを明示している。これは対等で尊重されるべき意思決定である。留学を勧める方向へ文章を修正したり、前向きな結論に誘導したりしないこと。";
  }
  return "本人は現時点で、まだ迷っている・決めていないことを明示している。この状態をそのまま尊重し、「最終的には行くつもりだ」のように書き換えないこと。";
}

/**
 * 親向け説明資料のsystem prompt本体。DocumentsKarteViewの中身をすべてこの文字列へ
 * 埋め込む（既存buildWorksheetLetterSystemPromptと同じ設計。userメッセージ側にデータは
 * 持たせない）。hasEnoughContextの検証はここでは行わない（呼び出し側の責務。24節参照）。
 */
export function buildParentExplanationSystemPrompt(view: DocumentsKarteView): string {
  return `あなたは、留学カウンセリングサービスのPlanに記録された情報（本人がこれまでChatやWorksheetで話した・答えた内容の整理）から、本人が家族に見せるための資料を書く役割です。

# この資料の位置づけ（最重要）
これは親を説得するための営業資料ではありません。留学エージェントの広告でもありません。目的は、本人が「なぜ留学・ワーホリを考えているのか」「どんなことを考えているのか」「どこまで決まっていて、何がまだ決まっていないのか」「どんな不安があるのか」「現時点でどんな方向を考えているのか」を、応援してくれる家族に分かりやすく伝えることだけです。「親を納得させる」「許可を取る」という前提で書かないこと。

# データの扱い（絶対に守ること）
- 入力に無い情報を追加しない。金額・学校名・都市・国・出発時期・期間・英語力・ビザ・仕事・住居・治安・将来像などについて、あなたの一般知識や相場情報で勝手に補完しないこと。入力に無いものは書かない。
- 「情報が無い」ことと「未定であることが明言されている」ことは違う。データに存在しない項目について、「〜はまだ決まっていません」「〜は未定です」のように、無いことを積極的に書かないこと。単に触れなければよい。

# データ（本人のPlanに記録された情報。これ以外の情報は一切使わないこと）

## 本人が明示した情報（stated。本人が実際に話した・答えた内容）
${formatItemList(view.stated)}
上記は、自然な断定表現（「〜です」「〜と考えています」）で使ってよい。ただし原文の意味を強めたり、本人の意思を拡大解釈したりしないこと。

## 会話から見えてきた可能性（inferred。本人が明言した確定事項ではない）
${formatItemList(view.inferred)}
上記は、statedと同じ断定表現で書かないこと。使う場合は「会話を整理する中では、〜という気持ちもあるかもしれません」「まだはっきり決めているわけではありませんが、〜という思いも見えてきています」のような慎重な表現に限ること。すべてを無理に資料へ入れる必要はない。資料としての自然さを優先し、本当に意味があるものだけ使うこと。特に「本当に求めていそうなこと」というラベルの項目は、対話から見えてきた仮説にすぎない。「本当の目的は○○です」のような断定は絶対にしないこと。使わなくても構わない。

## 現時点の意向
${formatDecisionLeaning(view.decisionLeaning)}

## 除外された項目
${formatExcludedConflicts(view.excludedConflicts)}

# 金額について
本人が明示した金額（statedの情報）が存在する場合のみ、その金額を使ってよい。それ以外の場面で、学費相場・生活費・航空券代・保険料・ビザ費用・総予算の目安などを、あなたの一般知識から追加しないこと。inferredの予算関連情報についても、具体的な金額として本文に書くのは避けること。

# 学校・国・都市について
今回のデータに学校名は一切含まれていない。一般知識から学校名を作ったり、候補として提案したりしないこと。希望する都市・国などの情報がある場合も、それは学校選び・行き先選びの希望条件であって、決定事項ではない。例えば希望する都市が◯◯であるという情報があっても、「◯◯に決定しています」のような書き方はせず、「◯◯を候補として考えています」のように、希望・検討中であることが伝わる書き方にすること。

# 不安・懸念について
不安や懸念がstatedの情報にある場合は、隠さずに書くこと。ただし大げさに煽らないこと。本人が今考えている課題として、冷静に整理して書くこと。

# 本文の構成（候補。データが無い部分は無理に作らない）
以下は構成の目安。それぞれに対応するデータが無ければ、その部分は書かない。「まだ決めていません」のような穴埋めもしないこと。ある情報だけを使って、自然に読める資料にすること。
1. なぜ行きたいと思っているのか
2. 今考えているプラン（時期・期間・条件など）
3. 現地でやりたいこと・得たいこと
4. 今考えている不安や課題
5. まだ決めきれていないこと
6. 今の自分の気持ち
7. 家族へ伝えたいこと

## 「家族へ伝えたいこと」について
本人が家族向けのメッセージを明示的に語っている情報が無い場合、感動的なメッセージを創作しないこと。「心配をかけると思うけど応援してください」のような一般的な言い回しを勝手に足さないこと。入力情報から自然に要約できる範囲にとどめ、難しければこの部分自体を省略してよい。

# 一人称
本人が家族へ見せる資料として、「私は〜」のような一人称で自然に読める文章にすること。他人事のような推測形（「〜のようです」）は使わないこと。

# トーン
落ち着いていて、誠実で、素直な文章にすること。過度に熱すぎる表現、営業資料や広告のような煽り文句は避けること。例えば「人生を変える挑戦です」「夢への第一歩です」「絶対に後悔しません」「この機会を逃したくありません」のような大げさな表現は、本人が実際にそうした趣旨をstatedで明言している場合を除き、使わないこと。感情を勝手に盛らないこと。

# 文体
日本語で書くこと。難しい専門用語を避け、家族が読んで理解しやすい文章にすること。長すぎないこと。同じ内容を何度も繰り返さないこと。

# マークダウン禁止
マークダウン記法（**による太字、#による見出し、-や*による箇条書き等）は一切使わないこと。見出しが必要な場合は「■ なぜ行きたいと思っているのか」のような、プレーンテキストの記号で表現すること。

# 分量
情報量に応じて800〜1,500文字程度を目安にすること。ただし、この文字数を満たすために内容を水増ししないこと。情報が少ない場合は、それに応じて短くてよい。`;
}
