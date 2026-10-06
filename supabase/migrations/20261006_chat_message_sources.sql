-- ============================================================
-- chat_messages.sources
--
-- Chat の回答の下に出している「参考情報」（確認済みリファレンスの出典）を、
-- ページを読み込み直したあとの過去メッセージにも復元できるようにする。
--
-- 設計の要点:
--   1. 保存するのは**利用者へ表示してよい sanitized な値だけ**
--      （lib/referenceSources.ts の ChatSource と同じ形）。
--      内部メモ（review_note）・内部の検証フラグ（primarySourceVerified）・
--      旧値の履歴（supersededValue）・未確認項目（unverified）・
--      開発用 snapshot のメタデータ・prompt の指示文は**保存しない**。
--   2. 既存の列は変更しない。`proposal_data` は提案カード専用なので流用しない。
--   3. RLS は chat_messages の既存 policy がそのまま効く
--      （plans.user_id = auth.uid() のセッションの行だけ読み書きできる）。
--      列を足すだけなので policy の追加・変更は不要。
--   4. 匿名 /widget は DB 保存をしない設計のまま。この列は Plan Chat 用。
--
-- 形（jsonb の配列。1メッセージあたり最大5件）:
--   [
--     {
--       "name": "Australian Government Department of Home Affairs - Student visa (subclass 500)",
--       "url": "https://immi.homeaffairs.gov.au/...",
--       "label": "一次情報（Department of Home Affairs）",
--       "reviewedAt": "2026-10-02",
--       "updatedAt": null,
--       "note": null,
--       "topic": "学生ビザ（サブクラス500） / 就労の条件"
--     }
--   ]
--
-- 読み出し側は保存済みの値を**そのまま信用せず**再検証する
-- （https 以外の URL・必須項目の欠け・長すぎる文字列・件数超過を落とす）。
-- 古い行には sources が無いため null のままで、その場合は出典パネルを出さない。
-- ============================================================

alter table chat_messages
  add column if not exists sources jsonb;

comment on column chat_messages.sources is
  'その回答で表示した確認済みリファレンスの出典（表示してよい sanitized な値のみ。最大5件）。内部メモは保存しない。';
