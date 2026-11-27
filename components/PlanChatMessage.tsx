import { stripMarkdownBold } from "@/lib/markdown";

/** assistant（AI）側 avatar のブランド画像。source of truth は public/images/chat/ai-alert.png のみ。 */
const AI_AVATAR_SRC = "/images/chat/ai-alert.png";

/**
 * Plan Chat（/plans/[planId]/chat）専用のメッセージ表示（presentation のみ）。
 *
 * My Karte と同じ世界観（淡いグレーの canvas / 白いパネル / 蛍光ライムのアクセント）に揃える:
 *   - assistant … **カードを持たず、白い地に本文をそのまま置く**（枠・影・角丸なし）。
 *     画面でいちばん読む場所なので、囲いを外して読む面積を広げている。
 *     蛍光は avatar の淡いライムのリングだけに残す（長文の横にラインを伸ばさない）。
 *   - user      … **淡いセージの面**（--mk-pale-sage）。右寄せ・最大 85% 幅で会話らしく見せる。
 *     蛍光ライムでユーザー発言を塗りつぶすことはしない。
 *   - 本文はどちらも共通クラス .mk-text（15〜16px / 行間 1.7 / #262626）。
 *     段落間の余白・角丸・内余白も両者で揃え、色の違いだけに頼らず区別する。
 *
 * テキスト整形は従来どおり（stripMarkdownBold + \n\n 区切りの段落化 + whitespace-pre-wrap）。
 * **Markdown ライブラリは足さない**（この画面はもともと素のテキスト表示で、出力も
 * プロンプト側で Markdown を使わない前提になっている）。
 * /widget 側の表示（Message.tsx）には一切影響しない。
 */

/** \n\n（空行）区切りだけを見た目上の段落として分ける（Message.tsx と同一ロジック）。 */
function splitParagraphs(text: string): string[] {
  const parts = text.split(/\n{2,}/).filter((p) => p.length > 0);
  return parts.length > 0 ? parts : [text];
}

/** user avatar 用の汎用人型（プロフィール画像が未設定のときの fallback）。 */
function UserGlyphIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 19c1.1-3.3 3.9-4.8 6.5-4.8s5.4 1.5 6.5 4.8" />
    </svg>
  );
}

/** 本文。user / assistant で同じクラスを使う（文字サイズ・行間・段落の余白を揃える）。 */
function MessageBody({ paragraphs }: { paragraphs: string[] }) {
  return (
    <div className="space-y-4">
      {paragraphs.map((para, i) => (
        <p key={i} className="mk-text whitespace-pre-wrap break-words">
          {para}
        </p>
      ))}
    </div>
  );
}

export default function PlanChatMessage({
  role,
  content,
  userAvatarUrl = null,
}: {
  role: "user" | "assistant";
  content: string;
  /** ログイン中ユーザーのプロフィール画像 signed URL。null なら汎用アイコンへ fallback。 */
  userAvatarUrl?: string | null;
}) {
  const isUser = role === "user";
  const paragraphs = splitParagraphs(stripMarkdownBold(content));

  if (isUser) {
    return (
      <div className="flex items-start justify-end gap-3">
        <div className="min-w-0 max-w-[85%] rounded-[18px] rounded-tr-[6px] bg-[var(--mk-pale-sage)] px-4 py-3.5 sm:px-5 sm:py-4">
          <MessageBody paragraphs={paragraphs} />
        </div>
        {userAvatarUrl ? (
          // 個人ごとの signed URL（private bucket）。AppNav の MenuAvatar と同じ <img> 方式。装飾なので alt=""。
          // eslint-disable-next-line @next/next/no-img-element -- private avatars bucket の署名付き URL のため
          <img
            src={userAvatarUrl}
            alt=""
            className="mt-0.5 h-8 w-8 shrink-0 rounded-full border border-[var(--mk-border)] bg-white object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--mk-border)] bg-white text-[var(--mk-sub)]"
          >
            <UserGlyphIcon className="h-4.5 w-4.5" />
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 sm:gap-3.5">
      {/* AI avatar: 既存のブランド画像（白地の PNG）をそのまま使い、周りの淡いライムのリングだけを足す。 */}
      {/* eslint-disable-next-line @next/next/no-img-element -- user avatar と実装方式を揃えるため <img> */}
      <img
        src={AI_AVATAR_SRC}
        alt=""
        aria-hidden
        className="mt-0.5 h-9 w-9 shrink-0 rounded-full bg-white object-contain ring-2 ring-[var(--neon-lime-soft)]"
      />
      {/* カードを持たない。白地の上に本文だけを置く（余白は行間のための最小限）。 */}
      <div className="min-w-0 flex-1 pt-1">
        <MessageBody paragraphs={paragraphs} />
      </div>
    </div>
  );
}
