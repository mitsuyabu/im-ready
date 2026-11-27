import Image from "next/image";
import Link from "next/link";
import type {
  MyPlanAccPhase,
  MyPlanDestPhase,
  MyPlanMonthlyTimeline,
  MyPlanPointPhase,
  MyPlanSectionId,
  MyPlanTimedPhase,
  MyPlanTimelinePhase,
  MyPlanView,
} from "@/lib/myPlanView";
import { MY_PLAN_SECTIONS, packActivityLanes } from "@/lib/myPlanView";
import EditablePlanItems from "@/components/EditablePlanItems";
import EditableDestination from "@/components/EditableDestination";
import EditableAccommodation from "@/components/EditableAccommodation";
import EditableSchools from "@/components/EditableSchools";
import EditableTimeline from "@/components/EditableTimeline";
import EditablePlanDuration from "@/components/EditablePlanDuration";
import SavedSchoolMainCard from "@/components/SavedSchoolCard";
import PlanContextLabel from "@/components/PlanContextLabel";
import MyPlanOutline from "@/components/MyPlanOutline";
import { getMyPlanHeroImage } from "@/lib/planCover";

/**
 * 新しい My Plan（「ユーザーが自分で育てる実行プラン」）の presentation（Step 2-3）。
 *
 * データは lib/myPlanView.ts の buildMyPlanView が組み立て済み。Server Component のままで、
 * 編集が要るセクション（Goals / Destination / Work / Things / Milestones）だけ client island に委譲する。
 *   - saved（自分の Plan・主役）: 通常の white / navy、追加 / 削除できる
 *   - candidate（Karte 由来・採用可）: 破線・生成り ＋「＋ Planに追加」（Goals / Destination）
 *   - hint（Karte 由来・read-only）: 「意向」だけの情報。採用ボタンなし（Work / Milestones）
 *
 * School & English / Timeline は今回 read-only（Step 2-4 / 2-7）。blueprint unavailable の場合は
 * 編集 UI を出さず（editingEnabled=false）、警告 ＋ Karte 候補中心の表示にする。
 */

/* ------------------------------------------------------------------ */
/* icons                                                              */
/* ------------------------------------------------------------------ */

type IconProps = { className?: string };
function svgProps(className?: string) {
  return {
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
}
const PinIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <path d="M12 21s7-5.6 7-11a7 7 0 0 0-14 0c0 5.4 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);
const CalendarIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <rect x="4" y="5" width="16" height="16" rx="2" />
    <path d="M4 9h16M8 3v4M16 3v4" />
  </svg>
);
const WalletIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <path d="M4 7a2 2 0 0 1 2-2h12v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
    <path d="M16 12h3v-3h-3a1.5 1.5 0 0 0 0 3Z" />
  </svg>
);
const SchoolIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <path d="M4 21V9l8-5 8 5v12M4 21h16M9 21v-6h6v6" />
  </svg>
);
const ArrowRightIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
/* YOUR YEARLY PLAN の各フェーズに添える小さな line icon（装飾。主役にしない）。 */
const BookIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <path d="M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3Z" />
    <path d="M17 4h2v13M8.5 8h5.5M8.5 11h5.5" />
  </svg>
);
const BriefcaseIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <rect x="3.5" y="7.5" width="17" height="12" rx="2" />
    <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3.5 12.5h17" />
  </svg>
);
const UsersIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3.5 19c.6-3 2.9-4.5 5.5-4.5S13.9 16 14.5 19" />
    <path d="M16 8.2A2.6 2.6 0 0 1 16 14M17 14.6c2 .4 3.4 1.7 3.9 4" />
  </svg>
);
const DocIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <path d="M6 3h8l4 4v14H6Z" />
    <path d="M14 3v4h4M9 12h6M9 16h6" />
  </svg>
);
const CompassIcon = ({ className }: IconProps) => (
  <svg {...svgProps(className)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m15.5 8.5-2 5-5 2 2-5Z" />
  </svg>
);

/* ------------------------------------------------------------------ */
/* section accents（既存 palette 内。scoring ではなく装飾のみ）                          */
/* ------------------------------------------------------------------ */

// section title は「しっかり読める濃色」。各セクションの色相は保ちつつ、暗めに寄せる。
const SECTION_ACCENT: Record<MyPlanSectionId, string> = {
  goals: "#4b5b3e",
  destination: "#33506a",
  accommodation: "#5b5270",
  school: "#3f5a3b",
  work: "#7a4a30",
  things: "#9a4d38",
  milestones: "#45413a",
  timeline: "#1e2b3d",
};

/** ACCOMMODATION lane / bar の色（soft lavender・§27）。 */
const ACCOMMODATION_BAR_COLOR = "#a89abf";

/* ------------------------------------------------------------------ */
/* タイムラインの蛍光アクセント                                           */
/* ------------------------------------------------------------------ */

/**
 * レーンごとの蛍光色。**役割と色を 1:1 で固定**し、同じ役割に別の色を使わない。
 *   - DESTINATIONS（都市・移動）   … シアン
 *   - ACCOMMODATION（滞在先）      … ライム
 *   - ACTIVITIES（活動・予定）     … イエロー
 * 見出し横の小さな点・バーの始点・カード上端のアクセントは、すべてこの色で揃える。
 * 既存のパステル（PHASE_PALETTE / ACCOMMODATION_BAR_COLOR）が持つ
 * 「都市と活動の対応関係」は変えず、その上に少量だけ重ねる。
 */
const LANE_NEON = {
  destinations: "var(--neon-blue)",
  accommodation: "var(--neon-lime)",
  activities: "var(--neon-yellow)",
} as const;

/**
 * 期間バーの始点だけを蛍光色にする背景。
 * px 指定なので **バーの長さ・開始位置・終了位置には一切影響しない**
 * （1ヶ月の短いバーでも蛍光が占める幅は同じ 10px）。
 */
function barWithNeonStart(pastel: string, neon: string): string {
  return `linear-gradient(90deg, ${neon} 0px, ${neon} 7px, ${pastel} 11px, ${pastel} 100%)`;
}

/** レーン見出し（DESTINATIONS など）の左に置く小さな点。 */
function LaneLabel({ children, dot }: { children: React.ReactNode; dot: string }) {
  return (
    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--mk-sub)]">
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Monthly summary timeline（YOUR PLAN AT A GLANCE の直下・横図）           */
/* 役割は「1年の流れをひと目で」。詳細な activities / 理由は下の Timeline が担う。  */
/* ------------------------------------------------------------------ */

/**
 * フェーズの色（index で機械割り当て。意味による色推論はしない・§23）。
 * I'm ready! の warm/editorial トーンに合わせ、彩度を抑えた muted pastel を使う（§3 / §22）。
 * 色は node / top accent / period pill / icon だけに使い、カードはベタ塗りにしない（§13）。
 */
const PHASE_PALETTE: { node: string; pillBg: string; pillText: string }[] = [
  { node: "#8FAFC2", pillBg: "#E9F1F5", pillText: "#567789" }, // 1 dusty blue
  { node: "#87B7A6", pillBg: "#E6F1EE", pillText: "#4c7368" }, // 2 soft teal
  { node: "#9EB486", pillBg: "#EDF1E5", pillText: "#5f7050" }, // 3 sage
  { node: "#D4AE72", pillBg: "#F6EEDF", pillText: "#8a6a3c" }, // 4 sand / ochre
  { node: "#D98A7B", pillBg: "#F7E8E3", pillText: "#a25e51" }, // 5 dusty coral
  { node: "#A89ABF", pillBg: "#EEEBF3", pillText: "#6a5e83" }, // 6 muted lavender
];

/** decorative serif number の色（§19 第一候補）。 */
const SERIF_NUMBER_COLOR = "#e7e8e4";

/** status badge（小さく・強調しすぎない・§18）。saved=sage / AI=pale blue / considering=sand。 */
const PHASE_STATUS_BADGE: Record<
  MyPlanTimelinePhase["status"],
  { label: string; cls: string }
> = {
  saved: { label: "保存済み", cls: "bg-[var(--mk-block)] text-[var(--mk-label)]" },
  "ai-suggested": { label: "AI提案", cls: "bg-[var(--fn-chat)] text-[var(--mk-ink)]" },
  considering: { label: "検討中", cls: "bg-[var(--fn-plan)] text-[var(--mk-ink)]" },
};

/** フェーズ内容に応じた小さな line icon の種類（装飾。keyword→なければ index 順）。 */
type PhaseIconKind = "book" | "briefcase" | "users" | "doc" | "compass";
function phaseIconKind(title: string, index: number): PhaseIconKind {
  if (/語学|英語|学校|勉強|クラス|study|school|english/i.test(title)) return "book";
  if (/仕事|ジョブ|バイト|就労|働|ファーム|接客|ホスピタ|job|work|hospitality/i.test(title))
    return "briefcase";
  if (/ビザ|visa|書類|申請|手続|セカンド|節目/i.test(title)) return "doc";
  if (/進路|将来|キャリア|整理|まとめ|振り返|career/i.test(title)) return "compass";
  if (/仲間|交流|友|ネットワーク|コミュニティ|people|community/i.test(title)) return "users";
  return (["book", "briefcase", "users", "doc", "compass", "compass"] as const)[index] ?? "compass";
}

function PhaseIcon({ kind, className }: { kind: PhaseIconKind; className?: string }) {
  switch (kind) {
    case "book":
      return <BookIcon className={className} />;
    case "briefcase":
      return <BriefcaseIcon className={className} />;
    case "users":
      return <UsersIcon className={className} />;
    case "doc":
      return <DocIcon className={className} />;
    case "compass":
      return <CompassIcon className={className} />;
  }
}

function TimelineNode({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="block h-[18px] w-[18px] rounded-full ring-4 ring-[var(--mk-card)]"
      style={{ backgroundColor: color, boxShadow: "0 0 0 1px rgba(30,28,24,0.06)" }}
    />
  );
}

function PhaseCard({
  phase,
  palette,
  index,
  className = "",
}: {
  phase: MyPlanTimelinePhase;
  palette: (typeof PHASE_PALETTE)[number];
  index: number;
  className?: string;
}) {
  const iconKind = phaseIconKind(phase.title, index);
  const badge = PHASE_STATUS_BADGE[phase.status];
  return (
    <div
      className={`mk-card mk-card-sm relative w-full max-w-[248px] overflow-hidden p-4 ${className}`}
    >
      {/* phase 色は上辺 accent だけ（カードはベタ塗りにしない・§13/§14）。
          右端だけ蛍光イエローへ抜けるのは ACTIVITIES カードと同じルール。 */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{
          backgroundColor: palette.node,
          backgroundImage: `linear-gradient(90deg, ${palette.node} 0%, ${palette.node} 55%, ${LANE_NEON.activities} 100%)`,
        }}
      />
      {/* decorative serif number（背景・低コントラスト・§19） */}
      <span
        aria-hidden
        className="pointer-events-none absolute right-2 top-1 select-none font-serif text-[38px] font-semibold leading-none"
        style={{ color: SERIF_NUMBER_COLOR }}
      >
        {String(index + 1).padStart(2, "0")}
      </span>

      <div className="relative">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ backgroundColor: palette.pillBg, color: palette.pillText }}
          >
            {phase.rangeLabel}
          </span>
          <span aria-hidden className="inline-flex" style={{ color: palette.node }}>
            <PhaseIcon kind={iconKind} className="h-4 w-4" />
          </span>
        </div>

        <p className="mt-2 text-[17px] font-semibold leading-snug text-[var(--mk-ink)] sm:text-[18px]">
          {phase.title}
        </p>
        {phase.note && (
          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-[var(--mk-sub)]">{phase.note}</p>
        )}

        <span
          className={`mt-3 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${badge.cls}`}
        >
          {badge.label}
        </span>
      </div>
    </div>
  );
}

/**
 * month-scale モードの compact activity card（§2 / §18-§21）。
 * 横幅は grid 側で durationMonths に連動（§2-§5）。ここでは最小幅だけ持たせ、狭すぎる 1ヶ月
 * カードは視覚補助として少しだけ右に溢れてよい（bar の開始・終了位置は grid が保持・§6 / §7）。
 * content density は durationMonths で調整（1ヶ月: title + range + status のみ・§19 / §21）。
 * serif number・icon は出さない（流れの可読性を優先）。
 */
function TimelineBarCard({
  rangeLabel,
  title,
  note,
  status,
  color,
  durationMonths,
}: {
  rangeLabel: string;
  title: string;
  note: string | null;
  status: MyPlanTimelinePhase["status"];
  color: string;
  /** content density の判定に使う（1 は subtext 省略・§19）。 */
  durationMonths: number;
}) {
  const badge = PHASE_STATUS_BADGE[status];
  const showNote = note != null && durationMonths >= 2;
  return (
    <div className="relative w-full min-w-[100px] overflow-hidden rounded-[11px] border border-[var(--mk-border)] bg-white px-2.5 py-2">
      {/* カード上端の色帯。既存のパステルから、右端だけ蛍光イエローへ抜けるようにした
          （活動＝イエローの対応は LANE_NEON で固定）。帯の位置・太さは従来どおり。 */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{
          backgroundColor: color,
          backgroundImage: `linear-gradient(90deg, ${color} 0%, ${color} 55%, ${LANE_NEON.activities} 100%)`,
        }}
      />
      <div className="flex flex-wrap items-center gap-1">
        <span
          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ backgroundColor: color + "22", color: "var(--mk-body)" }}
        >
          <span
            aria-hidden
            className="h-1 w-1 shrink-0 rounded-full"
            style={{ backgroundColor: LANE_NEON.activities }}
          />
          {rangeLabel}
        </span>
        <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-medium ${badge.cls}`}>
          {badge.label}
        </span>
      </div>
      <p className="mt-1 text-[12px] font-semibold leading-snug text-[var(--mk-ink)] sm:text-[13px]">
        {title}
      </p>
      {showNote && <p className="mt-0.5 line-clamp-1 text-[10px] text-[var(--mk-sub)]">{note}</p>}
    </div>
  );
}

/**
 * YOUR PLAN TIMELINE — Plan 全体期間を軸にした「実時間スケール」の横タイムライン。
 * activity は実際の startMonth / durationMonths の位置へ配置する（Month 1 が左端・§1-§7）。
 * 全体期間が不明なときだけ従来の「順序だけ」の summary モードにフォールバック（§25）。
 * 時期が決まっている予定だけを載せる場所とし、時期未設定の保存済み activity は timeline に出さない。
 * （データは plan_blueprint に残り、各セクションで編集・時期設定できる）
 * I'm ready! の warm ivory / editorial トーンを維持し、派手なガントチャートにはしない（§8）。
 */
const YEARLY_CAPTION: Record<MyPlanMonthlyTimeline["source"], string> = {
  "month-scale":
    "あなたが設定した月ごとの予定を、Plan全体の期間に合わせて表示しています。編集は下の各セクションで行えます。",
  "saved-timeline":
    "保存済みのTimelineをAI提案として表示しています。詳しい内容は下のTimelineで確認できます。",
  summary:
    "My Planの保存内容から、進み方の目安をまとめています。月ごとの詳しい流れは、下のTimelineでAIに提案してもらえます。",
};

/* ---- 0ヶ月目（到着）から始まる実時間軸の位置計算（§33 / §34） ----
 * 軸は boundary 0..N（N+1 点）。0 = 到着、N = 期間終了。
 * duration bar は月区間として配置:
 *   left  = (max(0, start-1))/N       … start=0 も start=1 も左端（到着）
 *   width = duration/N                … start が 0 でも durationMonths をそのまま月数として使う
 * School/Work（start>=1）は現在 Grid（grid-column）で配置するため width 計算はここを通らない。 */
function boundaryPercent(boundary: number, totalMonths: number): number {
  return (Math.max(0, Math.min(boundary, totalMonths)) / totalMonths) * 100;
}
function barLeftPercent(startMonth: number, totalMonths: number): number {
  return boundaryPercent(Math.max(0, startMonth - 1), totalMonths);
}
/** duration bar の幅（%）。startMonth が 0（到着時）でも durationMonths を減算しない（§1 / §2）。 */
function barWidthPercent(durationMonths: number, totalMonths: number): number {
  return (Math.max(durationMonths, 0.5) / totalMonths) * 100;
}

/* ---- DESTINATIONS lane の packing ----
 * 時間が重ならない stay は同じ行へ横並びにする（ACTIVITIES の packActivityLanes と同じ考え方）。
 * ただし ACTIVITIES と違い、DESTINATIONS は bar より「都市名 + 期間ラベル」の方が横に長いので、
 * bar の重なりだけでなく「直前ラベルがその行に収まるか」も見て判定する。収まらない stay は次の行へ。
 * ラベル幅は canvas の最小幅(px)基準の機械的な概算（実測はしない・全角 1em / 半角 0.55em）。
 * 実際の canvas はこれ以上に広くなり得るため、見積もりは「やや広め＝安全側」に働く。
 * 加えて描画側でも同じ行の次ラベルまでを max-width にして truncate し、重なりを構造的に防ぐ。 */
const DEST_LANE_GAP_PX = 10;
const DEST_CITY_FONT_PX = 14;
const DEST_RANGE_FONT_PX = 12;

function estimateTextPx(text: string, fontPx: number): number {
  let w = 0;
  for (const ch of text) w += /[\u0020-\u007e]/.test(ch) ? fontPx * 0.55 : fontPx;
  return w;
}

function estimateDestLabelPx(city: string, rangeLabel: string): number {
  // 都市名 + ml-1.5(6px) + range ラベル + 右側に空ける余白(10px)。
  return (
    estimateTextPx(city, DEST_CITY_FONT_PX) +
    6 +
    estimateTextPx(rangeLabel, DEST_RANGE_FONT_PX) +
    10
  );
}

type DestLaneItem = {
  phase: MyPlanDestPhase;
  /** bar / dot の左位置（%）。 */
  leftPercent: number;
  /** bar 幅（%）。point（durationMonths なし）は null。 */
  widthPercent: number | null;
  /** ラベルの左位置（%）。右端で溢れないよう clamp 済み（packing もこの値で判定する）。 */
  labelLeftPercent: number;
  /** ラベルの最大幅（%）。同じ行の次ラベル手前まで。超える分は truncate する。 */
  labelMaxPercent: number;
};

function packDestinationLanes(
  phases: MyPlanDestPhase[],
  totalMonths: number,
  canvasPx: number,
): DestLaneItem[][] {
  const gap = (DEST_LANE_GAP_PX / canvasPx) * 100;
  const lanes: { items: DestLaneItem[]; barEnd: number; labelEnd: number }[] = [];

  for (const phase of phases) {
    const leftPercent = barLeftPercent(phase.startMonth, totalMonths);
    const widthPercent =
      phase.durationMonths != null ? barWidthPercent(phase.durationMonths, totalMonths) : null;
    const labelWidth = (estimateDestLabelPx(phase.city, phase.rangeLabel) / canvasPx) * 100;
    const labelLeftPercent = Math.max(0, Math.min(leftPercent, 100 - labelWidth));

    const item: DestLaneItem = {
      phase,
      leftPercent,
      widthPercent,
      labelLeftPercent,
      labelMaxPercent: 100 - labelLeftPercent,
    };
    const lane = lanes.find(
      (l) => leftPercent >= l.barEnd + gap && labelLeftPercent >= l.labelEnd,
    );
    if (lane) {
      // 直前ラベルの max-width を「この stay のラベル開始位置まで」に縮めて重なりを断つ。
      const prev = lane.items[lane.items.length - 1];
      prev.labelMaxPercent = Math.max(0, labelLeftPercent - prev.labelLeftPercent);
      lane.items.push(item);
      lane.barEnd = Math.max(lane.barEnd, leftPercent + (widthPercent ?? 0));
      lane.labelEnd = Math.max(lane.labelEnd, labelLeftPercent + labelWidth);
    } else {
      lanes.push({
        items: [item],
        barEnd: leftPercent + (widthPercent ?? 0),
        labelEnd: labelLeftPercent + labelWidth,
      });
    }
  }
  return lanes.map((l) => l.items);
}

/** month label の間引き（§28）。tick は全 boundary 分持つ。 */
function axisLabelMonths(totalMonths: number): number[] {
  const step =
    totalMonths <= 12 ? 1 : totalMonths <= 18 ? 2 : totalMonths <= 24 ? 3 : Math.ceil(totalMonths / 12);
  const out: number[] = [];
  for (let m = 1; m <= totalMonths; m += step) out.push(m);
  if (out[out.length - 1] !== totalMonths) out.push(totalMonths);
  return out;
}

function MonthScaleTimeline({
  totalMonths,
  timedPhases,
  pointPhases,
  destinationPhases,
  accommodationPhases,
  arrival,
}: {
  totalMonths: number;
  timedPhases: MyPlanTimedPhase[];
  pointPhases: MyPlanPointPhase[];
  destinationPhases: MyPlanDestPhase[];
  accommodationPhases: MyPlanAccPhase[];
  arrival: { city: string; hasBar: boolean } | null;
}) {
  const labels = axisLabelMonths(totalMonths);
  // 内部 canvas は最低幅を持ち、狭い画面では横スクロール（縮めない・§29 / §30）。desktop 12ヶ月は収まる。
  const minWidthPx = Math.max(760, totalMonths * 74);
  // ACTIVITIES（School / Work）を lane packing（§9-§16）。色は元の並び順で固定（lane で再割りしない）。
  const activityLanes = packActivityLanes(timedPhases);
  const colorByKey = new Map(timedPhases.map((p, i) => [p.key, i]));
  // DESTINATIONS も重ならない stay は同じ行へ。色は元の並び順で固定（lane で再割りしない）。
  const destLanes = packDestinationLanes(destinationPhases, totalMonths, minWidthPx);
  const destColorByKey = new Map(destinationPhases.map((d, i) => [d.key, i]));

  return (
    <div className="mt-6 overflow-x-auto pb-1 [scrollbar-width:thin]">
      <div className="relative pr-1" style={{ minWidth: `${minWidthPx}px` }}>
        {/* 到着アンカー（Month 0・§30 / §56）＋ DESTINATIONS lane（§26 / §27） */}
        {(arrival || destinationPhases.length > 0) && (
          <div className="mb-2">
            <LaneLabel dot={LANE_NEON.destinations}>DESTINATIONS</LaneLabel>
            {arrival && (
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="rounded-full bg-[var(--neon-blue)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--neon-ink)]">
                  到着
                </span>
                <span className="text-[13px] font-semibold text-[var(--mk-ink)]">{arrival.city}</span>
                <span className="text-[10px] text-[var(--mk-sub)]">最初の滞在都市</span>
              </div>
            )}
            {/* 各行: [都市名] [range] を1段目、bar を2段目（重ねない）。時間が重ならない stay は
                同じ行に横並び。ラベル同士が当たる場合だけ次の行へ落とす。 */}
            <div className="mt-1.5 space-y-2.5">
              {destLanes.map((lane, laneIdx) => (
                <div key={`dest-lane-${laneIdx}`}>
                  <div className="relative h-5">
                    {lane.map((it) => (
                      <p
                        key={`${it.phase.key}-label`}
                        className="absolute top-0 truncate text-[13px] font-medium leading-5 text-[var(--mk-body)] sm:text-[14px]"
                        style={{
                          left: `${it.labelLeftPercent}%`,
                          maxWidth: `${it.labelMaxPercent}%`,
                        }}
                      >
                        {it.phase.city}
                        <span className="ml-1.5 text-[11px] font-normal text-[var(--mk-sub)] sm:text-[12px]">
                          {it.phase.rangeLabel}
                        </span>
                      </p>
                    ))}
                  </div>
                  <div className="relative mt-1 h-2">
                    {lane.map((it) => {
                      const pal =
                        PHASE_PALETTE[
                          (destColorByKey.get(it.phase.key) ?? 0) % PHASE_PALETTE.length
                        ];
                      return it.widthPercent != null ? (
                        <span
                          key={`${it.phase.key}-bar`}
                          className="absolute top-0 h-2 rounded-full opacity-90"
                          style={{
                            left: `${it.leftPercent}%`,
                            width: `${it.widthPercent}%`,
                            backgroundColor: pal.node,
                            // 始点 7px ぶんだけシアン。px 指定なのでバーの長さ・位置は変わらない。
                            backgroundImage: barWithNeonStart(pal.node, LANE_NEON.destinations),
                          }}
                        />
                      ) : (
                        <span
                          key={`${it.phase.key}-dot`}
                          aria-hidden
                          className="absolute top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full ring-2 ring-[var(--mk-card)]"
                          style={{
                            left: `${it.leftPercent}%`,
                            backgroundColor: pal.node,
                            boxShadow: `0 0 0 3px color-mix(in srgb, ${LANE_NEON.destinations} 45%, transparent)`,
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ACCOMMODATION lane（滞在方法・§25 / §27）。soft lavender bar。 */}
        {accommodationPhases.length > 0 && (
          <div className="mb-2">
            <LaneLabel dot={LANE_NEON.accommodation}>ACCOMMODATION</LaneLabel>
            {/* 各 record: [滞在方法] [range] を1段目、bar を2段目（重ねない・§14）。 */}
            <div className="mt-1.5 space-y-2.5">
              {accommodationPhases.map((a) => {
                const left = barLeftPercent(a.startMonth, totalMonths);
                return (
                  <div key={a.key}>
                    <p
                      className="whitespace-nowrap text-[13px] font-medium text-[var(--mk-body)] sm:text-[14px]"
                      style={{ marginLeft: `min(${left}%, calc(100% - 180px))` }}
                    >
                      {a.label}
                      <span className="ml-1.5 text-[11px] font-normal text-[var(--mk-sub)] sm:text-[12px]">
                        {a.rangeLabel}
                      </span>
                    </p>
                    <div className="relative mt-1 h-2">
                      {a.durationMonths != null ? (
                        <span
                          className="absolute top-0 h-2 rounded-full"
                          style={{
                            left: `${left}%`,
                            width: `${barWidthPercent(a.durationMonths, totalMonths)}%`,
                            backgroundColor: ACCOMMODATION_BAR_COLOR,
                            // 始点 7px ぶんだけライム。px 指定なのでバーの長さ・位置は変わらない。
                            backgroundImage: barWithNeonStart(
                              ACCOMMODATION_BAR_COLOR,
                              LANE_NEON.accommodation,
                            ),
                          }}
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="absolute top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full ring-2 ring-[var(--mk-card)]"
                          style={{
                            left: `${left}%`,
                            backgroundColor: ACCOMMODATION_BAR_COLOR,
                            boxShadow: `0 0 0 3px color-mix(in srgb, ${LANE_NEON.accommodation} 45%, transparent)`,
                          }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* month axis: 細い warm-gray line ＋ 各 boundary に small tick（§4）。左端 = 到着 / 0 */}
        <div className="relative h-8">
          <span aria-hidden className="absolute inset-x-0 bottom-1 h-px bg-[var(--mk-border)]" />
          {/* 軸の始点（= 到着）だけ、短い蛍光ラインとドットで視線の起点を示す。
              実データ（到着 = Month 0）に基づく位置で、現在地や進捗の表示ではない。 */}
          <span
            aria-hidden
            className="absolute bottom-1 h-[2px] rounded-full"
            style={{
              left: 0,
              width: "9%",
              background:
                "linear-gradient(90deg, var(--neon-lime) 0%, rgba(216,251,87,0) 100%)",
            }}
          />
          <span
            aria-hidden
            className="absolute h-[7px] w-[7px] rounded-full bg-[var(--neon-lime)] ring-2 ring-[var(--mk-card)]"
            style={{ left: 0, bottom: "1px" }}
          />
          {Array.from({ length: totalMonths + 1 }, (_, b) => b).map((b) => (
            <span
              key={`t${b}`}
              aria-hidden
              className="absolute bottom-1 h-2 w-px bg-[var(--mk-border)]"
              style={{ left: `${boundaryPercent(b, totalMonths)}%` }}
            />
          ))}
          <span
            className="absolute bottom-3 text-[10px] font-semibold text-[var(--mk-ink)]"
            style={{ left: "0%" }}
          >
            到着
          </span>
          {labels.map((m) => (
            <span
              key={`l${m}`}
              className="absolute bottom-3 -translate-x-1/2 text-[10px] font-medium text-[var(--mk-label)]"
              style={{ left: `${boundaryPercent(m, totalMonths)}%` }}
            >
              {m}
            </span>
          ))}
        </div>

        {/* ACTIVITIES（§16）: 重ならない School / Work は同じ lane に横並び（§9-§13）。
            card 幅は grid（repeat(totalMonths, 1fr)）で durationMonths に連動し、月境界で
            自然につながる（§4 / §5 / §22-§25）。card 上辺の色帯が duration bar（§28）。 */}
        {(activityLanes.length > 0 || pointPhases.length > 0) && (
          <div className="mt-3">
            <LaneLabel dot={LANE_NEON.activities}>ACTIVITIES</LaneLabel>

            <div className="mt-1.5 space-y-2">
              {activityLanes.map((lane, laneIdx) => (
                <div
                  key={`lane-${laneIdx}`}
                  className="grid items-start"
                  style={{ gridTemplateColumns: `repeat(${totalMonths}, minmax(0, 1fr))` }}
                >
                  {lane.map((p) => {
                    const start = Math.max(1, Math.min(p.startMonth, totalMonths));
                    const span = Math.max(
                      1,
                      Math.min(p.durationMonths, totalMonths - start + 1),
                    );
                    const pal =
                      PHASE_PALETTE[(colorByKey.get(p.key) ?? 0) % PHASE_PALETTE.length];
                    return (
                      <div
                        key={p.key}
                        className="min-w-0 pr-[3px]"
                        style={{ gridColumn: `${start} / span ${span}` }}
                      >
                        <TimelineBarCard
                          rangeLabel={p.rangeLabel}
                          title={p.title}
                          note={p.note}
                          status={p.status}
                          color={pal.node}
                          durationMonths={p.durationMonths}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* start のみ判明（durationMonths 不明）: card 幅を作らず point 表示（§32・既存維持）。 */}
            {pointPhases.length > 0 && (
              <div className="mt-2 space-y-2.5">
                {pointPhases.map((p, i) => {
                  const pal =
                    PHASE_PALETTE[(timedPhases.length + i) % PHASE_PALETTE.length];
                  const left = barLeftPercent(p.startMonth, totalMonths);
                  return (
                    <div key={p.key} className="relative pt-1">
                      <div className="relative h-3">
                        <span
                          aria-hidden
                          className="absolute h-3 w-3 -translate-x-1/2 rounded-full ring-4 ring-[var(--mk-card)]"
                          style={{
                            left: `${left}%`,
                            backgroundColor: pal.node,
                            boxShadow: `0 0 0 1px rgba(30,28,24,0.06), 0 0 0 7px color-mix(in srgb, ${LANE_NEON.activities} 28%, transparent)`,
                          }}
                        />
                      </div>
                      <div
                        className="mt-1"
                        style={{
                          marginLeft: `min(${left}%, calc(100% - 184px))`,
                          maxWidth: 184,
                        }}
                      >
                        <p className="text-[12px] font-semibold text-[var(--mk-ink)]">{p.title}</p>
                        {p.note && <p className="text-[10px] text-[var(--mk-sub)]">{p.note}</p>}
                        <p className="mt-0.5 text-[10px] text-[var(--mk-sub)]">
                          {p.label}・期間未定
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** summary モード（全体期間 不明）の従来レイアウト（順序だけ・中央線＋上下交互）。 */
function SummaryPhases({ phases }: { phases: MyPlanTimelinePhase[] }) {
  const wide = phases.length <= 5;
  return (
    <div className="relative mt-6">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 hidden h-px -translate-y-1/2 bg-[var(--mk-border)] sm:block"
      />
      <ol
        className={`relative flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:thin] ${
          wide ? "sm:grid sm:gap-3 sm:overflow-visible sm:pb-0 sm:snap-none" : "sm:gap-5"
        }`}
        style={wide ? { gridTemplateColumns: `repeat(${phases.length}, minmax(0, 1fr))` } : undefined}
      >
        {phases.map((p, i) => {
          const palette = PHASE_PALETTE[i % PHASE_PALETTE.length];
          const isUp = i % 2 === 0;
          return (
            <li
              key={p.key}
              className={`relative flex w-[230px] shrink-0 snap-start ${
                wide ? "sm:w-auto sm:min-w-0 sm:shrink" : "sm:w-[240px]"
              }`}
            >
              <div className="h-full w-full sm:hidden">
                <PhaseCard phase={p} palette={palette} index={i} className="h-full" />
              </div>
              <div className="hidden w-full sm:grid sm:grid-rows-[1fr_auto_1fr]">
                <div className="flex items-end justify-center px-2 pb-4">
                  {isUp && <PhaseCard phase={p} palette={palette} index={i} />}
                </div>
                <div className="relative z-10 flex items-center justify-center">
                  <TimelineNode color={palette.node} />
                </div>
                <div className="flex items-start justify-center px-2 pt-4">
                  {!isUp && <PhaseCard phase={p} palette={palette} index={i} />}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function MonthlyTimelineSection({ timeline }: { timeline: MyPlanMonthlyTimeline }) {
  const {
    source,
    totalMonths,
    durationLabel,
    timedPhases,
    pointPhases,
    summaryPhases,
    destinationPhases,
    accommodationPhases,
    arrival,
  } = timeline;
  const scaleMonths = source === "month-scale" && totalMonths != null ? totalMonths : null;
  const isScale = scaleMonths != null;

  return (
    <section
      id="myplan-yearly"
      className="mk-card mt-6 scroll-mt-6 p-5 sm:p-6 lg:p-7"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <div>
          {/* 見出しの上の短いライン（ライム → イエロー）。My Plan の各セクションカードと
              同じ「見出しの上に 3px のアクセント」の形で、ここだけグラデーションにしている。 */}
          <span
            aria-hidden
            className="block h-[3px] w-7 rounded-full"
            style={{
              background: "linear-gradient(90deg, var(--neon-lime) 0%, var(--neon-yellow) 100%)",
            }}
          />
          <p className="mk-eyebrow mt-2">YOUR PLAN TIMELINE</p>
          <h2 className="mk-section-title mt-1.5">
            {isScale ? "留学プランの大まかな流れ" : "Plan全体の流れ"}
          </h2>
        </div>
        {/* Plan 全体の期間（実データ）。淡いライムの小さな面＋ライムの点で軽く強調する。 */}
        {durationLabel && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--neon-lime-soft)] px-2.5 py-1 text-[12px] font-semibold text-[var(--neon-ink)]">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--neon-lime)]" />
            {durationLabel}
          </span>
        )}
      </div>

      {scaleMonths != null ? (
        <MonthScaleTimeline
          totalMonths={scaleMonths}
          timedPhases={timedPhases}
          pointPhases={pointPhases}
          destinationPhases={destinationPhases}
          accommodationPhases={accommodationPhases}
          arrival={arrival}
        />
      ) : (
        summaryPhases.length > 0 && <SummaryPhases phases={summaryPhases} />
      )}

      {isScale && (
        <p className="mk-sub-text mt-3 sm:hidden">横にスクロールすると、全期間を確認できます。</p>
      )}
      <p className="mk-sub-text mt-2 sm:mt-4">{YEARLY_CAPTION[source]}</p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* card chrome                                                        */
/* ------------------------------------------------------------------ */

function MyPlanCard({
  id,
  num,
  enName,
  subtitle,
  accent,
  span,
  children,
}: {
  id: MyPlanSectionId;
  num: string;
  enName: string;
  subtitle: string;
  accent: string;
  span: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={`myplan-${id}`}
      className={`mk-card relative scroll-mt-6 overflow-hidden p-5 sm:p-6 lg:p-7 ${span}`}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute right-3 top-1 select-none font-serif text-[46px] font-semibold leading-none text-[#eff0ec] sm:text-[62px]"
      >
        {num}
      </span>
      {/* セクションごとの個性は「見出しの上の短いライン」だけに残し、見出し自体は黒にする
          （以前はセクション色で見出しを塗っていた）。 */}
      <span
        aria-hidden
        className="relative block h-[3px] w-6 rounded-full"
        style={{ backgroundColor: accent }}
      />
      <h2 className="mk-section-title relative mt-2.5">{enName}</h2>
      <p className="mk-text relative mt-1 text-[var(--mk-sub)]">{subtitle}</p>
      <div className="relative">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* School & English（My Plan に保存済みの学校だけ表示。候補校の比較は School Comparison の役割）  */
/* ------------------------------------------------------------------ */

function SchoolBody({ view, planId }: { view: MyPlanView; planId: string }) {
  // My Plan に保存した学校だけを表示する。候補校の比較は School Comparison の役割。
  const { savedSchools, englishRef } = view.school;
  const comparisonHref = `/plans/${planId}/documents/school-comparison`;
  const hasSaved = savedSchools.length > 0;

  // メインカードに出す「軸にしている」1 校（selected → preferred → 先頭）。
  const primarySaved = hasSaved
    ? savedSchools.find((s) => s.status === "selected") ??
      savedSchools.find((s) => s.status === "preferred") ??
      savedSchools[0]
    : null;

  return (
    <>
      {hasSaved ? (
        <>
          <p className="mt-4 text-[15px] font-medium text-[var(--mk-label)]">このプランで考えている学校</p>
          <p className="mt-0.5 text-[13px] leading-6 text-[var(--mk-sub)]">
            School Comparison で比べて保存した学校です。
          </p>
          {/* 保存済みが 1 校でもカードは拡大しない。School Comparison の 3 列グリッドと
              同じ responsive（mobile 1 列 / tablet 2 列 / desktop 3 列相当）で 1 枚分に絞り、左寄せ。 */}
          {primarySaved && (
            <div className="mt-2.5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <SavedSchoolMainCard school={primarySaved} englishNote={englishRef[0]?.label ?? null} />
            </div>
          )}
          <div className="mt-3">
            <p className="text-[11px] font-medium tracking-wide text-[var(--mk-label)]">保存した学校の状態</p>
            <EditableSchools
              planId={planId}
              initialSchools={savedSchools}
              editingEnabled={view.blueprintAvailable}
              planDurationMonths={view.planDurationMonths}
            />
          </div>
        </>
      ) : (
        <div className="mt-4">
          <p className="text-[15px] leading-7 text-[var(--mk-body)]">まだ学校は保存していません。</p>
          <p className="mt-1 text-[13px] leading-6 text-[var(--mk-sub)]">
            School Comparison で比べた学校を、ここに残せます。
          </p>
        </div>
      )}

      {englishRef.length > 0 && (
        <div className="mt-4 rounded-[14px] bg-[var(--mk-block)] px-4 py-3">
          <p className="text-[11px] font-medium tracking-wide text-[var(--mk-label)]">英語について</p>
          <ul className="mt-1.5 space-y-1">
            {englishRef.map((e) => (
              <li key={e.key} className="text-[13px] leading-6 text-[var(--mk-label)]">
                {e.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link
        href={comparisonHref}
        className="btn-quiet mt-5 px-4 py-2"
      >
        {hasSaved ? "School Comparison を見る" : "学校を比較する"}
        <ArrowRightIcon className="h-4 w-4" />
      </Link>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* section dispatch                                                   */
/* ------------------------------------------------------------------ */

function renderSectionBody(id: MyPlanSectionId, view: MyPlanView, planId: string): React.ReactNode {
  const editingEnabled = view.blueprintAvailable;

  switch (id) {
    case "goals":
      return (
        <EditablePlanItems
          planId={planId}
          section="goals"
          initialItems={view.goals.saved}
          candidates={view.goals.candidates}
          addLabel="目標を追加"
          placeholder="例：英語で仕事ができるようになりたい"
          emptyLine="まだ目標がありません。"
          emptyHelper="自分で追加するか、ChatやWorksheetで整理した内容を候補から採用できます。"
          layout="rows"
          editingEnabled={editingEnabled}
        />
      );
    case "destination":
      return (
        <EditableDestination
          planId={planId}
          initialPrimary={view.destination.savedPrimary}
          initialInterested={view.destination.savedInterested}
          initialStays={view.destination.savedStays}
          candidates={view.destination.candidates}
          hints={view.destination.hints}
          editingEnabled={editingEnabled}
          planDurationMonths={view.planDurationMonths}
        />
      );
    case "accommodation":
      return (
        <EditableAccommodation
          planId={planId}
          initialAccommodations={view.accommodation.saved}
          candidate={view.accommodation.candidate}
          editingEnabled={editingEnabled}
          planDurationMonths={view.planDurationMonths}
        />
      );
    case "school":
      return <SchoolBody view={view} planId={planId} />;
    case "work":
      return (
        <EditablePlanItems
          planId={planId}
          section="workInterests"
          initialItems={view.work.saved}
          hints={view.work.hints}
          addLabel="興味のある仕事を追加"
          placeholder="例：カフェ、ホテル、ツアー関連"
          emptyLine="興味のある仕事がまだありません。"
          emptyHelper="現地でやってみたい仕事を、ここに残していきます。"
          layout="chips"
          editingEnabled={editingEnabled}
          itemTiming={{ planDurationMonths: view.planDurationMonths }}
        />
      );
    case "things":
      return (
        <EditablePlanItems
          planId={planId}
          section="thingsToDo"
          initialItems={view.things.saved}
          addLabel="やってみたいことを追加"
          placeholder="例：サーフィンをする"
          emptyLine="まだやってみたいことがありません。"
          emptyHelper="現地で経験したいことを、ここに残していきます。"
          layout="chips"
          editingEnabled={editingEnabled}
        />
      );
    case "milestones":
      return (
        <EditablePlanItems
          planId={planId}
          section="milestones"
          initialItems={view.milestones.saved}
          hints={view.milestones.hints}
          addLabel="目標や節目を追加"
          placeholder="例：セカンドビザ取得を目指す"
          emptyLine="まだ節目や目標がありません。"
          emptyHelper="ビザや資格、学校修了など、達成したいことをここに残していきます。"
          layout="rows"
          editingEnabled={editingEnabled}
          extraFooter={
            view.milestones.showVisaDisclaimer ? (
              <p className="mt-4 rounded-xl bg-[var(--mk-block)] px-4 py-3 text-[11px] leading-relaxed text-[var(--mk-sub)]">
                ビザや制度の条件は最新の公式情報をご確認ください。
              </p>
            ) : undefined
          }
        />
      );
    case "timeline":
      return (
        <EditableTimeline
          planId={planId}
          initialTimeline={view.timeline}
          canGenerate={view.timelineCanGenerate}
        />
      );
  }
}

/* ------------------------------------------------------------------ */
/* page                                                               */
/* ------------------------------------------------------------------ */

const WIDE_SECTIONS = new Set<MyPlanSectionId>(["school", "timeline"]);

export default function MyPlan({
  planId,
  planTitle,
  view,
  lastUpdated,
}: {
  planId: string;
  planTitle: string;
  view: MyPlanView;
  lastUpdated: string | null;
}) {
  // 何も無く、かつ編集もできない（blueprint unavailable）ときだけ onboarding。
  // 編集可能なら空でも各セクションの「＋ 追加」から自分で作り始められる（§74）。
  if (!view.hasAnyContent && !view.blueprintAvailable) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-24">
        <Link
          href={`/plans/${planId}`}
          className="inline-flex items-center gap-1 text-sm text-[var(--mk-sub)] transition-colors hover:text-[var(--mk-ink)]"
        >
          <span aria-hidden>←</span> Plan Homeに戻る
        </Link>
        <h1 className="mk-page-title mt-8">My Plan</h1>
        <p className="mk-text-lead mt-6">まだMy Planは空です。</p>
        <p className="mk-text mt-3 text-[var(--mk-sub)]">
          ChatやWorksheetで考えを整理すると、
          <br className="hidden sm:block" />
          ここにPlanの候補が見えてきます。
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link
            href={`/plans/${planId}/chat`}
            className="btn-primary px-5 py-2.5"
          >
            AIに相談する
          </Link>
          <Link
            href={`/plans/${planId}/worksheet`}
            className="btn-quiet px-5 py-2.5"
          >
            Worksheetで整理する
          </Link>
        </div>
      </div>
    );
  }

  const { hero } = view;
  // 行き先の都市に対応する背景画像（既存 resolvePlanCoverKey を再利用）。無ければ null → 従来背景。
  const heroImage = getMyPlanHeroImage(hero.destination?.text ?? null);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 pb-24 sm:px-6 sm:py-14 lg:px-8">
      <Link
        href={`/plans/${planId}`}
        className="inline-flex items-center gap-1 text-sm text-[var(--mk-sub)] transition-colors hover:text-[var(--mk-ink)]"
      >
        <span aria-hidden>←</span> Plan Homeに戻る
      </Link>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div>
          {/* いま見ている Plan 名。desktop は sidebar が同じ役割を持つため PlanContextLabel 側で lg:hidden。 */}
          <PlanContextLabel planTitle={planTitle} />
          <h1 className="mk-page-title">My Plan</h1>
          <p className="mk-text mt-1 text-[var(--mk-sub)]">留学・ワーホリの実行プラン</p>
        </div>
        {lastUpdated && <p className="mk-sub-text shrink-0 sm:mt-3">最終更新 {lastUpdated}</p>}
      </div>

      {!view.blueprintAvailable && (
        <p className="mk-sub-text mt-5 rounded-[14px] border border-[var(--mk-border)] bg-[var(--mk-block)] px-4 py-3 text-[var(--mk-label)]">
          保存したMy Planの情報を読み込めませんでした。編集は一時的にできませんが、下の「Karteからの候補」は表示できます。
        </p>
      )}

      {/* ヒーローサマリー。行き先の都市画像があればカード全面の背景に敷き（左は明るい余白・右に景観）、
          無ければ従来の淡いグリーン地 ＋ CSS グラデーションへ fallback（§6）。 */}
      {/* 地は白いカード。行き先の都市画像があるときだけ背景に敷き、文字側（左）を白でしっかり抜く。
          画像が無いときは全面のグリーンではなく、右上に淡いイエロー（My Plan の機能色）を
          部分的に差すだけにする。 */}
      <section
        className="mk-card relative mt-6 overflow-hidden"
        style={
          heroImage
            ? undefined
            : {
                backgroundImage:
                  "radial-gradient(120% 80% at 94% 4%, rgba(255,237,169,0.55), transparent 56%)",
              }
        }
      >
        {heroImage && (
          <>
            <Image
              src={heroImage}
              alt=""
              fill
              priority
              sizes="(min-width: 1024px) 1024px, 100vw"
              className="pointer-events-none select-none object-cover object-center"
            />
            {/* 左（テキスト側）を強め・右（景観側）を薄めの生成りグラデーション。mobile は少し強める（§3/§7）。 */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/96 via-white/88 to-white/60 sm:from-white/95 sm:via-white/78 sm:to-white/45"
            />
          </>
        )}
        <div className="relative z-10 px-5 py-6 sm:px-9 sm:py-8">
          <p className="mk-eyebrow">YOUR PLAN AT A GLANCE</p>
          <p className="mt-2.5 text-[22px] font-bold leading-snug text-[var(--mk-ink)] sm:text-[28px]">
            {hero.headline}
          </p>
          {hero.school && (
            <p className="mk-text mt-2 inline-flex items-center gap-1.5 text-[var(--mk-label)]">
              <SchoolIcon className="h-4 w-4" />
              {hero.school}
            </p>
          )}
        </div>
        <div className="relative z-10 grid grid-cols-2 gap-2 px-4 pb-4 sm:grid-cols-4 sm:px-6 sm:pb-6">
          <HeroItem
            icon={<PinIcon className="h-4 w-4" />}
            label="行き先"
            value={hero.destination?.text ?? null}
            note={hero.destination?.fromKarte ? "Karteから" : null}
          />
          <HeroItem icon={<CalendarIcon className="h-4 w-4" />} label="出発目安" value={hero.departure} />
          <EditablePlanDuration
            planId={planId}
            blueprintMonths={
              view.planDurationSource === "blueprint" ? view.planDurationMonths : null
            }
            karteMonths={view.planDurationKarteMonths}
            editingEnabled={view.blueprintAvailable}
          />
          <HeroItem icon={<WalletIcon className="h-4 w-4" />} label="予算" value={hero.budget} />
        </div>
      </section>

      {/* YOUR PLAN AT A GLANCE の直下: 月ベースの要約タイムライン（図）。
          材料が無ければ view 側で null になり、セクションごと出さない。
          文章ベースの詳細 Timeline は下のセクション一覧にそのまま残す。 */}
      {view.monthlyTimeline && <MonthlyTimelineSection timeline={view.monthlyTimeline} />}

      {/* メイン: 左アウトライン / 右カードグリッド */}
      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-[212px_minmax(0,1fr)] lg:gap-8">
        <aside className="lg:sticky lg:top-8 lg:self-start">
          {/* 見出しの一覧と選択状態だけを持つ client island。遷移先（#myplan-<id>）は従来のまま。 */}
          <MyPlanOutline
            sections={MY_PLAN_SECTIONS.map((s) => ({ id: s.id, enName: s.enName }))}
          />
        </aside>

        <div className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2">
          {MY_PLAN_SECTIONS.map((s, index) => (
            <MyPlanCard
              key={s.id}
              id={s.id}
              num={String(index + 1).padStart(2, "0")}
              enName={s.enName}
              subtitle={s.subtitle}
              accent={SECTION_ACCENT[s.id]}
              span={WIDE_SECTIONS.has(s.id) ? "sm:col-span-2" : ""}
            >
              {renderSectionBody(s.id, view, planId)}
            </MyPlanCard>
          ))}
        </div>
      </div>
    </div>
  );
}

function HeroItem({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  note?: string | null;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[14px] border border-[var(--mk-border)] bg-white px-4 py-3">
      <span
        aria-hidden
        className="fn-icon h-9 w-9 rounded-[12px]"
        style={{ backgroundColor: "var(--fn-plan)" }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="mk-item-label-sm">
          {label}
          {note && <span className="ml-1 font-normal text-[var(--mk-sub)]">／{note}</span>}
        </p>
        <p
          className={`mt-0.5 truncate text-[15px] font-semibold ${
            value ? "text-[var(--mk-ink)]" : "text-[var(--mk-sub)]"
          }`}
        >
          {value ?? "これから整理"}
        </p>
      </div>
    </div>
  );
}
