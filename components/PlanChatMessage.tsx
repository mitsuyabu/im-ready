import { stripMarkdownBold } from "@/lib/markdown";

/** assistant（AI）側 avatar のブランド画像。source of truth は public/images/chat/ai-alert.png のみ。 */
const AI_AVATAR_SRC = "/images/chat/ai-alert.png";

/**
 * Plan Chat（/plans/[planId]/chat）専用のメッセージ表示（presentation のみ）。
 * 参考デザインの「紙・ノート・相談ワークスペース」に寄せて、user は白いカード＋人型アイコン、
 * assistant は淡いセージの紙＋スパークアイコン＋折れた紙の角、で描く。
 *
 * テキスト整形は既存 components/Message.tsx の "document" variant と同じ（stripMarkdownBold +
 * \n\n 区切りの段落化 + whitespace-pre-wrap）。Markdown ライブラリは足さない。
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
      <div className="flex items-start gap-3 sm:gap-4">
        {userAvatarUrl ? (
          // 個人ごとの signed URL（private bucket）。AppNav の MenuAvatar と同じ <img> 方式。装飾なので alt=""。
          // eslint-disable-next-line @next/next/no-img-element -- private avatars bucket の署名付き URL のため
          <img
            src={userAvatarUrl}
            alt=""
            className="mt-1 h-9 w-9 shrink-0 rounded-full border border-[#e4dcc9] bg-white object-cover shadow-[0_1px_2px_rgba(60,50,30,0.08)]"
          />
        ) : (
          <span
            aria-hidden
            className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#e4dcc9] bg-white text-[#8a8578] shadow-[0_1px_2px_rgba(60,50,30,0.08)]"
          >
            <UserGlyphIcon className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0 flex-1 rounded-[15px] border border-black/[0.06] bg-white px-4 py-4 shadow-[0_1px_3px_rgba(40,33,20,0.06)] sm:px-6 sm:py-5">
          <div className="space-y-3 text-[16px] leading-7 text-[#2b2a26] sm:text-base">
            {paragraphs.map((para, i) => (
              <p key={i} className="whitespace-pre-wrap break-words">
                {para}
              </p>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 sm:gap-4">
      {/* AI avatar: 「!」ブランド画像（白地）。丸枠・薄い border・ごく薄い shadow で bubble になじませる。 */}
      {/* eslint-disable-next-line @next/next/no-img-element -- user avatar と実装方式を揃えるため <img> */}
      <img
        src={AI_AVATAR_SRC}
        alt=""
        aria-hidden
        className="mt-1 h-9 w-9 shrink-0 rounded-full border border-[#e5e0d6] bg-white object-contain shadow-[0_1px_2px_rgba(60,50,30,0.08)]"
      />
      <div className="relative min-w-0 flex-1 overflow-hidden rounded-[15px] border border-[#dde7d2] bg-[#f1f5ec] px-4 py-4 shadow-[0_1px_3px_rgba(40,50,30,0.06)] sm:px-6 sm:py-5">
        <div className="space-y-3 text-[16px] leading-7 text-[#2f342a] sm:text-base">
          {paragraphs.map((para, i) => (
            <p key={i} className="whitespace-pre-wrap break-words">
              {para}
            </p>
          ))}
        </div>
        {/* 紙の折れた角（装飾）。三角形を右下に重ねるだけ。読み上げ対象にしない。 */}
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-0 right-0 h-4 w-4 bg-[#e3ebd8] shadow-[-1px_-1px_1.5px_rgba(60,70,40,0.12)]"
          style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}
        />
      </div>
    </div>
  );
}
