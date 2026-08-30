import { parseDocumentBodyOutline } from "@/lib/documentBodyOutline";
import { MY_NOTE_DEFAULT_TITLE } from "@/lib/myNotePrompt";
import DocumentPlainText from "@/components/DocumentPlainText";

/**
 * My Note 本文の表示（Step 28）。「考える」＝内省ノートに見せる:
 * セクション見出しは小さく静かに、本文は行間・段落間を広めに、幅はやや狭め、
 * カードを積まない。
 *
 * lib/documentBodyOutline.ts（Step 27）で「■ 見出し ＋ prose」に分解し、
 * 解析できなければ（null）元 body 全文へ完全 fallback（DocumentPlainText）。
 * 本文の要約・言い換え・補完はしない。表示のしかたを変えるだけ。
 *
 * hooks 無しの純粋表示コンポーネント（page / Generator の両方から使う）。
 */

/** 空行を段落区切りとして、連続する非空行を 1 段落（改行保持）にまとめる。 */
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

export default function MyNoteBody({ body }: { body: string }) {
  const outline = parseDocumentBodyOutline(body);
  if (outline === null) return <DocumentPlainText body={body} />;

  // preamble が「生成 Document の既定タイトル」と完全一致する行だけは、detail header の
  // タイトルと重複するため落とす（意味推測ではなく厳密一致。§17）。それ以外の preamble は残す。
  const preambleLines = outline.preamble.filter(
    (line) => line.trim().length > 0 && line.trim() !== MY_NOTE_DEFAULT_TITLE,
  );

  return (
    <div className="mt-8 max-w-2xl">
      {preambleLines.length > 0 && (
        <div className="mb-8 space-y-3 text-[15px] leading-8 text-worksheet-primary">
          {preambleLines.map((line, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {line}
            </p>
          ))}
        </div>
      )}

      <div className="space-y-10">
        {outline.sections.map((section, i) => {
          const paragraphs = toParagraphs(section.lines);
          return (
            <section key={i}>
              <h2 className="text-sm font-medium tracking-wide text-worksheet-secondary">
                {section.heading}
              </h2>
              {paragraphs.length > 0 && (
                <div className="mt-3 space-y-4 text-[15px] leading-8 text-worksheet-primary">
                  {paragraphs.map((paragraph, j) => (
                    <p key={j} className="whitespace-pre-wrap">
                      {paragraph}
                    </p>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
