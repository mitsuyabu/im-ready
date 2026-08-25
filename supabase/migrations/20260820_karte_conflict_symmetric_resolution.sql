-- ============================================================
-- apply_karte_patch: conflict解消ロジックの修正（B案）
--
-- 既存の問題: 「stated同士・同一source」更新時、conflictの有無・内容を一切見ずに
-- 無条件でそのFieldのhandoff.conflictsを削除していた。このため、
--   Chat=A, Worksheet=B → conflict生成
--   その後Chatが(Worksheetの値Bとは無関係に)A'を発言(source=chatのまま)
-- という操作だけで、Worksheet側の主張(B)が一切参照されないままconflictが消える
-- という見逃しが発生し得た（実際にシミュレーションで再現・確認済み）。
--
-- 修正方針:
--   1. Fieldの更新可否を決めるA/B/C/Dルール自体は変更しない。
--   2. conflictの解消は「同一source更新」ではなく、
--      「conflictの2つのside（existingSource側・incomingSource側）のうち、
--       今回の書き込み元(source)と一致する側だけを最新値へ差し替えたうえで、
--       2つのsideの値がJSONB完全一致した場合にだけ」行う。
--      existing/incomingは固定的な役割（chat/worksheet）ではなく、その都度
--      patchのsourceと突き合わせて動的に判定する。
--   3. 今回のpatchのsourceが、既存conflictのどちらのsideとも一致しない場合
--      （現状のchat/worksheet 2source運用では起こらないが、将来profile等の
--      3つ目のsourceが加わった場合に起こり得る）は、2source構造の
--      KarteConflictでは安全に表現できないため、既存conflictを一切変更せず、
--      そのFieldへの今回の書き込み自体も受け入れない（RAISE WARNINGで明示的に
--      記録し、既存情報が静かに失われることを防ぐ）。
--
-- それ以外（行ロック・INSERT ON CONFLICT DO NOTHING・stated/inferredの裁定・
-- p_confirmed_items等その他パラメータの扱い・meta.updatedAtの更新）は無変更。
-- ============================================================

create or replace function apply_karte_patch(
  p_plan_id uuid,
  p_initial_karte jsonb,
  p_field_patches jsonb default '[]'::jsonb,
  p_confirmed_items jsonb default null,
  p_open_questions jsonb default null,
  p_immediate_proposal_requested boolean default null,
  p_proposals jsonb default null,
  p_summary text default null
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  current_karte jsonb;
  patch jsonb;
  block_name text;
  field_key text;
  path text[];
  existing_field jsonb;
  existing_certainty text;
  existing_source text;
  incoming_certainty text;
  incoming_source text;
  incoming_field jsonb;
  conflicts jsonb;
  existing_conflict jsonb;
  other_value jsonb;
  refreshed_conflict jsonb;
begin
  insert into plan_karte (plan_id, karte)
  values (p_plan_id, p_initial_karte)
  on conflict (plan_id) do nothing;

  select karte into current_karte from plan_karte where plan_id = p_plan_id for update;

  conflicts := coalesce(current_karte #> '{handoff,conflicts}', '[]'::jsonb);

  for patch in select * from jsonb_array_elements(p_field_patches)
  loop
    block_name := patch->>'block';
    field_key := patch->>'key';
    incoming_certainty := patch->>'certainty';
    incoming_source := patch->>'source';

    if block_name is null or field_key is null then
      raise warning 'apply_karte_patch: missing block/key, skipping';
      continue;
    end if;

    if incoming_certainty not in ('stated', 'inferred') then
      raise warning 'apply_karte_patch: invalid certainty % for %.%, skipping', incoming_certainty, block_name, field_key;
      continue;
    end if;

    if incoming_source not in ('chat', 'worksheet', 'profile') then
      raise warning 'apply_karte_patch: invalid source % for %.%, skipping', incoming_source, block_name, field_key;
      continue;
    end if;

    path := array[block_name, field_key];
    existing_field := current_karte #> path;

    if existing_field is null then
      raise warning 'apply_karte_patch: unknown field %.%, skipping', block_name, field_key;
      continue;
    end if;

    existing_certainty := existing_field->>'certainty';
    incoming_field := jsonb_build_object(
      'value', patch->'value', 'certainty', incoming_certainty, 'source', incoming_source
    );

    if existing_certainty = 'unknown' then
      current_karte := jsonb_set(current_karte, path, incoming_field, false);

    elsif existing_certainty = 'stated' and incoming_certainty = 'inferred' then
      null; -- statedを維持。仮説では上書きしない

    elsif existing_certainty = 'inferred' and incoming_certainty = 'stated' then
      current_karte := jsonb_set(current_karte, path, incoming_field, false);

    elsif existing_certainty = 'inferred' and incoming_certainty = 'inferred' then
      current_karte := jsonb_set(current_karte, path, incoming_field, false);

    else
      -- stated同士。ここでだけsource/conflictsを扱う
      existing_source := coalesce(existing_field->>'source', 'chat');

      -- このFieldの既存conflictを取得してから、いったん配列から除去する
      -- (後で「維持」と判定した場合は改めて積み直す。無条件削除はしない)
      select c into existing_conflict
      from jsonb_array_elements(conflicts) c
      where c->>'block' = block_name and c->>'key' = field_key
      limit 1;

      conflicts := (
        select coalesce(jsonb_agg(c), '[]'::jsonb)
        from jsonb_array_elements(conflicts) c
        where not (c->>'block' = block_name and c->>'key' = field_key)
      );

      if existing_conflict is not null then
        -- 既にconflictがある: patch.sourceと一致する側だけを最新値へ差し替える
        if existing_conflict->>'existingSource' = incoming_source then
          other_value := existing_conflict->'incomingValue';
          refreshed_conflict := jsonb_build_object(
            'block', block_name, 'key', field_key,
            'existingValue', patch->'value', 'existingSource', incoming_source,
            'incomingValue', other_value, 'incomingSource', existing_conflict->>'incomingSource'
          );
        elsif existing_conflict->>'incomingSource' = incoming_source then
          other_value := existing_conflict->'existingValue';
          refreshed_conflict := jsonb_build_object(
            'block', block_name, 'key', field_key,
            'existingValue', existing_conflict->'existingValue', 'existingSource', existing_conflict->>'existingSource',
            'incomingValue', patch->'value', 'incomingSource', incoming_source
          );
        else
          -- 3つ目のsourceからの更新。現在のKarteConflictは2sourceしか表現できないため、
          -- 既存conflictを一切変更せずそのまま戻し、このFieldへの今回の書き込みは受け入れない。
          raise warning
            'apply_karte_patch: field %.% already has a conflict between % and %; refusing update from a third source % (2-source structure cannot safely represent this)',
            block_name, field_key, existing_conflict->>'existingSource', existing_conflict->>'incomingSource', incoming_source;
          conflicts := conflicts || jsonb_build_array(existing_conflict);
          continue;
        end if;

        if other_value = patch->'value' then
          null; -- 2つのsideが一致した。解消(積み直さない)
        else
          conflicts := conflicts || jsonb_build_array(refreshed_conflict);
        end if;

        -- Field自体の更新は既存のA/B/C/Dルールのまま(conflictの有無で挙動を変えない)
        if existing_source = incoming_source then
          current_karte := jsonb_set(current_karte, path, incoming_field, false);
        elsif incoming_source = 'chat' then
          current_karte := jsonb_set(current_karte, path, incoming_field, false);
        end if;

      else
        -- 従来通りの初回判定(conflictがまだ無い状態)
        if existing_source = incoming_source then
          current_karte := jsonb_set(current_karte, path, incoming_field, false);

        elsif existing_field->'value' = patch->'value' then
          null; -- source違いだが値は一致。conflictにしない

        elsif incoming_source = 'chat' then
          current_karte := jsonb_set(current_karte, path, incoming_field, false);
          conflicts := conflicts || jsonb_build_array(jsonb_build_object(
            'block', block_name, 'key', field_key,
            'existingValue', existing_field->'value', 'existingSource', existing_source,
            'incomingValue', patch->'value', 'incomingSource', incoming_source
          ));

        else
          conflicts := conflicts || jsonb_build_array(jsonb_build_object(
            'block', block_name, 'key', field_key,
            'existingValue', existing_field->'value', 'existingSource', existing_source,
            'incomingValue', patch->'value', 'incomingSource', incoming_source
          ));
        end if;
      end if;
    end if;
  end loop;

  current_karte := jsonb_set(current_karte, '{handoff,conflicts}', conflicts, true);

  if p_confirmed_items is not null then
    current_karte := jsonb_set(current_karte, '{handoff,confirmedItems}', p_confirmed_items, false);
  end if;
  if p_open_questions is not null then
    current_karte := jsonb_set(current_karte, '{handoff,openQuestions}', p_open_questions, false);
  end if;
  if p_immediate_proposal_requested is not null then
    current_karte := jsonb_set(
      current_karte, '{handoff,immediateProposalRequested}', to_jsonb(p_immediate_proposal_requested), false
    );
  end if;
  if p_proposals is not null then
    current_karte := jsonb_set(current_karte, '{proposals}', p_proposals, false);
  end if;
  if p_summary is not null then
    current_karte := jsonb_set(current_karte, '{meta,summary}', to_jsonb(p_summary), false);
  end if;

  current_karte := jsonb_set(current_karte, '{meta,updatedAt}', to_jsonb(now()::text), false);

  update plan_karte set karte = current_karte, updated_at = now() where plan_id = p_plan_id;

  return current_karte;
end;
$$;

grant execute on function apply_karte_patch(uuid, jsonb, jsonb, jsonb, jsonb, boolean, jsonb, text) to authenticated;
