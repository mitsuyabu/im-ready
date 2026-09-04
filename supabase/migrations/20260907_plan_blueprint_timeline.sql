-- ============================================================
-- save_plan_blueprint_timeline: ユーザーが「採用」した AI Timeline を plan_blueprint.timeline へ
-- 保存する専用 RPC（Step 2-5 / 2-7）。
--
-- data jsonb（goals / destinations / schools 等のセクション）は **一切触らない**。timeline は
-- 独立カラムなので section patch 用の update_plan_blueprint_section とは別関数にする。
-- クライアントは data 全体を送らない（p_timeline だけ）。
--
-- 設計は他の plan_* RPC と揃える:
--   security invoker（RLS に加えた明示 owner check）／search_path 固定・public. 修飾／
--   行が無ければ作成（初期 data は空 object）／for update ロックで同一 plan_id を直列化／
--   p_expected_updated_at 任意の optimistic concurrency（不一致で stale_update）／
--   revoke all from public + grant execute to authenticated ／service role 不使用。
--
-- p_generated_at は timeline JSON 内の generatedAt と同値で保存する契約（query / audit 用）。
-- ============================================================
create or replace function save_plan_blueprint_timeline(
  p_plan_id uuid,
  p_timeline jsonb,
  p_generated_at timestamptz,
  p_expected_updated_at timestamptz default null
)
returns table (data jsonb, timeline jsonb, timeline_generated_at timestamptz, updated_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owns boolean;
  v_current_updated_at timestamptz;
begin
  if p_timeline is null or jsonb_typeof(p_timeline) <> 'object' then
    raise exception 'invalid_value_shape';
  end if;

  select exists (
    select 1 from public.plans
    where public.plans.id = p_plan_id
      and public.plans.user_id = auth.uid()
  ) into v_owns;
  if not v_owns then
    raise exception 'not_owner';
  end if;

  insert into public.plan_blueprint (plan_id, data)
  values (p_plan_id, '{}'::jsonb)
  on conflict (plan_id) do nothing;

  select public.plan_blueprint.updated_at
    into v_current_updated_at
  from public.plan_blueprint
  where public.plan_blueprint.plan_id = p_plan_id
  for update;

  if p_expected_updated_at is not null
     and v_current_updated_at is distinct from p_expected_updated_at then
    raise exception 'stale_update';
  end if;

  -- data には触れない。timeline / timeline_generated_at / updated_at のみ更新。
  update public.plan_blueprint
  set timeline = p_timeline,
      timeline_generated_at = p_generated_at,
      updated_at = now()
  where public.plan_blueprint.plan_id = p_plan_id;

  return query
    select
      public.plan_blueprint.data,
      public.plan_blueprint.timeline,
      public.plan_blueprint.timeline_generated_at,
      public.plan_blueprint.updated_at
    from public.plan_blueprint
    where public.plan_blueprint.plan_id = p_plan_id;
end;
$$;

revoke all on function save_plan_blueprint_timeline(uuid, jsonb, timestamptz, timestamptz) from public;
grant execute on function save_plan_blueprint_timeline(uuid, jsonb, timestamptz, timestamptz) to authenticated;
