"use client";

import { useState } from "react";
import type { DisplayProposal } from "@/lib/proposal/applyResult";
import { PlaceRatingBadge } from "@/components/PlaceRatingBadge";
import { GoogleAttribution } from "@/components/GoogleAttribution";
import { stripMarkdownBold } from "@/lib/markdown";

/**
 * Place Photos (New) の著作者帰属。Googleの利用規約上、表示する場合は省略できない。
 * displayName/uriのいずれも欠けることがあるため両方optionalとして扱う。
 */
export type PlaceAuthorAttribution = {
  displayName?: string;
  uri?: string;
};

/** /api/places/details のphotos[0]のうち、表示に使う範囲のみ（nameのみ保持し、実画像は保存しない） */
export type PlacePhoto = {
  name: string;
  authorAttributions?: PlaceAuthorAttribution[];
};

/** /api/places/details から取得した、表示に使う範囲のみ（保存はしない） */
export type PlaceDetails = {
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  /** 学校カードの1枚目の写真のみ（carousel等は今回実装しない） */
  photo?: PlacePhoto;
};

interface SchoolCardProps {
  /** 地図のピン番号と対応させる表示用の番号 */
  number: number;
  variant: "match" | "reference";
  proposal: DisplayProposal;
  /**
   * undefined = まだ取得中（placeIdはあるが /api/places/details 未着）
   * null = 取得済みだが評価データなし
   * オブジェクト = 取得成功
   */
  placeDetails: PlaceDetails | null | undefined;
  /**
   * "default"（既定・/widget向け）: 既存のborder+背景色カード。見た目・挙動とも変更していない。
   * "document"（Plan Chat向け）: Mindtripのホテル提案参考、横型・写真付きの相談記録スタイル。
   * proposal自体（DisplayProposal）にはimage/courseフィールドが存在しないため、新規生成・推測は
   * せずneutral placeholderで代替する。CTAは既存のgoogleMapsUriリンクをボタンとして再利用するのみで、
   * 新しい遷移先・保存処理は作らない。
   */
  layout?: "default" | "document";
}

function SchoolPlaceholderIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 21V9l8-5 8 5v12M4 21h16M9 21v-6h6v6" />
    </svg>
  );
}

/**
 * 学校1件ぶんのカード。合う候補(match)/参考候補(reference)は同じコンポーネントに
 * variant を渡す形で出し分ける（見た目の差は色ではなく枠の太さ・余白・文字サイズで表現）。
 */
export function SchoolCard({ number, variant, proposal, placeDetails, layout = "default" }: SchoolCardProps) {
  const isMatch = variant === "match";
  const hasPlaceId = Boolean(proposal.placeId);
  const hasRating =
    placeDetails != null && placeDetails.rating != null && placeDetails.userRatingCount != null;
  // photo API error / image load error のいずれでもplaceholderへ切り替える（保存はしない、表示stateのみ）
  const [imageErrored, setImageErrored] = useState(false);

  if (layout === "document") {
    const photo = placeDetails?.photo;
    const attribution = photo?.authorAttributions?.[0];

    const schoolPhoto = (sizeClassName: string) => (
      <div className="shrink-0">
        <div
          className={`flex items-center justify-center overflow-hidden rounded-2xl bg-worksheet-sage/30 text-worksheet-secondary ${sizeClassName}`}
        >
          {photo && !imageErrored ? (
            // Google Photo Media (New) は自ドメインの /api/places/photo 経由でのみ取得し、保存はしない。
            // next/imageの最適化パイプラインは今回意図的に使わず、素の<img>でシンプルに保つ
            // （remotePatterns設定も不要。MVP方針として意図的にnext/imageを使わないためlintを1行だけ無効化）。
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/places/photo?name=${encodeURIComponent(photo.name)}&maxWidthPx=400`}
              alt=""
              onError={() => setImageErrored(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <SchoolPlaceholderIcon className="h-8 w-8" />
          )}
        </div>
        {photo && !imageErrored && attribution && (attribution.displayName || attribution.uri) && (
          <p className="mt-1 truncate text-[10px] leading-tight text-worksheet-secondary">
            Photo:{" "}
            {attribution.uri ? (
              <a
                href={attribution.uri}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-worksheet-primary"
              >
                {attribution.displayName ?? attribution.uri}
              </a>
            ) : (
              attribution.displayName
            )}
          </p>
        )}
      </div>
    );

    return (
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={
                isMatch
                  ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-worksheet-sage text-xs font-semibold text-worksheet-primary"
                  : "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-worksheet-border text-xs text-worksheet-secondary"
              }
            >
              {number}
            </span>
            <span
              className={
                isMatch
                  ? "rounded-full bg-worksheet-sage px-2 py-0.5 text-[11px] font-medium text-worksheet-primary"
                  : "rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-worksheet-secondary dark:bg-zinc-800"
              }
            >
              {isMatch ? "ご希望に合う" : "参考候補"}
            </span>
          </div>

          <h4 className="mt-2 text-base font-semibold text-worksheet-primary sm:text-lg">
            {proposal.name}
          </h4>
          <p className="text-sm text-worksheet-secondary">{proposal.city}</p>

          {/* mobileではここに画像を挟む（学校名・都市の直後、説明文の前） */}
          <div className="mt-3 sm:hidden">{schoolPhoto("h-40 w-full")}</div>

          <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-worksheet-primary sm:line-clamp-3">
            {stripMarkdownBold(proposal.reason)}
          </p>

          {proposal.caveat && (
            <p className="mt-2 text-xs leading-relaxed text-worksheet-secondary">
              {isMatch ? "※ " : "希望と外れる点: "}
              {stripMarkdownBold(proposal.caveat)}
            </p>
          )}

          {hasPlaceId && placeDetails !== undefined && hasRating && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <PlaceRatingBadge
                rating={placeDetails.rating}
                userRatingCount={placeDetails.userRatingCount}
                googleMapsUri={placeDetails.googleMapsUri}
                className="text-[11px] text-worksheet-secondary"
              />
              <GoogleAttribution variant="standalone" />
            </div>
          )}

          {placeDetails?.googleMapsUri && (
            <a
              href={placeDetails.googleMapsUri}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center justify-center rounded-full bg-worksheet-accent px-4 py-2 text-xs font-medium text-worksheet-accent-contrast transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] sm:text-sm"
            >
              詳しく見る
            </a>
          )}
        </div>

        {/* desktopでは右カラムの画像として表示 */}
        <div className="hidden sm:block">{schoolPhoto("h-32 w-40")}</div>
      </div>
    );
  }

  return (
    <div
      className={
        isMatch
          ? "rounded-2xl border-[2px] border-proposal-accent bg-proposal-accent-soft p-4"
          : "rounded-2xl border-[0.5px] border-proposal-reference-border bg-proposal-reference-bg p-3.5"
      }
    >
      <div className="flex items-start gap-3">
        <span
          className={
            isMatch
              ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-proposal-accent text-xs font-semibold text-white"
              : "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-proposal-reference-border text-[11px] text-zinc-500 dark:text-zinc-400"
          }
        >
          {number}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h4
              className={
                isMatch
                  ? "text-base font-semibold text-zinc-900 dark:text-zinc-100"
                  : "text-sm font-medium text-zinc-700 dark:text-zinc-300"
              }
            >
              {proposal.name}
            </h4>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{proposal.city}</span>
          </div>

          <p
            className={
              isMatch
                ? "mt-2 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200"
                : "mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400"
            }
          >
            {stripMarkdownBold(proposal.reason)}
          </p>

          {isMatch && proposal.caveat && (
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              ※ {stripMarkdownBold(proposal.caveat)}
            </p>
          )}

          {!isMatch && proposal.caveat && (
            <div className="mt-2 rounded-lg bg-proposal-caveat-bg px-3 py-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              希望と外れる点: {stripMarkdownBold(proposal.caveat)}
            </div>
          )}

          <div className="mt-3 border-t border-zinc-200/70 pt-2 dark:border-zinc-800">
            {!hasPlaceId ? (
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                Googleの登録情報がないため地図・評価は表示できません。
              </p>
            ) : placeDetails === undefined ? (
              <p className="text-xs text-zinc-400 dark:text-zinc-500">評価情報を確認中…</p>
            ) : hasRating ? (
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <PlaceRatingBadge
                  rating={placeDetails.rating}
                  userRatingCount={placeDetails.userRatingCount}
                  googleMapsUri={placeDetails.googleMapsUri}
                  className="text-xs text-zinc-600 dark:text-zinc-400"
                />
                <GoogleAttribution variant="standalone" />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
