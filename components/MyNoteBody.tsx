import { parseDocumentBodyOutline } from "@/lib/documentBodyOutline";
import { MY_NOTE_DEFAULT_TITLE } from "@/lib/myNotePrompt";
import DocumentPlainText from "@/components/DocumentPlainText";

/**
 * My Note 本文の表示。共有デザインの「読み返すためのノート／エディトリアルページ」に寄せて、
 * 左に NOTE OUTLINE、右に section カード（01 は navy band 付きの大きなカード、02 以降は
 * 2 列グリッド）で見せる。
 *
 * 本文そのものは一切加工しない:
 *  - lib/documentBodyOutline.ts で「■ 見出し ＋ 行」に機械分解するだけ（要約・言い換え・並べ替えなし）
 *  - 「■ 」見出しが 1 つも無い（parser が null）body は、元 body 全文を plain text で完全 fallback
 *  - preamble・各 section の非空行は 1 行も落とさない
 *
 * フォントは他画面と統一して基本 sans。serif は装飾的な大きい番号（01〜）だけに使う。
 * hooks を持たない純粋表示コンポーネント。
 */

/** 空行を段落区切りに、連続する非空行を 1 段落（改行保持）へまとめる（従来と同じ）。 */
function toParagraphs(lines: string[]): string[] {
  const paragraphs: string[] = [];
  let buffer: string[] = [];
  for (const line of lines) {
    if (line.trim() === "") {
      if (buffer.length > 0) {
        paragraphs.push(buffer.join("\n"));
        buffer = [];
      }
    } else {
      buffer.push(line);
    }
  }
  if (buffer.length > 0) paragraphs.push(buffer.join("\n"));
  return paragraphs;
}

/** 02 以降のカード上辺のテーマカラー（Worksheet 一覧と近い sage / pale blue / gray / coral）。 */
const ACCENT_LINE = ["#7d9a63", "#9fb6cb", "#b6afa1", "#c8836b"];

function QuoteIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M9.5 6C6.5 7.4 5 9.8 5 13.3V18h5v-5H7.6c0-2 .9-3.4 2.9-4.3L9.5 6Zm9 0c-3 1.4-4.5 3.8-4.5 7.3V18h5v-5h-2.4c0-2 .9-3.4 2.9-4.3L18.5 6Z" />
    </svg>
  );
}

export default function MyNoteBody({ body }: { body: string }) {
  const outline = parseDocumentBodyOutline(body);
  if (outline === null) return <DocumentPlainText body={body} />;

  // detail header のタイトルと重複する既定タイトル行だけ落とす（厳密一致のみ）。
  const preambleLines = outline.preamble.filter(
    (line) => line.trim().length > 0 && line.trim() !== MY_NOTE_DEFAULT_TITLE,
  );

  const sections = outline.sections;
  const [first, ...rest] = sections;
  const firstParas = first ? toParagraphs(first.lines) : [];

  // Section 01 本文の font size は文章量で2段階に出し分ける（pure presentation。
  // 本文文字列は truncate も要約もせず、そのまま全文表示する。閾値は実画面での読みやすさから 200 文字）。
  const firstBodyLength = firstParas.join("\n").length;
  const isFirstSectionLong = firstBodyLength >= 200;
  const firstBodyClass = isFirstSectionLong
    ? "mt-3 space-y-4 text-base font-normal leading-8 text-[#232227] sm:text-lg"
    : "mt-3 space-y-4 text-lg font-medium leading-relaxed text-[#232227] sm:text-xl lg:text-2xl";

  return (
    <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-8">
      {/* NOTE OUTLINE */}
      <aside className="lg:sticky lg:top-8 lg:self-start">
        <nav className="rounded-[16px] border border-[#e5dfd6] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5f7050]">
            Note Outline
          </p>
          <ol className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 lg:block lg:space-y-0.5">
            {sections.map((section, i) => (
              <li key={i}>
                <a
                  href={`#mynote-section-${i + 1}`}
                  className={`flex gap-2.5 rounded-lg border-l-2 px-2 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e2b3d]/40 ${
                    i === 0
                      ? "border-[#1e2b3d] font-medium text-[#172033]"
                      : "border-transparent text-[#3f3a34] hover:bg-[#f2efe7]"
                  }`}
                >
                  <span aria-hidden className="font-serif text-xs text-[#b7b1a6]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="line-clamp-2 leading-snug">{section.heading}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </aside>

      {/* 本文 */}
      <div className="min-w-0 space-y-6">
        {preambleLines.length > 0 && (
          <div className="space-y-2 text-[15px] leading-8 text-[#625f59]">
            {preambleLines.map((line, i) => (
              <p key={i} className="whitespace-pre-wrap">
                {line}
              </p>
            ))}
          </div>
        )}

        {/* Section 01: navy band + white panel */}
        {first && (
          <article
            id="mynote-section-1"
            className="scroll-mt-6 overflow-hidden rounded-[18px] border border-[#e5dfd6] bg-white shadow-[0_1px_3px_rgba(30,28,24,0.05)]"
          >
            <div className="relative overflow-hidden bg-[#1e2b3d] px-5 py-6 sm:px-9 sm:py-8">
              <span
                aria-hidden
                className="pointer-events-none absolute left-5 top-1 select-none font-serif text-[52px] font-normal leading-none text-white/20 sm:text-[88px]"
              >
                01
              </span>
              <svg
                aria-hidden
                viewBox="0 0 200 120"
                preserveAspectRatio="none"
                className="pointer-events-none absolute right-0 top-0 h-full w-1/2"
              >
                <path d="M30 130 C 110 120, 150 40, 210 -10" fill="none" stroke="rgba(214,200,178,0.35)" strokeWidth="1.4" />
                <circle cx="196" cy="14" r="2.6" fill="rgba(214,200,178,0.5)" />
              </svg>
            </div>
            <div className="px-5 py-6 sm:px-9 sm:py-7">
              <h2 className="text-sm font-semibold tracking-wide text-[#5f7050]">{first.heading}</h2>
              {firstParas.length > 0 && (
                <div className={firstBodyClass}>
                  {firstParas.map((p, j) => (
                    <p key={j} className="whitespace-pre-wrap">
                      {p}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </article>
        )}

        {/* Section 02〜: 2 列グリッド */}
        {rest.length > 0 && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {rest.map((section, idx) => {
              const num = String(idx + 2).padStart(2, "0");
              const accent = ACCENT_LINE[idx % ACCENT_LINE.length];
              const paragraphs = toParagraphs(section.lines);
              const isImportant = section.heading.includes("大切");
              return (
                <article
                  key={idx}
                  id={`mynote-section-${idx + 2}`}
                  style={{ borderTopColor: accent }}
                  className="scroll-mt-6 rounded-[16px] border border-[#e5dfd6] border-t-[3px] bg-white p-5 shadow-[0_1px_3px_rgba(30,28,24,0.05)] sm:p-6 lg:p-7"
                >
                  <span
                    aria-hidden
                    className="select-none font-serif text-4xl font-normal leading-none text-[#1e2b3d]/20 sm:text-5xl"
                  >
                    {num}
                  </span>
                  <h3 className="mt-2 text-lg font-semibold text-[#172033]">{section.heading}</h3>

                  {paragraphs.length > 0 && (
                    <div className="mt-3 space-y-4 text-base leading-8 text-[#3f3a34]">
                      {isImportant ? (
                        <>
                          <blockquote className="flex gap-2.5 rounded-xl bg-[#eef2e8] px-4 py-3.5 text-[15px] leading-7 text-[#3c4a33]">
                            <QuoteIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#7d9a63]" />
                            <span className="whitespace-pre-wrap">{paragraphs[0]}</span>
                          </blockquote>
                          {paragraphs.slice(1).map((p, j) => (
                            <p key={j} className="whitespace-pre-wrap">
                              {p}
                            </p>
                          ))}
                        </>
                      ) : (
                        paragraphs.map((p, j) => (
                          <p key={j} className="whitespace-pre-wrap">
                            {p}
                          </p>
                        ))
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
