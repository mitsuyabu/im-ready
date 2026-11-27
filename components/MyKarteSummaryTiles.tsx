"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  getComparisonBoardCountServerSnapshot,
  getComparisonBoardCountSnapshot,
  subscribeComparisonBoard,
} from "@/lib/comparisonBoardStore";

/**
 * ページ上部の小さなサマリータイル（3 つ）。
 *
 * **出すのは実データを数えた件数だけ**。達成率・スコア・適合率・進捗バー・グラフのような
 * 「根拠のない指標」は出さない（ダッシュボードらしく見せるために数字を作らない）。
 *   - 整理した条件 … 値が入っている条件スロットの数 / 全スロット数
 *   - 学校候補     … 候補にあがっている学校の数
 *   - 比較中の案   … 比較ボードの候補案の数
 *
 * 見た目の方針:
 *   地はすべて白。1 枚目（整理した条件）だけ右上から蛍光ライムのグラデーションを
 *   白へ溶け込ませて主役にし、残り 2 枚は白のまま。3 枚を別々の色で塗り分けない。
 *   角丸・border・影は他のカードと同じ共通クラス（.mk-card / .mk-card-sm）に揃える。
 *   数値だけは役割が違うので専用サイズ（28 / 32px）を持たせ、ラベルと単位の色は
 *   共通の補助文字色（--mk-sub）を使う。
 *
 * 比較ボードの件数だけはこの端末の localStorage が持っているため、
 * サーバー描画時は数えられない。その間は 0 ではなく「—」を出し、
 * 復元後に 0 → 3 と数字が入れ替わって見えないようにする。
 */
export default function MyKarteSummaryTiles({
  planId,
  conditionsFilled,
  conditionsTotal,
  schoolCount,
}: {
  planId: string;
  conditionsFilled: number;
  conditionsTotal: number;
  schoolCount: number;
}) {
  const comparisonCount = useSyncExternalStore(
    useCallback((onChange: () => void) => subscribeComparisonBoard(planId, onChange), [planId]),
    useCallback(() => getComparisonBoardCountSnapshot(planId), [planId]),
    getComparisonBoardCountServerSnapshot,
  );

  const tiles: { label: string; value: string; unit?: string; lead?: boolean }[] = [
    {
      label: "整理した条件",
      value: String(conditionsFilled),
      unit: `/ ${conditionsTotal}`,
      // 主役の 1 枚だけ蛍光のグラデーションを持たせる
      lead: true,
    },
    { label: "学校候補", value: String(schoolCount), unit: "校" },
    {
      label: "比較中の案",
      value: comparisonCount === null ? "—" : String(comparisonCount),
      unit: "件",
    },
  ];

  return (
    <dl className="grid grid-cols-3 gap-2.5 sm:gap-3">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="mk-card mk-card-sm relative overflow-hidden px-3.5 py-3.5 sm:px-4 sm:py-4"
        >
          {/*
            右上から差す蛍光のグラデーション。白へ溶け込ませるので面のベタ塗りにはならない。
            文字の下に敷くだけなので読みやすさには影響しない。
          */}
          {tile.lead && (
            <span
              aria-hidden
              className="pointer-events-none absolute -right-7 -top-9 h-20 w-20 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, var(--neon-lime) 0%, rgba(216,251,87,0.3) 45%, rgba(255,255,255,0) 72%)",
              }}
            />
          )}

          <dt className="relative text-[11px] font-medium leading-tight text-[var(--mk-sub)] sm:text-[12px]">
            {tile.label}
          </dt>
          <dd className="relative mt-1.5 flex items-baseline gap-1">
            <span className="text-[28px] font-bold leading-none tracking-tight text-[var(--mk-ink)] sm:text-[32px]">
              {tile.value}
            </span>
            {tile.unit && (
              <span className="text-[12px] font-medium text-[var(--mk-sub)]">{tile.unit}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
