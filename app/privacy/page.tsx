export const metadata = {
  title: "プライバシーポリシー | I'm ready!",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        プライバシーポリシー
      </h1>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        ※本ページはドラフトです。公開前に法務レビューを受けてください。
      </p>

      <section className="mt-6 space-y-2">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
          1. 取得する情報
        </h2>
        <p>
          本サービスは、チャットでの入力内容、および対話から抽出される留学カウンセリング用の構造化データ（カルテ）を取り扱います。これらは応答生成のためAnthropic社のAPIに送信されます。個人を特定する情報の入力は必要な範囲にとどめるようご案内しています。
        </p>
      </section>

      <section className="mt-6 space-y-2">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
          2. Google Maps Platform の利用
        </h2>
        <p>
          学校周辺の地図・店舗・交通・評価情報の表示のため、Google Maps
          Platform（Places API / Maps JavaScript API）を利用しています。地図や周辺情報を表示する際、入力した住所や表示位置に関する情報がGoogleに送信されます。取り扱いについては
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            Googleプライバシーポリシー
          </a>
          をご確認ください。
        </p>
        <p>
          本サービスは、Places
          APIから取得した学校名・評価・写真等のコンテンツ本文をサーバーやデータベースに保存・キャッシュしません。保存するのは学校を一意に識別するための
          Place ID（および地図表示に使う場合の緯度経度）のみで、それ以外の内容は表示のたびにGoogleから取得します。
        </p>
      </section>

      <section className="mt-6 space-y-2">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
          3. 行わないこと
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>口コミ・レビューの本文の取得・保存・表示は行いません（評価点・件数・Googleマップへのリンクのみ表示）。</li>
          <li>Placesの情報から治安・犯罪の指標を推定・表示することはありません。</li>
          <li>第三者のスクレイピングAPIは利用していません。</li>
        </ul>
      </section>

      <section className="mt-6 space-y-2">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
          4. お問い合わせ
        </h2>
        <p>
          本ポリシーに関するお問い合わせは運営者までご連絡ください。（連絡先は別途記載）
        </p>
      </section>
    </div>
  );
}
