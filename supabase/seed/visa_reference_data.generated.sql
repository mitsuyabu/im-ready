-- visa_reference_data / visa_reference_sources の登録用 SQL
-- scripts/import-visa-reference-data.ts が data/visas/ の JSON から生成
-- 生成: 2026-10-01T23:38:43.009Z
-- entry 数: 8（australia_student_500: 6 / australia_working_holiday_417: 2）
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

-- australia_working_holiday_417 / specified_work（確認日: 2026-10-02）
with upserted as (
  insert into visa_reference_data (
    visa_key, visa_code, visa_name, country_code, category, summary, details, reviewed_at, review_note, updated_at
  ) values (
    'australia_working_holiday_417', '417', 'Working Holiday visa (subclass 417)', 'AU',
    'specified_work', 'specified work は、対象となる業種（specified industry）で、かつオーストラリアの対象地域（specified area）で行う仕事です。原則として、関係するオーストラリアの法令と該当する award に従って適切に支払われている必要があります。例外として、森林火災からの復旧や、宣言された自然災害からの復旧に関わるボランティアの仕事が specified work として認められる場合があります。業種・地域・仕事内容・時期の条件がすべて関わるため、業種名や地域名だけでは対象かどうかは決まりません。', '{"requiresEligibleIndustry":true,"requiresEligibleArea":true,"generallyPaid":true,"voluntaryExceptions":["bushfire_recovery","declared_natural_disaster_recovery"],"industries":["ツーリズム・ホスピタリティ（Northern Australia または Remote and Very Remote Australia に限る。2021-06-22 以降に行った仕事が対象で、申請時期の条件もある）","植物・動物の栽培（plant and animal cultivation）","漁業・真珠養殖（fishing and pearling）","林業（tree farming and felling）","鉱業（mining）","建設業（construction）","森林火災からの復旧（bushfire recovery。2019-07-31 より後の仕事）","自然災害からの復旧（natural disaster recovery。2021-12-31 より後の仕事）","重要な COVID-19 関連業務（2020-01-31 より後の仕事。適用時期の条件が強い過去の区分）"],"areas":["Remote and Very Remote Australia","Northern Australia","Regional Australia","森林火災の宣言地域（bushfire declared areas）","自然災害の宣言地域（natural disaster declared areas）"],"postcodeListAvailableAtSource":true,"eligibilityCheckSteps":["対象となる業種か","対象となる仕事内容（activity）か","対象となる郵便番号・宣言地域か","その区分に定められた時期（effective date）の条件を満たすか"],"evidence":["シフト勤務の場合、雇用契約書を保管するよう公式に案内されている","COVID-19 関連の区分については、裏付けとなる証拠について公式に記載がある"],"unverified":["すべての specified work に共通する証拠要件（公式ページで一般的な要件としては確認できなかった）","対象となる郵便番号の具体的な一覧（公式ページに掲載はあるが、このデータには取り込んでいない）","ツーリズム・ホスピタリティの申請時期条件の具体的な内容"],"passportExceptions":[{"appliesTo":"UK パスポート保持者（2024-07-01 以降に UK パスポートで申請する場合）","note":"セカンド・サードの 417 について specified subclass 417 work の要件を満たす必要がない。**UK 限定で、日本国籍には適用しない**"}]}'::jsonb,
    '2026-10-02'::date, 'Home Affairs の Specified subclass 417 work ページを人間が確認（accessed 2026-10-02）。業種・地域の区分・判定手順・ボランティア例外・UK パスポート例外を登録。郵便番号一覧はページに掲載があるが件数が多いため取り込まず、unverified に記録。すべての specified work に共通する一般的な証拠要件はこのページから確認できなかったため一般化していない。', now()
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
      ('Australian Government Department of Home Affairs - Specified subclass 417 work', 'https://immi.homeaffairs.gov.au/what-we-do/whm-program/specified-work-conditions/specified-work-417', 'home_affairs', null::date, null::date, '2026-10-02'::date, 'specified work の定義・対象業種・対象地域の区分・UK パスポート例外・災害復旧の扱いを確認。')
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes);

-- australia_working_holiday_417 / second_third（確認日: 2026-10-02）
with upserted as (
  insert into visa_reference_data (
    visa_key, visa_code, visa_name, country_code, category, summary, details, reviewed_at, review_note, updated_at
  ) values (
    'australia_working_holiday_417', '417', 'Working Holiday visa (subclass 417)', 'AU',
    'second_third', 'セカンドのワーキングホリデービザには3か月、サードには6か月の specified work が必要です。Home Affairs はこの「3か月」を最短の3暦月に相当する期間（最低88 calendar days）、「6か月」を最短の6暦月に相当する期間（最低179 calendar days）と定義しています。ただし日数だけでは条件を満たさず、その職種・業種でフルタイムの従業員が通常その期間に働く日数やシフトに相当する勤務を完了している必要があります。1つの雇用主のもとで連続して働く必要はなく、複数の期間や雇用主に分かれていてもかまいませんが、3か月・6か月より短い合計期間で完了することはできません。', '{"requiredPeriod":3,"requiredPeriodUnit":"months","second":{"requiredPeriod":3,"requiredPeriodUnit":"months","minimumCalendarDays":88,"calendarDaysBasis":"3 shortest calendar months equivalent"},"third":{"requiredPeriod":6,"requiredPeriodUnit":"months","minimumCalendarDays":179,"calendarDaysBasis":"6 shortest calendar months equivalent","eligibleWorkOnOrAfter":"2019-07-01"},"requiresEquivalentNormalFullTimeWork":true,"cannotCompleteInShorterTotalPeriod":true,"colloquial":"日本語では「88日」と呼ばれることが多い","countingRules":["1 work day は、その業種・職種で標準とされる通常の1日ないし1シフトの勤務時間","同じ暦日に長時間働いても2日分には数えない（標準が5時間の日に10時間働いても1日）","有給のオーストラリアの祝日・有給の病欠・それに相当する労災休暇は、specified work の日として数えられる場合がある","無給の祝日・無給の休暇は数えられない","悪天候などで働かず、その日が無給だった場合は数えられない（天候を理由に必要期間が短縮・免除される一般的な例外はない）","シフト勤務が業種の標準で、フルタイムの有給雇用契約などに基づく変動シフトの場合、有給のロスターされた休息期間を含めて数えられるケースがある（個別の契約によるため一律ではない）"],"splitRules":["1つの連続した期間で完了する必要はない","1つの雇用主のもとで完了する必要はない","週5日の連続勤務でも、週あたりの日数を減らして長い期間で行う形でもよい","複数の別々の勤務期間に分かれていてもよい","フルタイム・パートタイム・piecework の組み合わせでもよい"],"timingRules":["セカンドを申請する場合、specified work はファーストのワーキングホリデービザを保持している間に行う","サードを申請する場合、specified work はセカンドを保持している間に行い、かつ 2019-07-01 以降の仕事である必要がある","特定の bridging visa の状況や、過去の subclass 408 の COVID 関連の取り扱いについては例外がある（複雑な個別ケースとして扱う）"],"passportExceptions":[{"appliesTo":"UK パスポート保持者（2024-07-01 以降に UK パスポートで申請する場合）","note":"セカンド・サードについて specified subclass 417 work の要件を満たす必要がない。**UK 限定で、日本国籍には適用しない**"}],"unverified":["セカンド・サードの申請資格のうち、specified work 以外の条件（年齢・滞在状況など）","bridging visa / subclass 408 の例外の具体的な条件"]}'::jsonb,
    '2026-10-02'::date, 'Home Affairs の Specified subclass 417 work ページを人間が確認（accessed 2026-10-02）。3か月/88 calendar days、6か月/179 calendar days、2019-07-01 以降という条件、フルタイム相当の勤務日数要件、分割可能なこと、短縮不可、勤務日の数え方、有給/無給の扱い、シフト勤務、時期の原則を登録。specified work 以外の申請資格条件はこのページの対象外のため未確認。', now()
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
      ('Australian Government Department of Home Affairs - Specified subclass 417 work', 'https://immi.homeaffairs.gov.au/what-we-do/whm-program/specified-work-conditions/specified-work-417', 'home_affairs', null::date, null::date, '2026-10-02'::date, 'セカンド3か月（最低88 calendar days）・サード6か月（最低179 calendar days）・フルタイム相当要件・数え方・分割の可否を確認。')
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes);
