"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * My Plan 左の「PLAN OUTLINE」（見た目と選択状態だけを持つ client component）。
 *
 * やっていること:
 *   - 既存のアンカーリンク（#myplan-<id>）と遷移先はそのまま。新しい route も API も持たない。
 *   - いま画面に出ているセクションを 1 つだけハイライトする。判定は
 *     「ビューポート上端から ACTIVE_OFFSET 下の線を、最後に越えたセクション」という
 *     単純な規則で、scroll / resize のたびに rAF 1 回だけ計算する。
 *     IntersectionObserver は使っていない（複数セクションが同時に見えるときの
 *     ちらつきと、rootMargin の調整が難しいため）。
 *   - クリック直後は、ネイティブのアンカー移動が終わるまで少しのあいだ選択を固定して
 *     ちらつきを防ぐ（CLICK_LOCK_MS）。
 *   - 最下部までスクロールしたときは最後のセクションを選ぶ（短いセクションが
 *     上端の線に届かず選ばれないのを防ぐ）。
 *
 * データ・保存・スクロール位置そのものには一切触れない（既存の scroll-mt-6 もそのまま使う）。
 */

type OutlineSection = { id: string; enName: string };

/** 「いまのセクション」を決める、ビューポート上端からの距離。 */
const ACTIVE_OFFSET = 140;
/** クリック後に選択を固定する時間（ネイティブのアンカー移動ぶん）。 */
const CLICK_LOCK_MS = 600;
/** 最下部とみなす余白。 */
const BOTTOM_EPSILON = 4;

export default function MyPlanOutline({ sections }: { sections: OutlineSection[] }) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? "");
  const lockedUntilRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  const recompute = useCallback(() => {
    frameRef.current = null;
    if (Date.now() < lockedUntilRef.current) return;

    const doc = document.documentElement;
    // 最下部まで来たら最後のセクション（短いセクションが選ばれないのを防ぐ）
    const atBottom = window.scrollY + window.innerHeight >= doc.scrollHeight - BOTTOM_EPSILON;
    if (atBottom) {
      const last = sections[sections.length - 1];
      if (last) setActiveId(last.id);
      return;
    }

    let current = sections[0]?.id ?? "";
    for (const s of sections) {
      const el = document.getElementById(`myplan-${s.id}`);
      if (!el) continue;
      if (el.getBoundingClientRect().top - ACTIVE_OFFSET <= 0) current = s.id;
    }
    setActiveId((prev) => (prev === current ? prev : current));
  }, [sections]);

  const schedule = useCallback(() => {
    if (frameRef.current != null) return;
    frameRef.current = window.requestAnimationFrame(recompute);
  }, [recompute]);

  useEffect(() => {
    // 初期表示（URL に #myplan-... が付いている場合も、位置から計算すれば同じ結果になる）
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current);
    };
  }, [schedule]);

  return (
    <div className="mk-card p-4">
      <p className="mk-eyebrow px-1">PLAN OUTLINE</p>
      <ol className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 lg:block lg:space-y-0.5">
        {sections.map((s, i) => {
          const active = s.id === activeId;
          return (
            <li key={s.id}>
              <a
                href={`#myplan-${s.id}`}
                aria-current={active ? "true" : undefined}
                onClick={() => {
                  // クリックした項目をすぐ選択にして、移動が終わるまで固定する
                  lockedUntilRef.current = Date.now() + CLICK_LOCK_MS;
                  setActiveId(s.id);
                }}
                className={`relative flex items-baseline gap-2 rounded-[10px] px-2 py-2 text-sm transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--neon-lime)] lg:gap-2.5 lg:py-1.5 ${
                  active
                    ? "bg-[var(--neon-lime-soft)] font-semibold text-[var(--mk-ink)]"
                    : "text-[var(--mk-body)] hover:bg-[var(--mk-block)]"
                }`}
              >
                {/* 選択中だけ、左端に細い蛍光ライムのライン（面は淡いライムのまま） */}
                {active && (
                  <span
                    aria-hidden
                    className="absolute bottom-1 left-0 top-1 w-[3px] rounded-full bg-[var(--neon-lime)]"
                  />
                )}
                <span
                  className={`font-serif text-xs ${active ? "text-[var(--mk-label)]" : "text-[var(--mk-sub)]"}`}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                {s.enName}
              </a>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
