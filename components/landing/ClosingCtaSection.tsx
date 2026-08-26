import Link from "next/link";

/** Hero画像とは別の、淡いsage背景で軽くビジュアルの区切りを持たせる（巨大な広告バナーにはしない）。 */
export default function ClosingCtaSection() {
  return (
    <section className="border-t border-worksheet-border bg-worksheet-sage/25 px-4 py-16 text-center md:px-8 md:py-20 lg:px-[60px]">
      <h2 className="text-2xl font-semibold leading-snug text-worksheet-primary sm:text-3xl">
        行きたい気持ちが、
        <br />
        まだ曖昧でも大丈夫。
      </h2>
      <p className="mt-3 text-sm text-worksheet-secondary sm:text-base">まずは、話すことから。</p>

      <div className="mt-8">
        <Link
          href="/login"
          className="inline-flex items-center rounded-full bg-worksheet-accent px-6 py-3 text-sm font-medium text-worksheet-accent-contrast transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
        >
          はじめる
        </Link>
      </div>

      <p className="mt-3 text-xs text-worksheet-secondary">Googleアカウントで利用できます</p>
    </section>
  );
}
