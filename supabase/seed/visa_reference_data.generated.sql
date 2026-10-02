-- visa_reference_data / visa_reference_sources の登録用 SQL
-- scripts/import-visa-reference-data.ts が data/visas/ の JSON から生成
-- 生成: 2026-10-02T00:43:47.058Z
-- entry 数: 14（australia_student_500: 11 / australia_working_holiday_417: 3）
-- 適用方法: 内容を目で確認したうえで、Supabase の SQL エディタで実行する。
-- 対象 entry 以外は変更しない（upsert のみ。DELETE は対象 entry の出典の入れ替えだけ）。

-- australia_student_500 / work_rights（確認日: 2026-10-02）
with upserted as (
  insert into visa_reference_data (
    visa_key, visa_code, visa_name, country_code, category, summary, details, reviewed_at, review_note, updated_at
  ) values (
    'australia_student_500', '500', 'Student visa (subclass 500)', 'AU',
    'work_rights', '授業期間中（study terms / semesters）の就労は、2週間で48時間までが上限です。Masters by Research や Doctoral の学生は、コース開始後はこの上限を超えて働けます。授業期間外（コースのブレイク中）の扱いは異なるため、公式情報で確認が必要です。', '{"limit":48,"unit":"hours_per_fortnight","during":"study_terms","exceptions":[{"appliesTo":"Masters by Research / Doctoral の学生","note":"コース開始後は 48 hours per fortnight を超えて働ける"}],"unverified":["授業期間外（コースのブレイク中）の上限（Home Affairs のビザ条件ページで要確認。今回の資料では未確認）","上限を超えた場合の具体的な取り扱い"],"primarySourceVerified":true}'::jsonb,
    '2026-10-02'::date, 'Home Affairs の Student visa (subclass 500) ページで 48 hours per fortnight（授業期間中）と、master''s by research / doctoral の学生に就労上限がないことを確認し、一次情報照合済みにした。Study Australia の出典も根拠として保持。授業期間外の扱いは今回の資料では確認できていないため unverified に残した。', now()
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
      ('Australian Government Department of Home Affairs - Student visa (subclass 500)', 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500', 'home_affairs', null::date, null::date, '2026-10-02'::date, '授業・訓練が in session の間は 48 hours per fortnight。master''s by research / doctoral は就労上限なし。'),
      ('Study Australia - Student visa (subclass 500)', 'https://www.studyaustralia.gov.au/en/plan-your-move/your-guide-to-visas/student-visa-subclass-500', 'study_australia', null::date, null::date, '2026-10-01'::date, '「maximum of 48 hours per fortnight」および研究学位の例外を確認。ページに最終更新日の記載なし。'),
      ('Study Australia - Your work rights explained', 'https://www.studyaustralia.gov.au/en/work-in-australia/work-rights-and-responsibilities/your-work-rights-explained', 'study_australia', null::date, null::date, '2026-10-01'::date, '「don''t work more than 48 hours in a fortnight during study terms and semesters」を確認。')
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes);

-- australia_student_500 / health_insurance（確認日: 2026-10-02）
with upserted as (
  insert into visa_reference_data (
    visa_key, visa_code, visa_name, country_code, category, summary, details, reviewed_at, review_note, updated_at
  ) values (
    'australia_student_500', '500', 'Student visa (subclass 500)', 'AU',
    'health_insurance', '申請者および一緒に申請する家族は、オーストラリア滞在の全期間について適切な健康保険が必要です。通常は承認されたオーストラリアの提供者による OSHC です。国外から申請する場合、保険の開始日はコース開始日ではなく入国日からで、出国するまで維持する必要があります。', '{"items":["申請者と一緒に申請する家族について、滞在の全期間の保険が必要","通常は承認されたオーストラリアの提供者による OSHC","国外から申請する場合、保険の開始は入国日から（コース開始日ではない）","オーストラリアを出国するまで維持する必要がある","オーストラリア国内から申請する場合、直前のビザで保険が必要だった場合は継続した保険が必要","学校が手配する場合は CoE に保険の情報が含まれる","自分で手配する場合は保険証券の番号をビザ申請に記載する","必要な保険の情報を提出しないと、申請が却下される可能性があると案内されている"],"oshcCountryExceptions":["ノルウェー（定められた取り決めがある場合）","スウェーデン（定められた取り決めがある場合）","ベルギー（定められた取り決めがある場合）"],"countryExceptionsNote":"この国別の特例は上記の国に限られる。日本国籍の人には適用しない","primarySourceVerified":true,"unverified":["加入タイミングの細かい要件","免除が認められる具体的な手続き"]}'::jsonb,
    '2026-10-02'::date, 'Home Affairs の Student visa (subclass 500) ページで、滞在全期間の保険・OSHC・国外申請時は入国日から・国内申請時の継続要件・学校手配/自己手配の扱い・情報未提出で却下され得ること・ノルウェー/スウェーデン/ベルギーの特例を確認し、一次情報照合済みにした。国別特例は日本には適用しないことを明記。', now()
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
      ('Australian Government Department of Home Affairs - Student visa (subclass 500)', 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500', 'home_affairs', null::date, null::date, '2026-10-02'::date, '滞在全期間の保険、OSHC、国外申請時は入国日から開始、国内申請時の継続要件、国別特例（ノルウェー/スウェーデン/ベルギー）を確認。'),
      ('Study Australia - Student visa (subclass 500)', 'https://www.studyaustralia.gov.au/en/plan-your-move/your-guide-to-visas/student-visa-subclass-500', 'study_australia', null::date, null::date, '2026-10-01'::date, null)
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes);

-- australia_student_500 / genuine_student（確認日: 2026-10-02）
with upserted as (
  insert into visa_reference_data (
    visa_key, visa_code, visa_name, country_code, category, summary, details, reviewed_at, review_note, updated_at
  ) values (
    'australia_student_500', '500', 'Student visa (subclass 500)', 'AU',
    'genuine_student', 'genuine student（本当に学ぶ目的で来る学生）であることが求められ、オーストラリアで学ぶことが学生ビザの主な目的であると理解している必要があります。この要件は Genuine Student (GS) requirement と呼ばれ、以前の Genuine Temporary Entrant (GTE) requirement を置き換えたものです。', '{"effectiveFrom":"2024-03-23","items":["現在の状況（家族・地域・仕事・経済状況とのつながり）に関する質問","そのコースを選んだ理由・留学先としてオーストラリアを選んだ理由","そのコースを学ぶことでどのような利点があるか"],"unverified":["回答の評価基準","2024-03-23 という適用開始日の一次情報での確認"],"primarySourceVerified":true,"effectiveFromSource":"Study Australia（2024-03-23 という日付は Home Affairs のこのページでは確認していない）"}'::jsonb,
    '2026-10-02'::date, 'Home Affairs の Student visa (subclass 500) ページで『genuine student であること』『オーストラリアで学ぶことが学生ビザの主な目的だと理解していること』を確認し、現行の要件名として一次情報照合済みにした。ただし GS が GTE を置き換えた日付（2024-03-23）は今回のページでは確認できていないため、その日付は Study Australia 由来のまま。', now()
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
      ('Australian Government Department of Home Affairs - Student visa (subclass 500)', 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500', 'home_affairs', null::date, null::date, '2026-10-02'::date, 'genuine student であること、オーストラリアでの就学が学生ビザの主な目的であると理解していることを確認。GS/GTE の置き換え日はこのページでは未確認。'),
      ('Study Australia - Student and Temporary Graduate visa changes: 2024', 'https://www.studyaustralia.gov.au/en_in/tools-and-resources/news/student-and-temporary-graduate-visa-changes--2024', 'study_australia', null::date, null::date, '2026-10-01'::date, 'GS requirement が GTE requirement を置き換えた旨と日付を確認。')
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes);

-- australia_student_500 / financial_capacity（確認日: 2026-10-01）
with upserted as (
  insert into visa_reference_data (
    visa_key, visa_code, visa_name, country_code, category, summary, details, reviewed_at, review_note, updated_at
  ) values (
    'australia_student_500', '500', 'Student visa (subclass 500)', 'AU',
    'financial_capacity', '2024年5月10日以降に申請する場合、単身の学生について年間 AUD 29,710 の資金を示す必要があります。', '{"amount":29710,"currency":"AUD","basis":"minimum","per":"year","effectiveFrom":"2024-05-10","items":["単身の学生の場合の金額"],"unverified":["家族を伴う場合の金額","学費・渡航費を含むかどうかの扱い","資金の証明方法","Home Affairs での正確な金額の一次確認（今回のページでは『十分な資金が必要』と Gather Documents の参照までしか確認できていない）"],"primarySourceVerified":false}'::jsonb,
    '2026-10-01'::date, 'Study Australia の2024年変更ページで金額（$29,710 for an individual student）と適用開始日（2024-05-10 以降の申請）を確認。既存の lib/data/cities.ts の値と一致。 Home Affairs は HTTP 403 で取得できず、一次情報との照合は未了。家族同伴時の金額・資金の証明方法は未確認。 2026-10-02: Home Affairs の Student visa ページでは『enough money が必要』『最低額は Gather Documents を参照』までしか確認できず、正確な金額の一次確認は未了。したがって primarySourceVerified は false のまま、金額は Study Australia 由来の候補として維持する。', now()
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

-- australia_student_500 / costs（確認日: 2026-10-02）
with upserted as (
  insert into visa_reference_data (
    visa_key, visa_code, visa_name, country_code, category, summary, details, reviewed_at, review_note, updated_at
  ) values (
    'australia_student_500', '500', 'Student visa (subclass 500)', 'AU',
    'costs', '学生ビザの申請料は AUD 2,500 からです。限られた条件で申請料が下がる対象があり、一緒に申請する家族には追加の料金がかかります。このほか健康診断・警察証明書・生体情報の取得などの費用がかかる場合があります。', '{"amount":2500,"currency":"AUD","basis":"from","per":"application","effectiveFrom":"2026-07-01","effectiveFromSource":"Study Australia（この適用開始日は Home Affairs のこのページでは確認していない）","items":["本人の申請料は AUD 2,500 から","一緒に申請する家族には追加の料金がかかる","健康診断・警察証明書・生体情報の取得などの費用が別にかかる場合がある"],"costConcessions":["太平洋諸島・東ティモールの国籍の人（条件あり）","ASEAN 加盟国の国籍の人（条件あり）","Independent ELICOS の対象（条件あり）","Non-Award sector の対象（条件あり）"],"concessionsNote":"申請料が下がる対象は限られた条件のもの。日本国籍の人に自動的に適用されるものではない","primarySourceVerified":true,"unverified":["申請料が下がる具体的な条件","家族の追加料金の具体額","免除の対象となる条件"]}'::jsonb,
    '2026-10-02'::date, 'Home Affairs の Student visa (subclass 500) ページで『From AUD 2,500』、限られた条件での減額、家族の追加料金、健康診断・警察証明書・生体情報の追加費用を確認し、金額は既存の Study Australia 由来の値と一致したため一次情報照合済みにした。ただし適用開始日（2026-07-01）は今回のページでは確認できていないため、Study Australia 由来のまま effectiveFromSource に明記。減額対象を日本国籍に自動適用しないことも記録。', now()
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
      ('Australian Government Department of Home Affairs - Student visa (subclass 500)', 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500', 'home_affairs', null::date, null::date, '2026-10-02'::date, '申請料は From AUD 2,500、限られた条件での減額、家族の追加料金、健康診断・警察証明書・生体情報の追加費用を確認。適用開始日はこのページでは未確認。'),
      ('Study Australia - Student visa (subclass 500)', 'https://www.studyaustralia.gov.au/en/plan-your-move/your-guide-to-visas/student-visa-subclass-500', 'study_australia', null::date, null::date, '2026-10-01'::date, '申請料は「from」表記。正確な額は申請状況によって変わる。')
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes);

-- australia_student_500 / stay（確認日: 2026-10-02）
with upserted as (
  insert into visa_reference_data (
    visa_key, visa_code, visa_name, country_code, category, summary, details, reviewed_at, review_note, updated_at
  ) values (
    'australia_student_500', '500', 'Student visa (subclass 500)', 'AU',
    'stay', '滞在できる期間は最長6年で、就学の登録内容（enrolment）に沿って決まります。コースの種類やコースの長さによって変わるため、全員が6年になるわけではありません。小学校の Year 1〜4 で就学を開始する子どもは、原則として最長3年です。', '{"duration":6,"durationUnit":"years_up_to","durationBasis":"up_to","enrolmentDependent":true,"items":["最長6年。ただし「up to」であり、全員が6年になるわけではない","就学の登録内容（enrolment）に沿って決まる","コースの種類とコースの長さによって変わる","小学校の Year 1〜4 で開始する子どもは原則として最長3年"],"primarySchoolYears1to4MaxYears":3,"supersededValue":{"previousValue":"最長5年","previousSource":"Study Australia","resolution":"一次情報（Home Affairs）を正本とする方針に従い、2026-10-02 確認の最長6年・enrolment 連動へ更新した"},"unverified":["コースの種類・長さと滞在期間の具体的な対応関係","Year 1〜4 以外の学年の上限"],"primarySourceVerified":true}'::jsonb,
    '2026-10-02'::date, '【conflict を解消】Study Australia 由来の「最長5年」と、Home Affairs の「Up to 6 years and in line with your enrolment」が不一致だった。一次情報優先の方針に従い Home Affairs ベースへ更新し、旧値は supersededValue に記録。「全員6年」と読めないよう up to / enrolment 連動 / 小学校 Year 1〜4 は原則3年を details に保持。', now()
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
      ('Australian Government Department of Home Affairs - Student visa (subclass 500)', 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500', 'home_affairs', null::date, null::date, '2026-10-02'::date, '滞在期間（Up to 6 years and in line with your enrolment）とコース種類・長さによる変動、小学校 Year 1〜4 の原則最長3年を確認。'),
      ('Study Australia - Student visa (subclass 500)', 'https://www.studyaustralia.gov.au/en/plan-your-move/your-guide-to-visas/student-visa-subclass-500', 'study_australia', null::date, null::date, '2026-10-01'::date, 'このページには「最長5年」と記載されていた。Home Affairs の現行記載（最長6年）と不一致のため、値の根拠としては採用していない（履歴として保持）。')
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes);

-- australia_student_500 / eligibility（確認日: 2026-10-02）
with upserted as (
  insert into visa_reference_data (
    visa_key, visa_code, visa_name, country_code, category, summary, details, reviewed_at, review_note, updated_at
  ) values (
    'australia_student_500', '500', 'Student visa (subclass 500)', 'AU',
    'eligibility', '学生ビザの申請には、genuine student であること、原則6歳以上であること、英語力の証明が必要な場合はそれを満たすこと、健康保険・資金・健康・人物（character）の要件を満たすことなどが求められます。18歳未満の場合は適切な福祉（welfare）の手配が必要で、小中高で就学する場合は学年ごとの年齢条件もあります。18歳以上は Life in Australia の冊子を読んだうえで Australian Values Statement に署名します。', '{"minimumAge":6,"minimumAgeUnit":"years","items":["genuine student であること（オーストラリアで学ぶことが学生ビザの主な目的だと理解していること）","原則6歳以上","健康（health）の要件がある（申請者と一緒に申請する家族）","人物（character）の要件がある（申請者と、16歳以上で一緒に申請する家族）","18歳以上は Life in Australia の冊子を読む（または説明を受ける）うえで Australian Values Statement に署名する","オーストラリア政府への債務がある場合は、支払済みか支払いの取り決めが必要","過去のビザの取消や却下が審査に影響し得る","18歳未満の申請者については、子どもの最善の利益（best interests of the child）が考慮される"],"schoolStudentAgeRules":["Year 9 を開始する場合は17歳未満","Year 10 を開始する場合は18歳未満","Year 11 を開始する場合は19歳未満","Year 12 を開始する場合は20歳未満"],"schoolStudentAgeRulesNote":"これは小中高で就学する場合の追加条件。大学・専門・語学留学の人に当てはめないこと","under18Welfare":"18歳未満の場合は適切な福祉（welfare）の手配が必要。18歳になる時点などによって必要な情報が変わる場合がある","primarySourceVerified":true,"unverified":["福祉（welfare）の手配として認められる具体的な形式","健康診断が必要になる具体的な条件","人物（character）要件で警察証明書が必要になる具体的な条件","過去のビザ取消・却下が与える影響の具体的な判断"]}'::jsonb,
    '2026-10-02'::date, 'Home Affairs の Student visa (subclass 500) ページで、genuine student・最低年齢6歳・学校の学年別年齢条件・18歳未満の福祉の手配・健康・人物・Australian Values Statement・政府への債務・過去のビザ履歴・子どもの最善の利益を確認。健康診断や警察証明書が全員必須とは記載されていないため、要件の存在と個別書類の要求は分けて記録した。', now()
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
      ('Australian Government Department of Home Affairs - Student visa (subclass 500)', 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500', 'home_affairs', null::date, null::date, '2026-10-02'::date, '申請資格（年齢・genuine student・健康・人物・福祉・Values Statement・債務・ビザ履歴）を確認。')
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes);

-- australia_student_500 / application（確認日: 2026-10-02）
with upserted as (
  insert into visa_reference_data (
    visa_key, visa_code, visa_name, country_code, category, summary, details, reviewed_at, review_note, updated_at
  ) values (
    'australia_student_500', '500', 'Student visa (subclass 500)', 'AU',
    'application', '申請はオンラインで行います。2026年10月2日からの現行ルールでは、ほとんどの申請はオーストラリア国外から行う必要があります。国内から申請するには、対象となるビザを持っていることと、例外に当てはまることの両方が必要です。ワーキングホリデー（417）やワークアンドホリデー（462）などを持っている人は、国内から学生ビザを申請できないビザの一覧に含まれています。申請時にはすべての就学予定コースの CoE が必要で、CoE が無い申請は無効（invalid）になります。', '{"ruleChangeFrom":"2026-10-02","ruleChangeScope":["オーストラリア国内から誰が申請できるか","家族を申請に含められるか","次の学生ビザ（further Student visa）の申請","家族の後からの申請（subsequent entrant）"],"items":["申請はオンラインで行う","2026-10-02 からは、ほとんどの申請をオーストラリア国外から行う必要がある","国内から申請するには、対象となるビザを持っていることと例外に当てはまることの両方が必要","申請時にすべての就学予定コースの CoE を提出する（CoE が無いと申請は無効になる）","CoE はビザが決定される時点でも有効である必要がある","健康保険（OSHC）の情報が必要。学校が手配する場合は CoE に含まれ、自分で手配する場合は保険証券の番号を記載する"],"cannotApplyOnshoreVisaSubclasses":["subclass 417（ワーキングホリデー）","subclass 462（ワークアンドホリデー）","subclass 485","subclass 600","subclass 601","subclass 651"],"cannotApplyOnshoreNote":"これらのビザを持っている人は、オーストラリア国内から学生ビザを申請できないと案内されている。ワーキングホリデーから学生ビザへの切り替えを考えている人には、原則として国外からの申請が必要になる点を伝えること。ただし本人の状況が複雑な場合は Home Affairs での確認を案内し、個別の可否を保証しないこと","furtherStudentVisaExemptions":["主たるコースの修了に最大12か月の追加が必要な場合","DFAT または国防（Defence）の支援を受けている学生","博士課程（PhD）の学生","小中高（primary / secondary school）で就学する場合","コースの進級（course progression）に関する条件を満たす場合","教育機関の提供不能（provider default）が生じた場合"],"furtherStudentVisaExemptionsNote":"現在学生ビザを持つ主申請者が、オーストラリア国内から次の学生ビザを申請できる限定的な例外。6種類ある。本人がその例外に当たるかは状況によるため、当てはまると決めつけないこと","familyRuleFrom":"2026-10-02","familyRule":"2026年10月2日からの現行ルールでは、ほとんどの学生ビザ申請者は家族を申請に含められない（例外に当てはまる場合を除く）。さらに現行ルールでは、家族が後から subsequent entrant として申請することはいかなる場合もできない","familyInclusionExemptions":["博士課程（PhD）の学生","DFAT または国防（Defence）の支援を受けている学生","外国政府の奨学金を受けている人","対象となる太平洋諸島・ASEAN 国籍の人","現在学生ビザを持つ人の継続・進級に関する一定のケース"],"familyExemptionsNote":"これらの例外は限定的で、日本国籍の一般の留学希望者に自動的に当てはまるものではない","primarySourceVerified":true,"unverified":["国内申請が可能になる例外の具体的な条件","次の学生ビザの各例外の詳細な要件","家族を含められる例外の詳細な要件","国内から申請できないビザの一覧の完全な内容（ここに挙げたのは確認できた一部）"]}'::jsonb,
    '2026-10-02'::date, 'Home Affairs の Student visa (subclass 500) ページで、2026-10-02 からの申請場所と家族のルール変更、オンライン申請、CoE の提出と有効性、国内から申請できないビザ（417・462・485・600・601・651 を含む）、国内で次の学生ビザを申請できる6種類の例外、家族を含められる例外を確認。一覧は確認できた範囲のみで、完全な一覧であるとは扱っていない。', now()
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
      ('Australian Government Department of Home Affairs - Student visa (subclass 500)', 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500', 'home_affairs', null::date, null::date, '2026-10-02'::date, '申請方法・2026-10-02 からの国内申請と家族のルール・CoE の要件・国内申請できないビザ・限定的な例外を確認。')
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes);

-- australia_student_500 / study_rights（確認日: 2026-10-02）
with upserted as (
  insert into visa_reference_data (
    visa_key, visa_code, visa_name, country_code, category, summary, details, reviewed_at, review_note, updated_at
  ) values (
    'australia_student_500', '500', 'Student visa (subclass 500)', 'AU',
    'study_rights', 'CRICOS に登録されたフルタイムのコースに在籍する必要があり、在籍（enrolment）を維持する必要があります。複数のコースをつなげて就学する場合（packaged courses）は、すべての CoE のコードが必要で、一方のコースが次のコースにつながっている必要があります。コースの間隔は原則として2暦月未満です。', '{"items":["CRICOS に登録されたフルタイムのコースに在籍する","在籍（enrolment）を維持する必要がある","取消済み・修了済みのコースの CoE は有効ではない"],"packagedCourses":["すべての CoE のコードが必要","一方のコースが次のコースにつながっている必要がある","コースの間隔は原則として2暦月未満","学年の切り替わり（academic-year transition）については例外がある"],"primarySourceVerified":true,"unverified":["学年の切り替わりの例外が認められる具体的な条件","在籍を維持できなかった場合の具体的な取り扱い","コース変更が認められる条件"]}'::jsonb,
    '2026-10-02'::date, 'Home Affairs の Student visa (subclass 500) ページで、CRICOS 登録のフルタイムコース・在籍の維持・packaged courses（全 CoE コード・コースの連続性・原則2暦月未満の間隔・学年切替の例外）を確認。', now()
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
      ('Australian Government Department of Home Affairs - Student visa (subclass 500)', 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500', 'home_affairs', null::date, null::date, '2026-10-02'::date, 'CRICOS 登録のフルタイムコース、在籍維持、packaged courses の条件を確認。')
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes);

-- australia_student_500 / documents（確認日: 2026-10-02）
with upserted as (
  insert into visa_reference_data (
    visa_key, visa_code, visa_name, country_code, category, summary, details, reviewed_at, review_note, updated_at
  ) values (
    'australia_student_500', '500', 'Student visa (subclass 500)', 'AU',
    'documents', '申請には、すべての就学予定コースの CoE（または承認された代わりの在籍証明）と、必要な場合は健康保険の情報が必要です。英語力・資金・健康・人物・福祉・家族関係の書類は、本人の状況によって必要になります。必要書類は人によって変わるため、最終的には Home Affairs の Document Checklist tool で確認する必要があります。', '{"requiredDocuments":["すべての就学予定コースの CoE（または承認された代わりの在籍証明）","必要な場合の健康保険（OSHC）の情報（自分で手配した場合は保険証券の番号）"],"caseDependentDocuments":["英語力の証明（必要になる場合）","資金の証明","健康に関する書類・健康診断","人物（character）に関する書類","18歳未満の場合の福祉（welfare）の手配に関する書類","家族に関する書類（家族を含められる例外に当たる場合）"],"mayBeRequestedDocuments":["Home Affairs や ImmiAccount から追加で求められる書類"],"finalCheck":"必要書類は申請者の状況によって変わるため、Home Affairs の Document Checklist tool が最終的な確認手段","coeExceptions":["承認された外務貿易省（Foreign Affairs）または Trade の奨学金を受けている場合は支援の手紙（support letter）","国防（Defence）の支援を受けている場合は支援の手紙","中等教育の交換留学生は AASES","修士論文の採点を待っている大学院の研究学生は教育機関の手紙"],"coeExceptionsNote":"CoE が不要になる限定的な例外。「CoE は絶対に全員必須」と断定しないこと","primarySourceVerified":true,"unverified":["パスポートなど身分に関する書類が全員必須かどうか（今回のページでは明示を確認できていない）","申請者ごとの完全な必要書類の一覧","健康診断が必要になる具体的な条件","警察証明書が必要になる具体的な条件","承認されている英語試験の一覧と必要なスコア","英語試験のスコアの有効期間の具体的な要件"],"englishEvidence":{"mayBeRequired":true,"note":"英語力の証明は『必要になる場合がある（might need to provide）』もので、全員一律ではない","routes":["承認された英語試験のスコアを示す","免除（exemption）に当てはまる"],"onlineOrAtHomeTestsGenerallyNotAccepted":true,"checkWith":"Home Affairs の Document Checklist tool で、自分に英語力の証明が必要かを確認する"},"englishExemptions":["イギリス / アメリカ / カナダ / ニュージーランド / アイルランドのパスポートを持つ場合","Foreign Affairs または Defence の支援を受けている場合","中等教育の交換留学（Secondary Exchange）","登録された学校（registered school）のコースで就学する場合","単独の ELICOS（standalone ELICOS）","英語以外の言語で提供されるコース","登録された大学院の研究コース（postgraduate research）","一定の英語で行われた過去の就学がある場合","一定のオーストラリアでの就学がある場合"],"englishExemptionsNote":"免除は限定的で、本人の状況によって当てはまるかが変わる。パスポートによる免除の一覧に日本は含まれないため、日本国籍の人に自動的に免除を適用しないこと","englishScoreNote":"承認されている試験と必要なスコアは今回の資料で全て確認できていない。特定の試験スコアを一律の基準として案内しないこと"}'::jsonb,
    '2026-10-02'::date, 'Home Affairs の Student visa (subclass 500) ページで、CoE（と承認された代替）・健康保険の情報・状況によって必要になる書類（英語力・資金・健康・人物・福祉・家族）・Document Checklist tool が最終確認手段であることを確認。パスポート等の身分書類が全員必須という明示は今回のページで確認できなかったため、一般知識から必須側へ追加していない。 英語力については、証明が必要になる場合がある旨・承認試験／免除の2つの経路・オンラインや自宅受験の試験が一般に認められない旨・免除の区分を確認した。承認試験の一覧と必要スコアは確認できていないため、具体的なスコアは登録していない。', now()
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
      ('Australian Government Department of Home Affairs - Student visa (subclass 500)', 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500', 'home_affairs', null::date, null::date, '2026-10-02'::date, 'CoE と承認された代替、健康保険の情報、状況により必要な書類、CoE が不要になる例外、Document Checklist tool を確認。')
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes);

-- australia_student_500 / processing（確認日: 2026-10-02）
with upserted as (
  insert into visa_reference_data (
    visa_key, visa_code, visa_name, country_code, category, summary, details, reviewed_at, review_note, updated_at
  ) values (
    'australia_student_500', '500', 'Student visa (subclass 500)', 'AU',
    'processing', '審査にかかる期間は、Home Affairs の processing time guide で目安を確認できます。これは最近決定された申請をもとにした目安で、個別の申請に当てはまる時間ではありません。オーストラリア国外からの学生ビザ申請には、Ministerial Direction による審査の優先順位の仕組みがあります。', '{"type":"dynamic_official_guide","fixedDuration":null,"guaranteed":false,"items":["Home Affairs の processing time guide で目安を確認する","目安は最近決定された申請にもとづくもので、個別の申請に当てはまる時間ではない","国外からの申請には審査の優先順位の仕組みがある"],"outsideAustraliaPrioritySystem":true,"ministerialDirections":["2025-11-14 より前に申請されたもの: MD111","2025-11-14 以降に申請されたもの: MD115"],"currentMinisterialDirectionFrom":"2025-11-14","currentDirection":"MD115","directionsNote":"Ministerial Direction の番号は通常のユーザー向けの回答には出さない。優先順位の仕組みがあることだけを伝える","primarySourceVerified":true,"unverified":["現時点の具体的な処理期間の目安","優先順位の仕組みが個別の申請に与える影響"]}'::jsonb,
    '2026-10-02'::date, 'Home Affairs の Student visa (subclass 500) ページで、processing time guide tool の性質（最近決定された申請にもとづく目安で、個別申請に当てはまるものではない）と、国外申請の優先順位（2025-11-14 より前は MD111、以降は MD115）を確認。固定日数は持たず、保証しない形で登録した。', now()
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
      ('Australian Government Department of Home Affairs - Student visa (subclass 500)', 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500', 'home_affairs', null::date, null::date, '2026-10-02'::date, 'processing time guide の性質と、国外申請の優先順位（MD111 / MD115）を確認。')
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes);

-- australia_working_holiday_417 / same_employer（確認日: 2026-10-02）
with upserted as (
  insert into visa_reference_data (
    visa_key, visa_code, visa_name, country_code, category, summary, details, reviewed_at, review_note, updated_at
  ) values (
    'australia_working_holiday_417', '417', 'Working Holiday visa (subclass 417)', 'AU',
    'same_employer', 'ワーキングホリデー（Working Holiday Maker）のビザには condition 8547 が付され、原則として同一の雇用主で働けるのは最大6か月です。ただし現在は例外があり、勤務地が変わる場合（どの一箇所でも6か月を超えない）、オーストラリア全域での植物・動物の栽培、指定された critical sector、Northern Australia の一部業種、自然災害からの復旧の仕事などが該当します。例外に当てはまらない場合でも、条件によっては Home Affairs へ6か月を超えて働く許可を申請できます。許可が必ず認められるわけではなく、最初の6か月が終わる前に申請する必要があります。', '{"conditionNumber":8547,"appliesToVisaProgram":"Working Holiday Maker program のビザに必須の条件として付される","duration":6,"durationUnit":"months","generalRule":"同一の雇用主で働けるのは最大6か月。例外に該当する場合、または許可を得た場合を除く","employerMeaning":"employer は本人が直接働いている business / organisation として説明されている。labour hire や recruitment agency を通じて働く場合は、実際に就労する business の側が重要になるケースがある","exceptionsReviewed":true,"exceptionsExist":true,"exceptions":[{"appliesTo":"勤務地が異なる場合（different locations）","note":"同じ雇用主でも、どの一箇所でも6か月を超えないこと。「店舗を変えれば必ずリセットされる」という意味ではなく、各勤務地での期間が6か月以内である必要がある"},{"appliesTo":"植物・動物の栽培（plant and animal cultivation）","note":"オーストラリア全域が対象（地域の限定なし）"},{"appliesTo":"指定された critical sectors","note":"公式ページで案内されている対象は agriculture / food processing / health / aged care / disability care / childcare / tourism / hospitality。業種に該当するかは公式の記載で確認が必要"},{"appliesTo":"Northern Australia の一部業種","note":"fishing and pearling / tree farming and felling / construction / mining。**Northern Australia に限る**ため、オーストラリア全域の例外として扱わないこと"},{"appliesTo":"自然災害からの復旧（natural disaster recovery）","note":"オーストラリア全域が対象"}],"effectiveFrom":"2024-01-01","policyStatus":"current_policy_during_consultation","policyNote":"現在の例外の取り扱いは2024-01-01から開始され、Working Holiday program の見直し（reform consultation）が行われている間は継続すると案内されている。恒久的な制度として扱わず、将来変更され得ることを前提に説明すること","permission":{"available":true,"notGuaranteed":true,"considerations":["継続的なフルタイム就労が可能になるビザを申請済みであること","その結果を待っている状態であること","その仕事が雇用主にとって不可欠（critical）であること"],"requirement":"最初の6か月の期間が終了する前に申請する必要がある","recommendation":"申請フォームの案内では、6か月の終了まで少なくとも2週間前の提出が推奨されている","whilePendingIfSubmittedInTime":"6か月の終了前に申請済みであれば、書面での結果を受け取るまで同じ雇用主のもとで働き続けられると案内されている","ifSubmittedLate":"6か月が終了してから初めて申請した場合は、いったん就労を止めて結果を待つ必要がある"},"afterExemptionOrPermission":"例外に該当する場合、または許可が認められた場合は、同じ雇用主のもとでビザの残り期間を働けるケースがある。ただし個別のビザ条件は本人のビザで確認が必要","visaPeriodContext":["セカンドのビザでは、ファーストのビザで働いた雇用主のもとで、さらに6か月働けると案内されている","サードのビザでは、ファースト・セカンドで働いた雇用主のもとで、さらに6か月働けると案内されている","したがって「1つの会社で生涯6か月まで」という意味ではない"],"vevoGuidance":"本人の具体的なビザ条件は、ビザの grant letter または VEVO / myVEVO で確認するよう案内する。制度の一般的な説明と、本人個別の条件の確認は分けて伝えること","unverified":["employer の定義について、labour hire / recruitment agency 経由の場合の具体的な判断基準","critical sectors の各業種に該当するかどうかの詳細な定義","Northern Australia の地理的範囲の具体的な定義","許可（permission）の審査基準の詳細と、判断に要する期間"]}'::jsonb,
    '2026-10-02'::date, 'Home Affairs の3ページを人間が確認（accessed 2026-10-02）: 6-month work limitation / work longer than 6 months / condition 8547 permission request form。原則6か月・condition 8547・現行の5つの例外・2024-01-01 開始で consultation 中という位置づけ・許可の経路と考慮事項・申請時期（要件と推奨を区別）・審査待ち中の扱い・セカンド/サードでの追加6か月を登録。employer の定義の細部、critical sectors の業種定義、Northern Australia の地理的範囲、審査基準の詳細は未確認のため unverified に記録。 なお condition 8547 は Working Holiday Maker プログラムのビザに付される条件だが、この JSON は 417 用のため他のサブクラス番号は記載していない（混同防止）。', now()
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
      ('Australian Government Department of Home Affairs - 6 month work limitation', 'https://immi.homeaffairs.gov.au/what-we-do/whm-program/specified-work-conditions/6-month-work-limitation', 'home_affairs', null::date, null::date, '2026-10-02'::date, 'condition 8547 の原則6か月と現行の例外、2024-01-01 開始・consultation 中という位置づけを確認。'),
      ('Australian Government Department of Home Affairs - Work longer than 6 months', 'https://immi.homeaffairs.gov.au/visas/already-have-a-visa/check-visa-details-and-conditions/waivers-and-permissions/work-longer-than-6-months', 'home_affairs', null::date, null::date, '2026-10-02'::date, '許可申請の経路と考慮事項、審査待ち中の扱いを確認。'),
      ('Australian Government Department of Home Affairs - WHM condition 8547 permission request form', 'https://immi.homeaffairs.gov.au/what-we-do/whm-program/specified-work-conditions/WHM-condition-8547-permission-request-form', 'home_affairs', null::date, null::date, '2026-10-02'::date, '申請時期の推奨（6か月終了の少なくとも2週間前）を確認。要件としての「6か月終了前」とは区別して記録。')
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
