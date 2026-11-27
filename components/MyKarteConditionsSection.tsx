import MyKarteSectionHeader from "@/components/MyKarteSectionHeader";
import {
  CONDITION_SLOT_UNDECIDED_TEXT,
  CONDITION_SLOT_UNKNOWN_TEXT,
  countFilledConditionSlots,
  type ConditionSlot,
  type ConditionSlotId,
} from "@/lib/karteConditionSlots";

/**
 * My Karte ダッシュボードの Study Plan セクション（presentation のみ）。
 *
 * 白いカード 1 枚の中に、いまの希望・条件を整然と並べる。
 *
 * 見た目の方針（**My Note と同じ共通クラスを使う**）:
 *   - 項目名は .mk-item-label（14〜15px / 600 / #515650）で My Note の項目名と完全に同じ。
 *     以前はここだけ 10px の muted だったため、セクションごとに文字の階層が違って見えていた。
 *   - 値は .mk-value（17〜18px / 500）で **10 項目すべて同じ大きさ**。
 *     項目ごとに文字サイズを変えない。よく見る 4 項目（国 / 都市 / 期間 / 予算）は
 *     文字を大きくするのではなく、薄いグレーのブロックに載せて強弱を付ける。
 *   - 「未定」「未整理」は .mk-value-empty（値と同じ大きさ・太さと色だけ落とす）。
 *     薄すぎるグレーは使わない。
 *   - **項目ごとにパステルで塗り分けない**。色面は薄いグレー（--mk-block）だけで、
 *     蛍光は「整理できている件数」の pill（見出し側）にだけ使う。
 *   - 罫線の格子は引かない（表のセルに見せない）。区切りは余白とブロックで作る。
 *
 * 値は lib/karteConditionSlots.ts が Karte の stated 値（と Worksheet の回答）から
 * そのまま割り当てたもので、この画面では AI 生成・推測・補完を一切しない。
 * 未回答は「未整理」、本人が未定と答えたものは「未定」として区別する。
 * 複数候補は 1 つに絞らない。ここに出るのは **Karte 上の希望・条件**で、
 * My Plan（確定した実行計画）ではない。全 10 項目とデータ取得処理は従来どおり。
 *
 * hooks を持たない純粋表示コンポーネント。
 */

/** 上段に大きく出す 4 項目。残りは自動的に下段へ回る（項目自体は増減させない）。 */
const PRIMARY_SLOT_IDS: ConditionSlotId[] = ["country", "city", "duration", "budget"];

/** 項目ごとの小さなアイコン。線画 1 本ぶんの軽さに揃える（塗りを持たせない）。 */
function SlotIcon({ id, className }: { id: ConditionSlotId; className: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
  switch (id) {
    case "country": // globe
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M4 12h16M12 4c2 2.5 2 13 0 16M12 4c-2 2.5-2 13 0 16" />
        </svg>
      );
    case "city": // pin
      return (
        <svg {...common}>
          <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z" />
          <circle cx="12" cy="11" r="2" />
        </svg>
      );
    case "departure": // plane
      return (
        <svg {...common}>
          <path d="M3 13l18-7-7 18-2.5-6.5L3 13Z" />
        </svg>
      );
    case "duration": // clock
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4.5l3 2" />
        </svg>
      );
    case "budget": // wallet
      return (
        <svg {...common}>
          <rect x="3.5" y="6.5" width="17" height="12" rx="2.5" />
          <path d="M16 12.5h2" />
        </svg>
      );
    case "visa": // document
      return (
        <svg {...common}>
          <rect x="5" y="3.5" width="14" height="17" rx="2" />
          <path d="M9.5 8.5h5M9.5 12h5M9.5 15.5h3" />
        </svg>
      );
    case "study": // book
      return (
        <svg {...common}>
          <path d="M4 5.5h7v14H4zM13 5.5h7v14h-7z" />
        </svg>
      );
    case "studyDuration": // calendar
      return (
        <svg {...common}>
          <rect x="4" y="5.5" width="16" height="14" rx="2" />
          <path d="M4 10h16M9 3.5v3M15 3.5v3" />
        </svg>
      );
    case "work": // briefcase
      return (
        <svg {...common}>
          <rect x="3.5" y="8" width="17" height="11" rx="2" />
          <path d="M9 8V6h6v2M3.5 12.5h17" />
        </svg>
      );
    case "accommodation": // home
      return (
        <svg {...common}>
          <path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8Z" />
          <path d="M10 20v-5h4v5" />
        </svg>
      );
  }
}

/**
 * 値のテキスト。4 項目/6 項目で大きさは変えず（.mk-value で共通）、
 * 未入力のときだけ .mk-value-empty にして「未整理」「未定」を出し分ける。
 */
function SlotValue({ slot }: { slot: ConditionSlot }) {
  if (slot.values.length === 0) {
    return (
      <p className="mk-value-empty">
        {slot.state === "undecided" ? CONDITION_SLOT_UNDECIDED_TEXT : CONDITION_SLOT_UNKNOWN_TEXT}
      </p>
    );
  }
  return (
    <>
      {/* 複数候補は 1 つに絞らず全部出す */}
      <p className="mk-value break-words">{slot.values.join("、")}</p>
      {slot.state === "conflict" && (
        <p className="mk-sub-text mt-1">AI相談とワークシートで内容が違います</p>
      )}
    </>
  );
}

export default function MyKarteConditionsSection({
  planId,
  slots,
}: {
  planId: string;
  slots: ConditionSlot[];
}) {
  const filled = countFilledConditionSlots(slots);
  const primary = PRIMARY_SLOT_IDS.map((id) => slots.find((s) => s.id === id)).filter(
    (s): s is ConditionSlot => Boolean(s),
  );
  const secondary = slots.filter((s) => !PRIMARY_SLOT_IDS.includes(s.id));

  return (
    <section>
      <MyKarteSectionHeader
        eyebrow="Conditions"
        title="Study Plan"
        description="いま考えている希望と条件"
        href={`/plans/${planId}/documents/study-plan`}
        meta={filled > 0 ? `${filled} / ${slots.length}` : undefined}
      />

      {filled === 0 ? (
        <div className="mk-card-empty mk-pad-lg">
          <p className="mk-sub-text">
            AI相談やワークシートで条件を整理すると、ここに希望する国や時期、予算などが表示されます。
          </p>
        </div>
      ) : (
        <div className="mk-card mk-pad-lg">
          {/* 上段: よく見る 4 項目。文字は他と同じ大きさで、薄いグレーのブロックで強弱を付ける。 */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {primary.map((slot) => (
              <div key={slot.id} className="min-w-0 rounded-[14px] bg-[var(--mk-block)] px-4 py-3.5">
                <p className="mk-item-label flex items-center gap-1.5">
                  <SlotIcon id={slot.id} className="h-4 w-4 shrink-0" />
                  <span className="truncate">{slot.label}</span>
                </p>
                <div className="mt-1.5">
                  <SlotValue slot={slot} />
                </div>
              </div>
            ))}
          </div>

          {/* 下段: 残りの項目。罫線は引かず、余白だけで区切る（文字の大きさは上段と同じ）。 */}
          <div className="mt-7 grid grid-cols-2 gap-x-6 gap-y-6 sm:gap-x-10 lg:grid-cols-3">
            {secondary.map((slot) => (
              <div key={slot.id} className="min-w-0">
                <p className="mk-item-label flex items-center gap-1.5">
                  <SlotIcon id={slot.id} className="h-4 w-4 shrink-0" />
                  <span className="truncate">{slot.label}</span>
                </p>
                <div className="mt-1.5">
                  <SlotValue slot={slot} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
