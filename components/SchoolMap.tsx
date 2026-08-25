"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMapsLibrary } from "@/lib/googleMapsBrowserLoader";
import { GoogleAttribution } from "./GoogleAttribution";

interface SchoolMapProps {
  lat: number;
  lng: number;
  label?: string;
  zoom?: number;
  className?: string;
}

/**
 * Maps JavaScript API で学校の位置を表示する地図。
 * Placesの検索結果を地図に重ねる場合も、必ずこのGoogleマップ上に表示すること
 * （地図なしで別のマップライブラリに重ねない）。
 */
export function SchoolMap({ lat, lng, label, zoom = 15, className }: SchoolMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { Map } = await loadGoogleMapsLibrary("maps");
        const { Marker } = await loadGoogleMapsLibrary("marker");

        if (cancelled || !containerRef.current) return;

        const map = new Map(containerRef.current, {
          center: { lat, lng },
          zoom,
        });

        new Marker({ map, position: { lat, lng }, title: label });
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "地図の読み込みに失敗しました",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lat, lng, zoom, label]);

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  return (
    <div className={className}>
      <div ref={containerRef} className="h-64 w-full rounded-md" aria-label={label} />
      <GoogleAttribution variant="withMap" className="mt-1" />
    </div>
  );
}
