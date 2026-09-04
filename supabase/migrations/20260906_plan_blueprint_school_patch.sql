-- ============================================================
-- update_plan_blueprint_section を replace して、許可セクションに 'schools' を追加する（Step 2-4）。
--
-- 20260905_plan_blueprint_section_patch.sql と同じ設計（security invoker / owner check /
-- search_path 固定 / for update ロック / jsonb_set で 1 セクションだけ patch / 他セクション保持 /
-- p_expected_updated_at 任意の optimistic concurrency）。変更点は許可セクションと型ガードのみ。
--
-- schools セクションは School Comparison から「検討中（considering）」で保存し、My Plan 側で
-- 第一候補 / 決定 / 削除まで管理する。学校の選定は必ずユーザー操作で、AI / comparison は行わない。
-- ============================================================
create or replace function update_plan_blueprint_section(
  p_plan_id uuid,
  p_section text,
  p_value jsonb,
  p_expected_updated_at timestamptz default null
)
returns table (data jsonb, updated_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owns boolean;
  v_current_updated_at timestamptz;
begin
  -- 許可セクションのみ（data の既存キー名に一致）。schools を追加。
  if p_section not in ('goals', 'destinations', 'workInterests', 'thingsToDo', 'milestones', 'schools') then
    raise exception 'invalid_section: %', p_section;
  end if;

  -- 値の型ガード。destinations は object、それ以外（schools 含む）は array。
  if p_section = 'destinations' then
    if p_value is null or jsonb_typeof(p_value) <> 'object' then
      raise exception 'invalid_value_shape';
    end if;
  else
    if p_value is null or jsonb_typeof(p_value) <> 'array' then
      raise exception 'invalid_value_shape';
    end if;
  end if;

  -- 所有者チェック（RLS に加えた明示チェック。auth.uid() が null の匿名でも必ず失敗する）
  select exists (
    select 1 from public.plans
    where public.plans.id = p_plan_id
      and public.plans.user_id = auth.uid()
  ) into v_owns;
  if not v_owns then
    raise exception 'not_owner';
  end if;

  -- 行が無ければ作る（初期 data は空 object。fake value は入れない）
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

  update public.plan_blueprint
  set data = jsonb_set(coalesce(public.plan_blueprint.data, '{}'::jsonb), array[p_section], p_value, true),
      updated_at = now()
  where public.plan_blueprint.plan_id = p_plan_id;

  return query
    select public.plan_blueprint.data, public.plan_blueprint.updated_at
    from public.plan_blueprint
    where public.plan_blueprint.plan_id = p_plan_id;
end;
$$;

revoke all on function update_plan_blueprint_section(uuid, text, jsonb, timestamptz) from public;
grant execute on function update_plan_blueprint_section(uuid, text, jsonb, timestamptz) to authenticated;
