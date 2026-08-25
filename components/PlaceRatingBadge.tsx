/**
 * 口コミの表示は「評価点 + 件数 + Googleマップへのリンク」のみに限定する。
 * レビュー本文は一切扱わない（取得もしていない。app/api/places/details の
 * fieldMask に reviews を含めていない）。
 */

interface PlaceRatingBadgeProps {
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  className?: string;
}

export function PlaceRatingBadge({
  rating,
  userRatingCount,
  googleMapsUri,
  className,
}: PlaceRatingBadgeProps) {
  if (rating == null || userRatingCount == null) return null;

  const label = `★${rating.toFixed(1)}（${userRatingCount.toLocaleString("ja-JP")}件）`;

  if (!googleMapsUri) {
    return <span className={className}>{label}</span>;
  }

  return (
    <a
      href={googleMapsUri}
      target="_blank"
      rel="noopener noreferrer"
      className={`underline underline-offset-2 ${className ?? ""}`}
    >
      {label}
    </a>
  );
}
