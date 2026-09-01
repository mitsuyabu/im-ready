import Image from "next/image";

/**
 * Plan 選択後トップのヒーロー（presentation のみ）。
 *
 * Gold Coast の Plan だけ都市画像（/plan-hero/gold-coast.webp）を背景に使う試験実装。
 *   Gold Coast     → GoldCoastImageHero（next/image で全面表示・左に warm overlay・装飾は最小限）
 *   それ以外        → CollageHero（既存の navy ＋ 手ちぎり紙のコラージュ Hero。削除しない）
 * 今回は他都市へは広げない（汎用 city registry は作らない）。
 *
 * 表示する実データは plan.title と stated の city / departureTiming だけ。fake data は追加しない
 *（画像が Gold Coast でも Australia / Working Holiday / beach lifestyle 等は一切創作しない）。
 * 装飾はすべて aria-hidden・pointer-events-none。hooks を持たない純粋表示コンポーネント。
 */

const PAPER_TORN =
  "polygon(0 8px, 6% 2px, 13% 11px, 21% 3px, 29% 12px, 37% 4px, 46% 11px, 55% 2px, 64% 13px, 73% 4px, 82% 10px, 91% 2px, 100% 9px, calc(100% - 6px) 22%, 100% 40%, calc(100% - 7px) 58%, 100% 76%, calc(100% - 5px) 92%, 100% 100%, 88% calc(100% - 6px), 72% 100%, 58% calc(100% - 7px), 42% 100%, 28% calc(100% - 6px), 12% 100%, 0 calc(100% - 5px), 6px 80%, 0 62%, 7px 44%, 0 26%, 5px 12%)";

const SALMON_TORN =
  "polygon(0 0, 100% 0, 100% 46%, 92% 74%, 84% 100%, 74% 62%, 66% 92%, 55% 55%, 46% 96%, 37% 58%, 28% 100%, 19% 66%, 10% 100%, 0 70%)";

const WAVE_TORN =
  "polygon(0 44%, 9% 20%, 18% 48%, 28% 14%, 38% 46%, 48% 12%, 58% 44%, 68% 16%, 78% 46%, 88% 18%, 100% 40%, 100% 100%, 0 100%)";

/** 薄い紙ノイズ（feTurbulence を data-URI 化）。overlay で低 opacity 合成する。 */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const CHIP_CLASS_COLLAGE =
  "inline-flex items-center gap-1 rounded-full border border-[#2b2a27]/20 bg-white/85 px-2.5 py-1 text-[11px] font-medium text-[#1f2430]";
const CHIP_CLASS_IMAGE =
  "inline-flex items-center gap-1 rounded-full border border-[#2b2a27]/20 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-[#1f2430] shadow-[0_1px_2px_rgba(0,0,0,0.08)]";

const SUBTITLE = "このPlanの条件や考えを整理していこう。";
const FALLBACK_CHIP = "行き先・時期はこれから整理";

type HeroProps = {
  title: string;
  /** 表示用の都市テキスト（stated の schoolPrefs.preferredCity。自由記述・説明文込みのことがある）。 */
  city: string | null;
  /**
   * Hero 画像の切り替え判定にだけ使う「行き先として選択されている都市」。
   * page.tsx が Karte の正式な行き先 field（schoolPrefs.preferredCity、certainty=stated かつ
   * conflict 中でない）から渡す。無ければ null。表示には使わない。
   */
  destinationCity?: string | null;
  departureTiming: string | null;
};

/**
 * 今回試験対象の Gold Coast のみ判定（汎用 registry は作らない）。
 *
 * 判定は「行き先 field の先頭の都市名トークン」だけを見る。schoolPrefs.preferredCity は
 * 自由記述で `ゴールドコースト。都会すぎず海が近く…` のように理由が続くことがあるため、
 * 説明文が始まる区切り（。、，,.．（(／/・ 改行）で切った先頭部分を trim + lowercase して
 * **完全一致**で比較する。説明文への includes() は使わない
 *（例:「ゴールドコーストが気になる理由は…」のように区切り無しで続く文は一致しない）。
 */
function isGoldCoast(destinationCity: string | null | undefined): boolean {
  if (!destinationCity) return false;
  const head = destinationCity
    .trim()
    .split(/[。、，,.．（(／/・\n]/)[0]
    .trim()
    .toLowerCase();
  return head === "gold coast" || head === "ゴールドコースト";
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 2.5" />
    </svg>
  );
}

function MyPlanLabel({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`z-10 -rotate-2 bg-[#f4e7c4] px-2 py-0.5 text-[9px] font-semibold tracking-[0.18em] text-[#4a3f22] shadow-[0_1px_2px_rgba(0,0,0,0.2)] ${className}`}
      style={{ clipPath: "polygon(0 26%, 6% 0, 92% 8%, 100% 76%, 94% 100%, 4% 90%)" }}
    >
      MY PLAN
    </span>
  );
}

function Chips({
  city,
  departureTiming,
  chipClass,
}: HeroProps & { chipClass: string }) {
  const hasChips = Boolean(city || departureTiming);
  return (
    <div className="mt-5 flex flex-wrap gap-2.5">
      {!hasChips && (
        <span className="rounded-full border border-[#2b2a27]/20 bg-white/85 px-2.5 py-1 text-[11px] text-[#3f3d38]">
          {FALLBACK_CHIP}
        </span>
      )}
      {city && (
        <span className={chipClass}>
          <PinIcon className="h-3 w-3" />
          {city}
        </span>
      )}
      {departureTiming && (
        <span className={chipClass}>
          <ClockIcon className="h-3 w-3" />
          出発の目安：{departureTiming}
        </span>
      )}
    </div>
  );
}

export default function PlanTravelHero(props: HeroProps) {
  // Hero 画像は「行き先として選ばれている都市」(destinationCity) だけで決める。
  // 表示用の自由記述 city は判定に使わない。
  return isGoldCoast(props.destinationCity) ? (
    <GoldCoastImageHero {...props} />
  ) : (
    <CollageHero {...props} />
  );
}

/* ------------------------------------------------------------------ */
/* Gold Coast: 都市画像 Hero                                           */
/* ------------------------------------------------------------------ */

function GoldCoastImageHero({ title, city, departureTiming }: HeroProps) {
  return (
    <div className="relative overflow-hidden rounded-[24px] bg-[#eef2f4]">
      <div className="relative min-h-[248px] sm:min-h-[280px]">
        {/* 背景：Gold Coast の都市画像（左に明るい余白・右に街/海/ヤシ）。このページの主要画像。 */}
        <Image
          src="/plan-hero/gold-coast.webp"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 1024px, 100vw"
          className="object-cover object-[58%_center] sm:object-[54%_center] lg:object-center"
        />

        {/* 左側だけの warm overlay（文字の可読性用。画像が元々明るいので強くしすぎない）。 */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#fffaf0]/95 via-[#fffaf0]/58 to-transparent sm:from-[#fffaf0]/88 sm:via-[#fffaf0]/42"
        />

        {/* ごく薄い紙ノイズ */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-overlay"
          style={{ backgroundImage: GRAIN }}
        />

        {/* 左上の小さな MY PLAN ラベル（画像より目立たせない） */}
        <MyPlanLabel className="absolute left-4 top-4 sm:left-[5%]" />

        {/* 本文（左・明るい余白の上） */}
        <div className="relative z-10 flex min-h-[248px] max-w-[86%] flex-col justify-center px-5 py-12 sm:min-h-[280px] sm:max-w-[52%] sm:py-14 sm:pl-[8%]">
          <h1 className="text-[1.9rem] font-bold leading-[1.08] tracking-tight text-[#182233] drop-shadow-[0_1px_2px_rgba(255,250,240,0.7)] sm:text-4xl lg:text-[3.2rem]">
            {title}
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-[#3f3a33] sm:text-[15px]">{SUBTITLE}</p>
          <Chips city={city} departureTiming={departureTiming} title={title} chipClass={CHIP_CLASS_IMAGE} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* それ以外: 既存コラージュ Hero（fallback・削除しない）               */
/* ------------------------------------------------------------------ */

function CollageHero({ title, city, departureTiming }: HeroProps) {
  return (
    <div className="relative overflow-hidden rounded-[24px] bg-[#223650]">
      {/* ちぎれ縁を荒らす SVG フィルタ定義 */}
      <svg aria-hidden width="0" height="0" className="absolute">
        <defs>
          <filter id="pth-torn" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.018 0.05" numOctaves="3" seed="7" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      <div className="relative min-h-[248px] sm:min-h-[280px]">
        {/* 夕日・短い放射線・波線・ヤシ（右側） */}
        <svg
          aria-hidden
          viewBox="0 0 240 240"
          preserveAspectRatio="xMidYMid slice"
          className="pointer-events-none absolute right-0 top-0 h-full w-[46%] opacity-60 sm:w-[36%] sm:opacity-95"
        >
          <circle cx="112" cy="128" r="30" fill="#e8a486" opacity="0.5" />
          <g stroke="#e8a486" strokeWidth="2.6" strokeLinecap="round" opacity="0.75">
            <path d="M112 84v-11M132 92l7-8M92 92l-7-8M148 108l10-6M76 108l-10-6" />
          </g>
          <g stroke="#7d94b5" strokeWidth="2.6" fill="none" strokeLinecap="round" opacity="0.8">
            <path d="M-6 184c26-12 48 10 74 2s50-10 76 0 44 8 70-2" />
            <path d="M-6 202c26-10 48 8 74 0s50-8 76 2 44 6 70-2" />
            <path d="M-6 220c26-8 48 8 74 2s50-8 76 0 44 6 70-2" />
          </g>
          <g stroke="#8a9a86" strokeWidth="2.4" fill="none" strokeLinecap="round">
            <path d="M182 210c-2-22-3-40-2-56" />
            <path d="M180 154c-14-8-24-6-32 2M180 154c14-9 26-8 34 1M180 154c-7-15-6-27 2-37M180 154c9-13 21-16 33-12" opacity="0.9" />
          </g>
        </svg>

        {/* 右上の消印スタンプ */}
        <svg
          aria-hidden
          viewBox="0 0 96 68"
          className="pointer-events-none absolute right-2 top-2 hidden h-[70px] w-28 -rotate-3 text-[#a9b6c8] sm:block"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <rect x="4" y="4" width="88" height="60" rx="3" strokeDasharray="4 3" />
          <path d="M12 24c8-6 16 6 24 0s16-6 24 0 16 6 24 0" />
          <path d="M12 34c8-6 16 6 24 0s16-6 24 0 16 6 24 0" />
          <path d="M12 44c8-6 16 6 24 0s16-6 24 0 16 6 24 0" />
          <path d="M34 12l24-4-6 22-4-9-14-9Z" strokeLinejoin="round" opacity="0.9" />
        </svg>

        {/* 左の手描き星 */}
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-3 top-6 h-7 w-7 -rotate-6 text-[#cdd6e2] sm:left-4 sm:top-8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        >
          <path d="M12 3l2.4 5.6 6 .6-4.5 4 1.3 5.9L12 21l-5.2 3.1 1.3-5.9-4.5-4 6-.6L12 3z" />
        </svg>

        {/* 読みやすさ用の横グラデーション */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#223650] via-[#223650]/8 to-transparent"
        />

        {/* 下部右寄りの水色ちぎり紙／波 */}
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-1 left-[8%] h-12 w-[70%] bg-[#7d94b5]/45 sm:left-auto sm:right-[8%] sm:w-[52%]"
          style={{ clipPath: WAVE_TORN, filter: "url(#pth-torn)" }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-1 left-[22%] h-9 w-[52%] bg-[#dce9f5]/55 sm:left-auto sm:right-[12%] sm:w-[40%]"
          style={{ clipPath: WAVE_TORN, filter: "url(#pth-torn)" }}
        />

        {/* 大きく手でちぎった生成り紙 */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-3 left-[3%] right-[6%] -rotate-[0.6deg] bg-gradient-to-br from-[#fefdf6] to-[#f6efdf] sm:left-[5%] sm:right-[30%]"
          style={{
            clipPath: PAPER_TORN,
            filter: "url(#pth-torn) drop-shadow(0 8px 16px rgba(0,0,0,0.34))",
          }}
        />

        {/* 上辺のサーモンちぎり紙 */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-[8%] top-0 h-7 w-[46%] rotate-1 bg-[#e9987b]/70 sm:w-[30%]"
          style={{ clipPath: SALMON_TORN, filter: "url(#pth-torn)" }}
        />

        {/* 全体の薄い紙ノイズ */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06] mix-blend-overlay"
          style={{ backgroundImage: GRAIN }}
        />

        {/* 右下の方眼テープ */}
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-4 right-4 hidden h-9 w-24 -rotate-[7deg] border border-[#d8cfb8] bg-[#fbf7ea] shadow-[0_1px_3px_rgba(0,0,0,0.18)] sm:block"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 6px, rgba(0,0,0,0.06) 7px), repeating-linear-gradient(90deg, transparent, transparent 6px, rgba(0,0,0,0.06) 7px)",
          }}
        />

        {/* 左上のテープ風ラベル */}
        <MyPlanLabel className="absolute left-4 top-4 sm:left-[5%]" />

        {/* 本文（生成り紙の上） */}
        <div className="relative z-10 flex min-h-[248px] flex-col justify-center px-5 py-12 sm:min-h-[280px] sm:py-14 sm:pl-[8%] sm:pr-[38%]">
          <h1 className="text-[1.9rem] font-bold leading-[1.08] tracking-tight text-[#182233] sm:text-4xl lg:text-[3.2rem]">
            {title}
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-[#4a4740] sm:text-[15px]">{SUBTITLE}</p>
          <Chips city={city} departureTiming={departureTiming} title={title} chipClass={CHIP_CLASS_COLLAGE} />
        </div>
      </div>
    </div>
  );
}
