-- ============================================================
-- apply_karte_patch: plan_karte を Field 単位でatomicに更新するRPC。
--
-- save_plan_karte（Karte全体をmeta.updatedAtの比較だけで裁定していた旧関数）を置き換える。
-- 複数の書き手（Chat/Worksheet）が別々のFieldを同時に更新した場合でも、
-- 無関係なFieldの更新同士が互いを消してしまわないよう、
--   1. plan_karte行が無ければ作る（INSERT ... ON CONFLICT DO NOTHING）
--   2. 行をロックする（SELECT ... FOR UPDATE）
--   3. ロック内でField単位にcertainty/sourceを判定・適用する
--   4. 1回のUPDATEで書き戻す
-- を1トランザクションで行う。同一plan_idへの同時呼び出しは行ロックにより直列化される
-- ため、クライアント側の時刻比較（meta.updatedAt）は正しさの根拠として使わない
-- （単なる最終更新時刻の表示用情報になる）。
--
-- 裁定ルール（1つのFieldにつき）:
--   current=unknown                         → incomingを採用
--   current=stated,   incoming=inferred      → statedを維持（上書きしない）
--   current=inferred, incoming=stated        → statedで上書き（仮説の確定）
--   current=inferred, incoming=inferred      → 新しい仮説を採用
--   current=stated,   incoming=stated
--     ・source一致                            → 上書き（同一sourceの言い直し）
--     ・値が一致                              → 何もしない
--     ・source不一致・incoming=chat           → 上書き＋handoff.conflictsへ記録
--     ・source不一致・incoming=worksheet      → 上書きしない＋handoff.conflictsへ記録
--
-- handoff.conflicts は stated同士が別sourceで食い違った場合にのみ作られる
-- （AIのinferred仮説とstated情報の違いはconflictにしない）。値が一致すれば自動的に取り除かれる。
--
-- 最低限のvalidation: certainty/sourceは許可値のみ、block/keyは現在のKarte構造に実在するFieldのみ
-- 受け付ける（存在しないキーをjsonb_setで新規作成しない。create_missing=falseで統一）。
-- 不正なpatchはエラーにせず、そのFieldだけ無視してRAISE WARNINGで記録する。
-- ============================================================

drop function if exists save_plan_karte(uuid, jsonb, timestamptz);

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

      conflicts := (
        select coalesce(jsonb_agg(c), '[]'::jsonb)
        from jsonb_array_elements(conflicts) c
        where not (c->>'block' = block_name and c->>'key' = field_key)
      );

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
