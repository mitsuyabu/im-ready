"use client";

import Image from "next/image";

/**
 * Plan Chatの初期状態（実会話メッセージが1件も無い時）だけに表示する、中央寄せのスタート画面。
 * ここに新しいAPI呼び出しや専用ロジックは一切持たない。クイックスタートは既存の入力欄へ
 * 文言を渡すだけで、送信そのものは既存のsubmitフロー（Chat.tsx側）に完全に委ねる。
 *
 * 見た目は My Karte に合わせる: 見出しは .mk-page-title、説明は .mk-text（補助色）、
 * チップは白地＋細い border で、hover のときだけ縁が蛍光ライムになる。
 * 蛍光は「イラスト背後のごく淡い光」と「見出し上の 3px のライン」だけで、面のベタ塗りはしない。
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
    <div className="flex flex-col items-center text-center">
      {/* 留学イメージ画像。装飾のみでaltは空にし、見出しがこの画面の実質的な説明を担う。
          背後の淡いライムのグラデーションは白へ溶け込ませる（面のベタ塗りにしない）。 */}
      <div className="relative flex justify-center">
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full sm:h-64 sm:w-64"
          style={{
            background:
              "radial-gradient(circle, rgba(216,251,87,0.42) 0%, rgba(232,239,234,0.35) 45%, rgba(244,245,243,0) 70%)",
          }}
        />
        <Image
          src="/chat/chat-start-visual.png"
          alt=""
          width={1065}
          height={895}
          priority
          className="relative h-auto w-40 object-contain sm:w-56"
        />
      </div>

      {/* 見出しの上の短いライン。ライム→イエローの細い光だけで温度感を出す（面は塗らない）。 */}
      <span
        aria-hidden
        className="mt-6 h-[3px] w-10 rounded-full"
        style={{ background: "linear-gradient(90deg, var(--neon-lime) 0%, var(--neon-yellow) 100%)" }}
      />
      <h2 className="mk-page-title mt-3">今日は、何から整理する？</h2>
      <p className="mk-text mt-3 max-w-md text-[var(--mk-sub)]">
        留学について今考えていることを、まとまっていなくてもそのまま話してみてください。
      </p>

      {/* 通常時は白地＋細い border。hover のときだけ淡いライムが差す（主役は入力欄のまま）。 */}
      <div className="mx-auto mt-7 flex max-w-xl flex-wrap justify-center gap-2">
        {QUICK_START_OPTIONS.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => onQuickStart(text)}
            className="rounded-full border border-[var(--mk-border)] bg-[var(--mk-card)] px-4 py-2 text-[14px] font-medium text-[var(--mk-ink)] transition-colors duration-150 hover:border-[var(--neon-lime)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neon-lime)]"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
