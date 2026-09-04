-- ============================================================
-- update_plan_blueprint_section: plan_blueprint.data の 1 セクションだけを atomic に更新する RPC。
--
-- My Plan の編集は Goals / Destination / Work / Things / Milestones が同じ data jsonb に
-- 同居する。クライアントが古い state から data 全体を upsert すると、別セクションの直前の
-- 更新を消しうる。これを避けるため:
--   1. plan_blueprint 行が無ければ作る（INSERT ... ON CONFLICT DO NOTHING、初期 data は '{}'）
--   2. 行をロックする（SELECT ... FOR UPDATE）— 同一 plan_id への同時呼び出しを直列化
--   3. ロック内で jsonb_set により **指定セクションのキーだけ** を書き換える
--   4. 1 回の UPDATE で書き戻し、最新の data / updated_at を返す
-- を 1 トランザクションで行う。クライアントは data 全体を送らない（当該セクションの値だけ）。
--
-- security invoker（apply_karte_patch と同じ）。plan_blueprint の RLS（所有者のみ
-- select/insert/update）に加え、関数内でも plans.user_id = auth.uid() を明示チェックして
-- 明確なエラーを返す。service role は使わない。search_path を固定し public. で修飾する。
--
-- 触れるのは data の 5 セクションのみ。schools / timeline / timeline_generated_at は対象外。
-- p_expected_updated_at を渡した場合のみ optimistic concurrency チェック（不一致で stale_update）。
-- 渡さなければ「現在 data を読んで 1 セクションだけ patch」の MVP 動作。
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
  -- 許可セクションのみ（data の既存キー名に一致）
  if p_section not in ('goals', 'destinations', 'workInterests', 'thingsToDo', 'milestones') then
    raise exception 'invalid_section: %', p_section;
  end if;

  -- 値の型ガード（クライアントのバグでセクションをゴミで潰さない）
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

  -- optimistic concurrency（p_expected_updated_at を渡したときだけ）
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
