/**
 * 回答下の出典パネル（lib/referenceSources.ts / components/chat/SourceDisclosure.tsx）のテスト。
 *
 *   npx tsx scripts/test-reference-sources.ts
 *
 * 見たいこと:
 *   - そのターンで使った category の出典だけが出る（DB の全 entry を出さない）
 *   - 出典の強さ（一次情報 / 政府統計 / 大学 等）がラベルで区別される
 *   - 内部メモ（review_note / 内部の検証フラグ / superseded の旧値 / unverified）が漏れない
 *   - 開発用 Numbeo snapshot が出典として出ない
 *   - https 以外の URL を捨て、同じ URL を1件へまとめる
 * ネットワーク・DB へは接続しない。
 */

import { readFileSync, readdirSync } from "node:fs";
import {
  CHAT_SOURCE_MAX,
  buildChatSources,
  isPrimarySourceType,
  isSafeSourceUrl,
  sourceTypeLabel,
  type SourceCandidate,
} from "@/lib/referenceSources";
import {
  buildVisaCitations,
  visaCitationsToSourceCandidates,
} from "@/lib/visaReferenceContext";
import {
  buildCityReferenceCitations,
  cityCitationsToSourceCandidates,
} from "@/lib/cityReferenceContext";
import type { VisaCategory, VisaKey, VisaReferenceEntry } from "@/lib/visaReference";
import type { CityKey, CityReferenceCategory, CityReferenceEntry } from "@/lib/cityReference";
import { CITY_ADMIN_AREA } from "@/lib/cityReference";

let pass = 0;
let fail = 0;

/** コメントを除いたコード部分だけを返す（説明文に書いた語で誤検知しないため）。 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

function assert(condition: boolean, message: string) {
  if (condition) {
    pass++;
    console.log(`  OK   ${message}`);
  } else {
    fail++;
    console.error(`  FAIL ${message}`);
  }
}

/** 実 seed（curated JSON）を entry 形へ読み込む。 */
function loadVisaSeed(): VisaReferenceEntry[] {
  const out: VisaReferenceEntry[] = [];
  for (const file of readdirSync("data/visas/australia")) {
    if (!file.endsWith(".json") || file.startsWith("_")) continue;
    const d = JSON.parse(readFileSync(`data/visas/australia/${file}`, "utf8"));
    for (const [i, e] of (d.entries ?? []).entries()) {
      out.push({
        id: `${d.visaKey}-${e.category}-${i}`,
        visaKey: d.visaKey as VisaKey,
        visaCode: d.visaCode,
        visaName: d.visaName,
        countryCode: "AU",
        category: e.category as VisaCategory,
        summary: e.summary,
        details: e.details ?? {},
        reviewedAt: e.reviewedAt,
        sources: (e.sources ?? []).map((s: Record<string, unknown>) => ({
          sourceName: s.sourceName,
          sourceUrl: s.sourceUrl,
          sourceType: s.sourceType,
          sourcePublishedAt: s.sourcePublishedAt ?? null,
          sourceUpdatedAt: s.sourceUpdatedAt ?? null,
          accessedAt: s.accessedAt ?? null,
        })),
      } as VisaReferenceEntry);
    }
  }
  return out;
}

function loadCitySeed(): CityReferenceEntry[] {
  const out: CityReferenceEntry[] = [];
  for (const file of readdirSync("data/cities/australia")) {
    if (!file.endsWith(".json") || file.startsWith("_")) continue;
    const d = JSON.parse(readFileSync(`data/cities/australia/${file}`, "utf8"));
    for (const [i, e] of (d.entries ?? []).entries()) {
      out.push({
        id: `${d.cityKey}-${e.category}-${i}`,
        cityKey: d.cityKey as CityKey,
        countryCode: "AU",
        adminArea: d.adminArea ?? CITY_ADMIN_AREA[d.cityKey as CityKey],
        category: e.category as CityReferenceCategory,
        summary: e.summary,
        notes: e.notes ?? null,
        estimates: e.details?.estimates ?? [],
        reviewedAt: e.reviewedAt,
        sources: (e.sources ?? []).map((s: Record<string, unknown>) => ({
          sourceName: s.sourceName,
          sourceUrl: s.sourceUrl,
          sourceType: s.sourceType,
          sourcePublishedAt: s.sourcePublishedAt ?? null,
          sourceUpdatedAt: s.sourceUpdatedAt ?? null,
          note: s.note ?? null,
        })),
      } as CityReferenceEntry);
    }
  }
  return out;
}

const VISA_SEED = loadVisaSeed();
const CITY_SEED = loadCitySeed();

function visaEntry(visaKey: VisaKey, category: VisaCategory): VisaReferenceEntry {
  const found = VISA_SEED.find((e) => e.visaKey === visaKey && e.category === category);
  if (!found) throw new Error(`${visaKey}/${category} が seed に無い`);
  return found;
}

function cityEntry(cityKey: CityKey, category: CityReferenceCategory): CityReferenceEntry {
  const found = CITY_SEED.find((e) => e.cityKey === cityKey && e.category === category);
  if (!found) throw new Error(`${cityKey}/${category} が seed に無い`);
  return found;
}

/** route と同じ組み立て（そのターンの entry だけから出典を作る）。 */
function sourcesFor(options: { visa?: VisaReferenceEntry[]; city?: CityReferenceEntry[] }) {
  const candidates: SourceCandidate[] = [];
  if (options.city && options.city.length > 0) {
    candidates.push(...cityCitationsToSourceCandidates(buildCityReferenceCitations(options.city)));
  }
  if (options.visa && options.visa.length > 0) {
    candidates.push(...visaCitationsToSourceCandidates(buildVisaCitations(options.visa)));
  }
  return buildChatSources(candidates);
}

console.log("Test 1: 学生ビザの就労条件 → Home Affairs が出る");
{
  const sources = sourcesFor({ visa: [visaEntry("australia_student_500", "work_rights")] });
  assert(sources.length > 0, `出典が1件以上（${sources.length}件）`);
  assert(
    sources.some((s) => s.name.includes("Department of Home Affairs")),
    "Home Affairs が含まれる",
  );
  assert(
    sources[0].label === sourceTypeLabel("home_affairs"),
    `先頭が一次情報のラベル（実際: ${sources[0].label}）`,
  );
  assert(sources.every((s) => s.url.startsWith("https://")), "すべて https");
  assert(sources.every((s) => s.reviewedAt === "2026-10-02"), "確認日が渡る");
}

console.log("Test 2: 資金証明 → Home Affairs を出さない（一次照合未了）");
{
  const sources = sourcesFor({ visa: [visaEntry("australia_student_500", "financial_capacity")] });
  assert(sources.length === 1, `出典は1件（${sources.length}件）`);
  assert(
    !sources.some((s) => s.name.includes("Home Affairs")),
    "Home Affairs を出典として出さない",
  );
  assert(
    !sources.some((s) => isPrimarySourceType("home_affairs") && s.label.includes("一次情報")),
    "一次情報のラベルを付けない",
  );
  assert(sources[0].label === sourceTypeLabel("study_australia"), "政府系の留学情報として表示する");
  assert(sources[0].name.includes("Study Australia"), "Study Australia が出典");
}

console.log("Test 3: 滞在期間 → 旧 5 年の Study Australia を現在値の出典にしない");
{
  const stay = visaEntry("australia_student_500", "stay");
  const sources = sourcesFor({ visa: [stay] });
  const primary = sources.filter((s) => s.label.includes("一次情報"));
  assert(primary.length === 1, "一次情報の出典が1件ある（現在値の根拠）");
  // 旧値（最長5年）そのものが画面へ出ないこと
  const serialized = JSON.stringify(sources);
  assert(!/最長5年|up to 5 years/.test(serialized), "旧値（最長5年）が出典パネルに出ない");
  assert(!/supersededValue|previousValue|previousSource/.test(serialized), "superseded の内部 JSON が出ない");
  // Study Australia の出典自体はデータに残っているが、一次情報より後に並ぶ
  const haIndex = sources.findIndex((s) => s.label.includes("一次情報"));
  const saIndex = sources.findIndex((s) => s.name.includes("Study Australia"));
  if (saIndex >= 0) assert(haIndex < saIndex, "一次情報が Study Australia より先に並ぶ");
}

console.log("Test 4: 選ばれた category の出典だけが出る");
{
  const only = sourcesFor({ visa: [visaEntry("australia_student_500", "costs")] });
  const serialized = JSON.stringify(only);
  assert(!/48 hours|work_rights|就労の条件/.test(serialized), "就労条件の出典が混ざらない");
  assert(only.every((s) => (s.topic ?? "").includes("申請料")), "話題が申請料に限られる");
  // 全 entry を出していないこと
  const all = sourcesFor({ visa: VISA_SEED });
  assert(only.length < all.length, `1 category の出典数（${only.length}）< 全 entry（${all.length}）`);
}

console.log("Test 5: 都市も選ばれた category の出典だけ");
{
  const housing = sourcesFor({ city: [cityEntry("sydney", "housing")] });
  assert(housing.length === 1, `シドニーの住居費は1件（${housing.length}件）`);
  assert(housing[0].name.includes("University of Sydney"), "University of Sydney が出典");
  assert(housing[0].label === sourceTypeLabel("university"), "大学の公式情報として表示する");
  const serialized = JSON.stringify(housing);
  assert(!/BOCSAR|Transport for NSW/.test(serialized), "治安・交通の出典が混ざらない");

  const transport = sourcesFor({ city: [cityEntry("goldcoast", "transport")] });
  assert(transport.length === 2, `ゴールドコーストの交通は2件（${transport.length}件）`);
  assert(
    transport.some((s) => s.name.includes("Translink")) &&
      transport.some((s) => s.name.includes("Queensland Government")),
    "Translink と州政府の両方が出る",
  );
  assert(
    transport[0].label === sourceTypeLabel("government_information"),
    `政府の公式情報が先（実際: ${transport[0].label}）`,
  );
}

console.log("Test 6: 同じ URL は1件へまとめる");
{
  // ゴールドコーストの housing / food / utilities は同じ Bond University のページ
  const sources = sourcesFor({
    city: [cityEntry("goldcoast", "housing"), cityEntry("goldcoast", "food"), cityEntry("goldcoast", "utilities")],
  });
  assert(sources.length === 1, `3 category でも出典は1件（${sources.length}件）`);
  assert(sources[0].name.includes("Bond University"), "Bond University 1件になる");
  assert((sources[0].topic ?? "").split(" / ").length >= 3, `話題がまとめて記録される（${sources[0].topic}）`);

  // 末尾スラッシュ・ハッシュ違いも同一扱い
  const dup = buildChatSources([
    { sourceName: "A", sourceUrl: "https://example.gov.au/a", sourceType: "government_information" },
    { sourceName: "A", sourceUrl: "https://example.gov.au/a/", sourceType: "government_information" },
    { sourceName: "A", sourceUrl: "https://example.gov.au/a#top", sourceType: "government_information" },
  ]);
  assert(dup.length === 1, `末尾スラッシュ・ハッシュ違いも1件（${dup.length}件）`);
}

console.log("Test 7-9: 内部メタデータ・開発用 snapshot が漏れない");
{
  const sources = sourcesFor({ visa: VISA_SEED, city: CITY_SEED });
  const serialized = JSON.stringify(sources);
  for (const banned of [
    "review_note",
    "reviewNote",
    "人間レビュー待ち",
    "primarySourceVerified",
    "supersededValue",
    "unverified",
    "未確認",
    "numbeo",
    "Numbeo",
    "safetyIndex",
    "crimeIndex",
    "costOfLivingIndex",
    "dev_snapshot",
    "confidence は",
  ]) {
    assert(!serialized.includes(banned), `出典パネルに「${banned}」が出ない`);
  }
  // ビザ側の出典はそもそも note を持たない（公開 view に無い）
  const visaOnly = sourcesFor({ visa: VISA_SEED });
  assert(visaOnly.every((s) => s.note === undefined), "ビザの出典に補足（内部メモ）が付かない");
  // 都市側の補足は公開 notes だけ
  const sydneyHousing = sourcesFor({ city: [cityEntry("sydney", "housing")] });
  assert(
    (sydneyHousing[0].note ?? "").length > 0,
    "都市側は公開の補足が入る（鮮度の限界など）",
  );
  assert(
    !/人間レビュー待ち|confidence/.test(sydneyHousing[0].note ?? ""),
    "公開の補足に内部メモが混ざらない",
  );
}

console.log("Test 10: 安全でない URL を捨てる");
{
  for (const url of ["javascript:alert(1)", "data:text/html,x", "http://example.gov.au/a", "ftp://x/y", "not-a-url"]) {
    assert(!isSafeSourceUrl(url), `${url} を安全な URL として扱わない`);
  }
  assert(isSafeSourceUrl("https://example.gov.au/a"), "https は通す");
  const sources = buildChatSources([
    { sourceName: "危険", sourceUrl: "javascript:alert(1)", sourceType: "home_affairs" },
    { sourceName: "http", sourceUrl: "http://example.gov.au/a", sourceType: "home_affairs" },
    { sourceName: "正常", sourceUrl: "https://example.gov.au/b", sourceType: "home_affairs" },
  ]);
  assert(sources.length === 1 && sources[0].name === "正常", "https のものだけ残る");
}

console.log("Test 11: 出典が無ければパネルを出さない");
{
  assert(sourcesFor({}).length === 0, "entry が無ければ出典0件");
  assert(buildChatSources([]).length === 0, "候補が空なら0件");
  // 名前が空のものは捨てる
  assert(
    buildChatSources([{ sourceName: "   ", sourceUrl: "https://example.gov.au/a", sourceType: "home_affairs" }])
      .length === 0,
    "出典名が空なら出さない",
  );
  // コンポーネント側も 0 件で何も描画しない実装になっている
  const component = readFileSync("components/chat/SourceDisclosure.tsx", "utf8");
  assert(
    /sources\.length === 0\) return null/.test(component),
    "コンポーネントが0件のとき null を返す",
  );
}

console.log("Test 12: source_type を内部文字列のまま出さない");
{
  const sources = sourcesFor({ visa: VISA_SEED, city: CITY_SEED });
  const serialized = JSON.stringify(sources);
  for (const internal of [
    "home_affairs",
    "study_australia",
    "government_statistics",
    "government_information",
    "transport_authority",
    "university",
    "other_government",
  ]) {
    assert(!serialized.includes(internal), `内部の種別文字列「${internal}」が画面値に出ない`);
  }
  assert(sourceTypeLabel("home_affairs").includes("一次情報"), "home_affairs は一次情報と表示");
  assert(sourceTypeLabel("government_statistics") === "政府統計", "government_statistics は政府統計");
  assert(sourceTypeLabel("university") === "大学の公式情報", "university は大学の公式情報");
  assert(sourceTypeLabel("transport_authority") === "交通機関の公式情報", "transport_authority の表示");
  assert(sourceTypeLabel("study_australia") === "政府系の留学情報", "study_australia の表示");
  assert(sourceTypeLabel("未知の種別") === "確認済みの公開情報", "未知の種別は当たり障りのない表現");
}

console.log("Test 13: 一次情報が先頭に並ぶ");
{
  const mixed = buildChatSources([
    { sourceName: "大学", sourceUrl: "https://uni.edu.au/a", sourceType: "university" },
    { sourceName: "交通機関", sourceUrl: "https://t.gov.au/a", sourceType: "transport_authority" },
    { sourceName: "Home Affairs", sourceUrl: "https://immi.homeaffairs.gov.au/a", sourceType: "home_affairs" },
    { sourceName: "政府統計", sourceUrl: "https://stats.gov.au/a", sourceType: "government_statistics" },
    { sourceName: "Study Australia", sourceUrl: "https://studyaustralia.gov.au/a", sourceType: "study_australia" },
  ]);
  assert(
    mixed.map((s) => s.name).join(",") === "Home Affairs,政府統計,Study Australia,交通機関,大学",
    `強さ順に並ぶ（実際: ${mixed.map((s) => s.name).join(",")}）`,
  );
}

console.log("Test 14: 件数の上限とコンポーネントの作り");
{
  const many = buildChatSources(
    Array.from({ length: 12 }, (_, i) => ({
      sourceName: `出典${i}`,
      sourceUrl: `https://example.gov.au/${i}`,
      sourceType: "government_information",
    })),
  );
  assert(many.length === CHAT_SOURCE_MAX, `上限 ${CHAT_SOURCE_MAX} 件で切る（実際: ${many.length}）`);
  const component = readFileSync("components/chat/SourceDisclosure.tsx", "utf8");
  assert(/<details/.test(component) && /<summary/.test(component), "折りたたみ（details/summary）で作られている");
  assert(!/\bopen\b/.test(component.split("<summary")[0]), "既定で開いていない");
  assert(/rel="noopener noreferrer"/.test(component), "外部リンクに rel が付いている");
  assert(/target="_blank"/.test(component), "外部リンクが新しいタブで開く");
  // 禁止クラスの判定はコメントを除いたコード部分だけで行う（説明文の文字列で誤検知しないため）。
  assert(!/dark:/.test(codeOnly(component)), "dark: クラスを使っていない（light only）");
  assert(/min-h-\[32px\]/.test(component), "タップ領域の高さを確保している");
  assert(/min-w-0/.test(component), "長い URL でも崩れないよう min-w-0 を指定している");
  assert(/text-\[13px\]/.test(component), "本文より小さい文字で控えめに出す");
}

console.log("Test 15-17: /api/chat の後方互換と両クライアント");
{
  const route = readFileSync("app/api/chat/route.ts", "utf8");
  assert(
    /"Content-Type": "text\/plain; charset=utf-8"/.test(route),
    "本文は従来どおり text/plain のストリーム",
  );
  assert(/X-Reference-Sources/.test(route), "出典はヘッダで返す");
  assert(
    !/JSON\.stringify\(\{\s*message/.test(route),
    "本文を JSON へ変えていない（既存クライアントを壊さない）",
  );
  assert(
    /if \(sources\.length > 0\)/.test(route),
    "出典が無いターンではヘッダを付けない",
  );
  const chat = readFileSync("components/Chat.tsx", "utf8");
  assert(/readSourcesHeader/.test(chat), "クライアントがヘッダを読む");
  assert(/res\.body\.getReader\(\)/.test(chat), "ストリーム読み取りは従来どおり");
  assert(
    /toChatMessages/.test(chat) && /list\.map\(\(\{ role, content \}\)/.test(readFileSync("lib/chat.ts", "utf8")) === false,
    "送信時は role/content だけに戻している（出典は送らない）",
  );
  // /widget（匿名）と Plan Chat の両方で描画している
  assert(
    (chat.match(/<SourceDisclosure/g) ?? []).length === 2,
    `bubble（/widget）と document（Plan Chat）の両方に出典パネルがある（${(chat.match(/<SourceDisclosure/g) ?? []).length}箇所）`,
  );
}

console.log("Test 18: 関係ない一般会話では出典を出さない");
{
  // route は intent が無いターンでは entry を読まないため候補が空になる。
  const sources = sourcesFor({});
  assert(sources.length === 0, "ビザ・都市の話でなければ出典0件");
  const route = readFileSync("app/api/chat/route.ts", "utf8");
  assert(
    /const sourceCandidates: SourceCandidate\[\] = \[\];/.test(route),
    "出典候補はリクエストごとに作る（同時リクエストで混ざらない）",
  );
  assert(
    /collect: SourceCandidate\[\]/.test(route),
    "候補は引数で受け取る（モジュール共有の状態を持たない）",
  );
}

console.log("");
console.log(`passed: ${pass} / failed: ${fail}`);
if (fail > 0) process.exit(1);
