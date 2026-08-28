-- ============================================================
-- document_shares
-- 親向け説明資料（plan_documents, type = 'parent_explanation'）を、ログイン不要の
-- bearer link（/share/documents/[token]、未実装）で家族へ共有するための土台。
-- 今回のmigrationはDB/RLS/RPCのみ。share作成API・公開page・LINE共有は含まない
-- （Step 9範囲外。設計の詳細な比較検討はStep 8の報告を参照）。
--
-- 設計方針（最重要）:
-- - plan_documentsのschema/RLS/policyは一切変更しない。公開取得は
--   document_sharesのみを参照し、plan_documentsへは一切JOINしない
--   （snapshot方式。共有時点のtitle/body/updated_atをこのtableへコピーして持つ。
--   将来元のplan_documentsが再生成されても、既に発行済みの共有URLの内容は
--   変わらない。詳細はStep 8報告のN参照）。
-- - anonには document_shares・plan_documents いずれのtable権限も一切付与しない。
--   anonが実行できるのは、本migration末尾のSECURITY DEFINER関数
--   get_public_document_by_token_hash への EXECUTE 権限だけ。
-- - service roleは使わない（このprojectでは導入しない前提を維持）。
-- ============================================================

create table document_shares (
  id uuid primary key default gen_random_uuid(),
  plan_document_id uuid not null references plan_documents(id) on delete cascade,
  -- raw tokenはDBに保存しない。SHA-256(raw token)の16進文字列（64文字）のみ保持する。
  -- hash化・raw token生成は将来のshare作成API（Next.js側）の責務で、この
  -- migrationでは行わない。
  token_hash text not null unique,
  -- 共有時点のplan_documents.title/content.body/updated_atのsnapshot。
  title text not null,
  body text not null,
  document_updated_at timestamptz not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  -- revoke時、将来のUPDATEでenabled=falseとrevoked_atの両方を設定する運用を想定する
  -- （どちらか一方だけが変わっても、公開RPC側は両方を見るため安全側に倒れる。
  -- 詳細はStep 8報告のO参照）。
  revoked_at timestamptz,
  -- MVPでは共有作成API側でデフォルト90日を設定する想定だが、このmigrationでは
  -- DB defaultを設定せずnullableのままにする（無期限も表現できるようにするため）。
  expires_at timestamptz
);

-- token_hashのunique制約により一意indexは自動作成されるため、別途indexは作らない。

-- plan_document_idでの一般検索（例: 将来のshare管理UIで、あるdocumentの
-- 有効/失効済みshareを一覧する等）向けの通常index。
create index document_shares_plan_document_id_idx on document_shares (plan_document_id);

-- chat_sessions_one_main_per_plan と同じ発想: 1 plan_documentにつき有効なshareは
-- 高々1件（部分UNIQUE INDEX）。expires_atが過去になってもDB側でenabledは自動的に
-- falseへは変わらないため、将来の再共有処理は「新しいshareを作る前に既存の
-- enabled=true行を明示的にrevokeする」という運用を前提とする（trigger/cronによる
-- 自動更新は今回作らない）。
create unique index document_shares_one_active_per_document
  on document_shares (plan_document_id)
  where enabled;

alter table document_shares enable row level security;

-- authenticated ownerのみがCRUD可能。ownershipは
-- document_shares.plan_document_id → plan_documents.id → plan_documents.plan_id →
-- plans.id → plans.user_id = auth.uid() という2段のJOINで確認する
-- （plan_karte等の既存ownership patternと同じ考え方）。

create policy "document_shares_select_own" on document_shares for select
  using (
    exists (
      select 1
      from plan_documents
      join plans on plans.id = plan_documents.plan_id
      where plan_documents.id = document_shares.plan_document_id
        and plans.user_id = auth.uid()
    )
  );

create policy "document_shares_insert_own" on document_shares for insert
  with check (
    exists (
      select 1
      from plan_documents
      join plans on plans.id = plan_documents.plan_id
      where plan_documents.id = document_shares.plan_document_id
        and plans.user_id = auth.uid()
    )
  );

create policy "document_shares_update_own" on document_shares for update
  using (
    exists (
      select 1
      from plan_documents
      join plans on plans.id = plan_documents.plan_id
      where plan_documents.id = document_shares.plan_document_id
        and plans.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from plan_documents
      join plans on plans.id = plan_documents.plan_id
      where plan_documents.id = document_shares.plan_document_id
        and plans.user_id = auth.uid()
    )
  );

-- DELETE policyは意図的に作らない。RLSが有効なtableでは、該当操作のpolicyが
-- 1つも存在しなければその操作自体が（superuser/table ownerを除き）常に拒否される。
-- revokeはUPDATE（enabled=false, revoked_at=now()）で表現し、share historyを
-- 残せるようにする（詳細はStep 8報告のO、今回報告のK参照）。

-- anon向けのtable policyは一切追加しない（select/insert/update/deleteのいずれも）。
-- 防御的に、anonに対するtable権限を明示的に外しておく（Supabaseのデフォルト権限
-- モデルに依存せず、この時点で確実にゼロであることをmigration自体に記録する）。
revoke all on document_shares from anon;

-- ============================================================
-- get_public_document_by_token_hash
-- 公開共有ページ（未実装）専用の、唯一のanon向けアクセス経路。
-- token_hashの完全一致でdocument_sharesを検索し、title/body/document_updated_at
-- だけを返す（select * は使わない。id/plan_document_id/token_hash/enabled/
-- revoked_at/expires_at/created_atはいずれも返さない）。
--
-- SECURITY DEFINER: このprojectで初めてのSECURITY DEFINER関数のため、以下を
-- すべて満たす設計にしている。
-- - search_pathを空文字に固定し（hijacking対策）、内部のtable参照は
--   public.document_shares とschema修飾する。search_pathを空にしても、
--   now()等の組み込み関数はpg_catalogが常に暗黙的に検索されるため問題なく解決される。
-- - token_hashの完全一致のみ（LIKE/ILIKE/部分一致は使わない）。
-- - 動的SQL（EXECUTE/format等）は一切使わない。language sql の単純な
--   SELECT文のみで構成し、構造的に動的SQLを書けない形にしている。
-- - enabled=true・revoked_at is null・expires_at未経過、をすべて条件に含める。
-- - 該当なしの場合は理由を区別せず0行を返す（token不正/存在しない/revoked/
--   disabled/expiredをこの関数の外へ一切漏らさない）。
-- - PUBLICからのEXECUTEを明示的にrevokeし、anon・authenticatedへのみ
--   個別にgrantする（authenticatedを含める理由: ログイン中のブラウザで
--   公開URLを開いた場合も、同じ公開取得経路をそのまま使えるようにするため。
--   ログイン状態によって公開ページの見え方を分岐させる必要はない）。
-- - 関数owner: このmigrationを適用するロール（Supabaseの管理用ロール、通常は
--   postgres）がそのままownerになる。SECURITY DEFINERはこのowner権限で実行される
--   ため、RLSで守られたdocument_sharesの行にも関数内部からはアクセスできるが、
--   関数の外（anon/authenticatedロール自体）には返り値の3fieldしか渡らない。
--   service role keyへは一切依存しない（このprojectには導入しない）。
-- ============================================================

create function public.get_public_document_by_token_hash(p_token_hash text)
returns table (title text, body text, document_updated_at timestamptz)
language sql
security definer
stable
set search_path = ''
as $$
  select
    document_shares.title,
    document_shares.body,
    document_shares.document_updated_at
  from public.document_shares
  where document_shares.token_hash = p_token_hash
    and document_shares.enabled = true
    and document_shares.revoked_at is null
    and (document_shares.expires_at is null or document_shares.expires_at > now())
  limit 1;
$$;

revoke all on function public.get_public_document_by_token_hash(text) from public;
grant execute on function public.get_public_document_by_token_hash(text) to anon, authenticated;
