"use client";

import Image from "next/image";

/**
 * Plan Chatの初期状態（実会話メッセージが1件も無い時）だけに表示する、中央寄せのスタート画面。
 * ここに新しいAPI呼び出しや専用ロジックは一切持たない。クイックスタートは既存の入力欄へ
 * 文言を渡すだけで、送信そのものは既存のsubmitフロー（Chat.tsx側）に完全に委ねる。
 */

const QUICK_START_OPTIONS = [
  "留学するか迷っている",
  "行き先を相談したい",
  "学校を選びたい",
  "予算が不安",
  "英語力が心配",
];

/**
 * 見た目のみ。中央寄せ・入力欄との一体感は親（Chat.tsx）側が1つのflex columnで
 * まとめて作るため、このコンポーネント自身はh-full/justify-centerのような
 * 独自の全体centeringを持たず、テキストブロックの中身だけを担う。
 */
export default function ChatStartScreen({ onQuickStart }: { onQuickStart: (text: string) => void }) {
  return (
    <div className="text-center">
      {/* 留学イメージ画像。装飾のみでaltは空にし、見出しがこの画面の実質的な説明を担う。
          Mindtrip参考で大きく見せすぎないよう、幅はmobile 160px/PC 224px程度に抑える。 */}
      <div className="flex justify-center">
        <Image
          src="/chat/chat-start-visual.png"
          alt=""
          width={1065}
          height={895}
          priority
          className="h-auto w-40 object-contain sm:w-56"
        />
      </div>

      <h2 className="mt-5 text-2xl font-bold leading-snug text-worksheet-primary sm:text-3xl">
        今日は、何から整理する？
      </h2>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-worksheet-secondary sm:text-base">
        留学について今考えていることを、まとまっていなくてもそのまま話してみてください。
      </p>

      {/* 通常時は主張を弱く（枠線を薄く・文字をsecondary色に）、hover時だけセージ背景にする */}
      <div className="mx-auto mt-7 flex max-w-xl flex-wrap justify-center gap-2">
        {QUICK_START_OPTIONS.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => onQuickStart(text)}
            className="rounded-full border border-worksheet-border/70 px-4 py-2 text-sm text-worksheet-secondary transition-colors duration-150 hover:border-worksheet-sage-hover hover:bg-worksheet-sage hover:text-worksheet-primary"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
