"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMapsLibrary } from "@/lib/googleMapsBrowserLoader";
import { GoogleAttribution } from "@/components/GoogleAttribution";
import type { DisplayProposal } from "@/lib/proposal/applyResult";

declare global {
  interface Window {
    // Google Maps JS APIがキー拒否時（RefererNotAllowedMapError等）に呼ぶグローバルコールバック。
    // importLibrary() のPromiseが必ずしもrejectしないため、これも合わせて監視する。
    gm_authFailure?: () => void;
  }
}

interface ProposalMapProps {
  proposals: DisplayProposal[];
}

interface Pin {
  number: number;
  category: "match" | "reference";
  lat: number;
  lng: number;
  name: string;
}

/** カードと同じ採番（合う候補→参考候補の順）。番号がカードのバッジと一致する */
function toPins(proposals: DisplayProposal[]): Pin[] {
  const matches = proposals.filter((p) => p.category === "match");
  const references = proposals.filter((p) => p.category === "reference");
  const pins: Pin[] = [];
  matches.forEach((p, i) => {
    if (p.lat == null || p.lng == null) return;
    pins.push({ number: i + 1, category: "match", lat: p.lat, lng: p.lng, name: p.name });
  });
  references.forEach((p, i) => {
    if (p.lat == null || p.lng == null) return;
    pins.push({
      number: matches.length + i + 1,
      category: "reference",
      lat: p.lat,
      lng: p.lng,
      name: p.name,
    });
  });
  return pins;
}

function readCssColor(varName: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return value || fallback;
}

/** 番号バッジ付きの丸ピンアイコンをSVGで作る。合う候補=塗りつぶし、参考候補=白地+縁取り */
function buildPinIcon(category: "match" | "reference", accentColor: string, referenceColor: string) {
  const size = category === "match" ? 30 : 24;
  const r = size / 2 - 2;
  const c = size / 2;
  const fill = category === "match" ? accentColor : "#ffffff";
  const stroke = category === "match" ? "#ffffff" : referenceColor;
  const strokeWidth = category === "match" ? 2 : 1.5;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${c}" cy="${c}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(c, c),
  };
}

/**
 * 提案の全候補（合う候補＋参考候補）を1つの地図にまとめて表示する。
 * legacy Marker（label+icon）を使用。AdvancedMarkerElement/Map IDは使わない
 * （追加のGCP設定が要らない既存実績のある方式に揃える）。
 * ピンの座標は DisplayProposal.lat/lng（schools.ts保存済み）をそのまま使い、
 * 地図表示のために Places API を追加で呼ぶことはしない。
 * lat/lng の無い学校（placeId未解決含む）はそもそもピンを立てない。
 */
export function ProposalMap({ proposals }: ProposalMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pins = toPins(proposals);

  useEffect(() => {
    if (pins.length === 0) return;

    let cancelled = false;
    const prevAuthFailure = window.gm_authFailure;
    window.gm_authFailure = () => {
      if (cancelled) return;
      console.error(
        "地図の読み込みに失敗しました: gm_authFailure（APIキーがGoogle Cloud Console側で拒否されました。" +
          "リファラ制限・Maps JavaScript APIの有効化・課金設定を確認してください）",
      );
      setError("地図を読み込めませんでした");
    };

    (async () => {
      try {
        const { Map } = await loadGoogleMapsLibrary("maps");
        const { LatLngBounds } = await loadGoogleMapsLibrary("core");
        const { Marker } = await loadGoogleMapsLibrary("marker");

        if (cancelled || !containerRef.current) return;

        const accentColor = readCssColor("--proposal-accent", "#2563eb");
        const referenceColor = readCssColor("--proposal-reference-border", "#d4d4d8");

        const map = new Map(containerRef.current, {
          center: { lat: pins[0].lat, lng: pins[0].lng },
          zoom: 12,
        });

        for (const pin of pins) {
          new Marker({
            map,
            position: { lat: pin.lat, lng: pin.lng },
            title: pin.name,
            icon: buildPinIcon(pin.category, accentColor, referenceColor),
            label: {
              text: String(pin.number),
              color: pin.category === "match" ? "#ffffff" : "#71717a",
              fontSize: "11px",
              fontWeight: "bold",
            },
            zIndex: pin.category === "match" ? 2 : 1,
          });
        }

        if (pins.length === 1) {
          map.setCenter({ lat: pins[0].lat, lng: pins[0].lng });
          map.setZoom(14);
        } else {
          const bounds = new LatLngBounds();
          for (const pin of pins) bounds.extend({ lat: pin.lat, lng: pin.lng });
          map.fitBounds(bounds, 40);
        }
      } catch (err) {
        if (cancelled) return;
        console.error(
          "地図の読み込みに失敗しました:",
          err instanceof Error ? err.message : err,
        );
        setError("地図を読み込めませんでした");
      }
    })();

    return () => {
      cancelled = true;
      window.gm_authFailure = prevAuthFailure;
    };
    // pins は proposals から毎レンダー再計算されるが、値としては提案メッセージ生成時点で不変
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (pins.length === 0) return null;

  if (error) {
    return (
      <div className="flex h-48 w-full items-center justify-center rounded-2xl border border-dashed border-red-300 bg-red-50 text-sm text-red-500 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div>
      <div ref={containerRef} className="h-48 w-full rounded-2xl" />
      <GoogleAttribution variant="withMap" className="mt-1" />
    </div>
  );
}
