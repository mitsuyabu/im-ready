-- ============================================================
-- profiles
-- ユーザー本人の、Plan をまたいで共通する基本プロフィール。
-- plan_karte が plan_id を主キーにするのと同じ発想で user_id を主キーにする
-- （1 user = 1 profile 行）。Plan / Karte 側の情報（希望都市・時期・予算・学校条件・
-- 留学目的・不安・判断軸など）はここに入れない（役割を分ける）。
--
-- gender / english_level / study_abroad_experience は Postgres native enum を使わず、
-- 既存の chat_messages.role / plan_documents.type と同じ「text + CHECK」パターンに揃える。
-- 未回答は NULL（空文字は入れない）。
--
-- updated_at は plan_karte / plan_documents と同様、汎用の update_updated_at トリガーは
-- 付けない。アプリ側（upsert 時）で明示的に now() を入れる。
-- ============================================================
create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  birth_date date,
  gender text check (gender in ('male', 'female', 'other', 'prefer_not_to_say')),
  residence text,
  occupation text,
  english_level text check (english_level in ('beginner', 'elementary', 'intermediate', 'advanced')),
  study_abroad_experience text check (
    study_abroad_experience in ('none', 'short_term', 'long_term', 'working_holiday', 'other')
  ),
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- 本人（auth.uid() = user_id）のみ SELECT / INSERT / UPDATE 可能。
-- 他ユーザーの profile は一切読めない。service role は使わない。
create policy "profiles_select_own" on profiles for select
  using (auth.uid() = user_id);

create policy "profiles_insert_own" on profiles for insert
  with check (auth.uid() = user_id);

create policy "profiles_update_own" on profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- DELETE policy は意図的に作らない（profile 削除はアカウント削除の一部。別タスク）。
-- RLS 有効かつ該当 policy 無しのため DELETE は常に拒否される。

-- ============================================================
-- avatars bucket（private）
-- プロフィール画像専用。public read はしない（§26: 本人のみ閲覧）。読み取りは
-- authenticated 本人のみ許可し、表示は署名付き URL（createSignedUrl）で行う。
--
-- path 規約: {user_id}/avatar.<ext>
--   先頭セグメント（storage.foldername(name))[1]）が所有者の user_id であることを
--   すべての policy で必須にする。これにより他ユーザーの avatar を
--   upload / update / delete できない（user_id spoof 不可）。
--
-- file_size_limit = 5MB、allowed_mime_types = JPEG/PNG/WebP を bucket 自体にも設定
-- （クライアント側 validation と二重防御）。
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "avatars_read_own" on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_insert_own" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_update_own" on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_delete_own" on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
