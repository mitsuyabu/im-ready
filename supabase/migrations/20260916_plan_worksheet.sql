-- ============================================================
-- plan_worksheet
-- Plan Worksheet の回答を Plan 単位でサーバーに保持する（1 Plan = 1 行）。
-- これまで回答はブラウザの localStorage にしか無く、同じアカウントでも別端末では未回答に見えていた。
-- この table を正本にし、localStorage は補助キャッシュ / 既存回答の移行元として扱う。
--
--   state    : WorksheetPersistedData（lib/worksheetStorage.ts）をそのまま保存する。
--              { answers, ratings, rankings, compromises, singleSelections, multiSelections }
--              自由記入・数値（年齢）・選択式の自由記入欄は answers、選択は singleSelections /
--              multiSelections、優先順位カテゴリは ratings / rankings / compromises に入る。
--              読み出し側は必ず sanitize を通す（jsonb を型として信用しない）。
--   revision : 楽観的排他用の単調増加カウンタ。クライアントは「最後に読んだ revision」を条件に
--              UPDATE し（where revision = 読んだ値）、0 行なら別端末が先に保存したとみなして
--              最新を読み直し、設問単位でマージしてから保存し直す（lib/planWorksheet.ts）。
--
-- plan_karte / plan_blueprint と同じく plan_id を主キーにし、汎用の update_updated_at
-- トリガーは付けない（write 時にアプリ側で updated_at を明示更新する）。
-- 匿名の /worksheet は従来どおり localStorage のみで、この table を使わない。
-- ============================================================
create table plan_worksheet (
  plan_id uuid primary key references plans(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table plan_worksheet enable row level security;

-- 所有者（plan_worksheet.plan_id -> plans.user_id = auth.uid()）のみ SELECT / INSERT / UPDATE 可能。
-- plan_karte / plan_documents / plan_blueprint と同じ EXISTS パターン。service role は使わない。
create policy "plan_worksheet_select_own" on plan_worksheet for select
  using (exists (select 1 from plans where plans.id = plan_worksheet.plan_id and plans.user_id = auth.uid()));

create policy "plan_worksheet_insert_own" on plan_worksheet for insert
  with check (exists (select 1 from plans where plans.id = plan_worksheet.plan_id and plans.user_id = auth.uid()));

create policy "plan_worksheet_update_own" on plan_worksheet for update
  using (exists (select 1 from plans where plans.id = plan_worksheet.plan_id and plans.user_id = auth.uid()))
  with check (exists (select 1 from plans where plans.id = plan_worksheet.plan_id and plans.user_id = auth.uid()));

-- DELETE policy は意図的に作らない。回答の「解除」は state の中身を消して UPDATE するだけで、
-- 行そのものは消さない。Plan 削除時は on delete cascade で消える（plan_blueprint と同じ方針）。
-- anon 向け policy・追加 grant は無し（既存 table と同じく authenticated のデフォルト権限 ＋ RLS で十分）。
