-- visa_reference_data / visa_reference_sources の登録用 SQL
-- scripts/import-visa-reference-data.ts が data/visas/ の JSON から生成
-- 生成: 2026-10-01T05:56:49.211Z
-- entry 数: 6（australia_student_500: 6）
-- 適用方法: 内容を目で確認したうえで、Supabase の SQL エディタで実行する。
-- 対象 entry 以外は変更しない（upsert のみ。DELETE は対象 entry の出典の入れ替えだけ）。

-- australia_student_500 / work_rights（確認日: 2026-10-01）
with upserted as (
  insert into visa_reference_data (
    visa_key, visa_code, visa_name, country_code, category, summary, details, reviewed_at, review_note, updated_at
  ) values (
    'australia_student_500', '500', 'Student visa (subclass 500)', 'AU',
    'work_rights', '授業期間中（study terms / semesters）の就労は、2週間で48時間までが上限です。Masters by Research や Doctoral の学生は、コース開始後はこの上限を超えて働けます。授業期間外（コースのブレイク中）の扱いは異なるため、公式情報で確認が必要です。', '{"limit":48,"unit":"hours_per_fortnight","during":"study_terms","exceptions":[{"appliesTo":"Masters by Research / Doctoral の学生","note":"コース開始後は 48 hours per fortnight を超えて働ける"}],"unverified":["授業期間外（コースのブレイク中）の上限","上限を超えた場合の具体的な取り扱い"]}'::jsonb,
    '2026-10-01'::date, 'Study Australia の2ページで同一の記述を確認。Home Affairs は HTTP 403 で未取得のため一次情報の照合が未了。ブレイク中の扱いは両ページに記載がなく unverified に記録した。', now()
  )
  on conflict (visa_key, category) do update set
    visa_code = excluded.visa_code,
    visa_name = excluded.visa_name,
    country_code = excluded.country_code,
    summary = excluded.summary,
    details = excluded.details,
    reviewed_at = excluded.reviewed_at,
    review_note = excluded.review_note,
    updated_at = now()
  returning id
),
cleared as (
  delete from visa_reference_sources
  where entry_id in (select id from upserted)
  returning entry_id
)
insert into visa_reference_sources (
  entry_id, source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes
)
select upserted.id, v.source_name, v.source_url, v.source_type, v.source_published_at, v.source_updated_at, v.accessed_at, v.notes
from upserted
cross join (
  values
      ('Study Australia - Student visa (subclass 500)', 'https://www.studyaustralia.gov.au/en/plan-your-move/your-guide-to-visas/student-visa-subclass-500', 'study_australia', null::date, null::date, '2026-10-01'::date, '「maximum of 48 hours per fortnight」および研究学位の例外を確認。ページに最終更新日の記載なし。'),
      ('Study Australia - Your work rights explained', 'https://www.studyaustralia.gov.au/en/work-in-australia/work-rights-and-responsibilities/your-work-rights-explained', 'study_australia', null::date, null::date, '2026-10-01'::date, '「don''t work more than 48 hours in a fortnight during study terms and semesters」を確認。')
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes);

-- australia_student_500 / health_insurance（確認日: 2026-10-01）
with upserted as (
  insert into visa_reference_data (
    visa_key, visa_code, visa_name, country_code, category, summary, details, reviewed_at, review_note, updated_at
  ) values (
    'australia_student_500', '500', 'Student visa (subclass 500)', 'AU',
    'health_insurance', 'OSHC（留学生向けの健康保険）を、オーストラリア滞在の全期間について維持する必要があります。', '{"items":["滞在の全期間について適切な健康保険を維持すること"],"unverified":["加入タイミングの要件","家族を含める場合の扱い","免除となるケース"]}'::jsonb,
    '2026-10-01'::date, 'Study Australia の記述（maintain adequate health insurance for the whole of your stay）を確認。保険会社・金額は未確認。 Home Affairs は HTTP 403 で取得できず、一次情報との照合は未了。加入タイミング・家族を含める場合・免除となるケースは未確認。', now()
  )
  on conflict (visa_key, category) do update set
    visa_code = excluded.visa_code,
    visa_name = excluded.visa_name,
    country_code = excluded.country_code,
    summary = excluded.summary,
    details = excluded.details,
    reviewed_at = excluded.reviewed_at,
    review_note = excluded.review_note,
    updated_at = now()
  returning id
),
cleared as (
  delete from visa_reference_sources
  where entry_id in (select id from upserted)
  returning entry_id
)
insert into visa_reference_sources (
  entry_id, source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes
)
select upserted.id, v.source_name, v.source_url, v.source_type, v.source_published_at, v.source_updated_at, v.accessed_at, v.notes
from upserted
cross join (
  values
      ('Study Australia - Student visa (subclass 500)', 'https://www.studyaustralia.gov.au/en/plan-your-move/your-guide-to-visas/student-visa-subclass-500', 'study_australia', null::date, null::date, '2026-10-01'::date, null)
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes);

-- australia_student_500 / genuine_student（確認日: 2026-10-01）
with upserted as (
  insert into visa_reference_data (
    visa_key, visa_code, visa_name, country_code, category, summary, details, reviewed_at, review_note, updated_at
  ) values (
    'australia_student_500', '500', 'Student visa (subclass 500)', 'AU',
    'genuine_student', 'Genuine Student (GS) requirement に沿った質問への回答が必要です。これは2024年3月23日に、以前の Genuine Temporary Entrant (GTE) requirement を置き換えたものです。', '{"effectiveFrom":"2024-03-23","items":["現在の状況（家族・地域・仕事・経済状況とのつながり）に関する質問","そのコースを選んだ理由・留学先としてオーストラリアを選んだ理由","そのコースを学ぶことでどのような利点があるか"],"unverified":["回答の評価基準","不十分と判断された場合の取り扱い"]}'::jsonb,
    '2026-10-01'::date, 'Study Australia の2024年変更ページで GS が GTE を置き換えた日付（2024-03-23）と質問の趣旨を確認。 Home Affairs は HTTP 403 で取得できず、一次情報との照合は未了。回答の評価基準は未確認。', now()
  )
  on conflict (visa_key, category) do update set
    visa_code = excluded.visa_code,
    visa_name = excluded.visa_name,
    country_code = excluded.country_code,
    summary = excluded.summary,
    details = excluded.details,
    reviewed_at = excluded.reviewed_at,
    review_note = excluded.review_note,
    updated_at = now()
  returning id
),
cleared as (
  delete from visa_reference_sources
  where entry_id in (select id from upserted)
  returning entry_id
)
insert into visa_reference_sources (
  entry_id, source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes
)
select upserted.id, v.source_name, v.source_url, v.source_type, v.source_published_at, v.source_updated_at, v.accessed_at, v.notes
from upserted
cross join (
  values
      ('Study Australia - Student and Temporary Graduate visa changes: 2024', 'https://www.studyaustralia.gov.au/en_in/tools-and-resources/news/student-and-temporary-graduate-visa-changes--2024', 'study_australia', null::date, null::date, '2026-10-01'::date, 'GS requirement が GTE requirement を置き換えた旨と日付を確認。')
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes);

-- australia_student_500 / financial_capacity（確認日: 2026-10-01）
with upserted as (
  insert into visa_reference_data (
    visa_key, visa_code, visa_name, country_code, category, summary, details, reviewed_at, review_note, updated_at
  ) values (
    'australia_student_500', '500', 'Student visa (subclass 500)', 'AU',
    'financial_capacity', '2024年5月10日以降に申請する場合、単身の学生について年間 AUD 29,710 の資金を示す必要があります。', '{"amount":29710,"currency":"AUD","basis":"minimum","per":"year","effectiveFrom":"2024-05-10","items":["単身の学生の場合の金額"],"unverified":["家族を伴う場合の金額","学費・渡航費を含むかどうかの扱い","資金の証明方法"]}'::jsonb,
    '2026-10-01'::date, 'Study Australia の2024年変更ページで金額（$29,710 for an individual student）と適用開始日（2024-05-10 以降の申請）を確認。既存の lib/data/cities.ts の値と一致。 Home Affairs は HTTP 403 で取得できず、一次情報との照合は未了。家族同伴時の金額・資金の証明方法は未確認。', now()
  )
  on conflict (visa_key, category) do update set
    visa_code = excluded.visa_code,
    visa_name = excluded.visa_name,
    country_code = excluded.country_code,
    summary = excluded.summary,
    details = excluded.details,
    reviewed_at = excluded.reviewed_at,
    review_note = excluded.review_note,
    updated_at = now()
  returning id
),
cleared as (
  delete from visa_reference_sources
  where entry_id in (select id from upserted)
  returning entry_id
)
insert into visa_reference_sources (
  entry_id, source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes
)
select upserted.id, v.source_name, v.source_url, v.source_type, v.source_published_at, v.source_updated_at, v.accessed_at, v.notes
from upserted
cross join (
  values
      ('Study Australia - Student and Temporary Graduate visa changes: 2024', 'https://www.studyaustralia.gov.au/en_in/tools-and-resources/news/student-and-temporary-graduate-visa-changes--2024', 'study_australia', null::date, null::date, '2026-10-01'::date, null)
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes);

-- australia_student_500 / costs（確認日: 2026-10-01）
with upserted as (
  insert into visa_reference_data (
    visa_key, visa_code, visa_name, country_code, category, summary, details, reviewed_at, review_note, updated_at
  ) values (
    'australia_student_500', '500', 'Student visa (subclass 500)', 'AU',
    'costs', '2026年7月1日以降、学生ビザの申請料は1申請あたり AUD 2,500 からです（免除の対象となる場合を除く）。', '{"amount":2500,"currency":"AUD","basis":"from","per":"application","effectiveFrom":"2026-07-01","unverified":["免除の対象となる条件","家族を含める場合の追加料金","支払い方法"]}'::jsonb,
    '2026-10-01'::date, 'Study Australia の記述「From 1 July 2026, student visa fees are from AUD$2,500 per visa application unless you are exempt」を確認。「from（〜から）」である点を basis で保持している。確定額として扱わないこと。 Home Affairs は HTTP 403 で取得できず、一次情報との照合は未了。免除条件・同伴者の追加料金は未確認。', now()
  )
  on conflict (visa_key, category) do update set
    visa_code = excluded.visa_code,
    visa_name = excluded.visa_name,
    country_code = excluded.country_code,
    summary = excluded.summary,
    details = excluded.details,
    reviewed_at = excluded.reviewed_at,
    review_note = excluded.review_note,
    updated_at = now()
  returning id
),
cleared as (
  delete from visa_reference_sources
  where entry_id in (select id from upserted)
  returning entry_id
)
insert into visa_reference_sources (
  entry_id, source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes
)
select upserted.id, v.source_name, v.source_url, v.source_type, v.source_published_at, v.source_updated_at, v.accessed_at, v.notes
from upserted
cross join (
  values
      ('Study Australia - Student visa (subclass 500)', 'https://www.studyaustralia.gov.au/en/plan-your-move/your-guide-to-visas/student-visa-subclass-500', 'study_australia', null::date, null::date, '2026-10-01'::date, '申請料は「from」表記。正確な額は申請状況によって変わる。')
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes);

-- australia_student_500 / stay（確認日: 2026-10-01）
with upserted as (
  insert into visa_reference_data (
    visa_key, visa_code, visa_name, country_code, category, summary, details, reviewed_at, review_note, updated_at
  ) values (
    'australia_student_500', '500', 'Student visa (subclass 500)', 'AU',
    'stay', '滞在できる期間はコースの期間に応じて決まり、最長5年です。', '{"duration":5,"durationUnit":"years_max","items":["コース期間に応じた期間（最長5年）"],"unverified":["コース期間との具体的な対応関係","延長・再申請の条件"]}'::jsonb,
    '2026-10-01'::date, 'Study Australia の記述（stay for the duration of your course, maximum five years）を確認。 Home Affairs は HTTP 403 で取得できず、一次情報との照合は未了。コース期間との具体的な対応関係・延長の条件は未確認。', now()
  )
  on conflict (visa_key, category) do update set
    visa_code = excluded.visa_code,
    visa_name = excluded.visa_name,
    country_code = excluded.country_code,
    summary = excluded.summary,
    details = excluded.details,
    reviewed_at = excluded.reviewed_at,
    review_note = excluded.review_note,
    updated_at = now()
  returning id
),
cleared as (
  delete from visa_reference_sources
  where entry_id in (select id from upserted)
  returning entry_id
)
insert into visa_reference_sources (
  entry_id, source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes
)
select upserted.id, v.source_name, v.source_url, v.source_type, v.source_published_at, v.source_updated_at, v.accessed_at, v.notes
from upserted
cross join (
  values
      ('Study Australia - Student visa (subclass 500)', 'https://www.studyaustralia.gov.au/en/plan-your-move/your-guide-to-visas/student-visa-subclass-500', 'study_australia', null::date, null::date, '2026-10-01'::date, null)
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes);
