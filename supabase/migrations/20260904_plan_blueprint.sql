-- ============================================================
-- plan_blueprint
-- My Plan 再設計の保存基盤（Step 2-1）。Karte（Chat / Worksheet から蓄積される
-- AI / system の shared understanding）とは別に、ユーザー自身が採用した
-- 「編集可能な留学・ワーホリの実行計画」を 1 Plan = 1 行で保持する。
--
--   data     : BlueprintData（goals / destinations / schools / workInterests /
--              thingsToDo / milestones）。型と sanitize は lib/planBlueprint.ts。
--              読み出し側は必ず sanitizeBlueprintData() を通す（jsonb を型として信用しない）。
--   timeline : ユーザーが「採用済み」の AI Timeline のみ（未採用の preview は保存しない）。
--   timeline_generated_at : timeline JSON 内の generatedAt と同値で保存する契約
--              （JSON parse 無しで query / index / audit できるようにする）。
--
-- plan_karte / plan_documents と同じく plan_id を主キーにし、汎用の update_updated_at
-- トリガーは付けない（write 時にアプリ側で updated_at を明示更新する。今回 write は未実装）。
-- ============================================================
create table plan_blueprint (
  plan_id uuid primary key references plans(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  timeline jsonb,
  timeline_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table plan_blueprint enable row level security;

-- 所有者（plan_blueprint.plan_id -> plans.user_id = auth.uid()）のみ SELECT / INSERT / UPDATE 可能。
-- plan_karte / plan_documents / document_shares と同じ EXISTS パターン。service role は使わない。
create policy "plan_blueprint_select_own" on plan_blueprint for select
  using (exists (select 1 from plans where plans.id = plan_blueprint.plan_id and plans.user_id = auth.uid()));

create policy "plan_blueprint_insert_own" on plan_blueprint for insert
  with check (exists (select 1 from plans where plans.id = plan_blueprint.plan_id and plans.user_id = auth.uid()));

create policy "plan_blueprint_update_own" on plan_blueprint for update
  using (exists (select 1 from plans where plans.id = plan_blueprint.plan_id and plans.user_id = auth.uid()))
  with check (exists (select 1 from plans where plans.id = plan_blueprint.plan_id and plans.user_id = auth.uid()));

-- DELETE policy は意図的に作らない。Plan 削除時は on delete cascade で消える。
-- RLS 有効かつ DELETE policy 無しのため、それ以外の DELETE は（table owner を除き）常に拒否される。
-- anon 向け policy・追加 grant は無し（既存 table と同じく authenticated のデフォルト権限 ＋ RLS で十分）。
