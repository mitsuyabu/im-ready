"use client";

import { useCallback, useId, useState, useSyncExternalStore } from "react";
import {
  COMPARISON_FIELDS,
  COMPARISON_UNDECIDED_TEXT,
  MAX_COMPARISON_OPTIONS,
  addOption,
  buildOptionFromConditionSlots,
  canCopyFromConditionSlots,
  comparisonOptionDisplayName,
  createEmptyOption,
  optionValue,
  removeOption,
  renameOption,
  setOptionValue,
  type ComparisonBoardState,
  type ComparisonFieldId,
} from "@/lib/comparisonBoard";
import {
  getComparisonBoardServerSnapshot,
  getComparisonBoardSnapshot,
  subscribeComparisonBoard,
  updateComparisonBoard,
} from "@/lib/comparisonBoardStore";
import type { ConditionSlot } from "@/lib/karteConditionSlots";

/**
 * Comparison Board（比較ボード）。My Karte トップの中で**その場で開閉**するセクション。
 *
 * 役割分担:
 *   - データモデル・コピー・sanitize → lib/comparisonBoard.ts（pure）
 *   - この端末への保存               → lib/comparisonBoardStorage.ts
 *   - このファイル                   → 開閉・編集モード・表の描画だけ
 * 将来 DB 保存や「AI が比較案を提案 → 承認で追加」を足すときに、この分離のまま差し替えられる。
 *
 * 開閉の仕様:
 *   - 初期状態は閉じている。別ページへ遷移しない（同一ページ内で開閉する）。
 *   - 中身は open のときだけ描画する（閉じているとき画面スペースを消費しない）。
 *   - 開閉しても入力内容は失わない（state は親であるこのコンポーネントが持ち続け、
 *     閉じるときに unmount されるのは DOM だけ）。
 *   - ボタンは aria-expanded / aria-controls を持ち、キーボードでも操作できる素の <button>。
 *   - 開閉でページ上部へジャンプさせない（Link ではなく button、href も hash も使わない）。
 *   - 過剰なアニメーションは使わない（transition は色だけ）。
 *
 * 表の仕様:
 *   - 縦軸が比較項目、横軸が候補案（料金プラン比較表の形）。
 *   - 横スクロールするのは**表の領域だけ**。ページ全体に横 overflow を出さない。
 *   - 左端の比較項目列は position: sticky で固定する。
 *   - 順位・点数・適合率・おすすめ度のような評価は一切出さない（モデルにも持たせていない）。
 *   - 架空の国・都市・金額・学校名を実データとして出さない（例示は placeholder だけ）。
 *
 * 文字は My Karte の共通クラスに揃える（見出し = .mk-section-title、案の名前 = .mk-card-title、
 * 比較項目名 = .mk-item-label-sm、注意書き = .mk-sub-text）。表のセルの値だけは列幅が決まって
 * いるため専用サイズ（15px）を持たせているが、色は共通の本文色（--mk-body）を使う。
 * **開閉・追加・名称変更・編集・削除・保存の挙動は一切変更していない**（見た目だけ）。
 */

/**
 * 列ヘッダーの下に引くアクセント線。案ごとに少しだけ変えて列を見分けやすくするが、
 * **面は白のまま**（パステルでヘッダーを塗り分けない）。値の意味づけもしない。
 */
const OPTION_RULES = ["var(--neon-lime)", "var(--mk-pale-blue)", "var(--mk-pale-sage)"];

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
    >
      {open ? <path d="M6 14l6-6 6 6" /> : <path d="M6 10l6 6 6-6" />}
    </svg>
  );
}

/** セクションの目印。2 枚の面を並べて「見比べる」ことを示す（評価の記号は使わない）。 */
function CompareIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
    >
      <rect x="3.5" y="5" width="7" height="14" rx="1.5" />
      <rect x="13.5" y="5" width="7" height="10" rx="1.5" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13" />
    </svg>
  );
}

/*
 * ボタンの見た目は 3 段だけに揃える（蛍光をどこに使うかを 1 か所で決める）。
 *   PRIMARY   … 蛍光ライムの面 + near-black。1 画面に「いま押す操作」だけ
 *   SECONDARY … 白 + 細い枠。hover でだけ蛍光がうっすら差す
 *   ACTIVE    … 編集モードなど「いまオンになっている」状態
 * 蛍光を載せた面の文字は必ず near-black（--neon-ink）にしてコントラストを確保する。
 */
const BTN_BASE =
  "inline-flex items-center gap-1.5 rounded-full text-[13px] font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-worksheet-accent";
const BTN_PRIMARY =
  `${BTN_BASE} border-[1.5px] border-[var(--neon-lime)] bg-[var(--neon-lime)] text-[var(--neon-ink)] hover:bg-white`;
const BTN_SECONDARY =
  `${BTN_BASE} border border-[#d8d2c6] bg-white text-[#3f3a34] hover:border-[#b7d94a] hover:bg-[var(--neon-lime-soft)]`;

/** 入力欄の focus。蛍光のリングで「いま編集している場所」を分かりやすくする。 */
const FIELD_FOCUS =
  "focus:border-[#b7d94a] focus:outline-none focus:ring-2 focus:ring-[var(--neon-lime)]";

export type ComparisonBoardProps = {
  planId: string;
  /** Karte の希望・条件。「今の条件からコピー」でのみ使う（自動で候補案にはしない）。 */
  conditionSlots: ConditionSlot[];
};

export default function ComparisonBoard({ planId, conditionSlots }: ComparisonBoardProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const panelId = useId();

  /*
   * ボードの内容は lib/comparisonBoardStore.ts（外部ストア）が持ち、ここでは購読するだけ。
   * - 復元を effect でやらないので cascading render が起きない
   * - SSR / hydration 中は空のボードを返すので hydration mismatch が無い
   * - 状態がコンポーネントの外に生きるため、**閉じて開き直しても入力内容が残る**
   */
  const board = useSyncExternalStore(
    useCallback((onChange: () => void) => subscribeComparisonBoard(planId, onChange), [planId]),
    useCallback(() => getComparisonBoardSnapshot(planId), [planId]),
    getComparisonBoardServerSnapshot,
  );
  const setBoard = useCallback(
    (updater: (prev: ComparisonBoardState) => ComparisonBoardState) =>
      updateComparisonBoard(planId, updater),
    [planId],
  );

  const options = board.options;
  const count = options.length;
  const canAdd = count < MAX_COMPARISON_OPTIONS;
  const canCopy = canCopyFromConditionSlots(conditionSlots);

  const handleAddEmpty = useCallback(() => {
    setBoard((prev) => addOption(prev, createEmptyOption()));
    setEditing(true);
  }, [setBoard]);

  const handleAddFromKarte = useCallback(() => {
    // コピーはユーザーがこのボタンを押したときだけ。読み込み時には呼ばれない。
    setBoard((prev) =>
      addOption(prev, buildOptionFromConditionSlots(conditionSlots, `案${prev.options.length + 1}`)),
    );
    setEditing(true);
  }, [conditionSlots, setBoard]);

  /** 閉じた状態に出す一行。件数だけを言い、評価や進捗率は出さない。 */
  const summary =
    count === 0
      ? "気になる留学プランを並べて比較する"
      : count === 1
        ? "1つの案を整理中"
        : `${count}つの候補を検討中`;

  return (
    // 他のセクションが「見出し + 中身」なのに対し、ここは開閉するひとまとまりの道具なので
    // 外枠のあるモジュールとして見せる。開くと地色がつき、少し特別な面になる。
    <section className="mk-card overflow-hidden">
      {/* ---- ヘッダー（閉じていても出る） ---- */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex min-w-0 items-center gap-3.5">
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-[var(--neon-lime)] text-[var(--neon-ink)]"
          >
            <CompareIcon />
          </span>
          <div className="min-w-0">
            <p className="mk-eyebrow">Compare</p>
            <h2 className="mk-section-title mt-1">留学プランの比較</h2>
            <p className="mk-sub-text mt-1">{summary}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className={`shrink-0 px-4 py-2 ${open ? BTN_SECONDARY : BTN_PRIMARY}`}
        >
          {open ? "比較ボードを閉じる" : "比較ボードを開く"}
          <ChevronIcon open={open} />
        </button>
      </div>

      {/* ---- 本体（open のときだけ描画。閉じている間は高さを持たない） ---- */}
      {open && (
        <div id={panelId} className="border-t border-[var(--mk-border)] px-5 pb-6 pt-5 sm:px-7">
          {count === 0 ? (
            <div className="rounded-[var(--mk-radius-sm)] bg-[var(--mk-block)] px-5 py-6">
              <p className="mk-text">
                国や都市、滞在期間など、迷っている留学プランを並べて比較できます。
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={handleAddEmpty} className={`${BTN_PRIMARY} px-4 py-2`}>
                  ＋ 比較する案を追加
                </button>
                {canCopy && (
                  <button
                    type="button"
                    onClick={handleAddFromKarte}
                    className={`${BTN_SECONDARY} px-4 py-2`}
                  >
                    今の希望・条件からコピーして作る
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* 操作列。編集モードの切り替えと案の追加。 */}
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <p className="mk-sub-text">
                  {count === 1
                    ? "もう1案追加すると、同じ項目で並べて比べられます。"
                    : "同じ項目を横に並べて比べられます。"}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing((v) => !v)}
                    aria-pressed={editing}
                    className={`px-3.5 py-1.5 ${editing ? BTN_PRIMARY : BTN_SECONDARY}`}
                  >
                    {editing ? "編集を終える" : "編集する"}
                  </button>
                  {canAdd && (
                    <button
                      type="button"
                      onClick={handleAddEmpty}
                      className={`px-3.5 py-1.5 ${BTN_SECONDARY}`}
                    >
                      ＋ 案を追加
                    </button>
                  )}
                </div>
              </div>

              {/* 比較表。横スクロールはこの領域だけに閉じる。 */}
              <div
                className={`mt-4 overflow-hidden rounded-[var(--mk-radius-sm)] border bg-[var(--mk-card)] transition-colors duration-150 ${
                  editing ? "border-[#bfe24a]" : "border-[var(--mk-border)]"
                }`}
              >
                <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-left">
                  <caption className="sr-only">
                    比較する留学プランの候補案を、項目ごとに並べた表
                  </caption>
                  <thead>
                    <tr>
                      {/* 左上の角。比較項目列の見出し。 */}
                      <th
                        scope="col"
                        className="sticky left-0 z-10 w-[104px] min-w-[104px] border-b-2 border-r border-b-[var(--mk-ink)] border-r-[var(--mk-border)] bg-[var(--mk-block)] px-4 py-3.5 align-bottom text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--mk-sub)] sm:w-[132px] sm:min-w-[132px]"
                      >
                        比較項目
                      </th>
                      {options.map((option, index) => (
                        <th
                          key={option.id}
                          scope="col"
                          className="min-w-[150px] border-b-2 border-[var(--mk-ink)] bg-[var(--mk-card)] px-4 py-3.5 align-bottom sm:min-w-[190px]"
                        >
                          <div className="flex items-start justify-between gap-2">
                            {editing ? (
                              <>
                                <label className="min-w-0 flex-1">
                                  <span className="sr-only">
                                    {comparisonOptionDisplayName(option, index)}の名前
                                  </span>
                                  <input
                                    type="text"
                                    value={option.name}
                                    onChange={(e) =>
                                      setBoard((prev) =>
                                        renameOption(prev, option.id, e.target.value),
                                      )
                                    }
                                    placeholder={`案${index + 1}`}
                                    className={`w-full rounded-md border border-[#e4e0d7] bg-white px-2.5 py-1.5 text-[15px] font-semibold text-[var(--mk-ink)] placeholder:font-normal placeholder:text-[#a8aca6] ${FIELD_FOCUS}`}
                                  />
                                </label>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setBoard((prev) => removeOption(prev, option.id))
                                  }
                                  aria-label={`${comparisonOptionDisplayName(option, index)}を削除`}
                                  className="shrink-0 rounded-md p-1 text-[#8a857b] transition-colors duration-150 hover:bg-white/70 hover:text-[#6b4a44] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-worksheet-accent"
                                >
                                  <TrashIcon />
                                </button>
                              </>
                            ) : (
                              <span className="min-w-0">
                                <span
                                  aria-hidden
                                  className="mb-1.5 block h-[3px] w-7 rounded-full"
                                  style={{
                                    backgroundColor: OPTION_RULES[index % OPTION_RULES.length],
                                  }}
                                />
                                <span className="mk-card-title block break-words">
                                  {comparisonOptionDisplayName(option, index)}
                                </span>
                              </span>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {COMPARISON_FIELDS.map((field, rowIndex) => (
                      <tr
                        key={field.id}
                        // 行ごとに白とごく薄いグレーを交互に（罫線を増やさずに行を追いやすくする）
                        className={rowIndex > 0 ? "border-t border-[#f0f1ee]" : undefined}
                      >
                        <th
                          scope="row"
                          className="mk-item-label-sm sticky left-0 z-10 w-[104px] min-w-[104px] border-r border-[var(--mk-border)] bg-[var(--mk-block)] px-4 py-3.5 align-top sm:w-[132px] sm:min-w-[132px]"
                        >
                          {field.label}
                        </th>
                        {options.map((option) => {
                          const value = optionValue(option, field.id);
                          return (
                            <td
                              key={option.id}
                              className="min-w-[150px] px-4 py-3.5 align-top sm:min-w-[190px]"
                            >
                              {editing ? (
                                <label className="block">
                                  <span className="sr-only">
                                    {field.label}（{option.name.trim() || "この案"}）
                                  </span>
                                  {field.kind === "long" ? (
                                    <textarea
                                      value={option.values[field.id] ?? ""}
                                      onChange={(e) =>
                                        setBoard((prev) =>
                                          setOptionValue(
                                            prev,
                                            option.id,
                                            field.id as ComparisonFieldId,
                                            e.target.value,
                                          ),
                                        )
                                      }
                                      rows={3}
                                      placeholder={field.placeholder}
                                      className={`w-full resize-y rounded-md border border-[#e4e0d7] bg-white px-2.5 py-1.5 text-[15px] leading-[1.7] text-[var(--mk-body)] placeholder:text-[#a8aca6] ${FIELD_FOCUS}`}
                                    />
                                  ) : (
                                    <input
                                      type="text"
                                      value={option.values[field.id] ?? ""}
                                      onChange={(e) =>
                                        setBoard((prev) =>
                                          setOptionValue(
                                            prev,
                                            option.id,
                                            field.id as ComparisonFieldId,
                                            e.target.value,
                                          ),
                                        )
                                      }
                                      placeholder={field.placeholder}
                                      className={`w-full rounded-md border border-[#e4e0d7] bg-white px-2.5 py-1.5 text-[15px] text-[var(--mk-body)] placeholder:text-[#a8aca6] ${FIELD_FOCUS}`}
                                    />
                                  )}
                                </label>
                              ) : value ? (
                                // 長文も崩れないように折り返す（横幅は列で揃える）
                                <p className="whitespace-pre-wrap break-words text-[15px] leading-[1.7] text-[var(--mk-body)]">
                                  {value}
                                </p>
                              ) : (
                                <p className="text-[15px] text-[var(--mk-sub)]">
                                  {COMPARISON_UNDECIDED_TEXT}
                                </p>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>

              {/* 追加の導線（表の下）。上限に達したら理由を書いて消す。 */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {canAdd ? (
                  <>
                    <button type="button" onClick={handleAddEmpty} className={`${BTN_PRIMARY} px-4 py-2`}>
                      ＋ 比較する案を追加
                    </button>
                    {canCopy && (
                      <button
                        type="button"
                        onClick={handleAddFromKarte}
                        className={`${BTN_SECONDARY} px-4 py-2`}
                      >
                        今の希望・条件からコピーして作る
                      </button>
                    )}
                  </>
                ) : (
                  <p className="mk-sub-text">
                    今はいちどに{MAX_COMPARISON_OPTIONS}案まで比較できます。
                  </p>
                )}
              </div>

              <p aria-live="polite" className="sr-only">
                候補案 {count} 件
              </p>
            </>
          )}

          {/* 保存先についての注意書き。期待を持たせない。 */}
          <p className="mk-sub-text mt-4">
            比較ボードの内容は、いまはお使いのブラウザにのみ保存されます（他の端末には同期されません）。
          </p>
        </div>
      )}
    </section>
  );
}
