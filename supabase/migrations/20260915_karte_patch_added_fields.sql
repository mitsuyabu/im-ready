-- ============================================================
-- apply_karte_patch: Karte に追加した field を、既存 plan_karte 行でも書き込めるようにする
--
-- 背景:
--   lib/karte.ts の BLOCK_SPECS に、Worksheet の現実条件を保持するための field を追加した。
--     budget.rangeLabel / timing.durationLabel / schoolPrefs.preferredCountries /
--     schoolPrefs.studyDurationLabel / constraints.currentCommitmentPlan / decision.familySharingStatus
--   新規 Plan の行は p_initial_karte（createEmptyKarte）にこれらの key を含むため問題ない。
--   しかし既存の plan_karte.karte（jsonb）にはこの key が存在しないため、従来の
--     existing_field is null → 'unknown field' として skip
--   によって、既存 Plan ではこれらの field への書き込みが永久に無視されてしまう。
--
-- 変更点（この1点のみ）:
--   保存済み jsonb に key が無い場合でも、それが **下の allowlist に明示した追加 field** で、
--   かつ block 自体は object として存在するなら、その field を unknown とみなして通常どおり裁定する。
--   unknown からの書き込みだけ jsonb_set の create_missing を true にする（key を作る）。
--   allowlist に無い key は従来どおり 'unknown field' として skip（任意の key を作らせない）。
--
-- それ以外（行ロック・INSERT ON CONFLICT DO NOTHING・stated/inferred の裁定・source/conflict の
-- 対称解消ロジック・その他パラメータ・meta.updatedAt の更新・security invoker・grant）は
-- 20260820_karte_conflict_symmetric_resolution.sql と同一。既存行のデータは書き換えない（backfill しない）。
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
  field_was_missing boolean;
  -- 保存済み jsonb に key が無くても unknown として受け付ける、後から追加した field。
  added_field_paths constant text[] := array[
    'budget.rangeLabel',
    'timing.durationLabel',
    'schoolPrefs.preferredCountries',
    'schoolPrefs.studyDurationLabel',
    'constraints.currentCommitmentPlan',
    'decision.familySharingStatus'
  ];
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
    field_was_missing := false;

    if existing_field is null then
      if (block_name || '.' || field_key) = any (added_field_paths)
         and jsonb_typeof(current_karte -> block_name) = 'object' then
        existing_field := jsonb_build_object('value', null, 'certainty', 'unknown');
        field_was_missing := true;
      else
        raise warning 'apply_karte_patch: unknown field %.%, skipping', block_name, field_key;
        continue;
      end if;
    end if;

    existing_certainty := existing_field->>'certainty';
    incoming_field := jsonb_build_object(
      'value', patch->'value', 'certainty', incoming_certainty, 'source', incoming_source
    );

    if existing_certainty = 'unknown' then
      -- 追加 field が保存済み jsonb に無かった場合だけ key を作る（それ以外は従来どおり作らない）
      current_karte := jsonb_set(current_karte, path, incoming_field, field_was_missing);

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
