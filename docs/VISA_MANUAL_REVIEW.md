# ビザ情報の人間レビュー記録シート

Department of Home Affairs は自動取得を拒否する（HTTP 403。2026-10-01 に再確認）。そのため**人間がブラウザで公式ページを開いて確認した内容だけ**を記録し、`data/visas/australia/*.json` へ登録する。

## 使い方

1. 下の表の項目を1つずつ、公式ページを開いて確認する
2. 確認できたら `確認` を `yes` にし、値・要約・出典・日付を記入する
3. **確認できなかったものは `no` のまま空欄にする**（過去の値を復活させない／一般知識で補わない／Study Australia から Home Affairs の値を推定しない／417 と 462 を類推しない／他国籍の条件を日本へ当てはめない）
4. 記入後、`data/visas/australia/*.json` の該当 entry を更新する
5. `npx tsx scripts/import-visa-reference-data.ts` で検証 → `npx tsx scripts/test-visa-manual-review.ts` で規則を確認
6. 生成 SQL を目視確認してから DB へ適用する

## 記録のルール

- **長い原文をコピーしない**。要約を書く（著作権・保守性の両面から）
- 金額には通貨・`from`/`exact` の区別・適用開始日を必ず付ける
- 期間には単位を必ず付ける（`months` / `years` / `days`）
- 就労時間は公式の単位のまま記録する（`hours_per_fortnight` を週単位へ換算しない）
- `source_updated_at` が分からなければ空欄（**日付を作らない**）
- `accessed_at` は実際にページを開いた日、`reviewed_at` はその内容を登録データとして確定した日
- 「88日」は俗称。正式条件（必要期間・単位・specified work の条件）として記録する

## 記録フォーマット（各項目に対して）

| 列 | 内容 |
|---|---|
| 確認 | `yes` / `no` |
| 値 | 構造化できる値（数値・単位・通貨・日付など） |
| 要約 | 公式の記載を自分の言葉で短くまとめたもの |
| 出典名 | 例: Department of Home Affairs - Working Holiday visa (subclass 417) |
| 出典 URL | 実際に開いたページの URL |
| ページ箇所 | 見出し・タブ名（例: "Eligibility" タブ） |
| 適用開始日 | 公式に書かれていれば |
| 出典の更新日 | 分かる場合のみ。不明なら空欄 |
| accessed_at | ページを開いた日 |
| reviewed_at | 登録データとして確定した日 |
| 備考 | 例外の有無・確認できなかった点・判断に迷った点 |

---

# 1. Working Holiday visa (subclass 417)

一次情報: https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417

**現状: specified_work と second_third の2カテゴリを登録済み**（2026-10-02 に人間が Home Affairs の
「Specified subclass 417 work」ページを確認）。それ以外のカテゴリは未確認のため未登録で、Chat は
数値を推測せず「確認できていない」と答える。

確認済みページ: https://immi.homeaffairs.gov.au/what-we-do/whm-program/specified-work-conditions/specified-work-417
（accessed_at / reviewed_at: 2026-10-02）

> 注意: サブクラス462（Work and Holiday）は**別のビザ**。462 の条件を 417 の JSON に入れない。

## 1-1. eligibility

| 項目 | 確認 | 値 | 要約 | ページ箇所 | 備考 |
|---|---|---|---|---|---|
| 対象となるパスポート / 国に日本が含まれるか | no | | | | |
| 年齢の要件（下限・上限） | no | | | | 国によって上限が異なる場合があるため、**日本国籍の条件**を確認する |
| 扶養する子ども（dependent children）に関する条件 | no | | | | |
| 1回目のビザの申請条件 | no | | | | |

## 1-2. stay

| 項目 | 確認 | 値 | 要約 | ページ箇所 | 備考 |
|---|---|---|---|---|---|
| 滞在できる期間（単位つき） | no | | | | |

## 1-3. work_rights

| 項目 | 確認 | 値 | 要約 | ページ箇所 | 備考 |
|---|---|---|---|---|---|
| 就労の一般的な条件 | no | | | | |

## 1-4. same_employer（2026-10-02 確認済み）

確認したページ（いずれも Department of Home Affairs。accessed_at / reviewed_at: 2026-10-02）:
- 6 month work limitation — https://immi.homeaffairs.gov.au/what-we-do/whm-program/specified-work-conditions/6-month-work-limitation
- Work longer than 6 months — https://immi.homeaffairs.gov.au/visas/already-have-a-visa/check-visa-details-and-conditions/waivers-and-permissions/work-longer-than-6-months
- WHM condition 8547 permission request form — https://immi.homeaffairs.gov.au/what-we-do/whm-program/specified-work-conditions/WHM-condition-8547-permission-request-form

単純に「6か月まで」だけで完結させない。**一般ルール・例外・例外の条件・許可が必要かどうか**を分けて記録する。

| 項目 | 確認 | 値 | 要約 | ページ箇所 | 備考 |
|---|---|---|---|---|---|
| ビザ条件の番号 | **yes** | 8547 | WHM プログラムのビザに必須条件として付される | 6 month work limitation | 417 の JSON には他のサブクラス番号を書かない（混同防止） |
| 一般ルール（期間・単位） | **yes** | 6 months | 同一の雇用主で働けるのは最大6か月 | 同 | 例外・許可と必ずセットで説明する |
| 例外の有無 | **yes** | あり（5区分） | | 同 | `exceptionsReviewed: true` / `exceptionsExist: true` |
| 例外: 勤務地が異なる場合 | **yes** | どの一箇所でも6か月を超えない | 同じ雇用主でも勤務地が変われば対象 | 同 | 「店舗を変えれば必ずリセット」ではない |
| 例外: 植物・動物の栽培 | **yes** | オーストラリア全域 | 地域の限定なし | 同 | |
| 例外: critical sectors | **yes** | agriculture / food processing / health / aged care / disability care / childcare / tourism / hospitality | | 同 | 該当するかは公式の記載で確認 |
| 例外: Northern Australia の一部業種 | **yes** | fishing and pearling / tree farming and felling / construction / mining | **Northern Australia に限る** | 同 | 全域の例外として扱わない |
| 例外: 自然災害からの復旧 | **yes** | オーストラリア全域 | | 同 | |
| 現行取り扱いの開始日 | **yes** | 2024-01-01 | Working Holiday program の見直し中は継続 | 同 | 恒久的な制度として断定しない |
| 許可（permission）の経路 | **yes** | あり | 例外に当てはまらない場合でも申請できる | Work longer than 6 months | **必ず認められるとは限らない** |
| 許可で考慮される点 | **yes** | 3点 | 継続的なフルタイム就労が可能なビザを申請済み／結果待ち／その仕事が雇用主にとって不可欠 | 同 | |
| 申請時期（要件） | **yes** | 最初の6か月が終了する前 | | 同 | 推奨とは区別して記録 |
| 申請時期（推奨） | **yes** | 6か月終了の少なくとも2週間前 | | permission request form | 要件ではなく推奨 |
| 期限内申請の審査待ち中 | **yes** | 働き続けられる | 書面の結果を受け取るまで | Work longer than 6 months | |
| 期限後に申請した場合 | **yes** | いったん就労を止める | 結果を待つ必要がある | 同 | 自動的に継続できるとしない |
| 例外該当・許可後 | **yes** | ビザの残り期間を働けるケースがある | | 同 | 個別条件は本人のビザで確認 |
| 「雇用主」の意味 | **yes**（概要） | 直接働いている business / organisation | labour hire 経由では実際に就労する business 側が重要になるケースがある | 6 month work limitation | 細部の判断基準は未確認 |
| セカンド・サードでの扱い | **yes** | さらに6か月 | 前のビザで働いた雇用主のもとで、次のビザでさらに6か月働けると案内 | 同 | 「1社で生涯6か月」ではない |
| 本人の条件の確認方法 | **yes** | grant letter / VEVO / myVEVO | | Work longer than 6 months | 一般説明と個別確認を分ける |
| labour hire の具体的判断基準 | no | | | | 未確認 |
| critical sectors の業種定義の詳細 | no | | | | 未確認 |
| Northern Australia の地理的範囲 | no | | | | 未確認 |
| 許可の審査基準・所要期間 | no | | | | 未確認 |

## 1-5. study_rights

| 項目 | 確認 | 値 | 要約 | ページ箇所 | 備考 |
|---|---|---|---|---|---|
| 就学・訓練が可能な期間（単位つき） | no | | | | |

## 1-6. application

| 項目 | 確認 | 値 | 要約 | ページ箇所 | 備考 |
|---|---|---|---|---|---|
| 申請時にオーストラリア国内／国外のどちらにいる必要があるか | no | | | | |
| 申請方法 | no | | | | |
| その他の申請条件 | no | | | | |

## 1-7. documents

公式が区分を示している範囲で分ける（示していない区分を作らない）。

| 項目 | 確認 | 値 | 要約 | ページ箇所 | 備考 |
|---|---|---|---|---|---|
| 身分（identity）関係 | no | | | | |
| 資金の証明（financial evidence） | no | | | | 金額が示されている場合は通貨も記録 |
| 健康（health）関係 | no | | | | |
| 人物（character）関係 | no | | | | |
| 追加で求められ得る書類 | no | | | | 「必須」と混ぜない |

## 1-8. costs

| 項目 | 確認 | 値 | 要約 | ページ箇所 | 備考 |
|---|---|---|---|---|---|
| 現在の申請料（金額・通貨） | no | | | | |
| `from`（〜から）か `exact`（確定額）か | no | | | | |
| 適用開始日 | no | | | | |
| 同伴者の追加料金・免除の有無 | no | | | | |

## 1-9. processing

| 項目 | 確認 | 値 | 要約 | ページ箇所 | 備考 |
|---|---|---|---|---|---|
| 公式の審査期間の案内 | no | | | | パーセンタイル等の動的な表示なら、固定日数として保存せず `type: "dynamic_official_guide"` / `fixedDuration: null` で記録する |

## 1-10. second_third（2026-10-02 確認済み・一部）

| 項目 | 確認 | 値 | 要約 | ページ箇所 | 備考 |
|---|---|---|---|---|---|
| セカンドの必要期間 | **yes** | 3 months | 最短3暦月相当＝最低 88 calendar days | Specified subclass 417 work | 日数だけでは条件を満たさない |
| サードの必要期間 | **yes** | 6 months | 最短6暦月相当＝最低 179 calendar days | 同 | |
| サードの対象時期 | **yes** | 2019-07-01 以降の仕事 | | 同 | |
| フルタイム相当の要件 | **yes** | 必須 | その職種・業種でフルタイム従業員が通常その期間に働く日数・シフト相当 | 同 | 「88日いれば達成」は誤り |
| 期間の短縮 | **yes** | 不可 | 3か月・6か月より短い合計期間では完了できない | 同 | 長時間働いても短縮されない |
| 分割の可否 | **yes** | 可 | 連続・単一雇用主である必要なし。フルタイム/パート/piecework の組合せ可 | 同 | ただしフルタイム相当要件は必要 |
| 勤務日の数え方 | **yes** | 標準の1日/1シフト | 同じ暦日に長時間働いても2日分にはならない | 同 | |
| 有給の祝日・病欠 | **yes** | 数えられる場合がある | 有給の祝日・有給の病欠・相当する労災休暇 | 同 | 無給は数えない |
| 悪天候で無給の日 | **yes** | 数えない | 天候を理由とする短縮・免除の一般的例外はない | 同 | |
| シフト勤務 | **yes** | 条件つきで数えられる | 有給のロスターされた休息期間を含められるケースがある | 同 | 個別契約により異なる |
| 時期の原則 | **yes** | 前のビザ保持中 | セカンドはファースト保持中、サードはセカンド保持中 | 同 | bridging / 旧408 は例外（複雑ケース） |
| specified work 以外の申請資格 | no | | | | 年齢・滞在状況などは別ページで確認 |

## 1-11. specified_work（2026-10-02 確認済み）

| 項目 | 確認 | 値 | 要約 | ページ箇所 | 備考 |
|---|---|---|---|---|---|
| specified work の定義 | **yes** | 対象業種 かつ 対象地域 | 原則として法令・award に従って適切に支払われた仕事 | Specified subclass 417 work | 業種名・地域名だけでは判定できない |
| 対象となる業種 | **yes** | 9区分 | ツーリズム・ホスピタリティ（地域限定）／植物・動物の栽培／漁業・真珠養殖／林業／鉱業／建設／森林火災復旧／自然災害復旧／重要なCOVID-19業務 | 同 | COVID区分は過去の時期条件が強い |
| 対象となる地域の区分 | **yes** | 5区分 | Remote and Very Remote / Northern / Regional / 森林火災宣言地域 / 自然災害宣言地域 | 同 | |
| 郵便番号の一覧 | **yes**（存在を確認） | — | 公式ページに掲載あり | 同 | **件数が多いためデータには取り込まない**。判定は公式で確認 |
| 判定の手順 | **yes** | 4段階 | 業種 → 仕事内容 → 郵便番号・宣言地域 → 時期条件 | 同 | |
| ボランティアの例外 | **yes** | 森林火災復旧 / 宣言された自然災害復旧 | 原則は有給だが、この2区分はボランティアでも認められる場合がある | 同 | |
| 必要な証拠（一般） | no | | | | **一般的な証拠要件はこのページから確認できず**。一般化しない |
| 必要な証拠（確認できた範囲） | **yes** | シフト勤務: 雇用契約書の保管／COVID区分: 証拠の記載あり | | 同 | 全区分へ一般化しない |
| UK パスポート例外 | **yes** | 2024-07-01 以降に UK パスポートで申請する場合は要件免除 | | 同 | **UK 限定。日本国籍には適用しない** |

---

# 2. Student visa (subclass 500)

一次情報: https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500
人間確認日（accessed_at / reviewed_at）: 2026-10-02

## 2-0. 2026-10-02 からの制度変更（最重要）

| 項目 | 確認 | 内容 | 備考 |
|---|---|---|---|
| 申請場所 | **yes** | ほとんどの申請はオーストラリア国外から行う必要がある | 国内申請は「対象ビザの保持」＋「例外該当」の両方が必要 |
| 国内申請できないビザ | **yes** | 417 / 462 / 485 / 600 / 601 / 651 を含む | 確認できた範囲。完全な一覧としては扱わない |
| 家族の同時申請 | **yes** | ほとんどの申請者は家族を含められない（例外あり） | 例外は PhD / DFAT・Defence / 外国政府奨学金 / 対象の太平洋諸島・ASEAN 国籍 / 継続・進級の一定ケース |
| 家族の後からの申請 | **yes** | subsequent entrant は現行ルールでは不可 | 「後から呼べる」と案内しないこと |

## 2-1. 既存6カテゴリの一次情報照合

Phase 1 で **Study Australia**（政府系だがビザ制度の一次情報ではない）で確認した内容が登録済み。Home Affairs と照合した。

照合の方針: 一致した場合は Home Affairs の出典を追加する（Study Australia の出典は残してよい）。一致しなかった場合は **勝手に上書きしない**。差分を記録し、どちらが現行かを判断したうえで、旧値を `supersededValue` に残して更新する（今回の `stay` がその例）。

| category | 現在の登録値 | Home Affairs で一致 | 差分と対応 | 備考 |
|---|---|---|---|---|
| work_rights | 授業期間中 48 hours per fortnight / Masters by Research・Doctoral は例外 | **yes** | 一致。Home Affairs 出典を追加し `primarySourceVerified: true` | ブレイク中の上限は**未確認のまま**（別ページのため今回未登録） |
| health_insurance | OSHC を滞在全期間について維持 | **yes** | 一致。国別の特例（Norway / Sweden / Belgium）を `oshcCountryExceptions` として追加 | **日本国籍には適用しない**旨を note に明記 |
| genuine_student | GS requirement（2024-03-23 に GTE を置換） | **yes** | 要件の存在は一致。2024-03-23 は Study Australia 由来のため `effectiveFromSource` で出典を分離 | 評価基準の詳細は未確認 |
| financial_capacity | AUD 29,710 / 年・単身 | **no（照合未了）** | **金額を Home Affairs で確認できなかったため、Home Affairs 出典を追加せず `primarySourceVerified: false` のまま維持** | Gather Documents で current exact amount を人間確認するまで一次照合未了 |
| costs | AUD 2,500 **から** / 1申請 | **yes** | 金額は一致。`effectiveFrom: 2026-07-01` は Home Affairs 未確認のため `effectiveFromSource` で明示。申請料が下がる対象（`costConcessions`）を追加 | concessions は**日本国籍へ自動適用されない** |
| stay | コース期間に応じた期間（**最長5年**） | **no（conflict）** | **Home Affairs は「最長6年・enrolment 連動」。一次情報を正本として更新し、旧値は `supersededValue` に記録（黙って消していない）** | 小学校 Year 1〜4 は最長3年 |

### conflict の記録（stay）

| 項目 | 内容 |
|---|---|
| Study Australia（旧） | up to 5 years |
| Home Affairs（現行一次情報） | up to 6 years、在籍（enrolment）に連動 |
| 解消方針 | 一次情報を正本とする。旧値は `supersededValue.previousValue` に残し、`resolution` に理由を記録 |
| Study Australia 出典 | 削除せず残すが「この値の根拠ではない」と note に記録 |

## 2-2. eligibility（登録済み）

| 項目 | 確認 | 値 / 要約 | 備考 |
|---|---|---|---|
| genuine student であること | **yes** | 学生ビザの主な目的を理解していること | |
| 最低年齢 | **yes** | 6歳以上 | |
| 学校就学時の学年別年齢 | **yes** | Y9<17 / Y10<18 / Y11<19 / Y12<20 | **小中高の就学者限定。大学・専門・語学の人へ当てはめない** |
| 18歳未満の福祉（welfare） | **yes** | 適切な福祉の手配が必要 | 認められる具体的な形式は未確認 |
| 健康（health） | **yes** | 要件がある（申請者と同時申請の家族） | 健康診断が必要になる条件は未確認 |
| 人物（character） | **yes** | 申請者と、16歳以上で同時申請の家族 | 警察証明書が必要になる条件は未確認 |
| Australian Values Statement | **yes** | 18歳以上は Life in Australia を読んだうえで署名 | |
| 政府への債務 | **yes** | 支払済みか支払いの取り決めが必要 | |
| 過去のビザ取消・却下 | **yes** | 審査に影響し得る | 具体的な判断は未確認 |
| 子どもの最善の利益 | **yes** | 18歳未満について考慮される | |

## 2-3. application（登録済み）

| 項目 | 確認 | 値 / 要約 | 備考 |
|---|---|---|---|
| 申請方法 | **yes** | オンライン | |
| 申請時の所在 | **yes** | 2026-10-02 から、ほとんどの申請は国外から | §2-0 参照 |
| 国内申請の条件 | **yes** | 対象ビザの保持＋例外該当の**両方** | どちらか一方では不可 |
| 国内申請できないビザ | **yes** | 417 / 462 / 485 / 600 / 601 / 651 | WHV からの切替は原則国外申請 |
| 国内での further Student visa の例外 | **yes** | 6種類（最大12か月の追加 / DFAT・Defence / PhD / 小中高 / course progression / provider default） | 本人が該当するとは決めつけない |
| 家族のルール | **yes** | §2-0 のとおり | subsequent entrant 不可 |
| CoE | **yes** | 全就学予定コース分が必要。無い申請は invalid。決定時点でも有効が必要 | CoE 不要の例外は §2-5 |
| OSHC | **yes** | 情報が必要。自己手配時は保険証券の番号 | |

## 2-4. study_rights（登録済み）

| 項目 | 確認 | 値 / 要約 | 備考 |
|---|---|---|---|
| コース要件 | **yes** | CRICOS 登録のフルタイムコース | |
| 在籍の維持 | **yes** | enrolment を維持する必要がある | 維持できなかった場合の扱いは未確認 |
| 無効な CoE | **yes** | 取消済み・修了済みのコースの CoE は無効 | |
| packaged courses | **yes** | 全 CoE コードが必要 / コースが次へつながる / 間隔は原則2暦月未満 / 学年切替に例外 | 例外の具体条件は未確認 |

## 2-5. documents（登録済み）

| 項目 | 確認 | 値 / 要約 | 備考 |
|---|---|---|---|
| 必要な書類 | **yes** | 全就学予定コースの CoE（または承認された代替）／必要な場合の OSHC 情報 | **パスポート等を一般知識から必須側へ追加していない** |
| ケースによって必要な書類 | **yes** | 英語力 / 資金 / 健康 / 人物 / 18歳未満の福祉 / 家族関係 | |
| 後から求められ得る書類 | **yes** | Home Affairs・ImmiAccount から追加要求され得る | |
| CoE が不要になる例外 | **yes** | Foreign Affairs・Trade 奨学金 / Defence の支援（support letter）／中等教育交換留学の AASES ／修士論文採点待ちの研究学生の教育機関の手紙 | 「CoE は全員絶対必須」と断定しない |
| 英語力が免除される例外 | **yes** | UK / USA / Canada / NZ / Ireland のパスポート等 | **日本は一覧に含まれない。日本国籍へ適用しない** |
| 英語力の具体的スコア | **no** | — | **特定のスコアを一律の基準として登録しない（IELTS 6.0 等を固定値にしない）** |
| 最終確認手段 | **yes** | Home Affairs の Document Checklist tool | |

## 2-6. processing（登録済み）

| 項目 | 確認 | 値 / 要約 | 備考 |
|---|---|---|---|
| 公式の審査期間の案内 | **yes** | processing time guide で目安を確認。最近決定された申請にもとづく目安で、個別申請に当てはまるものではない | `fixedDuration: null` / `guaranteed: false` |
| 国外申請の優先順位 | **yes** | 2025-11-14 より前は MD111、以降は MD115 | **MD 番号は通常のユーザー回答には出さない** |
| 現時点の具体的な処理期間 | **no** | — | 変動するため固定値として持たない |

## 2-7. 一次情報でまだ未確認（登録しない項目）

| 項目 | 理由 |
|---|---|
| financial_capacity の正確な金額 | Home Affairs の Gather Documents で未確認。`primarySourceVerified: false` のまま |
| 申請者ごとの完全な必要書類の一覧 | プロフィールごとに変わる。Document Checklist tool が最終確認手段 |
| 英語力の具体的なスコア基準 | すべての閾値を確認できていない。特定スコアを一律基準にしない |
| 健康診断が必要になる具体的な条件 | ケースごとに決まる |
| 警察証明書が必要になる具体的な条件 | ケースごとに決まる |
| 授業期間外（コースのブレイク中）の就労上限 | 別の visa conditions ページの内容で、今回共有された資料に含まれない |
---

# 3. 記入後のチェック

```bash
# 1. 検証（SQL は出さない）
npx tsx scripts/import-visa-reference-data.ts --check

# 2. 人間レビューの規則を確認（単位・通貨・例外・出典の有無など）
npx tsx scripts/test-visa-manual-review.ts

# 3. SQL を生成して目視確認
npx tsx scripts/import-visa-reference-data.ts

# 4. 確認後、開発用 DB → 本番 DB へ適用（remote への適用は人間の判断で）
```

確認できていない項目が残っていても問題ない。**確認したものだけが正式データ候補になり、確認できなかったものは空のまま残る**ことが重要。
