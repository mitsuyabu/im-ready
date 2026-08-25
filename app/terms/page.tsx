export const metadata = {
  title: "利用規約 | I'm ready!",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        利用規約
      </h1>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        ※本ページはドラフトです。公開前に法務レビューを受けてください。
      </p>

      <section className="mt-6 space-y-2">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
          1. サービスの内容
        </h2>
        <p>
          本サービスは、留学を検討している方向けのAIカウンセリング・チャットボットです。留学を勧めることをゴールとせず、「今は行かない」という選択も含めて中立的に検討をサポートします。
        </p>
      </section>

      <section className="mt-6 space-y-2">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
          2. 行わないこと
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>学費等の決済・預かりは行いません。</li>
          <li>
            特定のエージェント・学校を根拠なく強く勧めることはありません。
          </li>
          <li>
            学費・ビザ・為替など変動する情報について断定的な回答はしません。正確な最新情報は各機関で確認してください。
          </li>
        </ul>
      </section>

      <section className="mt-6 space-y-2">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
          3. 外部サービスの利用
        </h2>
        <p>
          本サービスは、応答生成のためAnthropic社のAPIを利用しています。また、学校周辺の地図・施設情報の表示にGoogle
          Maps Platform（Places API / Maps JavaScript API）を利用しています。Google
          Maps
          Platformの利用にあたっては、Googleの以下の規約・ポリシーが適用されます。
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <a
              href="https://cloud.google.com/maps-platform/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              Google Maps Platform 利用規約
            </a>
          </li>
          <li>
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              Google プライバシーポリシー
            </a>
          </li>
        </ul>
        <p>
          学校の口コミ・評価は、Googleマップ上の評価点・件数のみを表示し、当該情報へのリンクを提供します。レビュー本文は取得・表示していません。
        </p>
      </section>

      <section className="mt-6 space-y-2">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
          4. お問い合わせ
        </h2>
        <p>本規約に関するお問い合わせは運営者までご連絡ください。（連絡先は別途記載）</p>
      </section>
    </div>
  );
}
