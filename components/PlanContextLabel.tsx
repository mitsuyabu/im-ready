/**
 * 「いま見ているのはどの Plan か」を示す、ページタイトル直上の小さなコンテキスト表示。
 *
 * Desktop（lg 以上）は AppNav の Plan sidebar 上部が同じ役割を持つため `lg:hidden` で出さない
 * （同じ Plan 名を 1 画面に二重表示しない）。mobile / tablet でだけページタイトルの上に添える。
 *
 * 情報の強弱は「ページタイトル > 本文 > Plan 名」。pill / 背景 / border / `Plan:` の prefix は付けない。
 * legacy の長い title は省略せず最大 2 行で自然に折り返す。
 */
export default function PlanContextLabel({ planTitle }: { planTitle: string }) {
  const title = planTitle.trim();
  if (title.length === 0) return null;
  return (
    <p className="mb-1 line-clamp-2 text-[11px] font-medium leading-tight text-[#7c766d] lg:hidden">
      {title}
    </p>
  );
}
