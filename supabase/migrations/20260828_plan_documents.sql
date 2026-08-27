-- ============================================================
-- plan_documents
-- Documents機能の土台（Step 1）。生成・編集フローはまだ無いため、
-- このmigrationではテーブルとRLSのみを用意する。
--
-- type は将来追加予定の5種類をCHECK constraintで許可するが、
-- 実際に生成できるDocument typeは今回まだ無い（アプリ側からの
-- insertはまだ発生しない）。Postgres native enumは使わず、
-- chat_messages.role と同じ「text + CHECK」パターンに揃える
-- （型追加のたびのALTER TYPEを避けるため）。
--
-- updated_at は plan_karte と同様、汎用のupdate_updated_atトリガーは
-- 意図的に付けない。DBに共通trigger基盤がまだ無く、Documentの
-- 生成/編集フロー（未実装）が持つべき責務のため、そちら側で
-- 明示的に設定する方針とする。
--
-- 1 Plan = 1 type = 1行（unique制約）。再生成は将来的にupsertで
-- 上書きする想定（version履歴は今回の設計に含めない）。
-- ============================================================
create table plan_documents (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  type text not null check (
    type in ('parent_explanation', 'my_note', 'study_plan', 'agent_summary', 'school_comparison')
  ),
  title text not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, type)
);

alter table plan_documents enable row level security;

create policy "plan_documents_select_own" on plan_documents for select
  using (exists (select 1 from plans where plans.id = plan_documents.plan_id and plans.user_id = auth.uid()));

create policy "plan_documents_insert_own" on plan_documents for insert
  with check (exists (select 1 from plans where plans.id = plan_documents.plan_id and plans.user_id = auth.uid()));

create policy "plan_documents_update_own" on plan_documents for update
  using (exists (select 1 from plans where plans.id = plan_documents.plan_id and plans.user_id = auth.uid()))
  with check (exists (select 1 from plans where plans.id = plan_documents.plan_id and plans.user_id = auth.uid()));

create policy "plan_documents_delete_own" on plan_documents for delete
  using (exists (select 1 from plans where plans.id = plan_documents.plan_id and plans.user_id = auth.uid()));
