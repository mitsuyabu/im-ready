-- ============================================================
-- plan_consultation_sheet
-- My Karte の 5 つ目の資料「Consultation Sheet（留学相談シート）」を Plan 単位で保持する（1 Plan = 1 行）。
--
-- 他の資料（plan_documents）は「AI が生成した本文を読む」スナップショットだが、Consultation Sheet は
-- ユーザー自身が項目を追加・編集・完了・削除する編集可能なワークスペースなので、plan_documents の
-- `{ format: "text", body }` には載せず専用 table を正本にする（二重保存しない）。
--
--   state    : ConsultationSheetState（lib/consultationSheet.ts）。
--              { topics, todos, findings, nextActions, handledCandidateKeys }
--              各リストは ConsultationItem[]（id / text / completed? / category? / source / createdAt / updatedAt）。
--              候補（AI相談・ワークシートからの提案）そのものは保存しない。毎回 Karte / Worksheet から
--              計算し直し、ユーザーが「追加する」「表示しない」と操作した候補の key だけを
--              handledCandidateKeys に残す（再計算しても同じ候補を出し直さないため）。
--              読み出し側は必ず sanitize を通す（jsonb を型として信用しない）。
--   revision : 楽観的排他用。plan_worksheet と同じく revision 条件つき UPDATE で、別端末の保存を検出して
--              項目（id）単位でマージしてから保存し直す。
--
-- plan_worksheet / plan_blueprint と同じく plan_id を主キーにし、updated_at はアプリ側で明示更新する。
-- 将来の共有（エージェントへの URL 共有など）は document_shares と同様に別 table で持てるよう、
-- ここには共有用の列を足していない。
-- ============================================================
create table plan_consultation_sheet (
  plan_id uuid primary key references plans(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table plan_consultation_sheet enable row level security;

-- 所有者（plan_consultation_sheet.plan_id -> plans.user_id = auth.uid()）のみ SELECT / INSERT / UPDATE 可能。
-- plan_worksheet / plan_blueprint / plan_documents と同じ EXISTS パターン。service role は使わない。
create policy "plan_consultation_sheet_select_own" on plan_consultation_sheet for select
  using (exists (select 1 from plans where plans.id = plan_consultation_sheet.plan_id and plans.user_id = auth.uid()));

create policy "plan_consultation_sheet_insert_own" on plan_consultation_sheet for insert
  with check (exists (select 1 from plans where plans.id = plan_consultation_sheet.plan_id and plans.user_id = auth.uid()));

create policy "plan_consultation_sheet_update_own" on plan_consultation_sheet for update
  using (exists (select 1 from plans where plans.id = plan_consultation_sheet.plan_id and plans.user_id = auth.uid()))
  with check (exists (select 1 from plans where plans.id = plan_consultation_sheet.plan_id and plans.user_id = auth.uid()));

-- DELETE policy は作らない。項目の削除は state を更新するだけで、行は消さない（Plan 削除時は cascade）。
