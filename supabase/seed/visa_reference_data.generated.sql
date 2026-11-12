-- visa_reference_data / visa_reference_sources の登録用 SQL
-- scripts/import-visa-reference-data.ts が data/visas/ の JSON から生成
-- 生成: 2026-11-11T23:31:06.057Z
-- entry 数: 22（australia_student_500: 11 / australia_working_holiday_417: 11）
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
    'financial_capacity', '2024年5月10日以降に申請する場合、単身の学生について年間 AUD 29,710 の資金を示す必要があります。', '{"amount":29710,"currency":"AUD","basis":"minimum","per":"year","effectiveFrom":"2024-05-10","items":["単身の学生の場合の金額"],"evidenceStatus":"unverified","evidenceGuidance":{"specificMethodsVerified":false,"doNotNameSpecificDocuments":true,"verifiedEvidence":[],"note":"資金要件の具体的な証明方法・必要書類は、現在の human-reviewed な Home Affairs 資料では未確認。具体的な書類名を回答に挙げない。"},"unverified":["家族を伴う場合の金額","学費・渡航費を含むかどうかの扱い","資金の証明方法","Home Affairs での正確な金額の一次確認（今回のページでは『十分な資金が必要』と Gather Documents の参照までしか確認できていない）"],"primarySourceVerified":false}'::jsonb,
    '2026-10-01'::date, 'Study Australia の2024年変更ページで金額（$29,710 for an individual student）と適用開始日（2024-05-10 以降の申請）を確認。既存の lib/data/cities.ts の値と一致。 Home Affairs は HTTP 403 で取得できず、一次情報との照合は未了。家族同伴時の金額・資金の証明方法は未確認。 2026-10-02: Home Affairs の Student visa ページでは『enough money が必要』『最低額は Gather Documents を参照』までしか確認できず、正確な金額の一次確認は未了。したがって primarySourceVerified は false のまま、金額は Study Australia 由来の候補として維持する。 2026-10-20: 証明方法が未確認であることを details の evidenceStatus / evidenceGuidance として構造化し、Chat が機械的に判定して具体的な書類名を出さないようにした（新しい証明方法は追加していない）。', now()
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

-- australia_working_holiday_417 / eligibility（確認日: 2026-10-01）
with upserted as (
  insert into visa_reference_data (
    visa_key, visa_code, visa_name, country_code, category, summary, details, reviewed_at, review_note, updated_at
  ) values (
    'australia_working_holiday_417', '417', 'Working Holiday visa (subclass 417)', 'AU',
    'eligibility', '日本のパスポートを持つ人の場合、このビザの申請対象年齢は18〜30歳です。上限が30歳の国・地域では、31歳になる前に申請を提出する必要があり、締切は31歳の誕生日の前日の midnight（AEST / AEDST 基準）です。30歳のうちに期限内に申請していれば、結果が出る前に31歳になっても、他の条件を満たしていれば認められ得ます。年齢以外にも、パスポートの対象国・扶養している子どもを同伴しないこと・過去の WHM プログラムのビザでの入国歴などの条件があります。', '{"country":"Japan","eligiblePassport":true,"eligiblePassportNote":"日本のパスポートはこのビザの対象となる国・地域の一覧に掲載されている。ただしこれは「日本国籍なら必ず取得できる」という意味ではなく、年齢・資金・健康・人物などの他の条件も満たす必要がある","minimumAge":18,"maximumAge":30,"ageCountryScope":"この 18〜30歳 は日本のパスポートを持つ人についての条件。上限が異なる国・地域もあるが、その条件を日本国籍の人に当てはめて説明しないこと","applicationAgeDeadline":{"rule":"上限が30歳の国・地域では、31歳になる前に申請を提出する必要がある","deadline":"31歳の誕生日の前日の midnight","timezoneBasis":"AEST / AEDST","appliesAtLodgement":true,"turningAgeAfterLodgement":"30歳のうちに期限内に申請していれば、審査結果が出る前に31歳になっても、他の条件を満たしている場合はビザが認められ得る","notAnArrivalDeadline":"これは**申請を提出する時点**の年齢条件。「30歳までに渡航しなければならない」という意味ではない。入国の期限については今回の資料で確認していないため、推測して案内しないこと"},"dependentChildren":{"cannotBeAccompanied":true,"note":"扶養している子どもを同伴することはできない","familyInSameApplication":"1回目の申請では、家族を同じ申請に含めることはできない"},"previousVisaDisqualifyingHistory":{"appliesTo":"1回目（ファースト）の申請","rule":"過去に Working Holiday Maker プログラムのビザでオーストラリアへ入国したことがある場合は対象にならない","programScopeNote":"Working Holiday Maker プログラムには、このビザ（subclass 417）のほかに、対象の国・地域向けのもう1つのサブクラスが含まれる。もう1つのサブクラスの制度内容はこのデータでは扱わないため、本人が過去に別のサブクラスで入国している場合は、公式での確認を案内すること"},"primarySourceVerified":true,"unverified":["入国の期限（申請時の年齢条件とは別のもの。今回の資料では確認していない）","資金要件の具体的な金額","健康・人物（character）の要件で必要になる具体的な書類","申請資格に関わる他の条件の具体値（就学と訓練の条件は study_rights の entry に登録済みなので、ここには含めない）"]}'::jsonb,
    '2026-10-01'::date, '2026-10-01 に人間が Home Affairs の Working Holiday visa (subclass 417) 公式ページを画面で確認した内容。日本が対象の国・地域の一覧に掲載されていること、日本は 18 to 30 years、31歳になる前の申請提出（締切は31歳の誕生日の前日の midnight AEST / AEDST）、提出後に31歳になった場合の扱い、扶養している子どもの同伴不可、1回目の申請での過去の入国歴の条件を登録した。過去の入国歴の条件はもう1つのサブクラスにも及ぶが、別サブクラスの制度情報をこの JSON へ混入させない方針（importer の分離検証）を維持するため、サブクラス番号は記録せず「Working Holiday Maker プログラムのビザ」として表現し、個別ケースは公式確認へ案内する形にした。入国の期限・資金額・申請料などは今回の画面では確認していないため unverified に残した。', now()
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
      ('Australian Government Department of Home Affairs - Working Holiday visa (subclass 417)', 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417', 'home_affairs', null::date, null::date, '2026-10-01'::date, '対象となる国・地域の一覧に日本が掲載されていること、日本は 18 to 30 years であること、30歳が上限の国・地域では31歳になる前に申請を提出する必要があること（締切は31歳の誕生日の前日の midnight AEST / AEDST）、扶養している子どもを同伴できないこと、1回目の申請では過去に同じプログラムのビザで入国していないことを確認。')
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes);

-- australia_working_holiday_417 / documents（確認日: 2026-10-23）
with upserted as (
  insert into visa_reference_data (
    visa_key, visa_code, visa_name, country_code, category, summary, details, reviewed_at, review_note, updated_at
  ) values (
    'australia_working_holiday_417', '417', 'Working Holiday visa (subclass 417)', 'AU',
    'documents', '申請には、現在のパスポートのページ（顔写真・本人情報・発行日・有効期限が分かるもの）と、両親2人の名前が記載された出生証明書のコピーが必要です。出生証明書を持っておらず取得もできない場合は、family book・政府発行の身分証明書・裁判所発行の書類が代わりになります。名前を変更している場合はその証明も必要です。滞在と出国のための資金の証拠も提出し、Home Affairs は「通常は AUD 5,000」と案内しています。人物（character）に関する書類は、条件に当てはまる場合に求められることがあります。英語以外の書類は英語への翻訳が必要ですが、書類を認証（certified）する必要はないと明記されています。', '{"appliesTo":"First Working Holiday visa（subclass 417）の申請について確認した内容。セカンド・サードの申請で追加・変更される書類は、この画面では確認していない","requiredDocuments":["現在のパスポートのページ（顔写真・本人情報・パスポートの発行日・有効期限が分かるもの）","両親2人の名前が記載された出生証明書（birth certificate）のコピー"],"birthCertificateAlternatives":{"appliesWhen":"出生証明書を持っておらず、取得することもできない場合","options":["両親2人の名前が記載された family book","政府が発行した身分証明書（government-issued identification）","本人であることを確認できる裁判所発行の書類（court-issued document）"],"note":"これは出生証明書が取得できない場合の代替であり、全員に必要な通常の書類ではない"},"caseDependentDocuments":["名前を変更している場合は、その証明となる書類"],"nameChangeEvidence":{"appliesWhen":"名前を変更している場合","officialWording":"Home Affairs は「proof such as」として次を例示している（これだけに限るとは書かれていない）","examples":["結婚証明書（marriage certificate）","離婚証明書（divorce certificate）","オーストラリアの Registry of Births, Deaths and Marriages が発行した改名の書類","該当する国外の機関が発行した改名の書類","本人が名乗っていた他の名前が分かる書類"],"note":"名前を変更していない人には必要ない。全員必須として案内しないこと"},"financialEvidence":{"heading":"Enough money for your stay and to leave","requirement":"オーストラリア滞在に十分な資金があることを示す証拠を提出する","amount":5000,"currency":"AUD","basis":"usually","amountWording":"Home Affairs の表現は「This is usually AUD 5,000.」。最低額・確定額として断定しないこと","exitRequirement":"滞在が終わるときにオーストラリアを出る航空券を購入できる十分な資金があること、または既に航空券を持っていることを示す","ifNotAttached":"証拠を申請に添付しない場合、追加の情報を求められて審査が遅れる可能性があると案内されている","specificDocumentTypesVerified":false,"note":"どのような書類で資金を示すかは、この画面に記載がないため確認できていない。書類名を挙げずに「要件がある」ことと金額の表現までを伝えること"},"mayBeRequestedDocuments":["人物（character）に関する書類（Home Affairs の表現は「We might ask you to provide」）"],"characterDocuments":{"officialWording":"Home Affairs の表現は「We might ask you to provide」。全員必須ではない","australianPoliceCertificate":{"appliesWhen":"16歳になって以降、過去10年間でオーストラリアに合計12か月以上滞在している場合に求められる可能性がある","accepted":"complete disclosure National Police Certificate（Australian Federal Police が発行したもの）のみ受理されると記載されている","notAccepted":["standard disclosure certificates","オーストラリアの州・テリトリーの警察が発行した national police certificates"],"note":"どの発行元・どの種類かで受理されるかが変わるため、種類の違いを落として説明しないこと"},"overseasPoliceCertificate":{"appliesWhen":"16歳になって以降、過去10年間で、母国を含む各国に合計12か月以上滞在している場合、その国の overseas police certificate を求められる可能性がある","note":"オーストラリアの証明書とは条件が別。混同して説明しないこと"},"militaryRecords":{"appliesWhen":"軍（armed forces）に勤務したことがある場合","options":["military service records","discharge papers"],"officialWording":"これらの書類が必要かどうかは Home Affairs から知らせると記載されている"}},"administrativeForms":{"note":"これは本人の資格を示す書類ではなく、申請の事務手続きのための様式。必要書類の一覧として案内しないこと","items":["authorised recipient を指名する場合: Form 956A（Appointment or withdrawal of an authorised recipient）","immigration assistance を受ける場合: Form 956（Appointment of a registered migration agent, legal practitioner or exempt person）"],"submission":"書面での通知・様式は ImmiAccount へアップロードする"},"translationRequirements":{"rule":"英語以外の書類はすべて英語へ翻訳し、原本と翻訳の両方を申請で提出する","inAustralia":"オーストラリア国内の翻訳者は NAATI の認定を受けている必要がある","outsideAustralia":"オーストラリア国外の翻訳者は認定は必須ではないが、各翻訳に次を英語で記載する: 氏名（full name）／住所と電話番号／翻訳する言語についての資格と経験","certificationNote":"Home Affairs は「You do not need to have any documents certified.」と明記している。認証済みのコピー（certified copy）が必須だと案内しないこと"},"scanRequirements":["英語・英語以外を含むすべての書類をカラーでスキャンまたは撮影する","スキャンや写真は鮮明である必要がある","複数ページの書類は、全ページを1つのファイルとして保存する"],"attachRule":"同じ書類を複数のことを示すために使う場合でも、その書類を添付するのは1回だけ","primarySourceVerified":true,"unverified":["資金のevidenceとして提出する具体的な書類の種類（この画面に記載がない）","健康（health）に関する書類（この画面では独立したセクションを確認していない）","人物（character）の書類が実際に求められるかどうかの個別の判断","書類ごとのファイル形式・容量などの技術的な要件","セカンド・サードの申請で追加される書類（この画面は First Working Holiday visa のもの）"]}'::jsonb,
    '2026-10-23'::date, '2026-10-23 に人間が Home Affairs の Working Holiday visa (subclass 417) → First Working Holiday visa → Step 2「Gather your documents」を画面で確認した内容。「必須」と明記されているもの（パスポートのページ・両親の名前が載った出生証明書）、出生証明書が取得できない場合の代替、名前変更の証明（条件付き・公式は proof such as として例示）、資金のevidence（usually AUD 5,000・出国用の航空券を買える資金または既に所持・未添付だと審査が遅れ得る）、「We might ask you to provide」として挙げられている人物関係の書類（Australian は complete disclosure の AFP 発行のみ受理／standard disclosure と州・テリトリー警察発行は不受理、overseas は国ごとの条件）、軍の記録（必要かは Home Affairs から知らせる）、Form 956A / 956、翻訳とスキャンの要件、同じ書類は1回だけ添付する規則を登録した。資金をどの書類で示すかは画面に記載が無いため、Phase 8.3〜8.6 で未確認として扱うと決めた financial evidence 系の書類名は一切追加していない（禁止している具体名は lib/visaReferenceContext.ts の「必ず守ること」に列挙されている）。独立した Health documents のセクションはこの画面で確認していないため、健康に関する書類は登録せず unverified に残した。この画面は First Working Holiday visa のものなので、セカンド・サードで追加される書類は未確認。', now()
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
      ('Australian Government Department of Home Affairs - Working Holiday visa (subclass 417) / First Working Holiday visa / Step 2: Gather your documents', 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417', 'home_affairs', null::date, null::date, '2026-10-23'::date, 'First Working Holiday visa の Step 2「Gather your documents」を人間が画面で確認。身分（パスポートのページ・両親の名前が載った出生証明書とその代替）、名前変更の証明、滞在と出国のための資金（usually AUD 5,000・出国用の航空券を買える資金または既に所持）、求められる可能性のある人物関係の書類（Australian / overseas police certificate・軍の記録）、authorised recipient / migration agent の様式、翻訳・スキャンの要件、同じ書類を一度だけ添付する規則を確認。独立した Health documents のセクションはこの画面では確認していない。')
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

-- australia_working_holiday_417 / costs（確認日: 2026-11-11）
with upserted as (
  insert into visa_reference_data (
    visa_key, visa_code, visa_name, country_code, category, summary, details, reviewed_at, review_note, updated_at
  ) values (
    'australia_working_holiday_417', '417', 'Working Holiday visa (subclass 417)', 'AU',
    'costs', 'Home Affairs の画面では、申請料は1回目（ファースト）が AUD 840、2回目（セカンド）と3回目（サード）が AUD 1,000 と表示されています。画面に書かれているのはこの金額までで、「〜から」「最低額」という表記はなく、いつからこの額なのか（適用開始日）も確認できていません。支払い時の手数料、一緒に申請する家族の追加料金、減額や免除の有無も、この画面では確認していません。最新の金額は Home Affairs で確認してください。', '{"appliesTo":"1回目（First）・2回目（Second）・3回目（Third）の Working Holiday visa（subclass 417）について、公式ページの各カードに表示されていた申請料。ここに無い費用は確認していない","per":"application","currency":"AUD","first":{"amount":840,"currency":"AUD","basis":"exact_as_displayed","officialWording":"Cost AUD 840.00"},"second":{"amount":1000,"currency":"AUD","basis":"exact_as_displayed","officialWording":"Cost AUD 1,000.00"},"third":{"amount":1000,"currency":"AUD","basis":"exact_as_displayed","officialWording":"Cost AUD 1,000.00"},"sameAcrossStages":false,"displayNote":"公式画面の表示は「Cost AUD 840.00」のような金額のみ。Student visa の「From AUD 2,500」のような from の表記はなく、minimum とも書かれていない。「この画面にこの額が表示されていた」という範囲で伝え、「〜から」「最低」と言い換えないこと","effectiveFrom":null,"effectiveFromNote":"この金額がいつから適用されているかは、この画面では確認していない。ページ全体の Last updated （2024-12-09）を適用開始日として説明しないこと","primarySourceVerified":true,"unverified":["この金額の適用開始日","支払い時の surcharge・カード手数料などの追加費用","一緒に申請する家族（additional applicant）の追加料金","申請料が下がる・免除される対象と条件","今後の金額の改定"]}'::jsonb,
    '2026-11-11'::date, 'Home Affairs の Working Holiday visa (subclass 417) ページで、First / Second / Third の各カードに 表示された申請料（AUD 840.00 / AUD 1,000.00 / AUD 1,000.00）を人間が画面で確認した。「from」「minimum」の表記は無く、適用開始日もこの画面には無いため、basis は exact_as_displayed とし、effectiveFrom は null のまま。surcharge・家族の追加料金・減額は確認していないので unverified に記録。ページ全体の Last updated（2024-12-09）は sourceUpdatedAt にだけ持ち、金額の適用開始日には使わない。', now()
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
      ('Australian Government Department of Home Affairs - Working Holiday visa (subclass 417)', 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417', 'home_affairs', null::date, '2024-12-09'::date, '2026-11-11'::date, 'First / Second / Third の各カードの Cost 表示（AUD 840.00 / AUD 1,000.00 / AUD 1,000.00）を確認。from / minimum の表記と適用開始日はこのページでは確認していない。sourceUpdatedAt はページ全体の Last updated であり、各申請料の適用開始日ではない。')
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes);

-- australia_working_holiday_417 / stay（確認日: 2026-11-11）
with upserted as (
  insert into visa_reference_data (
    visa_key, visa_code, visa_name, country_code, category, summary, details, reviewed_at, review_note, updated_at
  ) values (
    'australia_working_holiday_417', '417', 'Working Holiday visa (subclass 417)', 'AU',
    'stay', 'Home Affairs の画面では、滞在できる期間は1回目（ファースト）・2回目（セカンド）・3回目（サード）のいずれも 12 months と表示されています。画面にあるのはこの表示までで、この期間をいつから数えるのか（ビザが認められた日なのか、入国した日なのか）、滞在中にオーストラリアを出入りできるかどうかは書かれていないため、確認できていません。この点は Home Affairs で確認してください。', '{"appliesTo":"1回目（First）・2回目（Second）・3回目（Third）の Working Holiday visa（subclass 417）について、公式ページの各カードに表示されていた滞在期間","first":{"duration":12,"durationUnit":"months","officialWording":"Stay 12 months"},"second":{"duration":12,"durationUnit":"months","officialWording":"Stay 12 months"},"third":{"duration":12,"durationUnit":"months","officialWording":"Stay 12 months"},"sameAcrossStages":true,"wordingNote":"公式画面の表示は「Stay 12 months」のみ。滞在期間について触れるときは、この 12 months（12か月）という表示をそのまま伝えること。期間をいつから数えるか、この期間がどう適用されるかは画面に書かれていないため、そこへ踏み込まないこと","primarySourceVerified":true,"unverified":["この 12 months をどの時点から数えるか（ビザが認められた日／オーストラリアへ入国した日など）","この 12 months が状況によって短くなったり延びたりすることがあるかどうか","滞在中にオーストラリアを出入りできるか（travel / re-entry）の扱い","滞在期間に関係する他のビザ条件の具体値"]}'::jsonb,
    '2026-11-11'::date, 'Home Affairs の Working Holiday visa (subclass 417) ページで、First / Second / Third の各カードの 「Stay 12 months」を人間が画面で確認した。up to / exact のどちらとも書かれていないため durationBasis は設定せず、起算点（grant date / 入国日）や travel・re-entry の扱いも画面に無いので unverified に記録。Student 500 の stay は「Up to 6 years」と明記されていたため durationBasis を持つが、417 にはその表記が無いので同じ扱いにしない。', now()
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
      ('Australian Government Department of Home Affairs - Working Holiday visa (subclass 417)', 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417', 'home_affairs', null::date, '2024-12-09'::date, '2026-11-11'::date, 'First / Second / Third の各カードの Stay 表示（いずれも 12 months）を確認。up to / exact の区別、起算点、travel・re-entry の扱いはこのページでは確認していない。sourceUpdatedAt はページ全体の Last updated であり、滞在期間のルールの適用開始日ではない。')
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes);

-- australia_working_holiday_417 / processing（確認日: 2026-11-11）
with upserted as (
  insert into visa_reference_data (
    visa_key, visa_code, visa_name, country_code, category, summary, details, reviewed_at, review_note, updated_at
  ) values (
    'australia_working_holiday_417', '417', 'Working Holiday visa (subclass 417)', 'AU',
    'processing', '審査にかかる期間は、Home Affairs の visa processing time guide で目安を確認できます。この目安は最近決定された申請をもとにしたもので、個別の申請に当てはまる期間ではありません。2026年11月11日に確認した時点では、公式ページに「平均しておよそ3か月程度と見込まれる」と表示されていました。これは保証ではないため、ビザが認められるまでは航空券の予約や、仕事・就学の約束をしないよう案内されています。', '{"type":"dynamic_official_guide","fixedDuration":null,"guaranteed":false,"currentAverageGuidance":{"value":3,"unit":"months","wording":"expected to be around","officialWording":"The average processing time is expected to be around three months.","checkedAt":"2026-11-11","isCurrentPageValue":true},"items":["Home Affairs の visa processing time guide（審査期間の目安を見るツール）で目安を確認する","ツールが示すのは最近決定された申請の処理期間","示されるのは目安（guide only）であり、個別の申請に当てはまる期間ではない","ビザが認められるまで、航空券の予約や、渡航・仕事・就学の約束をしない"],"primarySourceVerified":true,"unverified":["保証される処理期間（保証という仕組み自体がない）","処理期間の percentile（75%・90% などの内訳）","審査の優先順位の仕組み","1回目・2回目・3回目で目安が違うかどうか（画面には1つの平均の目安しかない）","この平均の目安が今後どう変わるか"]}'::jsonb,
    '2026-11-11'::date, 'Home Affairs の Working Holiday visa (subclass 417) ページで、visa processing time guide tool を使うこと・示されるのは recently decided applications の処理期間であること・guide only で個別の申請に当てはまるものではないこと・「The average processing time is expected to be around three months.」という表示・ビザ許可前に航空券や travel / work / study の約束をしないことを人間が画面で確認した。固定の処理期間としては保存せず、type: dynamic_official_guide / fixedDuration: null / guaranteed: falseのまま、現時点の目安だけを currentAverageGuidance に確認日つきで持つ。percentile と優先順位は未確認。', now()
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
      ('Australian Government Department of Home Affairs - Working Holiday visa (subclass 417)', 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417', 'home_affairs', null::date, '2024-12-09'::date, '2026-11-11'::date, 'processing time guide tool の性質（recently decided applications にもとづく guide only で、個別の申請に当てはまるものではない）と、確認時点の表示「The average processing time is expected to be around three months.」、ビザ許可前に航空券・travel / work / study の約束をしない案内を確認。percentile と優先順位の仕組みはこのページでは確認していない。')
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes);

-- australia_working_holiday_417 / application（確認日: 2026-11-11）
with upserted as (
  insert into visa_reference_data (
    visa_key, visa_code, visa_name, country_code, category, summary, details, reviewed_at, review_note, updated_at
  ) values (
    'australia_working_holiday_417', '417', 'Working Holiday visa (subclass 417)', 'AU',
    'application', '1回目（ファースト）の申請は、オーストラリアの外からオンラインで行う必要があると案内されています。2回目・3回目については、オーストラリア国内にいる場合に満たす必要がある状態として、substantive visa（実体のあるビザ）を持っているか、最後の substantive visa が失効してから28日未満であることが挙げられています。これは「国内にいる場合に満たす状態」で、2回目・3回目をどこから申請する必要があるのか、オンラインである必要があるのかは、この画面では確認できていません。', '{"appliesTo":"1回目（First）の申請方法・申請場所と、2回目（Second）・3回目（Third）についてオーストラリア国内にいる場合の状態条件。公式ページの各カードで確認した内容","first":{"online":true,"locationRequirement":"outside_australia","officialWording":"You must apply online from outside Australia"},"secondThird":{"inAustraliaStatusCondition":{"officialWording":"If you are in Australia, you must hold a substantive visa or your last substantive visa expired less than 28 days ago","options":["substantive visa（実体のあるビザ）を持っている","最後に持っていた substantive visa が失効してから28日未満である"],"scopeNote":"これは「オーストラリア国内にいる場合に満たす必要がある状態」の条件。2回目・3回目をオーストラリア国内から申請できる、あるいは国外から申請する必要がある、という申請場所のルールとしては説明しないこと。オンライン申請である必要があるかどうかも、この画面では確認していない。また、2回目・3回目の申請場所が1回目と同じなのか違うのかも確認できていないため、「1回目とは違う」「1回目と同じ」のどちらとも言わないこと"}},"primarySourceVerified":true,"unverified":["2回目・3回目の申請場所の要件（オーストラリアの外にいる必要があるかどうか）","2回目・3回目がオンライン申請である必要があるかどうか","1回目をオーストラリア国内から申請できる例外があるかどうか","申請を提出する時期（いつまでに出す必要があるか）","bridging visa を持っている場合の扱い","「失効から28日未満」の数え方と例外","申請に含められる家族の範囲"]}'::jsonb,
    '2026-11-11'::date, 'Home Affairs の Working Holiday visa (subclass 417) ページで、First の「You must apply online from outside Australia」と、Second / Third の「If you are in Australia, you must hold a substantive visa or your last substantive visa expired less than 28 days ago」を人間が画面で確認した。後者は**国内にいる場合に満たす状態**の条件なので、申請場所のルールへ一般化しないよう scopeNote を必須にして保持。2回目・3回目の申請場所・オンライン要件・提出時期・bridging visa・28日の数え方は未確認のまま unverified に記録した。', now()
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
      ('Australian Government Department of Home Affairs - Working Holiday visa (subclass 417)', 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417', 'home_affairs', null::date, '2024-12-09'::date, '2026-11-11'::date, 'First は「You must apply online from outside Australia」、Second / Third は「If you are in Australia, you must hold a substantive visa or your last substantive visa expired less than 28 days ago」を確認。Second / Third の申請場所そのもの・オンライン要件・提出時期・bridging visa の扱いはこのページでは確認していない。')
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes);

-- australia_working_holiday_417 / work_rights（確認日: 2026-11-11）
with upserted as (
  insert into visa_reference_data (
    visa_key, visa_code, visa_name, country_code, category, summary, details, reviewed_at, review_note, updated_at
  ) values (
    'australia_working_holiday_417', '417', 'Working Holiday visa (subclass 417)', 'AU',
    'work_rights', 'Home Affairs の概要画面では、1回目（ファースト）について「You can work while you are here」、2回目（セカンド）と3回目（サード）について「You can do any kind of work while you are here」と案内されています。画面にあるのはこの表現までで、働ける時間の上限があるのか、自営業として働けるのか、ビザが始まる前や満了したあとの就労がどう扱われるのかは確認できていません。同じ雇用主のもとで働ける期間には別の条件があります。', '{"appliesTo":"First / Second / Third Working Holiday visa（subclass 417）の概要画面で確認した就労の記述。この画面に書かれている範囲のみで、就労条件の詳細ページは確認していない","reviewStage":"overview-level human-reviewed only（概要画面のみ。就労条件の詳細ページは未確認）","generalWorkRight":true,"first":{"officialWording":"You can work while you are here"},"second":{"officialWording":"You can do any kind of work while you are here"},"third":{"officialWording":"You can do any kind of work while you are here"},"wordingNote":"画面にあるのはこの表現まで。就労が認められていることと仕事の種類についての記述だけを伝え、働ける時間の上限・雇用形態・就労できる期間へ踏み込まないこと。First と Second・Third で文言が異なるが、その差が何を意味するかは画面では確認できていない","wordingDifferenceNote":"First の「You can work」と Second・Third の「You can do any kind of work」は文言が異なる。ただし「First には職種の制限がある」「Second・Third だけ職種が自由」「両者は実質同じ意味」のいずれも確認できていない。聞かれた場合は「公式の概要画面では文言が異なりますが、その差が何を意味するかまでは今回確認できていません」と伝えること","sameEmployerHandledSeparately":true,"sameEmployerNote":"同じ雇用主のもとで働ける期間には別の条件がある。その内容は same_employer の entry を正本とし、ここには複製しない。期間の数字や例外の内容をこの entry から答えないこと","primarySourceVerified":true,"unverified":["働ける時間の上限（週あたり・2週間あたりの上限があるのかどうか）","就労できる業種・職種の制限の有無と具体的な内容","First の「You can work」と Second・Third の「any kind of work」の文言の差が意味すること","自営業（self-employed / contractor）としての就労の扱い","ビザが始まる前・満了したあとの就労の扱い","ボランティアの仕事の一般的な扱い","複数の雇用主のもとで同時に働けるかどうか"]}'::jsonb,
    '2026-11-11'::date, '【段階1: overview-level human-reviewed only】Home Affairs の Working Holiday visa (subclass 417) 概要画面で、First の「You can work while you are here」と Second / Third の「You can do any kind of work while you are here」を人間が画面で確認した。就労条件の詳細ページは今回確認していないため、働ける時間の上限・職種制限の詳細・自営業・ビザ開始前と満了後の就労・ボランティアの一般的な扱い・複数雇用主での同時就労はすべて unverified のまま。時間上限が未確認なので limit / unit 等の時間を表す field は持たない（持つと上限の数値があるかのように描画される）。同一雇用主の6か月の条件と condition 8547 は same_employer、specified work の業種・地域・日数は specified_work / second_third を正本とし、この entry には複製しない。application entry にある「最後の substantive visa の失効から28日未満」は申請時の在留状態の条件で、就労できる期間の話ではないため、この entry では扱わない。', now()
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
      ('Australian Government Department of Home Affairs - Working Holiday visa (subclass 417)', 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417', 'home_affairs', null::date, '2024-12-09'::date, '2026-11-11'::date, '概要画面の First / Second / Third の各カードの就労に関する記述を確認（First: You can work while you are here／Second・Third: You can do any kind of work while you are here）。働ける時間の上限・職種制限の詳細・自営業・ビザ開始前と満了後の就労はこのページでは確認していない。sourceUpdatedAt はページ全体の Last updated であり、就労条件の適用開始日ではない。')
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes);

-- australia_working_holiday_417 / study_rights（確認日: 2026-11-12）
with upserted as (
  insert into visa_reference_data (
    visa_key, visa_code, visa_name, country_code, category, summary, details, reviewed_at, review_note, updated_at
  ) values (
    'australia_working_holiday_417', '417', 'Working Holiday visa (subclass 417)', 'AU',
    'study_rights', 'このビザには condition 8548（Maximum 4 months study）が付されます。就学（study）も訓練（training）も認められていますが、このビザでオーストラリアにいる間の就学と訓練を合わせた合計で、4か月を超えることはできません。公式の文は「You can’t study or train for more than a total of 4 months while you are in Australia on this visa.」で、この4か月は「17 weeks and 3 days」と案内されています。この4か月には週末・祝日・試験前の授業の無い期間が含まれ、オリエンテーション期間と休暇期間は含まれません。work-based training と、オーストラリアの外でも受けられる通信講座（correspondence courses）は、この4か月にはカウントしないと案内されています。1回目・2回目・3回目のいずれにも同じ condition 8548 が付されます。', '{"appliesTo":"First / Second / Third Working Holiday visa（subclass 417）のすべてについて、condition 8548 を人間が公式画面で確認した内容","conditionNumber":8548,"conditionTitle":"Maximum 4 months study","studyAllowed":true,"trainingAllowed":true,"studyTrainingCombinedLimit":true,"duration":4,"durationUnit":"months","durationBasis":"up_to","durationScope":"このビザでオーストラリアにいる間の就学（study）と訓練（training）を合わせた合計。公式の表現は「a total of 4 months while you are in Australia on this visa」","equivalentDuration":{"weeks":17,"days":3,"officialWording":"Four months of study or training is 17 weeks and 3 days."},"sameAcrossStages":true,"countsTowardLimit":["週末（weekends）","祝日（public holidays）","試験前の授業の無い期間（non-teaching periods before exams）"],"doesNotCountTowardLimit":["オリエンテーション期間（orientation periods）","休暇期間（holiday periods）"],"excludedActivities":[{"type":"work-based training","countsTowardFourMonthLimit":false,"note":"公式の文は「You can do work-based training and correspondence courses that you could take outside Australia. These don’t count towards the 4 months study or training.」。**この記載の範囲でだけ**扱い、「work-based training は training に当たらない」と一般化しないこと"},{"type":"correspondence courses that you could take outside Australia","countsTowardFourMonthLimit":false,"note":"オーストラリアの外でも受けられる通信講座について、公式が4か月にカウントしないとしている扱い。どの講座がこれに当たるかの判断基準は確認していない"}],"officialWording":"You can’t study or train for more than a total of 4 months while you are in Australia on this visa.","combinedLimitNote":"この4か月は就学と訓練の**合計**。「就学で4か月、訓練でさらに4か月」のように別枠として説明しないこと。コースごと・提供機関ごとの上限としても説明しないこと","wordingNote":"公式に書かれているのは「最大4か月（合計）」「4か月は17週3日」「含むもの・含まないもの」「カウントしない活動」まで。コースの種類（語学学校・専門・大学など）やフルタイム・パートタイムの違いによる扱いはこの画面では確認していないため、踏み込まないこと","primarySourceVerified":true,"unverified":["語学学校（ELICOS）がこの条件の対象として明示されているかどうか","専門（vocational）・大学・short course の個別の扱い","フルタイムとパートタイムで扱いが違うかどうか","雇用主が提供する訓練（employer-provided training）と work-based training の境界の詳細","複数のコース・複数の提供機関にまたがる場合の合算の具体的な方法","4か月を超えた場合の具体的な取り扱い"]}'::jsonb,
    '2026-11-12'::date, 'Home Affairs のビザ条件のページで condition 8548（Maximum 4 months study）を人間が画面で確認した。確認した内容は、就学・訓練がどちらも可能であること／合計で4か月を超えられないこと（You can’t study or train for more than a total of 4 months while you are in Australia on this visa.）／4か月は17 weeks and 3 days であること／4か月に含まれるもの（weekends / public holidays / non-teaching periods before exams）／含まれないもの（orientation periods / holiday periods）／work-based training と「オーストラリアの外でも受けられる通信講座」は4か月にカウントしないこと。First / Second / Third のいずれにも同じ condition 8548 が付されることも確認したため sameAcrossStages: true とした。4か月は**合計**なので、就学と訓練を別枠にしないよう combinedLimitNote を保持している。Student 500 の就学条件（CRICOS 登録のフルタイムコース・CoE・packaged courses・2週間48時間）はまったく別のビザの条件なので、この entry には持ち込まない。語学学校（ELICOS）の明示・vocational / university の個別扱い・フルタイムとパートタイムの違い・合算方法の詳細・4か月を超えた場合の取り扱いはこの画面では確認していないため unverified のまま。', now()
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
      ('Australian Government Department of Home Affairs - See your visa conditions（condition 8548 - Maximum 4 months study）', 'https://immi.homeaffairs.gov.au/visas/already-have-a-visa/check-visa-details-and-conditions/see-your-visa-conditions', 'home_affairs', null::date, null::date, '2026-11-12'::date, 'condition 8548（Maximum 4 months study）の本文を確認。合計4か月・17 weeks and 3 days・含むもの（weekends / public holidays / non-teaching periods before exams）・含まないもの（orientation periods / holiday periods）・work-based training と「オーストラリアの外でも受けられる通信講座」はカウントしないこと。コース種別（語学学校・vocational・university）やフルタイム／パートタイムの違い、4か月を超えた場合の取り扱いはこのページでは確認していない。'),
      ('Australian Government Department of Home Affairs - Working Holiday visa (subclass 417)', 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417', 'home_affairs', null::date, '2024-12-09'::date, '2026-11-12'::date, 'First / Second / Third のいずれにも condition 8548 が付されることを確認。sourceUpdatedAt はページ全体の Last updated であり、この条件の適用開始日ではない。')
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, accessed_at, notes);
