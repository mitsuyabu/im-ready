-- ============================================================
-- 20260920_city_reference_data_transition
--
-- 【このmigrationの目的: 履歴の同期（history sync）】
--
-- 経緯:
--   1. `20260919` は当初 Numbeo 前提の `city_living_data` を作るmigrationで、Remote では
--      その版が applied として記録された。
--   2. その後 Numbeo 採用を撤回し、ローカルの `20260919` の**内容だけ**を現在の
--      `city_reference_data` / `city_reference_sources` 版へ差し替えた。
--      → migration history（Remote に記録された `20260919`）と、ファイルの内容にズレが発生。
--   3. Remote には Supabase SQL Editor から、現在の `city_reference_data` 版のSQLを**手動で適用済み**。
--      → DB実体は新しい都市リファレンス基盤になっているが、その「移行」が履歴に残っていない。
--
-- そこで `20260919` は書き換えず（Remote で applied のまま・repair もしない）、
-- 実際に Remote で起きた最終状態を **この `20260920` で追認**する。
--   `20260919` … 過去の Remote history と内容差分がある legacy marker
--   `20260920` … 現在の都市リファレンス基盤の状態スナップショット（この file）
--
-- 【適用方法（重要）】
--   Remote には既に実体があるため、`db push` で新規作成するのではなく、
--   `supabase migration repair 20260920 --status applied` で applied 扱いにして履歴を揃える。
--   （このSQL自体は下記のとおり冪等なので、万一 push されても失敗しない。）
--
-- 【冪等性について】
--   このfileは2つの理由で、何度実行しても安全な形で書いてある:
--     (a) Remote には既に同じ実体がある（手動適用済み）
--     (b) ローカルで `db reset` すると `20260919`（＝同じ内容）→ `20260920` の順に流れる
--   そのため create は `if not exists` / `create or replace` を使い、制約は存在確認してから
--   追加する。既に正しい状態なら、このmigrationは**何も変更しない**。
--
-- 【内容の出所】
--   `supabase/migrations/20260919_city_reference_data.sql` を source of truth として転記した。
--   Remote の実体に無いものを想像で追加していない（列・制約・index・RLS・grant・viewの定義は
--   すべて 20260919 と同一）。設計意図の詳細なコメントは 20260919 側にあるため、ここでは
--   重複させず要点だけを書く。
--
-- 【適用後の確認方法】
--   このmigrationは「実体があれば何もしない」ため、実体が本当に一致しているかは別途確認する。
--   確認用SQLは file 末尾のコメントに記載（Supabase SQL Editor で実行する）。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 都市リファレンス本体（1都市 × 1 category = 1行）
-- ------------------------------------------------------------
create table if not exists city_reference_data (
  id uuid primary key default gen_random_uuid(),
  city_key text not null,
  country_code text not null default 'AU',
  admin_area text,
  category text not null check (
    category in ('safety', 'housing', 'food', 'transport', 'utilities', 'everyday')
  ),
  summary text not null,
  notes text,
  details jsonb not null default '{}'::jsonb,
  reviewed_at date not null,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city_key, category)
);

-- ------------------------------------------------------------
-- 2. 出典（1つの entry に複数の出典が付く）
-- ------------------------------------------------------------
create table if not exists city_reference_sources (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references city_reference_data(id) on delete cascade,
  source_name text not null,
  source_url text not null,
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
  source_published_at date,
  source_updated_at date,
  note text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3. 制約（table が既に存在していた場合に備えて、無い場合だけ追加する）
--    create table 時に無名で宣言している制約は Postgres が自動命名するため、
--    ここでもその自動命名と同じ名前で存在を確認する。
-- ------------------------------------------------------------
do $$
begin
  -- 1都市 × 1 category につき1行（import SQL の on conflict が依存している）
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.city_reference_data'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (city_key, category)'
  ) then
    alter table city_reference_data
      add constraint city_reference_data_city_key_category_key unique (city_key, category);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.city_reference_data'::regclass
      and conname = 'city_reference_data_category_check'
  ) then
    alter table city_reference_data
      add constraint city_reference_data_category_check check (
        category in ('safety', 'housing', 'food', 'transport', 'utilities', 'everyday')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.city_reference_sources'::regclass
      and conname = 'city_reference_sources_source_type_check'
  ) then
    alter table city_reference_sources
      add constraint city_reference_sources_source_type_check check (
        source_type in (
          'government_statistics',
          'police',
          'government_information',
          'university',
          'transport_authority',
          'other'
        )
      );
  end if;

  -- entry が消えたら出典も消える（孤児の出典を残さない）
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.city_reference_sources'::regclass
      and contype = 'f'
      and pg_get_constraintdef(oid) like 'FOREIGN KEY (entry_id) REFERENCES city_reference_data(id)%'
  ) then
    alter table city_reference_sources
      add constraint city_reference_sources_entry_id_fkey
      foreign key (entry_id) references city_reference_data(id) on delete cascade;
  end if;
end $$;

-- ------------------------------------------------------------
-- 4. index
-- ------------------------------------------------------------
create index if not exists city_reference_data_city_key_idx on city_reference_data (city_key);
create index if not exists city_reference_data_category_idx on city_reference_data (category);
create index if not exists city_reference_sources_entry_id_idx on city_reference_sources (entry_id);

-- ------------------------------------------------------------
-- 5. base table は非公開
--    RLS を有効にし、policy は作らない（＝行が見えない）。加えて Supabase の default
--    privileges で付く table 権限自体も落とす（select も含めて全て）。
--    内部メモ（review_note）を REST API から読めないようにするための境界。
--    これらはいずれも冪等な文なので、そのまま再実行してよい。
-- ------------------------------------------------------------
alter table city_reference_data enable row level security;
alter table city_reference_sources enable row level security;

revoke all on city_reference_data from anon, authenticated;
revoke all on city_reference_sources from anon, authenticated;

-- ------------------------------------------------------------
-- 6. sanitized view（公開する読み取り経路）
--    security_invoker は false のままにする（view owner の権限で base table を読むため、
--    anon / authenticated に base table の権限が無くても view 経由の参照は成立する）。
--    列の構成は 20260919 と同一。review_note / created_at / updated_at は含めない。
--    `create or replace view` は列名・型・順序が同じであれば既存 view でも通る。
-- ------------------------------------------------------------
create or replace view city_reference_public as
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

create or replace view city_reference_sources_public as
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

-- view にも default privileges で全権限が付くため、まず全て落としてから select だけを与える。
-- 単一 table の view は自動更新可能なため書き込みを落とすのは必須。trigger も INSTEAD OF
-- トリガ経由の書き込み口になり得るため残さない。
revoke all on city_reference_public from anon, authenticated;
revoke all on city_reference_sources_public from anon, authenticated;

grant select on city_reference_public to anon, authenticated;
grant select on city_reference_sources_public to anon, authenticated;

-- ------------------------------------------------------------
-- 7. コメント（DB 上に意図を残す。冪等）
-- ------------------------------------------------------------
comment on table city_reference_data is
  '都市の公開情報を人間が確認して蓄積する汎用レイヤー（1都市×1category）。合成スコアは持たない。読み取りは city_reference_public 経由のみ。';
comment on table city_reference_sources is
  'city_reference_data の出典（1 entry に複数）。読み取りは city_reference_sources_public 経由のみ。';
comment on column city_reference_data.reviewed_at is
  'I''m ready! 側で最後に人間が内容を確認した日。Chat が古い情報を最新と断定しないために使う。';
comment on column city_reference_data.review_note is
  '確認時の内部メモ。公開 view には含めない。';
comment on view city_reference_public is
  'city_reference_data の sanitized view（内部メモを除く）。Chat・将来の City Guide / Media の読み取り経路。';
comment on view city_reference_sources_public is
  'city_reference_sources の sanitized view。';

-- ============================================================
-- 【適用後の確認用SQL】
-- このmigrationは「実体があれば何もしない」ため、Remote の実体が想定どおりかは
-- 以下を Supabase SQL Editor で実行して確認する（読み取りのみ）。
--
-- -- (1) table / view が4つ揃っているか
-- select table_name, table_type from information_schema.tables
-- where table_schema = 'public' and table_name like 'city_reference%'
-- order by table_name;
--   期待: city_reference_data(BASE TABLE) / city_reference_public(VIEW)
--         city_reference_sources(BASE TABLE) / city_reference_sources_public(VIEW)
--
-- -- (2) 列の構成（view に review_note / created_at / updated_at が無いこと）
-- select table_name, string_agg(column_name, ', ' order by ordinal_position)
-- from information_schema.columns
-- where table_schema = 'public' and table_name like 'city_reference%'
-- group by table_name order by table_name;
--
-- -- (3) RLS が有効で policy が0件であること
-- select c.relname, c.relrowsecurity,
--        (select count(*) from pg_policies p where p.tablename = c.relname) as policies
-- from pg_class c join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relname in ('city_reference_data','city_reference_sources');
--   期待: relrowsecurity = true / policies = 0（両方）
--
-- -- (4) 権限が「view の SELECT だけ」であること
-- select table_name, grantee, string_agg(privilege_type, '+' order by privilege_type)
-- from information_schema.role_table_grants
-- where table_name like 'city_reference%' and grantee in ('anon','authenticated')
-- group by table_name, grantee order by table_name, grantee;
--   期待: city_reference_public / city_reference_sources_public に対する anon・authenticated の
--         SELECT のみ（計4行）。base table の行が出てはいけない。
--
-- -- (5) view が owner 権限で動く（security_invoker が付いていない）こと
-- select c.relname, c.reloptions from pg_class c join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relname in ('city_reference_public','city_reference_sources_public');
--   期待: reloptions が null、または security_invoker=false を含む
--
-- -- (6) 制約と index
-- select conname, pg_get_constraintdef(oid) from pg_constraint
-- where conrelid in ('public.city_reference_data'::regclass, 'public.city_reference_sources'::regclass)
-- order by conname;
-- select indexname from pg_indexes where schemaname = 'public' and tablename like 'city_reference%'
-- order by indexname;
--
-- -- (7) 匿名キーで base table が読めないこと（アプリ側の境界確認）
-- --     REST API で確認する: /rest/v1/city_reference_data?select=* → 権限エラーになること
-- --                          /rest/v1/city_reference_public?select=city_key → 読めること
-- ============================================================
