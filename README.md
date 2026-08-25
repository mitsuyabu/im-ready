# 留学カウンセリングAI チャットボット

留学を検討している日本語ユーザー向けの、AIカウンセリング・チャットボットです。
単なるFAQボットではなく、対話を通じてユーザーの目的・潜在ニーズを引き出し、構造化された「カルテ」を裏で自動生成します。

- **中立性を重視**: 留学を勧めることをゴールにせず、「今は行かない」という選択も一緒に検討します。
- **お金は預かりません**: 学費等の決済・預かりは行いません。
- **HPへの埋め込み**を前提に設計されています（詳細は後述）。

詳細仕様は [`docs/SPEC.md`](docs/SPEC.md) を参照してください。

---

## 技術スタック

- Next.js（App Router）+ TypeScript
- Tailwind CSS
- Anthropic API（`@anthropic-ai/sdk`）

---

## セットアップ

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.example` を `.env.local` にコピーし、Anthropic Console で発行したAPIキーを設定してください。

```bash
cp .env.example .env.local
```

```env
# .env.local
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxx

# 使用モデル（任意。未指定なら既定で claude-opus-4-8 を使用）
ANTHROPIC_MODEL=
```

`.env.local` は `.gitignore` 対象です。本物のAPIキーは `.env.local` にのみ書き、`.env.example` には絶対に書かないでください。

### 3. 開発サーバーの起動

```bash
npm run dev
```

- チャット単体の画面: [http://localhost:3000/widget](http://localhost:3000/widget)
- トップページ（`/`）は現時点ではプレースホルダーです。

開発モード（`NODE_ENV !== "production"`）では、チャット画面内に「開発用: カルテを表示」という折りたたみパネルが表示され、裏で更新されているカルテ（構造化データ）の中身をリアルタイムに確認できます。

---

## ディレクトリ構成

```
/app
  page.tsx                … トップページ（プレースホルダー、規約リンクあり）
  /widget/page.tsx         … 埋め込み用チャット画面（本体）
  /terms/page.tsx          … 利用規約
  /privacy/page.tsx        … プライバシーポリシー
  /api/chat/route.ts       … Anthropicへのストリーミング応答
  /api/karte/route.ts      … カルテ（構造化データ）の差分抽出
  /api/places/details/route.ts … Place Details (New) のサーバー側プロキシ（結果は保存しない）
  /api/places/nearby/route.ts  … Nearby Search (New) のサーバー側プロキシ（結果は保存しない）
  /api/places/photo/route.ts   … Place Photo (New) のサーバー側プロキシ（画像は保存しない）
/components
  Chat.tsx                 … チャット本体（ストリーミング表示・送信中表示・エラー処理）
  Message.tsx              … 発言バブル
  KarteSummary.tsx          … 会話の区切りで表示するカルテ要約・確認UI
  KarteDebugPanel.tsx        … 開発用のカルテ生データ表示パネル
  EmbedCloseButton.tsx       … 埋め込み（iframe）時のみ表示される閉じるボタン
  GoogleAttribution.tsx      … Google Places/Maps 利用時の帰属表示（共通）
  PlaceRatingBadge.tsx       … 評価点+件数+Googleマップへのリンクのみの口コミ表示
  SchoolMap.tsx              … Maps JavaScript APIでの地図表示
  AddressAutocomplete.tsx    … Autocomplete (New) を使った住所入力補完
/lib
  anthropic.ts             … Anthropicクライアント初期化・モデル設定
  prompt.ts                … システムプロンプト・update_karteツール定義
  karte.ts                 … カルテの型・差分マージ
  chat.ts                  … チャットメッセージの型・共通バリデーション
  knowledge.ts              … 知識ベース本文の生成（data/cities.ts から文章を組み立てる。数値は直書きしない）
  googlePlaces.ts            … サーバー側 Places API 共有ヘルパー（サーバー専用キーのみ使用）
  googleMapsBrowserLoader.ts … ブラウザ側 Maps JS API 共有ローダー（ブラウザ用キーのみ使用）
  data/cities.ts             … 都市別 生活費データ（構造化データの唯一の出所）
  data/schools.ts             … 学校データ（country/city/name/address + placeId等。Places本文は持たない）
/scripts
  resolve-place-ids.ts       … 【開発時ローカル実行専用】schools.ts の name+address から
                                 placeId/lat/lngを解決し書き戻す。DB・Admin APIは無い。
/public
  embed.js                … HP設置用ローダースクリプト
/embed-test
  index.html               … 埋め込み動作確認用の簡易HTML（別ドメイン想定）
```

---

## 知識ベースの生活費データ（運用ルール）

システムプロンプトに埋め込まれる都市別の生活費（家賃・食費・交通費など）は、[`lib/data/cities.ts`](lib/data/cities.ts) が唯一の数値の出所です。[`lib/knowledge.ts`](lib/knowledge.ts) はこのデータから説明文を生成するだけで、数値を直書きしません。

### 数値を更新するとき

1. `lib/data/cities.ts` の該当レコード（`AUSTRALIA_CITIES` の1要素）を編集する。
2. `source` / `sourceUrl` を実際に数値を取得した出所に更新する。
3. `fetchedAt`（取得日）を更新する。
4. 一次情報（政府・州政府・大学等の公式サイト）から直接取得できた場合は `confidence: "official"`、そこに到達できず二次情報源に頼った場合は `confidence: "secondary"` とし、`notes` にその旨を書く。`secondary` のレコードは次回更新時に一次情報での再確認を優先すること。

DBは使わず、このファイルへの直接編集のみで完結する（このリポジトリにDBは無い）。

### データソースに関する制約（必ず守ること）

**Numbeo のデータは、スクレイピングはもちろん、手入力で転記した数値であっても使用しないこと。** Numbeo は利用規約上、データの商用利用をデータライセンス契約者に限定しており、この制限は「手入力かどうか」とは関係なく、値そのものに対してかかる。このボットは商用サービスであるため、Numbeo由来の数値を使うと利用規約違反になる。

数値を入力してよい出所は次のいずれかのみ：

- **(a) 公的統計・公式サイトの自前監修データ**: 各国政府・州政府・大学等が公開している数値（例: オーストラリア内務省の学生ビザ資金要件、州政府の留学生向け公式サイト、大学公式サイトの生活費ガイド、各国統計局の賃金統計など）。
- **(b) Numbeo の API / Data License を契約して得た数値**: 契約範囲内であれば使用可能。契約していない場合は (a) のみを使うこと。

これはコードでは強制できないため、データを追加・更新する人が上記ルールを守る運用上の約束事とする。

---

## 学校データと Google Places / Maps 連携

### 大原則

**Google Places のコンテンツ（学校名・評価・評価数・写真・周辺情報・営業時間など）は、DBにもファイルにも保存・キャッシュしない。** 保存してよいのは `placeId`（と、地図表示に使う場合のみ座標）だけで、それ以外の本文は表示のたびに実行時にPlaces APIから取得する。このリポジトリにDBは無いため、`placeId` は [`lib/data/schools.ts`](lib/data/schools.ts) の構造化データに持たせている。

### 構成

1. **`lib/data/schools.ts`**: 学校ごとの `country` / `city` / `name` / `address` / `placeId?` / `lat?` / `lng?` / `placeIdRefreshedAt?`。ホームステイ型（教師の自宅に滞在するスタイル）等、固定キャンパスが無い学校は `address` を持たず、`placeId` 解決の対象外とする。
2. **`scripts/resolve-place-ids.ts`**（開発時にローカル実行するスクリプトのみ。管理APIやDBは無い）: `schools.ts` の `name + address` を Places API (New) Text Search で解決し、`placeId` / `lat` / `lng` / `placeIdRefreshedAt` を `schools.ts` に書き戻す。`placeIdRefreshedAt` が12か月を超えた、または未設定のレコードのみが対象。
   ```bash
   GOOGLE_MAPS_SERVER_KEY=xxx npm run resolve-place-ids -- --dry-run
   GOOGLE_MAPS_SERVER_KEY=xxx npm run resolve-place-ids
   ```
3. **実行時プロキシ（サーバー側、`app/api/places/*`）**: 提案フェーズ（学校を提示する瞬間）でのみ呼ぶ想定で、毎メッセージでは呼ばない。結果は一切保存しない。
   - `GET /api/places/details?placeId=...` … Place Details (New)。`fieldMask` は `displayName, rating, userRatingCount, googleMapsUri, location, regularOpeningHours, photos` のみ。**`reviews` は含めない。**
   - `POST /api/places/nearby` … Nearby Search (New)。学校の `lat/lng` を中心に、`category`（`shop` / `transit` / `activity`）で周辺情報を出し分け。
   - `GET /api/places/photo?name=...` … Place Photo (New)。画像は保存せず、Googleが発行する一時URLへリダイレクトするだけ（サーバーキーはクライアントに渡らない）。
4. **フロント（`components/`）**:
   - `AddressAutocomplete.tsx` … Autocomplete (New)（`PlaceAutocompleteElement`）。ブラウザ用キー（リファラ制限）+ セッショントークンで課金。
   - `SchoolMap.tsx` … Maps JavaScript APIで地図を描画。Places結果を地図に重ねる場合は必ずこの地図上に表示すること。
   - `PlaceRatingBadge.tsx` … 口コミは評価点+件数+Googleマップへのリンクのみ表示（例「★4.3（1,240件）」→タップでGoogleマップ）。レビュー本文は扱わない。
   - `GoogleAttribution.tsx` … 地図あり/なしに応じた帰属表示の共通コンポーネント。

### やらないこと（必ず守る）

- Placesのコンテンツ本文（名前・評価・写真・周辺情報・営業時間等）を保存・キャッシュしない。保存するのは `placeId`（と使う場合のみ座標）のみ。
- レビュー本文は取得・保存・表示しない。評価点・件数・Googleマップへのリンクのみを表示する。
- Placesのデータから治安・犯罪の指標を推定・表示しない（治安情報は別の監修ソースを使う）。
- 第三者のスクレイピングAPIは使わない。Google Business Profile APIは自社所有ロケーション限定のため、学校紹介の用途には使えない。

### 環境変数とキーの分離

- `GOOGLE_MAPS_SERVER_KEY`（サーバー専用）: `scripts/resolve-place-ids.ts` と `app/api/places/*` からのみ使用。クライアントに渡さない。IP制限等を推奨。
- `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`（ブラウザ用）: `AddressAutocomplete` / `SchoolMap`（Maps JavaScript API / Autocomplete）からのみ使用。**必ずHTTPリファラ制限をかけること。**

---

## HPへの埋め込み方法

このボットは、留学エージェントや語学学校のHPに **scriptタグ1行** で設置できるウィジェットとして作られています。

### 設置方法

設置したいHPの `<body>` 内に、以下の1行を追加するだけです。

```html
<script src="https://<デプロイ先のドメイン>/embed.js" data-key="TENANT_KEY" async></script>
```

- `src` には、このアプリをデプロイしたドメインの `/embed.js` を指定します。
- `data-key` には、設置元（エージェント・学校）を識別するための任意の文字列を指定します（将来のマルチテナント対応の土台。現時点では値を保持するのみです）。

設置すると、ページ右下にチャット起動ボタンが表示されます。クリックすると `/widget` を読み込んだチャットパネルが開閉します。

### ローカルでの埋め込みテスト

`npm run dev` で開発サーバーを起動した状態で、`embed-test/index.html` をブラウザで直接開いてください（`file://` で開いてOKです）。このファイルはNext.jsアプリの外にある、別ドメインのHPを想定した簡易HTMLです。

```html
<!-- embed-test/index.html 内 -->
<script src="http://localhost:3000/embed.js" data-key="test-agent-001" async></script>
```

右下にチャット起動ボタンが表示されれば、埋め込みは成功しています。

### 技術的な補足

- `/widget` は他ドメインからのiframe埋め込みを前提に `Content-Security-Policy: frame-ancestors *;` を付与しています（`next.config.ts`）。本番運用時は、許可するホスト名を列挙するなど絞り込みを検討してください。
- iframeと親ページ（埋め込み先HP）間は `postMessage` で最小限の通信（開閉）を行っています。

---

## 制約・注意事項

- 学費等の決済・預かりは実装していません（今後も実装しない前提です）。
- 会話ログや収集した情報には機微な内容が含まれ得ます。取り扱いには注意してください。
- 学費・ビザ・為替など変動する情報について、AIは断定的な回答をしないよう設計されています。
- Google Placesのコンテンツ本文は保存・キャッシュしません（詳細は「学校データと Google Places / Maps 連携」参照）。
