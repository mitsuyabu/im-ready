-- ============================================================
-- profile_facts.plan_id の外部キーを ON DELETE CASCADE へ張り替える
--
-- 背景:
--   UI から Plan を削除できるようにした（components/DeletePlanDialog.tsx）。削除は本人の権限で
--   `delete from plans where id = ? and user_id = ?` を 1 文実行するだけで、plans に紐づく子 table は
--   FK の cascade で一緒に消える設計になっている。
--
--   ところが profile_facts だけが `on delete cascade` ではなく NO ACTION（Postgres の既定）だった。
--   この table は migration ではなくダッシュボードで作られたため、cascade の指定が漏れていた
--   （plans も同様に migration 管理外）。実 DB で確認した外部キーの一覧:
--     profile_facts            … confdeltype = 'a'（NO ACTION）  ← これだけ
--     plan_karte               … 'c'
--     chat_sessions            … 'c'
--     plan_documents           … 'c'
--     plan_blueprint           … 'c'
--     plan_worksheet           … 'c'
--     plan_consultation_sheet  … 'c'
--     consultation_sheet_shares… 'c'
--   2 段目（chat_messages → chat_sessions / document_shares → plan_documents）はいずれも 'c'。
--
--   そのため profile_facts に行がある Plan は、削除しようとすると FK 違反（SQLSTATE 23503）になり、
--   UI 側は（安全側に倒して）「削除できませんでした」と表示するだけで、その Plan を消せない。
--   実 DB には該当する行が 1 件存在する（total_rows = 1 / distinct_plans = 1）。
--
-- この migration が変更するもの:
--   profile_facts_plan_id_fkey の削除時動作（NO ACTION → CASCADE）のみ。
--   列・型・PRIMARY KEY (id)・UNIQUE (plan_id)・RLS・policy・grant・他 table・データは変更しない
--   （DELETE / UPDATE / backfill を一切行わない）。
--
--   張り替えは 1 文の ALTER TABLE（drop ＋ add）で行うため、途中状態が外から見えることはない。
--   実行中は profile_facts に ACCESS EXCLUSIVE、plans に SHARE ROW EXCLUSIVE のロックがかかるが、
--   対象は 1 行で、FK の検証もその 1 行だけなので短時間で完了する。
--
-- 適用前後の確認（読み取り専用）:
--   select conname, confdeltype, pg_get_constraintdef(oid) as definition
--   from pg_constraint
--   where conrelid = 'public.profile_facts'::regclass and contype = 'f';
--
--   適用前: confdeltype = 'a' / FOREIGN KEY (plan_id) REFERENCES plans(id)
--   適用後: confdeltype = 'c' / FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
-- ============================================================

-- 前提の確認。想定と違う形（制約が無い・単一列でない・参照先が plans(id) でない）なら
-- 何も変更せずエラーで停止する（推測で schema を作り替えない）。
do $$
declare
  definition text;
begin
  select pg_get_constraintdef(oid) into definition
  from pg_constraint
  where conrelid = 'public.profile_facts'::regclass
    and contype = 'f'
    and conname = 'profile_facts_plan_id_fkey';

  if definition is null then
    raise exception
      'profile_facts_plan_id_fkey が見つかりません。実 DB の外部キー定義を確認してください（この migration は何も変更していません）。';
  end if;

  if definition not like 'FOREIGN KEY (plan_id) REFERENCES plans(id)%' then
    raise exception
      'profile_facts_plan_id_fkey の定義が想定と異なります: %（この migration は何も変更していません）。', definition;
  end if;
end
$$;

alter table public.profile_facts
  drop constraint profile_facts_plan_id_fkey,
  add  constraint profile_facts_plan_id_fkey
    foreign key (plan_id)
    references public.plans(id)
    on delete cascade;
