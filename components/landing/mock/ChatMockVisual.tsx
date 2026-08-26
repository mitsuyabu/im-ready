/**
 * LP専用の軽量mock。実際のChat（components/Chat.tsx）のロジック・componentには一切依存せず、
 * サンプルの会話文だけを静的に表示する（実ユーザーのデータは使用しない）。
 * 淡いsky系のトーンで「話す」ことを機能単位で一目で伝える。会話カード＋小さなfact chip
 * （軽いshadow・僅かなoffset）で、単なる縮小スクショではなく「機能が分かるvisual」にしている。
 */
export default function ChatMockVisual() {
  return (
    <div className="relative w-full rounded-3xl bg-sky-50 p-5 pb-9 sm:p-7 sm:pb-11">
      <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-700">
            AI
          </div>
          <p className="min-w-0 text-sm leading-relaxed text-worksheet-primary sm:text-base">
            留学、気になっているんですね。今のところ、どんな気持ちが一番強いですか？
          </p>
        </div>

        <div className="mt-4 flex items-start justify-end gap-3">
          <p className="min-w-0 max-w-[85%] rounded-2xl bg-worksheet-surface-2 px-4 py-2.5 text-right text-sm leading-relaxed text-worksheet-primary sm:text-base">
            正直まだ迷っていて…費用も期間も、何も決まってないです。
          </p>
        </div>

        <div className="mt-4 flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-700">
            AI
          </div>
          <p className="min-w-0 text-sm leading-relaxed text-worksheet-primary sm:text-base">
            まとまっていなくて大丈夫ですよ。まずは「なぜ気になっているか」から、一緒に整理していきましょう。
          </p>
        </div>
      </div>

      {/* 会話から見えてきたfactの断片、というニュアンスの小さな浮きchip */}
      <div className="absolute -bottom-3 left-6 flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-sky-700 shadow-md sm:left-8">
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
        気持ちが少しずつ言葉になる
      </div>
    </div>
  );
}
