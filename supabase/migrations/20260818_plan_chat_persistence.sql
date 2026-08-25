-- ============================================================
-- plan_karte
-- updated_at は論理時刻（karte.meta.updatedAt）として使うため、
-- 汎用の update_updated_at トリガーは意図的に付けない。
-- ============================================================
create table plan_karte (
  plan_id uuid primary key references plans(id) on delete cascade,
  karte jsonb not null,
  updated_at timestamptz not null default now()
);

alter table plan_karte enable row level security;

create policy "plan_karte_select_own" on plan_karte for select
  using (exists (select 1 from plans where plans.id = plan_karte.plan_id and plans.user_id = auth.uid()));

create policy "plan_karte_insert_own" on plan_karte for insert
  with check (exists (select 1 from plans where plans.id = plan_karte.plan_id and plans.user_id = auth.uid()));

create policy "plan_karte_update_own" on plan_karte for update
  using (exists (select 1 from plans where plans.id = plan_karte.plan_id and plans.user_id = auth.uid()))
  with check (exists (select 1 from plans where plans.id = plan_karte.plan_id and plans.user_id = auth.uid()));

-- 論理時刻(karte.meta.updatedAt)より古い書き込みは黙って無視する（競合する非同期保存の解決）
create or replace function save_plan_karte(p_plan_id uuid, p_karte jsonb, p_updated_at timestamptz)
returns void
language sql
security invoker
as $$
  insert into plan_karte (plan_id, karte, updated_at)
  values (p_plan_id, p_karte, p_updated_at)
  on conflict (plan_id) do update
    set karte = excluded.karte, updated_at = excluded.updated_at
    where plan_karte.updated_at < excluded.updated_at;
$$;

grant execute on function save_plan_karte(uuid, jsonb, timestamptz) to authenticated;

-- ============================================================
-- chat_sessions
-- user_id は持たない。所有者は plan_id -> plans.user_id で判定する。
-- ============================================================
create table chat_sessions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  is_main boolean not null default false,
  created_at timestamptz not null default now()
);

-- 1 Planにつき is_main=true の行は高々1件（部分UNIQUE INDEX）
create unique index chat_sessions_one_main_per_plan
  on chat_sessions (plan_id)
  where is_main;

alter table chat_sessions enable row level security;

create policy "chat_sessions_select_own" on chat_sessions for select
  using (exists (select 1 from plans where plans.id = chat_sessions.plan_id and plans.user_id = auth.uid()));

create policy "chat_sessions_insert_own" on chat_sessions for insert
  with check (exists (select 1 from plans where plans.id = chat_sessions.plan_id and plans.user_id = auth.uid()));

-- ============================================================
-- chat_messages
-- 順序は created_at(DB now) + id(identity) のみで確定する（sequence列は追加しない）。
-- proposal_data は学校提案メッセージのときだけ ProposalMessageData を、通常メッセージは null を持つ。
-- ============================================================
create table chat_messages (
  id bigint generated always as identity primary key,
  session_id uuid not null references chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  proposal_data jsonb,
  created_at timestamptz not null default now()
);

alter table chat_messages enable row level security;

create policy "chat_messages_select_own" on chat_messages for select
  using (exists (
    select 1 from chat_sessions join plans on plans.id = chat_sessions.plan_id
    where chat_sessions.id = chat_messages.session_id and plans.user_id = auth.uid()
  ));

create policy "chat_messages_insert_own" on chat_messages for insert
  with check (exists (
    select 1 from chat_sessions join plans on plans.id = chat_sessions.plan_id
    where chat_sessions.id = chat_messages.session_id and plans.user_id = auth.uid()
  ));

-- 復元クエリ（参考）
-- select role, content, proposal_data from chat_messages
-- where session_id = $1 order by created_at asc, id asc;
