"use client";

import { useEffect, useState } from "react";
import type { DisplayProposal } from "@/lib/proposal/applyResult";
import type { ProposalSituation } from "@/lib/proposal/selectProposals";
import { stripMarkdownBold } from "@/lib/markdown";
import { ProposalMap } from "./ProposalMap";
import { SchoolCard, type PlaceDetails, type PlaceAuthorAttribution } from "./SchoolCard";

/** Place Details (New) のphotos[0]から、表示に必要なnameとauthorAttributionsだけを安全に取り出す */
function extractFirstPhoto(data: unknown): PlaceDetails["photo"] {
  if (typeof data !== "object" || data === null || !("photos" in data)) return undefined;
  const photos = (data as { photos?: unknown }).photos;
  if (!Array.isArray(photos) || photos.length === 0) return undefined;

  const first = photos[0];
  if (typeof first !== "object" || first === null) return undefined;
  const name = (first as { name?: unknown }).name;
  if (typeof name !== "string") return undefined;

  const rawAttributions = (first as { authorAttributions?: unknown }).authorAttributions;
  const authorAttributions: PlaceAuthorAttribution[] | undefined = Array.isArray(rawAttributions)
    ? rawAttributions
        .filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null)
        .map((a) => ({
          displayName: typeof a.displayName === "string" ? a.displayName : undefined,
          uri: typeof a.uri === "string" ? a.uri : undefined,
        }))
    : undefined;

  return { name, authorAttributions };
}

interface ProposalMessageProps {
  situation: ProposalSituation;
  introNote: string | null;
  proposals: DisplayProposal[];
  /**
   * "default"（既定・/widget向け）: 既存の固定mx-4・max-w-2xl。見た目は変更していない。
   * "document"（Plan Chat向け）: 親（Chat.tsx）側で既にmax-w-3xlの本文カラムに収まっているため、
   * 独自のmx-4・max-w-2xlは持たず、会話本文と同じ横幅・区切り方（border-bottom+padding）に揃える。
   */
  variant?: "default" | "document";
}

/**
 * 提案メッセージのリッチ表示。テキスト(formatProposalMessage)の代わりに、
 * 全校地図＋学校カードで描画する。提案ロジック(第1〜3層)の結果(proposals)をそのまま使うだけで、
 * ここでは選定・理由付けは一切行わない。
 *
 * 評価・レビュー件数・地図リンクは表示のためだけに実行時取得し、保存はしない
 * （このコンポーネントの state 内メモリに保持するのみで、karte 等へは書き込まない）。
 * 同じ提案メッセージ内で placeId が重複しないことが前提だが、念のため一意化してから取得する。
 */
export function ProposalMessage({ introNote, proposals, variant = "default" }: ProposalMessageProps) {
  const [detailsByPlaceId, setDetailsByPlaceId] = useState<Record<string, PlaceDetails | null>>(
    {},
  );

  useEffect(() => {
    const placeIds = [...new Set(proposals.map((p) => p.placeId).filter((id): id is string => !!id))];
    if (placeIds.length === 0) return;

    let cancelled = false;

    (async () => {
      const entries = await Promise.all(
        placeIds.map(async (placeId): Promise<[string, PlaceDetails | null]> => {
          try {
            const res = await fetch(`/api/places/details?placeId=${encodeURIComponent(placeId)}`);
            if (!res.ok) return [placeId, null];
            const data = await res.json();
            return [
              placeId,
              {
                rating: typeof data.rating === "number" ? data.rating : undefined,
                userRatingCount:
                  typeof data.userRatingCount === "number" ? data.userRatingCount : undefined,
                googleMapsUri: typeof data.googleMapsUri === "string" ? data.googleMapsUri : undefined,
                photo: extractFirstPhoto(data),
              },
            ];
          } catch {
            return [placeId, null];
          }
        }),
      );
      if (!cancelled) {
        setDetailsByPlaceId(Object.fromEntries(entries));
      }
    })();

    return () => {
      cancelled = true;
    };
    // このメッセージが作られた時点の proposals は不変（1回だけ取得すればよい）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const matches = proposals.filter((p) => p.category === "match");
  const references = proposals.filter((p) => p.category === "reference");

  return (
    <div
      className={
        variant === "document"
          ? "space-y-4 border-b border-worksheet-border/60 py-5 sm:py-6"
          : "mx-4 mb-3 max-w-2xl space-y-4"
      }
    >
      {introNote && (
        <p
          className={
            variant === "document"
              ? "text-sm leading-relaxed text-worksheet-primary"
              : "text-sm leading-relaxed text-zinc-700 dark:text-zinc-300"
          }
        >
          {stripMarkdownBold(introNote)}
        </p>
      )}

      <ProposalMap proposals={proposals} />

      {matches.length > 0 && (
        <div className="space-y-2">
          <h3
            className={
              variant === "document"
                ? "text-sm font-semibold text-worksheet-primary"
                : "text-sm font-semibold text-zinc-900 dark:text-zinc-100"
            }
          >
            ご希望に合う候補
          </h3>
          <div className={variant === "document" ? "divide-y divide-worksheet-border/60" : "space-y-3"}>
            {matches.map((p, i) => (
              <div key={p.schoolSlug} className={variant === "document" ? "py-6 sm:py-8" : undefined}>
                <SchoolCard
                  number={i + 1}
                  variant="match"
                  proposal={p}
                  placeDetails={p.placeId ? detailsByPlaceId[p.placeId] : null}
                  layout={variant === "document" ? "document" : "default"}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {references.length > 0 && (
        <div className="space-y-2">
          <h3
            className={
              variant === "document"
                ? "text-sm font-semibold text-worksheet-primary"
                : "text-sm font-semibold text-zinc-900 dark:text-zinc-100"
            }
          >
            条件を一部外れる参考候補
          </h3>
          <div className={variant === "document" ? "divide-y divide-worksheet-border/60" : "space-y-3"}>
            {references.map((p, i) => (
              <div key={p.schoolSlug} className={variant === "document" ? "py-6 sm:py-8" : undefined}>
                <SchoolCard
                  number={matches.length + i + 1}
                  variant="reference"
                  proposal={p}
                  placeDetails={p.placeId ? detailsByPlaceId[p.placeId] : null}
                  layout={variant === "document" ? "document" : "default"}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
