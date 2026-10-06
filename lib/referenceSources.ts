/**
 * Chat の回答で実際に使った確認済みリファレンス（ビザ・都市）の**出典表示用**レイヤー。
 *
 * 設計の要点:
 *   - 表示するのは「そのターンで LLM へ渡した category の出典」だけ。DB の全 entry は出さない。
 *   - DB 内部の `source_type` 文字列をそのまま画面へ出さず、利用者向けラベルへ変換する。
 *     出典の強さ（一次情報 / 政府統計 / 政府公式 / 大学 など）を区別できる形にする。
 *   - **内部メモは一切通さない**。ビザ側の出典内部メモ（notes）はサーバー側の型にも
 *     存在しない（公開 view に含めていない）。都市側の `note` は公開前提の注記のみ。
 *   - URL は https のみ通す（javascript: / data: 等は捨てる）。
 *   - 同じ URL は1件へまとめ、件数に上限を設ける（回答下の UI を肥大化させない）。
 *
 * このファイルはクライアントからも import するため、サーバー専用の依存を持たない。
 */

/** 画面に出す出典1件。ここに無いフィールドは画面へ出さない。 */
export type ChatSource = {
  /** 出典名（公開情報）。 */
  name: string;
  /** 公式ページの URL（https のみ）。 */
  url: string;
  /** 出典の種別の利用者向けラベル（例: 一次情報、政府統計）。 */
  label: string;
  /** こちら側で人間が最後に確認した日（YYYY-MM-DD）。 */
  reviewedAt?: string;
  /** 出典側の更新日・公表日（分かる場合だけ）。 */
  updatedAt?: string;
  /** 公開前提の短い補足（鮮度や前提の限界など）。内部メモは入れない。 */
  note?: string;
  /** どの話題の出典か（例: 学生ビザ（サブクラス500） / 就労の条件）。 */
  topic?: string;
};

/**
 * DB の source_type → 利用者向けラベル。
 * **内部の文字列をそのまま画面に出さないための対応表**。
 */
const SOURCE_LABELS: Record<string, string> = {
  // ビザ側
  home_affairs: "一次情報（Department of Home Affairs）",
  study_australia: "政府系の留学情報",
  fair_work: "公的機関の情報（Fair Work Ombudsman）",
  ato: "公的機関の情報（オーストラリア国税庁）",
  education: "教育機関の公式情報",
  other_government: "その他の政府系情報",
  // 都市側
  government_statistics: "政府統計",
  police: "警察の公式情報",
  government_information: "政府の公式情報",
  transport_authority: "交通機関の公式情報",
  university: "大学の公式情報",
  other: "その他の確認済み情報",
};

/** 表示順（小さいほど上）。制度の一次情報を先頭に置く。 */
const SOURCE_RANK: Record<string, number> = {
  home_affairs: 1,
  government_statistics: 2,
  police: 3,
  government_information: 4,
  fair_work: 4,
  ato: 4,
  study_australia: 5,
  transport_authority: 6,
  university: 7,
  education: 8,
  other_government: 9,
  other: 9,
};

/** 既定で画面に載せる最大件数（これを超える分は落とす）。 */
export const CHAT_SOURCE_MAX = 5;

const NAME_MAX = 120;
const LABEL_MAX = 80;
const NOTE_MAX = 160;
const TOPIC_MAX = 60;

/** 出典の種別を利用者向けラベルへ。未知の種別は当たり障りのない表現にする。 */
export function sourceTypeLabel(sourceType: string): string {
  return SOURCE_LABELS[sourceType] ?? "確認済みの公開情報";
}

/** 一次情報（制度そのものの出典）かどうか。 */
export function isPrimarySourceType(sourceType: string): boolean {
  return sourceType === "home_affairs";
}

/** https の URL だけを通す（javascript: / data: などは捨てる）。 */
export function isSafeSourceUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** dedupe 用に URL を正規化する（末尾スラッシュとハッシュの差で重複させない）。 */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.host.toLowerCase()}${path}${parsed.search}`;
  } catch {
    return url;
  }
}

function clamp(value: string | null | undefined, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const flattened = value.replace(/\s+/g, " ").trim();
  if (flattened.length === 0) return undefined;
  return flattened.length > max ? `${flattened.slice(0, max)}…` : flattened;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function date(value: string | null | undefined): string | undefined {
  return typeof value === "string" && ISO_DATE.test(value) ? value : undefined;
}

/**
 * 保存済み（DB）の出典を画面へ出す前に再検証する。
 *
 * 保存した時点では sanitized でも、**保存済みの値をそのまま信用しない**
 * （手で書き換えられた行・古い形式・壊れた JSON で UI を壊さないため）。
 * 検証は buildChatSources と同じ規則（https のみ・必須項目・長さ上限・件数上限・URL 重複排除）。
 */
export function sanitizeStoredChatSources(value: unknown, max = CHAT_SOURCE_MAX): ChatSource[] {
  if (!Array.isArray(value)) return [];
  const candidates: SourceCandidate[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.name !== "string" || typeof row.url !== "string") continue;
    candidates.push({
      sourceName: row.name,
      sourceUrl: row.url,
      // 種別は保存していないため、保存済みラベルをそのまま使う（下で差し替える）。
      sourceType: "__stored__",
      reviewedAt: typeof row.reviewedAt === "string" ? row.reviewedAt : null,
      sourceUpdatedAt: typeof row.updatedAt === "string" ? row.updatedAt : null,
      note: typeof row.note === "string" ? row.note : null,
      topic: typeof row.topic === "string" ? row.topic : null,
    });
  }
  const labels = new Map<string, string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.url === "string" && typeof row.label === "string") {
      const label = clamp(row.label, LABEL_MAX);
      if (label && !labels.has(row.url)) labels.set(row.url, label);
    }
  }
  return buildChatSources(candidates, max).map((source) => ({
    ...source,
    // 保存時のラベルを優先し、無ければ当たり障りのない表現にする。
    label: labels.get(source.url) ?? sourceTypeLabel("__stored__"),
  }));
}

/** buildChatSources の入力（ビザ・都市の citation を同じ形へ寄せたもの）。 */
export type SourceCandidate = {
  sourceName: string;
  sourceUrl: string;
  sourceType: string;
  reviewedAt?: string | null;
  sourceUpdatedAt?: string | null;
  /** 公開前提の注記だけ。内部メモは渡さないこと。 */
  note?: string | null;
  topic?: string | null;
};

/**
 * 候補から画面表示用の出典一覧を作る。
 *
 * - https 以外・名前が無いものは落とす
 * - 同じ URL は1件へまとめる（先に出た方の情報を残し、話題だけ追記する）
 * - 出典の強さ順 → 名前順で安定ソート
 * - 上限（CHAT_SOURCE_MAX）で切る
 */
export function buildChatSources(candidates: SourceCandidate[], max = CHAT_SOURCE_MAX): ChatSource[] {
  const byUrl = new Map<string, { source: ChatSource; rank: number; topics: string[] }>();

  for (const candidate of candidates) {
    const name = clamp(candidate.sourceName, NAME_MAX);
    const url = typeof candidate.sourceUrl === "string" ? candidate.sourceUrl.trim() : "";
    if (!name || !url || !isSafeSourceUrl(url)) continue;

    const key = normalizeUrl(url);
    const topic = clamp(candidate.topic, TOPIC_MAX);
    const existing = byUrl.get(key);
    if (existing) {
      if (topic && !existing.topics.includes(topic)) existing.topics.push(topic);
      continue;
    }

    byUrl.set(key, {
      rank: SOURCE_RANK[candidate.sourceType] ?? 99,
      topics: topic ? [topic] : [],
      source: {
        name,
        url,
        label: sourceTypeLabel(candidate.sourceType),
        reviewedAt: date(candidate.reviewedAt),
        updatedAt: date(candidate.sourceUpdatedAt),
        note: clamp(candidate.note, NOTE_MAX),
      },
    });
  }

  return [...byUrl.values()]
    .sort((a, b) => (a.rank === b.rank ? a.source.name.localeCompare(b.source.name) : a.rank - b.rank))
    .slice(0, Math.max(0, max))
    .map(({ source, topics }) => (topics.length > 0 ? { ...source, topic: topics.join(" / ") } : source));
}
