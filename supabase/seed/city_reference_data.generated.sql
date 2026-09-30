-- city_reference_data / city_reference_sources の登録用 SQL
-- scripts/import-city-reference-data.ts が data/cities/ の JSON から生成
-- 生成: 2026-09-30T06:29:27.412Z
-- entry 数: 7
-- 適用方法: 内容を目で確認したうえで、Supabase の SQL エディタで実行する。

-- goldcoast / housing（確認日: 2026-09-30）
with upserted as (
  insert into city_reference_data (
    city_key, country_code, admin_area, category, summary, notes, details, reviewed_at, review_note, updated_at
  ) values (
    'goldcoast', 'AU', 'QLD',
    'housing', 'Bond University が2026年の目安として公表している金額では、ゴールドコーストで学外のシェア（一室）を借りる場合は週 AUD 200 程度から、ひとりでアパートを借りる場合は週 AUD 550 程度からとされ、ビーチへの近さや周辺環境で変わるとされています。学内の寮は Standard Twin が1学期 AUD 3,825 で、光熱費・洗濯設備・清掃が含まれます。学外のシェアに入居する場合は、敷金などの初期費用として AUD 800〜2,000 を見ておくよう案内されています。', 'Bond University が自校の学生向けに示している目安で、ゴールドコースト全体の実勢家賃の統計ではない。学内寮の金額は1学期あたりで、週あたりの金額ではない点に注意。学外の金額は立地で大きく変わるとページに明記されている。',
    '{"estimates":[{"sourceName":"Bond University - Living costs","label":"学外のシェア（一室）","min":200,"max":null,"currency":"AUD","period":"week","basis":"2026年の目安。ビーチへの近さや周辺環境で変わるとされる下限。"},{"sourceName":"Bond University - Living costs","label":"学外でひとりでアパートを借りる場合","min":550,"max":null,"currency":"AUD","period":"week","basis":"2026年の目安。立地で変わるとされる下限。"},{"sourceName":"Bond University - Living costs","label":"学内寮（Standard Twin・光熱費と清掃込み）","min":3825,"max":3825,"currency":"AUD","period":"semester","basis":"2026年の学内寮の料金。1学期あたり。光熱費・洗濯設備・清掃を含む。"},{"sourceName":"Bond University - Living costs","label":"学外シェア入居時の初期費用（敷金など）","min":800,"max":2000,"currency":"AUD","period":"one-time","basis":"入居時に一度必要になる費用の目安。家賃とは別。"}]}'::jsonb, '2026-09-30'::date, '人間レビュー待ち。confidence は Medium〜High（ゴールドコースト固有・2026年と明記された大学公式の金額）。ただし根拠は大学1校のみなので、Griffith University の living cost ページ（今回はアクセスできず未確認）を追加できると前提の違いを比較できる。', now()
  )
  on conflict (city_key, category) do update set
    country_code = excluded.country_code,
    admin_area = excluded.admin_area,
    summary = excluded.summary,
    notes = excluded.notes,
    details = excluded.details,
    reviewed_at = excluded.reviewed_at,
    review_note = excluded.review_note,
    updated_at = now()
  returning id
),
cleared as (
  delete from city_reference_sources
  where entry_id in (select id from upserted)
  returning entry_id
)
insert into city_reference_sources (
  entry_id, source_name, source_url, source_type, source_published_at, source_updated_at, note
)
select upserted.id, v.source_name, v.source_url, v.source_type, v.source_published_at, v.source_updated_at, v.note
from upserted
cross join (
  values
      ('Bond University - Living costs', 'https://bond.edu.au/fees-and-finance-options/additional-costs-to-consider/living-costs', 'university', null::date, null::date, 'ゴールドコーストの大学が2026年の金額として公表。最終更新日の記載なし。学生個人の状況で変わると注記あり。')
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, note);

-- goldcoast / food（確認日: 2026-09-30）
with upserted as (
  insert into city_reference_data (
    city_key, country_code, admin_area, category, summary, notes, details, reviewed_at, review_note, updated_at
  ) values (
    'goldcoast', 'AU', 'QLD',
    'food', 'Bond University が2026年の目安として公表している金額では、学外で暮らす場合の食料品代は週 AUD 80〜200 程度とされています。外食はファストフードのセットが AUD 15 程度から、中価格帯のレストランのメイン料理が AUD 30 以上とされ、自炊中心にするかどうかで差が出ます。学内の食事プランを使う場合は1学期 AUD 2,400 程度からです。', '食料品代は自炊を前提とした金額で、外食の頻度によって総額は変わる。大学1校が示す目安であり、統計ではない。',
    '{"estimates":[{"sourceName":"Bond University - Living costs","label":"食料品（自炊中心）","min":80,"max":200,"currency":"AUD","period":"week","basis":"2026年の目安。学外で暮らす場合。"},{"sourceName":"Bond University - Living costs","label":"学内の食事プラン","min":2400,"max":null,"currency":"AUD","period":"semester","basis":"2026年の目安。1学期あたりの下限。"}]}'::jsonb, '2026-09-30'::date, '人間レビュー待ち。confidence は Medium（大学1校のみが根拠）。シドニー側は前提が揃う食費データが取れていないため、都市間で食費を比較する用途にはまだ使わないこと。', now()
  )
  on conflict (city_key, category) do update set
    country_code = excluded.country_code,
    admin_area = excluded.admin_area,
    summary = excluded.summary,
    notes = excluded.notes,
    details = excluded.details,
    reviewed_at = excluded.reviewed_at,
    review_note = excluded.review_note,
    updated_at = now()
  returning id
),
cleared as (
  delete from city_reference_sources
  where entry_id in (select id from upserted)
  returning entry_id
)
insert into city_reference_sources (
  entry_id, source_name, source_url, source_type, source_published_at, source_updated_at, note
)
select upserted.id, v.source_name, v.source_url, v.source_type, v.source_published_at, v.source_updated_at, v.note
from upserted
cross join (
  values
      ('Bond University - Living costs', 'https://bond.edu.au/fees-and-finance-options/additional-costs-to-consider/living-costs', 'university', null::date, null::date, 'ゴールドコーストの大学が2026年の金額として公表。食料品・外食・学内食事プランの目安を記載。')
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, note);

-- goldcoast / transport（確認日: 2026-09-30）
with upserted as (
  insert into city_reference_data (
    city_key, country_code, admin_area, category, summary, notes, details, reviewed_at, review_note, updated_at
  ) values (
    'goldcoast', 'AU', 'QLD',
    'transport', 'クイーンズランド州の公共交通（Translink）は、ゴールドコーストを含む州内の全ゾーン・全交通手段で1回あたり AUD 0.50 の均一運賃です。バス・電車・路面電車・フェリー・オンデマンドサービスが対象で、空港連絡鉄道（Airtrain）は対象外です。この均一運賃はクイーンズランド州政府が2024年11月30日に恒久化を発表しています。', '州全体の制度で、ゴールコースト固有の料金ではない。均一運賃の期間中はオフピーク割引や一部の割引制度が適用されない点がTranslinkのページに明記されている。運賃制度は政策変更の影響を受けやすいため、他カテゴリより短い間隔で再確認したい。',
    '{"estimates":[{"sourceName":"Translink - 50 cent fares","label":"公共交通の均一運賃（全ゾーン・全交通手段）","min":0.5,"max":0.5,"currency":"AUD","period":"trip","basis":"1回の乗車あたり。Airtrainは対象外。オフピーク割引は適用されない。"}]}'::jsonb, '2026-09-30'::date, '人間レビュー待ち。confidence は High（交通事業者の公式ページと州政府の公式発表の2つが一致）。Bond University のページにも「1回50セント」と記載があり、3つ目の裏付けになっている。', now()
  )
  on conflict (city_key, category) do update set
    country_code = excluded.country_code,
    admin_area = excluded.admin_area,
    summary = excluded.summary,
    notes = excluded.notes,
    details = excluded.details,
    reviewed_at = excluded.reviewed_at,
    review_note = excluded.review_note,
    updated_at = now()
  returning id
),
cleared as (
  delete from city_reference_sources
  where entry_id in (select id from upserted)
  returning entry_id
)
insert into city_reference_sources (
  entry_id, source_name, source_url, source_type, source_published_at, source_updated_at, note
)
select upserted.id, v.source_name, v.source_url, v.source_type, v.source_published_at, v.source_updated_at, v.note
from upserted
cross join (
  values
      ('Translink - 50 cent fares', 'https://translink.com.au/tickets-and-fares/50-cent-fares', 'transport_authority', null::date, null::date, 'クイーンズランド州の公共交通事業者の公式ページ。均一運賃の対象範囲と除外（Airtrain）を確認。最終更新日の記載なし。'),
      ('Queensland Government - Ministerial media statement (50 cent fares made permanent)', 'https://statements.qld.gov.au/statements/101663', 'government_information', '2024-11-30'::date, null::date, '州政府の公式発表。Translinkの全ネットワークで均一運賃を恒久化する旨を記載。')
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, note);

-- goldcoast / utilities（確認日: 2026-09-30）
with upserted as (
  insert into city_reference_data (
    city_key, country_code, admin_area, category, summary, notes, details, reviewed_at, review_note, updated_at
  ) values (
    'goldcoast', 'AU', 'QLD',
    'utilities', 'Bond University が2026年の目安として公表している金額では、電気代は一般的な世帯で週 AUD 38 程度、インターネット回線は月 AUD 60 程度から、携帯電話のプランは月 AUD 10 程度からとされています。学内の寮に住む場合、光熱費は寮の料金に含まれます。', '電気代は世帯あたりの平均で、学生1人あたりの金額ではない。シェアハウスなら人数で分けることになる。物件の設備や季節によって変わる。',
    '{"estimates":[{"sourceName":"Bond University - Living costs","label":"電気代（一般的な世帯の平均）","min":38,"max":38,"currency":"AUD","period":"week","basis":"2026年の目安。世帯あたりの平均で、1人あたりの金額ではない。"},{"sourceName":"Bond University - Living costs","label":"インターネット回線","min":60,"max":null,"currency":"AUD","period":"month","basis":"2026年の目安。プランの下限。"},{"sourceName":"Bond University - Living costs","label":"携帯電話のプラン","min":10,"max":null,"currency":"AUD","period":"month","basis":"2026年の目安。プランの下限。"}]}'::jsonb, '2026-09-30'::date, '人間レビュー待ち。confidence は Medium（大学1校のみが根拠。電気代は世帯平均のため1人あたりへの読み替えは禁止）。', now()
  )
  on conflict (city_key, category) do update set
    country_code = excluded.country_code,
    admin_area = excluded.admin_area,
    summary = excluded.summary,
    notes = excluded.notes,
    details = excluded.details,
    reviewed_at = excluded.reviewed_at,
    review_note = excluded.review_note,
    updated_at = now()
  returning id
),
cleared as (
  delete from city_reference_sources
  where entry_id in (select id from upserted)
  returning entry_id
)
insert into city_reference_sources (
  entry_id, source_name, source_url, source_type, source_published_at, source_updated_at, note
)
select upserted.id, v.source_name, v.source_url, v.source_type, v.source_published_at, v.source_updated_at, v.note
from upserted
cross join (
  values
      ('Bond University - Living costs', 'https://bond.edu.au/fees-and-finance-options/additional-costs-to-consider/living-costs', 'university', null::date, null::date, 'ゴールドコーストの大学が2026年の金額として公表。電気代は世帯平均としての記載。')
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, note);

-- sydney / safety（確認日: 2026-09-30）
with upserted as (
  insert into city_reference_data (
    city_key, country_code, admin_area, category, summary, notes, details, reviewed_at, review_note, updated_at
  ) values (
    'sydney', 'AU', 'NSW',
    'safety', 'NSW犯罪統計局（BOCSAR）が公表している2026年6月までの2年間の推移では、Greater Sydney で強盗が11.9%、住居への侵入盗が5.8%、車上ねらいが4.2%減少し、主要な犯罪区分の多くは横ばいでした。一方で小売店での万引きは9.5%増えています。10年単位で見ると財産犯は大きく減り、記録された暴力犯罪は増えていますが、BOCSAR自身が「警察への届け出が増えたことを反映している可能性がある」と注記しています。生活の場面では、NSW州政府が留学生向けに、夜間の一人歩きを避ける・明るく慣れた道を通る・バッグは体に近づけて持つ・公共交通では運転手や他の乗客の近くに座る、といった基本的な注意を案内しています。', '統計はGreater Sydney単位で、シドニー市中心部やエリアごとの差を表すものではない。BOCSARはLGA・郵便番号・suburb単位のデータも公開しているため、エリア差に触れる場合はその粒度で改めて確認する必要がある。他州の統計とは罪種の定義・集計方法・公表期間が異なるため、州をまたぐ数値の比較には使えない。',
    '{}'::jsonb, '2026-09-30'::date, '人間レビュー待ち。BOCSARの四半期公表（次回以降）で数値が変わるため、再確認時は参照期間ごと更新する。エリア差についてはLGA単位のデータを見てから追記するか判断する。', now()
  )
  on conflict (city_key, category) do update set
    country_code = excluded.country_code,
    admin_area = excluded.admin_area,
    summary = excluded.summary,
    notes = excluded.notes,
    details = excluded.details,
    reviewed_at = excluded.reviewed_at,
    review_note = excluded.review_note,
    updated_at = now()
  returning id
),
cleared as (
  delete from city_reference_sources
  where entry_id in (select id from upserted)
  returning entry_id
)
insert into city_reference_sources (
  entry_id, source_name, source_url, source_type, source_published_at, source_updated_at, note
)
select upserted.id, v.source_name, v.source_url, v.source_type, v.source_published_at, v.source_updated_at, v.note
from upserted
cross join (
  values
      ('NSW Bureau of Crime Statistics and Research (BOCSAR) - Crime and policing', 'https://bocsar.nsw.gov.au/statistics-dashboards/crime-and-policing.html', 'government_statistics', '2026-09-16'::date, null::date, 'Greater Sydney単位。2026年6月までの2年間の推移。四半期ごとに公表。ライセンス条件はページに明記がなく要確認。'),
      ('Study NSW - Safety information', 'https://www.study.nsw.gov.au/current-students/staying-healthy-and-safe/safety', 'government_information', null::date, null::date, 'NSW州政府による留学生向けの安全案内。NSW全体が対象でシドニー固有ではない。最終更新日の記載なし。')
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, note);

-- sydney / housing（確認日: 2026-09-30）
with upserted as (
  insert into city_reference_data (
    city_key, country_code, admin_area, category, summary, notes, details, reviewed_at, review_note, updated_at
  ) values (
    'sydney', 'AU', 'NSW',
    'housing', 'University of Sydney が公表している学生向けの生活費目安では、住居費は月あたり AUD 980〜3,500 と幅があり、シェアハウスの一室を借りる方が安くなるとされています。大学の寮は固定料金で提示される場合があります。同大学はこの目安をオーストラリア政府の Study Australia 生活費計算ツールに基づくものとしており、単身の学生を想定した金額です。', 'この金額は大学が示す目安で、物件の場所・部屋の種類・共有かどうかで大きく変わる。住居の種類ごとの内訳はページに記載がない。Study Australia の計算ツール自体の最終更新は2023年11月とされているため、現在の相場とは差がある可能性がある。範囲はGreater Sydneyを想定した目安で、特定の地域の実勢家賃ではない。',
    '{"estimates":[{"sourceName":"University of Sydney - Living costs","label":"住居費（単身学生の目安・種類別の内訳なし）","min":980,"max":3500,"currency":"AUD","period":"month","basis":"単身学生。大学が示す目安で、Study Australia の生活費計算ツールに基づく。シェアハウスの一室ならより安くなるとされる。"}]}'::jsonb, '2026-09-30'::date, '人間レビュー待ち。confidence は Medium。住居の種類別（寮・シェア・ホームステイ）の内訳が取れる公式sourceを追加で探す価値がある（UNSW / UTS の living cost ページは未確認）。', now()
  )
  on conflict (city_key, category) do update set
    country_code = excluded.country_code,
    admin_area = excluded.admin_area,
    summary = excluded.summary,
    notes = excluded.notes,
    details = excluded.details,
    reviewed_at = excluded.reviewed_at,
    review_note = excluded.review_note,
    updated_at = now()
  returning id
),
cleared as (
  delete from city_reference_sources
  where entry_id in (select id from upserted)
  returning entry_id
)
insert into city_reference_sources (
  entry_id, source_name, source_url, source_type, source_published_at, source_updated_at, note
)
select upserted.id, v.source_name, v.source_url, v.source_type, v.source_published_at, v.source_updated_at, v.note
from upserted
cross join (
  values
      ('University of Sydney - Living costs', 'https://www.sydney.edu.au/study/fees-and-loans/other-costs/living-costs.html', 'university', null::date, null::date, '単身学生向けの目安。金額はStudy Australiaの生活費計算ツールに基づくと記載。最終更新日の記載なし。')
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, note);

-- sydney / transport（確認日: 2026-09-30）
with upserted as (
  insert into city_reference_data (
    city_key, country_code, admin_area, category, summary, notes, details, reviewed_at, review_note, updated_at
  ) values (
    'sydney', 'AU', 'NSW',
    'transport', 'シドニーの公共交通（電車・メトロ・バス・ライトレール・フェリー）は Opal という共通の運賃システムで、料金は乗った距離や交通手段によって変わります。Transport for NSW は1日あたりの上限を月曜〜木曜は AUD 19.30、金曜〜日曜と祝日は AUD 9.65、1週間の上限を AUD 50 としており、使う日が多くても上限までに収まります。', '距離帯ごとの1回あたりの運賃はこの調査では確認していない（上限額のみ確認）。ページに運賃の発効日が明記されていないため、改定時期は要確認。割引運賃（コンセッション）の対象になるかは在籍状況や就学内容で異なり、留学生が対象かどうかはこの調査では確認していない。',
    '{"estimates":[{"sourceName":"Transport for NSW - Opal fares","label":"1日あたりの上限（月〜木）","min":19.3,"max":19.3,"currency":"AUD","period":"day","basis":"大人のOpal運賃の上限額。月曜から木曜まで。"},{"sourceName":"Transport for NSW - Opal fares","label":"1日あたりの上限（金〜日・祝日）","min":9.65,"max":9.65,"currency":"AUD","period":"day","basis":"大人のOpal運賃の上限額。金曜・土曜・日曜・祝日。"},{"sourceName":"Transport for NSW - Opal fares","label":"1週間あたりの上限","min":50,"max":50,"currency":"AUD","period":"week","basis":"大人のOpal運賃の週上限。"}]}'::jsonb, '2026-09-30'::date, '人間レビュー待ち。上限額は公式ページの記載どおり。運賃改定が入りやすい項目なので、再確認の間隔は他カテゴリより短くしたい。コンセッション対象の可否は Transport for NSW の eligibility ページで別途確認が必要。', now()
  )
  on conflict (city_key, category) do update set
    country_code = excluded.country_code,
    admin_area = excluded.admin_area,
    summary = excluded.summary,
    notes = excluded.notes,
    details = excluded.details,
    reviewed_at = excluded.reviewed_at,
    review_note = excluded.review_note,
    updated_at = now()
  returning id
),
cleared as (
  delete from city_reference_sources
  where entry_id in (select id from upserted)
  returning entry_id
)
insert into city_reference_sources (
  entry_id, source_name, source_url, source_type, source_published_at, source_updated_at, note
)
select upserted.id, v.source_name, v.source_url, v.source_type, v.source_published_at, v.source_updated_at, v.note
from upserted
cross join (
  values
      ('Transport for NSW - Opal fares', 'https://transportnsw.info/tickets-fares/fares', 'transport_authority', null::date, null::date, 'Opalの上限額を確認。距離帯別の運賃と発効日はページに記載がなく未確認。')
) as v(source_name, source_url, source_type, source_published_at, source_updated_at, note);
