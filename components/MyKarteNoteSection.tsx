import MyKarteSectionHeader from "@/components/MyKarteSectionHeader";
import type { MyNoteBuckets, MyNoteCardKey } from "@/lib/myNoteBuckets";

/**
 * My Karte ダッシュボードの My Note セクション（presentation のみ）。
 *
 * **ページの中で最も重要なセクション**。4 つの話題（理由・目的 / こんな留学にしたい /
 * 大切にしたいこと / 気になっていること）を**同じ作りのカード**で出す。
 *
 * カードの作りは 4 枚で完全に共通（NoteCard 1 つだけで描く）:
 *   - 見出し … 小さな線アイコン（16px）＋ .mk-card-title（16px / semibold / near-black）
 *     横幅いっぱいの色帯や pill は使わない（以前の「補助カードはパステルの帯、
 *     hero は蛍光 pill」という不統一をやめた）
 *   - 項目名 … .mk-item-label（14〜15px / 600 / #515650）。回答を読み解くための見出しなので
 *     小さく薄いグレーにはしない
 *   - 本文   … .mk-text（15〜16px / 行間 1.7）。各カードの 1 件目だけ .mk-text-lead で少し強く。
 *     カード間で本文サイズを変えない
 *   - 余白・角丸・border・影・「ほか○件」の出し方もすべて共通（.mk-card / .mk-pad）
 *
 * カードごとの個性は **右上の淡いグラデーションの色だけ**で付ける:
 *   理由・目的 = 蛍光ライム / こんな留学にしたい = 淡いブルー /
 *   大切にしたいこと = 淡いセージ / 気になっていること = 淡いラベンダー。
 * いずれも白へ溶け込ませるので、面のベタ塗り（以前のピーチ一色）にはならない。
 * 長文が載る領域は白のまま。
 *
 * レイアウト（§7 の案 B＋C）:
 *   PC は 5 列グリッドの **2 段 Bento**（3 : 2 / 2 : 3）。
 *   以前の「左 1 枚 + 右に 3 枚縦積み」は右列だけが背高くなり、左の大きいカードの下に
 *   大きな空白ができていたため、横に散らして 2 段にした。
 *   items-start なので各カードは中身の分だけ伸び、固定高さは持たせない
 *   （空白を埋めるための架空の情報も、引き伸ばしもしない）。
 *   スマートフォンは 1 列。
 *
 * 出しているのは lib/myNoteBuckets.ts が Karte の stated 値と Worksheet の回答から
 * 機械的に振り分けた材料そのままで、この画面では AI 生成を一切行わない
 * （ページ表示時に Anthropic を呼ばない）。言い換え・要約・補完もしない。
 * inferred（AI の仮説）は buckets に入らない。未回答を推測で埋めない。
 *
 * hooks を持たない純粋表示コンポーネント。
 */

type NoteIconKey = "reasons" | "future" | "priorities" | "worries";

/** 画面に出す 4 つの話題。カードごとに変えるのは**グラデーションの色だけ**。 */
const NOTE_PANELS: {
  key: MyNoteCardKey;
  title: string;
  icon: NoteIconKey;
  /** 右上のグラデーションの色。白へ溶け込ませるので面のベタ塗りにはならない。 */
  wash: string;
}[] = [
  { key: "reasons", title: "留学したい理由・目的", icon: "reasons", wash: "var(--neon-lime)" },
  { key: "future", title: "こんな留学にしたい", icon: "future", wash: "var(--mk-pale-blue)" },
  { key: "priorities", title: "大切にしたいこと", icon: "priorities", wash: "var(--mk-pale-sage)" },
  { key: "worries", title: "気になっていること", icon: "worries", wash: "var(--mk-pale-lavender)" },
];

/**
 * Bento の列幅。カードの枚数（= 中身がある話題の数）で変える。
 * 1 段に 2 枚ずつ並べ、幅を 3 : 2 と 2 : 3 で入れ替えて大小のリズムを作る。
 */
const SPANS: Record<number, string[]> = {
  1: ["lg:col-span-5"],
  2: ["lg:col-span-3", "lg:col-span-2"],
  3: ["lg:col-span-3", "lg:col-span-2", "lg:col-span-5"],
  4: ["lg:col-span-3", "lg:col-span-2", "lg:col-span-2", "lg:col-span-3"],
};

/** 1 枚のカードに出す最大件数（4 枚すべて同じ）。これ以上は詳細画面で見てもらう。 */
const MAX_ITEMS = 3;

type NoteItem = { label: string; value: string };

/** 見出しの小さな線アイコン。4 枚で同じサイズ・同じ太さに揃える。 */
function NoteIcon({ icon }: { icon: NoteIconKey }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-4 w-4 shrink-0 text-[var(--mk-label)]",
    "aria-hidden": true,
  };
  switch (icon) {
    case "reasons": // compass（なぜ行きたいのか）
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M14.8 9.2l-1.6 4.2-4.2 1.6 1.6-4.2 4.2-1.6Z" />
        </svg>
      );
    case "future": // flag（こうなっていたい）
      return (
        <svg {...common}>
          <path d="M6 21V4M6 4h10l-1.5 3.5L16 11H6" />
        </svg>
      );
    case "priorities": // heart（大切にしたいこと）
      return (
        <svg {...common}>
          <path d="M12 19.5s-7-4.3-7-9a3.8 3.8 0 0 1 7-2.1A3.8 3.8 0 0 1 19 10.5c0 4.7-7 9-7 9Z" />
        </svg>
      );
    case "worries": // question（気になっていること）
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M9.6 9.5a2.4 2.4 0 1 1 3.6 2.1c-.7.4-1.2.9-1.2 1.8M12 16.6h.01" />
        </svg>
      );
  }
}

/**
 * My Note のカード。4 枚ともこの 1 つで描く（作りの違いを持たせない）。
 * 変わるのはタイトル・アイコン・右上のグラデーションの色・中身だけ。
 */
function NoteCard({
  title,
  icon,
  wash,
  items,
}: {
  title: string;
  icon: NoteIconKey;
  wash: string;
  items: NoteItem[];
}) {
  const shown = items.slice(0, MAX_ITEMS);
  const rest = items.length - shown.length;

  return (
    <div className="mk-card mk-pad relative overflow-hidden">
      {/* 右上から差す淡いグラデーション。白へ溶け込ませ、本文には掛けない。 */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-14 -top-20 h-56 w-56 rounded-full"
        style={{
          background: `radial-gradient(circle, ${wash} 0%, rgba(255,255,255,0) 68%)`,
          opacity: 0.55,
        }}
      />

      <div className="relative flex items-center gap-2.5">
        <NoteIcon icon={icon} />
        <h3 className="mk-card-title min-w-0 break-words">{title}</h3>
      </div>

      <ul className="relative mt-5 space-y-5">
        {shown.map((item, i) => (
          <li key={`${item.label}-${i}`}>
            {/* 項目名は「補足」ではなく回答を読み解くための見出し。4 枚で同じスタイル。 */}
            <p className="mk-item-label">{item.label}</p>
            {/* 1 件目だけ少し強く組む。原文のまま出し、行数だけ抑える。 */}
            <p
              className={`mt-1.5 whitespace-pre-wrap break-words ${
                i === 0 ? "mk-text-lead line-clamp-5" : "mk-text line-clamp-4"
              }`}
            >
              {item.value}
            </p>
          </li>
        ))}
      </ul>

      {/* 「ほか○件」の出し方も 4 枚で共通 */}
      {rest > 0 && (
        <p className="mk-sub-text relative mt-4 border-t border-[#f0f1ee] pt-3">ほか{rest}件</p>
      )}
    </div>
  );
}

export default function MyKarteNoteSection({
  planId,
  buckets,
}: {
  planId: string;
  buckets: MyNoteBuckets;
}) {
  const panels = NOTE_PANELS.map((p) => ({ ...p, items: buckets[p.key] })).filter(
    (p) => p.items.length > 0,
  );
  const spans = SPANS[panels.length] ?? [];

  return (
    <section>
      <MyKarteSectionHeader
        eyebrow="Note"
        title="My Note"
        description="これまで考えてきたこと"
        href={`/plans/${planId}/documents/my-note`}
      />

      {panels.length === 0 ? (
        <div className="mk-card-empty mk-pad-lg">
          <p className="mk-sub-text">
            AI相談やワークシートで考えを整理すると、ここに内容が表示されます。
          </p>
        </div>
      ) : (
        /*
          Bento Grid。5 列を 3 : 2 / 2 : 3 で 2 段に分ける。
          固定高さは持たせない。items-start なので各カードは中身の分だけ伸びる
          （短いカードを引き伸ばして中に空白を作らない）。
        */
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-5">
          {panels.map((p, i) => (
            <div key={p.key} className={spans[i] ?? "lg:col-span-5"}>
              <NoteCard title={p.title} icon={p.icon} wash={p.wash} items={p.items} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
