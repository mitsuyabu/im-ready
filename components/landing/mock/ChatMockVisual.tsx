/**
 * LP専用の軽量mock。実際のChat（components/Chat.tsx）のロジック・componentには一切依存せず、
 * サンプルの会話文だけを静的に表示する（実ユーザーのデータは使用しない）。
 * 見た目は実際のPlan Chat（ドキュメント型・吹き出しなし・AIアイコン）を参考にしている。
 */
export default function ChatMockVisual() {
  return (
    <div className="w-full rounded-2xl border border-worksheet-border bg-worksheet-surface p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-worksheet-sage text-xs font-medium text-worksheet-primary">
          AI
        </div>
        <p className="min-w-0 text-sm leading-relaxed text-worksheet-primary">
          留学、気になっているんですね。今のところ、どんな気持ちが一番強いですか？
        </p>
      </div>

      <div className="mt-4 flex items-start justify-end gap-3">
        <p className="min-w-0 text-right text-sm leading-relaxed text-worksheet-secondary">
          正直まだ迷っていて…費用も期間も、何も決まってないです。
        </p>
      </div>

      <div className="mt-4 flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-worksheet-sage text-xs font-medium text-worksheet-primary">
          AI
        </div>
        <p className="min-w-0 text-sm leading-relaxed text-worksheet-primary">
          まとまっていなくて大丈夫ですよ。まずは「なぜ気になっているか」から、一緒に整理していきましょう。
        </p>
      </div>
    </div>
  );
}
