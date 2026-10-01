-- ============================================================
-- visa_reference_data / visa_reference_sources
--
-- ビザ・法律・渡航手続きの情報を、**人間が公式ページを確認したうえで**category 単位に
-- 整理して持つレイヤー。Chat はビザについて聞かれたターンだけ、必要な category だけを読む。
--
-- 既存の都市リファレンス（20260919_city_reference_data.sql）と同じ設計方針:
--   1. base table は非公開（policy を作らず table 権限も全て落とす）。読み取りは sanitized view のみ
--   2. 内部メモ（review_note）は view に含めない
--   3. 出典は子 table に分け、1 entry に複数の出典を紐づけられる
--   4. reviewed_at を必須にし、古い情報を「最新」と断定させない材料にする
--   5. 外部 API の生レスポンスは保存しない（自動取得をしないため存在しない）
--
-- ビザ特有の方針:
--   - 制度は変動性が高いため reviewed_at を **not null** にする（都市側は category ごとだったが、
--     ビザは全 entry で必須）
--   - 数値の意味を Chat が誤解しないよう、重要な制度条件は summary（人間向けの短い説明）ではなく
--     details（構造化した事実）に持つ。例: 就労時間は単位（hours_per_fortnight）を必ず持たせる
--   - Department of Home Affairs が一次情報。自動取得はしない（公式サイトが 403 を返すため、
--     スクレイピング・ブラウザ自動化・回避策は作らない）。人間が確認して JSON へ入力する
--
-- user-owned データ（plans / plan_karte / plan_worksheet 等）の RLS には一切触れない。
-- ============================================================

create table visa_reference_data (
  id uuid primary key default gen_random_uuid(),
  -- 安定キー。国 + ビザ種別で一意（例: australia_student_500 / australia_working_holiday_417）。
  -- 417 と 462 を混同させないため、サブクラスまで含めてキーにする。
  visa_key text not null,
  -- サブクラス番号（'500' / '417' / '462'）。表示と照合に使う。
  visa_code text not null,
  -- 正式名称（例: 'Student visa (subclass 500)'）。
  visa_name text not null,
  country_code text not null default 'AU',
  -- 情報の種類。使う側が必要な category だけ取り出せるようにする。
  category text not null check (
    category in (
      'eligibility',
      'stay',
      'study_rights',
      'work_rights',
      'same_employer',
      'application',
      'documents',
      'costs',
      'processing',
      'second_third',
      'specified_work',
      'health_insurance',
      'financial_capacity',
      'genuine_student',
      'arrival_preparation'
    )
  ),
  -- 人間向けの短い説明（日本語）。数値の根拠としては details を使う。
  summary text not null,
  -- 構造化した事実。category ごとに必要な形を持てるようにし、単位を必ず添える。
  -- 例（work_rights）: { "limit": 48, "unit": "hours_per_fortnight", "during": "study_terms",
  --                      "exceptions": [{ "appliesTo": "...", "note": "..." }] }
  -- 例（costs）:       { "amount": 2500, "currency": "AUD", "basis": "from", "per": "application",
  --                      "effectiveFrom": "2026-07-01" }
  details jsonb not null default '{}'::jsonb,
  -- こちら側で最後に公式情報を人間確認した日（必須）。
  reviewed_at date not null,
  -- 内部メモ（何を確認したか・未確認の理由など）。**公開 view には出さない**。
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 1ビザ × 1 category につき1行（更新は upsert）。
  unique (visa_key, category)
);

create index visa_reference_data_visa_key_idx on visa_reference_data (visa_key);
create index visa_reference_data_category_idx on visa_reference_data (category);

-- ============================================================
-- 出典。1つの entry に複数の出典が付く（Home Affairs が一次、Study Australia 等が補助）。
-- ============================================================
create table visa_reference_sources (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references visa_reference_data(id) on delete cascade,
  source_name text not null,
  source_url text not null,
  -- 出典の性質。Chat が「Home Affairs の条件」と「補助的な案内」を同じ重みで語らないために使う。
  source_type text not null check (
    source_type in (
      'home_affairs',
      'study_australia',
      'fair_work',
      'ato',
      'education',
      'other_government'
    )
  ),
  -- 出典側の公表日 / 最終更新日。不明なら null（不明な日付を作らない）。
  source_published_at date,
  source_updated_at date,
  -- 人間がそのページを実際に開いて確認した日。
  accessed_at date,
  notes text,
  created_at timestamptz not null default now()
);

create index visa_reference_sources_entry_id_idx on visa_reference_sources (entry_id);

-- ============================================================
-- base table は非公開。policy を1つも作らず、table 権限も全て落とす。
-- 「どの列を出すか」はアプリの SELECT ではなく DB 側の view で保証する。
-- ============================================================
alter table visa_reference_data enable row level security;
alter table visa_reference_sources enable row level security;

revoke all on visa_reference_data from anon, authenticated;
revoke all on visa_reference_sources from anon, authenticated;

-- ============================================================
-- sanitized view。Chat（Server 側）と将来の公開ビザガイドはこの2つだけを読む。
--
-- view の権限セマンティクス（意図的にこの挙動に依存している）:
--   security_invoker を付けない view は view owner の権限で base table を読む。base table と
--   同じ migration で作るため owner も同じで、anon / authenticated が base table に権限を
--   持たなくても view 経由の参照は成立する。true にすると呼び出し元の権限で読もうとして
--   何も返らなくなるため false のままにする（PostgreSQL の既定は false だが明示する）。
-- ============================================================
create view visa_reference_public as
select
  id,
  visa_key,
  visa_code,
  visa_name,
  country_code,
  category,
  summary,
  details,
  reviewed_at
from visa_reference_data;

alter view visa_reference_public set (security_invoker = false);

create view visa_reference_sources_public as
select
  entry_id,
  source_name,
  source_url,
  source_type,
  source_published_at,
  source_updated_at,
  accessed_at
  -- notes（内部向けの補足）は公開しない
from visa_reference_sources;

alter view visa_reference_sources_public set (security_invoker = false);

-- default privileges で view にも全権限（truncate / trigger / references 含む）が付くため、
-- 全て落としてから select だけを与える。trigger は INSTEAD OF トリガ経由の書き込み口に
-- なり得るため残さない。
revoke all on visa_reference_public from anon, authenticated;
revoke all on visa_reference_sources_public from anon, authenticated;

grant select on visa_reference_public to anon, authenticated;
grant select on visa_reference_sources_public to anon, authenticated;

comment on table visa_reference_data is
  'ビザ情報を人間が公式確認して category 単位で持つレイヤー。読み取りは visa_reference_public 経由のみ。review_note は公開しない。';
comment on column visa_reference_data.details is
  '構造化した制度条件。数値には必ず単位を持たせる（例: unit=hours_per_fortnight）。summary から数値を推測させないための正本。';
comment on column visa_reference_data.reviewed_at is
  '公式情報を人間が最後に確認した日。ビザは変動するため必須。古い場合は Chat へ再確認推奨を添える。';
