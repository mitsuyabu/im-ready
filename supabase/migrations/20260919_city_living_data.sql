-- ============================================================
-- city_living_data
-- 都市の「治安の体感」「生活費の水準」を表す**外部データ**の保存先。
-- Chat が都市について聞かれたときだけ参照し、将来の City Guide / Media でも同じ行を使う。
--
-- これまでの都市データ（lib/data/cities.ts）との違い:
--   - cities.ts … 公的情報ベースの「実額（A$/週 等）」。コードに直接持つ編集済みデータ。
--   - この table … 外部ソース（まずは Numbeo）の「指数・体感値」。定期同期で更新し、取得日時を持つ。
--   両者は役割が違うため置き換えない。実額は cities.ts、都市間の相対比較はこちらを使う。
--
-- 設計方針:
--   1. 外部データであってユーザー本人の情報ではないため、plans / plan_karte とは完全に分離する
--      （Karte へ stated fact として書かない、という方針の DB 側の担保）。
--   2. public information なので誰でも読める（anon / authenticated に select を許可）。
--      ただし **書き込みは誰にも許可しない**（policy を作らない ＋ 明示的に revoke）。
--      更新は scripts/sync-city-living-data.ts が生成する SQL を運用者が適用する。
--   3. Chat が毎ターン使う代表値だけ column にし、項目数が多い・構造が変わり得るもの
--      （price 一覧・取得した生レスポンス）は jsonb に入れる。
--   4. source を持ち、将来 government / police / transport 等を足せるようにする
--      （1 都市 × 複数 source を並べられるよう unique は (city_key, source)）。
--   5. country_code を持ち、将来オーストラリア以外を足せるようにする。
-- ============================================================

create table city_living_data (
  id uuid primary key default gen_random_uuid(),
  -- lib/planCover.ts の PlanCoverKey と同じ値（sydney / melbourne / brisbane / goldcoast /
  -- cairns / perth）。都市名の表記揺れの吸収は既存の resolvePlanCoverKey に任せ、
  -- ここには正規化済みの key だけを入れる（新しい都市辞書を作らない）。
  city_key text not null,
  country_code text not null default 'AU',
  -- 'numbeo' 等。将来の公的データソース追加を想定して固定 enum にはしない。
  source text not null,

  -- ---- 治安（体感の指標。公的犯罪統計ではない） ----
  -- Numbeo /api/city_crime の index_safety / index_crime に対応。0〜100。
  safety_index numeric,
  crime_index numeric,
  -- safe_alone_daylight / safe_alone_night（昼・夜に一人で歩く安全感）
  safe_alone_daylight numeric,
  safe_alone_night numeric,
  -- worried_mugged_robbed / worried_home_broken（強盗・空き巣への不安）
  worried_mugged_robbed numeric,
  worried_home_broken numeric,

  -- ---- 生活費（他都市との相対比較に使う指数） ----
  -- Numbeo /api/indices。cpi_index は家賃を含まない生活費、cpi_and_rent_index は家賃込み。
  -- （Numbeo の API に cost_of_living_index という名前の field は無いため、実際の field 名に合わせる）
  cost_index numeric,
  cost_and_rent_index numeric,
  rent_index numeric,
  groceries_index numeric,
  restaurant_price_index numeric,

  -- ---- 代表的な実額（/api/city_prices から、使う項目だけ正規化して保存） ----
  -- 形: { "<slug>": { "itemId": 1, "label": "...", "average": 0, "low": 0, "high": 0, "dataPoints": 0 } }
  -- 項目は増減し得るため column 化せず jsonb。currency は行単位で持つ。
  prices jsonb not null default '{}'::jsonb,
  currency text,

  -- ---- 取得メタデータ ----
  -- 回答者数（データの厚み）。少ない都市では値の揺れが大きいため、Chat 側の注意喚起に使う。
  contributors integer,
  crime_contributors integer,
  -- 外部ソース側の更新時点（Numbeo は yearLastUpdate / monthLastUpdate を返すので月初日として保存）。
  source_updated_at date,
  -- こちらが取得した時刻。Chat が「最新」と断定しないための判断材料。
  fetched_at timestamptz not null default now(),
  -- 監査用の生レスポンス（正規化で落ちた値を後から確認できるようにする）。クライアントへは返さない。
  raw jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 同じ都市・同じ source は 1 行だけ（同期は upsert）。
  unique (city_key, source)
);

create index city_living_data_city_key_idx on city_living_data (city_key);

alter table city_living_data enable row level security;

-- 公開情報なので読み取りは誰でも可（ログイン前の City Guide / Media でも同じ行を使えるようにする）。
-- Chat は Server 側（anon key + 既存 Server client）からこの policy 経由で読む。
create policy "city_living_data_public_read" on city_living_data for select using (true);

-- 書き込み policy は作らない。RLS 有効 ＋ policy 無しなので insert / update / delete は誰も通らないが、
-- Supabase の default privileges で付く table 権限自体も落としておく（二重の防御）。
revoke insert, update, delete on city_living_data from anon, authenticated;
