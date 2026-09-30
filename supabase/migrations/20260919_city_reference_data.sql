-- ============================================================
-- city_reference_data / city_reference_sources
--
-- 都市に関する**公開情報を、人間が確認したうえで**留学・ワーホリ向けに整理して持つ汎用レイヤー。
-- Chat だけでなく、将来の I'm ready! Guide / City Guide / 都市比較 / My Plan 周辺情報からも
-- 同じ行を使う（Chat 専用の構造にしない）。
--
-- 前提と方針:
--   1. **独自スコアを作らない**。「Safety Index」「生活費指数」のような単一の合成指標は持たない。
--      治安は safety、生活費は housing / food / transport / utilities / everyday に分け、
--      それぞれ「短い要約 + 出典」として持つ（category 単位で取り出せる形にする）。
--   2. **出典の追跡を最優先**する。1つの category に複数の出典が付く（例: 治安は州警察と
--      犯罪統計機関、生活費は ABS と大学の student cost guide）ため、出典は子 table に分ける。
--   3. **外部 API の生レスポンスは保存しない**（自動取得をしないため、そもそも存在しない）。
--      保存するのは確認済みの要約・代表値・出典メタデータだけ。
--   4. **reviewed_at（こちらが最後に人間で確認した日）を必須**にする。Chat が古い情報を
--      「最新」と断定しないための判断材料。source 側の更新日が不明なら null のままにする
--      （不明な日付を作らない）。
--   5. base table は非公開。読み取りは sanitized view 経由だけにする（内部メモを公開しない）。
--   6. 将来の他国・他都市、他 category（weather / healthcare / visa 関連の都市事実など）を
--      追加できる形にする。city_key は将来の Media の city taxonomy と共有する想定。
--
-- user-owned データ（plans / plan_karte / plan_worksheet / plan_consultation_sheet 等）の
-- RLS には一切触れない。
-- ============================================================

create table city_reference_data (
  id uuid primary key default gen_random_uuid(),
  -- lib/planCover.ts の PlanCoverKey と同じ値（sydney / melbourne / brisbane / goldcoast /
  -- cairns / perth）。表記揺れの吸収は既存の resolvePlanCoverKey に任せ、ここには正規化済みの
  -- key だけを入れる（都市辞書を二重に持たない）。
  city_key text not null,
  country_code text not null default 'AU',
  -- 州・準州（'NSW' / 'VIC' / 'QLD' / 'WA' 等）。犯罪統計は州ごとに集計方法・定義・公表期間が
  -- 違うため、**州をまたぐ単純比較をさせない**判断に使う。
  admin_area text,
  -- 情報の種類。生活費を単一の指数へ統合せず、使う側が必要な category だけ取り出せるようにする。
  category text not null check (
    category in ('safety', 'housing', 'food', 'transport', 'utilities', 'everyday')
  ),
  -- 留学生・ワーホリ利用者向けの短い要約（日本語）。人間が出典を確認して登録する。
  summary text not null,
  -- 補足（地域差・夜間の注意・観光地特有の注意など）。無ければ null。
  notes text,
  -- 代表値や出典ごとの estimate を構造化して持つ。出典ごとに前提が違うため**平均しない**。
  -- 形の例: { "estimates": [{ "sourceName": "...", "label": "...", "min": 0, "max": 0,
  --           "currency": "AUD", "period": "week", "basis": "..." }] }
  details jsonb not null default '{}'::jsonb,
  -- こちら側で最後に内容を人間確認した日（必須）。
  reviewed_at date not null,
  -- 確認時の内部メモ（何を確認したか・次回見るべき点）。**公開 view には出さない**。
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 1都市 × 1 category につき1行（更新は upsert）。
  unique (city_key, category)
);

create index city_reference_data_city_key_idx on city_reference_data (city_key);
create index city_reference_data_category_idx on city_reference_data (category);

-- ============================================================
-- 出典。1つの entry に複数の出典が付く（§9）。
-- ============================================================
create table city_reference_sources (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references city_reference_data(id) on delete cascade,
  source_name text not null,
  source_url text not null,
  -- 出典の性質。公的統計・警察・政府情報・大学・交通事業者を区別できるようにする
  -- （Chat 側で「公的な犯罪統計」と「大学の試算」を同じ重みで語らせないため）。
  source_type text not null check (
    source_type in (
      'government_statistics',
      'police',
      'government_information',
      'university',
      'transport_authority',
      'other'
    )
  ),
  -- 出典側の公表日 / 最終更新日。不明なら null（不明な日付を作らない）。
  source_published_at date,
  source_updated_at date,
  -- 参照した範囲・注意点（例: 「州全体の値」「2024-25年次報告」）。
  note text,
  created_at timestamptz not null default now()
);

create index city_reference_sources_entry_id_idx on city_reference_sources (entry_id);

-- ============================================================
-- base table は非公開（policy を作らず、table 権限も全て落とす）。
-- 都市情報自体は公開情報だが、review_note のような内部メモを REST API から読めるようにしない。
-- 「どの列を出すか」はアプリの SELECT ではなく DB 側の view で保証する。
-- ============================================================
alter table city_reference_data enable row level security;
alter table city_reference_sources enable row level security;

revoke all on city_reference_data from anon, authenticated;
revoke all on city_reference_sources from anon, authenticated;

-- ============================================================
-- sanitized view。Chat・将来の City Guide / Media はこの2つだけを読む。
--
-- view の権限セマンティクス（意図的にこの挙動に依存している）:
--   security_invoker を付けない view は **view owner の権限で** base table を読む。
--   base table と同じ migration で作るため owner も同じで、anon / authenticated が base table に
--   権限を持たなくても view 経由の参照は成立する。base table の RLS も owner として評価される
--   （この table にユーザーごとの行は無く、全行が公開対象なので意図どおり）。
--   security_invoker を true にすると呼び出し元の権限で base table を読もうとして anon からは
--   何も返らなくなるため、false のままにしなければならない。PostgreSQL の既定は false だが、
--   将来の既定変更・誤編集を防ぐため明示する。Supabase のリンタはこの形を
--   security_definer_view として警告するが、公開する列を絞ることが目的なのでそれが意図どおり。
-- ============================================================
create view city_reference_public as
select
  id,
  city_key,
  country_code,
  admin_area,
  category,
  summary,
  notes,
  details,
  reviewed_at
from city_reference_data;

alter view city_reference_public set (security_invoker = false);

create view city_reference_sources_public as
select
  entry_id,
  source_name,
  source_url,
  source_type,
  source_published_at,
  source_updated_at,
  note
from city_reference_sources;

alter view city_reference_sources_public set (security_invoker = false);

-- Supabase の default privileges は view にも全権限（insert/update/delete のほか
-- truncate / trigger / references）を付けるため、まず全て落としてから select だけを与える。
-- 単一 table の view は自動更新可能なため書き込みを落とすのは必須。trigger も INSTEAD OF
-- トリガ経由の書き込み口になり得るため残さない。
revoke all on city_reference_public from anon, authenticated;
revoke all on city_reference_sources_public from anon, authenticated;

grant select on city_reference_public to anon, authenticated;
grant select on city_reference_sources_public to anon, authenticated;
