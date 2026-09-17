-- ============================================================
-- consultation_sheet_shares
-- Consultation Sheet（plan_consultation_sheet）を、ログイン不要・閲覧専用の共有リンク
-- （/share/consultation/[token]）でエージェント・カウンセラーへ見せるための table と公開取得関数。
--
-- 親向け説明資料の document_shares（20260829）と同じ考え方を踏襲する:
--   - anon には table 権限を一切与えない。公開ページが呼べるのは SECURITY DEFINER 関数だけ
--   - 関数は token_hash の完全一致で検索し、共有が有効な場合だけ「共有してよい最小限の値」を返す
--   - token 不正・存在しない・停止済み・期限切れを区別せず 0 行を返す
--   - service role は使わない
--
-- document_shares との違い（意図的）:
--   1. Live share: 共有時点の snapshot を持たず、開いた時点の最新 Consultation Sheet を読む。
--      何をどこまで見せるかは share_config（section ごとの ON/OFF）で固定する。
--   2. raw token も保存する（token 列）。「共有中なら同じ URL を表示する」ために、所有者が
--      別端末から開いても同じ URL を再表示できる必要があるため。token 列は所有者の RLS でしか
--      読めず、公開取得関数も返さない。公開側の照合は従来どおり token_hash で行う。
--   3. 期限なし（expires_at は nullable のまま、MVP では設定しない）＋ いつでも停止（revoked_at）。
--
-- 公開取得関数が返すもの（これ以外は返さない）:
--   plan の title / share_config の各フラグ / 共有 ON の section の項目（text と completed だけ）/
--   基本情報サマリー用の最小データ（stated の値と、サマリー項目の conflict の値だけ）/ シートの更新日時
-- 返さないもの: plan_id・user_id・メール・token・Karte 全体・inferred の値・source・certainty・
--   conflict の source・未採用の候補（候補はそもそも保存していない）・共有 OFF の section の中身
-- ============================================================

create table consultation_sheet_shares (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  -- 公開ページでの照合用。SHA-256(raw token) の16進64文字（lib/documentShareToken.ts と同じ形式）。
  token_hash text not null unique,
  -- 所有者が「共有中の URL」を再表示するための raw token（256bit・base64url）。所有者 RLS でのみ読める。
  token text not null unique,
  -- { showSummary, showTopics, showTodos, showFindings, showNextActions }。アプリ側で sanitize してから保存する。
  share_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

create index consultation_sheet_shares_plan_id_idx on consultation_sheet_shares (plan_id);

-- 1 Plan につき有効な共有は高々 1 件。停止（revoked_at を設定）した行は history として残り、
-- 再共有は新しい token の行を INSERT する（古い URL は復活させない）。
create unique index consultation_sheet_shares_one_active_per_plan
  on consultation_sheet_shares (plan_id)
  where revoked_at is null;

alter table consultation_sheet_shares enable row level security;

-- 所有者（plan_id -> plans.user_id = auth.uid()）のみ SELECT / INSERT / UPDATE。DELETE policy は作らない。
create policy "consultation_sheet_shares_select_own" on consultation_sheet_shares for select
  using (exists (select 1 from plans where plans.id = consultation_sheet_shares.plan_id and plans.user_id = auth.uid()));

create policy "consultation_sheet_shares_insert_own" on consultation_sheet_shares for insert
  with check (exists (select 1 from plans where plans.id = consultation_sheet_shares.plan_id and plans.user_id = auth.uid()));

create policy "consultation_sheet_shares_update_own" on consultation_sheet_shares for update
  using (exists (select 1 from plans where plans.id = consultation_sheet_shares.plan_id and plans.user_id = auth.uid()))
  with check (exists (select 1 from plans where plans.id = consultation_sheet_shares.plan_id and plans.user_id = auth.uid()));

revoke all on consultation_sheet_shares from anon;

-- ============================================================
-- 内部 helper: Karte の 1 field を「stated のときだけ値だけ」返す。inferred / unknown は null。
-- certainty・source は返さない。公開取得関数の中でだけ使う（anon / authenticated には EXECUTE を与えない）。
-- ============================================================
create function public.consultation_share_stated_value(p_karte jsonb, p_block text, p_key text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when p_karte -> p_block -> p_key ->> 'certainty' = 'stated'
      and jsonb_typeof(coalesce(p_karte -> p_block -> p_key -> 'value', 'null'::jsonb)) <> 'null'
    then p_karte -> p_block -> p_key -> 'value'
    else null
  end;
$$;

revoke all on function public.consultation_share_stated_value(jsonb, text, text) from public;

-- ============================================================
-- 内部 helper: シートの 1 リストを、共有してよい形（text と completed だけ）に変換する。
-- id / source（user・candidate の別）/ category / 日時は返さない。
-- ============================================================
create function public.consultation_share_items(p_items jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_agg(
               -- completed が無い項目もあるため、必ず true / false のどちらかに揃える。
               jsonb_build_object(
                 'text', btrim(e.value ->> 'text'),
                 'completed', coalesce((e.value -> 'completed') = 'true'::jsonb, false)
               )
               order by e.ordinality
             )
      from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end)
           with ordinality as e(value, ordinality)
      where jsonb_typeof(e.value) = 'object'
        and length(btrim(coalesce(e.value ->> 'text', ''))) > 0
    ),
    '[]'::jsonb
  );
$$;

revoke all on function public.consultation_share_items(jsonb) from public;

-- ============================================================
-- get_public_consultation_sheet: 公開共有ページ専用の、唯一の anon 向けアクセス経路。
-- ============================================================
create function public.get_public_consultation_sheet(p_token_hash text)
returns table (
  plan_title text,
  show_summary boolean,
  show_topics boolean,
  show_todos boolean,
  show_findings boolean,
  show_next_actions boolean,
  topics jsonb,
  todos jsonb,
  findings jsonb,
  next_actions jsonb,
  summary_source jsonb,
  sheet_updated_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  with share as (
    select s.plan_id, s.share_config
    from public.consultation_sheet_shares s
    where s.token_hash = p_token_hash
      and s.revoked_at is null
      and (s.expires_at is null or s.expires_at > now())
    limit 1
  ),
  cfg as (
    select
      share.plan_id,
      (share.share_config -> 'showSummary') = 'true'::jsonb as show_summary,
      (share.share_config -> 'showTopics') = 'true'::jsonb as show_topics,
      (share.share_config -> 'showTodos') = 'true'::jsonb as show_todos,
      (share.share_config -> 'showFindings') = 'true'::jsonb as show_findings,
      (share.share_config -> 'showNextActions') = 'true'::jsonb as show_next_actions
    from share
  )
  select
    p.title,
    cfg.show_summary,
    cfg.show_topics,
    cfg.show_todos,
    cfg.show_findings,
    cfg.show_next_actions,
    case when cfg.show_topics then public.consultation_share_items(sheet.state -> 'topics') else '[]'::jsonb end,
    case when cfg.show_todos then public.consultation_share_items(sheet.state -> 'todos') else '[]'::jsonb end,
    case when cfg.show_findings then public.consultation_share_items(sheet.state -> 'findings') else '[]'::jsonb end,
    case when cfg.show_next_actions then public.consultation_share_items(sheet.state -> 'nextActions') else '[]'::jsonb end,
    case when cfg.show_summary then jsonb_build_object(
      'karte', jsonb_strip_nulls(jsonb_build_object(
        'preferredCountries', public.consultation_share_stated_value(k.karte, 'schoolPrefs', 'preferredCountries'),
        'preferredCity', public.consultation_share_stated_value(k.karte, 'schoolPrefs', 'preferredCity'),
        'courseType', public.consultation_share_stated_value(k.karte, 'schoolPrefs', 'courseType'),
        'accommodation', public.consultation_share_stated_value(k.karte, 'schoolPrefs', 'accommodation'),
        'departureTiming', public.consultation_share_stated_value(k.karte, 'timing', 'departureTiming'),
        'durationLabel', public.consultation_share_stated_value(k.karte, 'timing', 'durationLabel'),
        'durationWeeks', public.consultation_share_stated_value(k.karte, 'timing', 'durationWeeks'),
        'rangeLabel', public.consultation_share_stated_value(k.karte, 'budget', 'rangeLabel'),
        'totalCap', public.consultation_share_stated_value(k.karte, 'budget', 'totalCap'),
        'selfLevel', public.consultation_share_stated_value(k.karte, 'language', 'selfLevel'),
        'wantsToWork', public.consultation_share_stated_value(k.karte, 'work', 'wantsToWork')
      )),
      -- サマリーに出す項目の conflict だけ。値は「検討中（A / B）」の表示に使う。source は返さない。
      'conflicts', coalesce((
        select jsonb_agg(jsonb_build_object(
          'block', c.value ->> 'block', 'key', c.value ->> 'key',
          'existingValue', c.value -> 'existingValue', 'incomingValue', c.value -> 'incomingValue'
        ))
        from jsonb_array_elements(case when jsonb_typeof(k.karte -> 'handoff' -> 'conflicts') = 'array'
                                       then k.karte -> 'handoff' -> 'conflicts' else '[]'::jsonb end) as c(value)
        where (c.value ->> 'block') || '.' || (c.value ->> 'key') in (
          'schoolPrefs.preferredCountries', 'schoolPrefs.preferredCity', 'schoolPrefs.courseType',
          'schoolPrefs.accommodation', 'timing.departureTiming', 'timing.durationLabel', 'timing.durationWeeks',
          'budget.rangeLabel', 'budget.totalCap', 'language.selfLevel', 'work.wantsToWork'
        )
      ), '[]'::jsonb),
      'myPlan', jsonb_strip_nulls(jsonb_build_object(
        'primaryCity', b.data -> 'destinations' -> 'primary' ->> 'label',
        'durationMonths', b.data -> 'planSettings' -> 'durationMonths',
        'accommodations', coalesce((
          select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('type', a.value ->> 'type', 'label', a.value ->> 'label')))
          from jsonb_array_elements(case when jsonb_typeof(b.data -> 'accommodations') = 'array'
                                         then b.data -> 'accommodations' else '[]'::jsonb end) as a(value)
        ), '[]'::jsonb),
        'workInterests', coalesce((
          select jsonb_agg(w.value ->> 'label')
          from jsonb_array_elements(case when jsonb_typeof(b.data -> 'workInterests') = 'array'
                                         then b.data -> 'workInterests' else '[]'::jsonb end) as w(value)
        ), '[]'::jsonb)
      ))
    ) else null end,
    sheet.updated_at
  from cfg
  join public.plans p on p.id = cfg.plan_id
  left join public.plan_consultation_sheet sheet on sheet.plan_id = cfg.plan_id
  left join public.plan_karte k on k.plan_id = cfg.plan_id
  left join public.plan_blueprint b on b.plan_id = cfg.plan_id
  limit 1;
$$;

revoke all on function public.get_public_consultation_sheet(text) from public;
grant execute on function public.get_public_consultation_sheet(text) to anon, authenticated;
