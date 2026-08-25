"use client";

import { useEffect, useRef } from "react";
import { loadGoogleMapsLibrary } from "@/lib/googleMapsBrowserLoader";

export interface ResolvedAddress {
  placeId: string;
  formattedAddress?: string;
  lat?: number;
  lng?: number;
}

interface AddressAutocompleteProps {
  onSelect: (address: ResolvedAddress) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Autocomplete (New) の PlaceAutocompleteElement を使った住所オートコンプリート入力欄。
 * ブラウザ用キー（NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY、リファラ制限）+
 * セッショントークン（PlaceAutocompleteElement が内部で自動管理）で課金される。
 *
 * 【要確認】Places UI Kit の Web Component（gmp-place-autocomplete /
 * PlaceAutocompleteElement）はAPIが比較的新しく、Google側の更新で
 * イベント名・プロパティ名が変わることがある。組み込み前に最新の公式
 * ドキュメントで gmp-select イベントの仕様（旧 gmp-placeselect からの
 * 変更有無）を必ず確認し、実ブラウザ + 実APIキーで動作確認すること。
 * このコンポーネントは実APIキーでの動作確認をしていない。
 */
export function AddressAutocomplete({
  onSelect,
  placeholder,
  className,
}: AddressAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let cancelled = false;
    let element: InstanceType<
      google.maps.PlacesLibrary["PlaceAutocompleteElement"]
    > | null = null;

    const handleSelect = async (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { placePrediction?: { toPlace: () => google.maps.places.Place } }
        | undefined;
      const place = detail?.placePrediction?.toPlace();
      if (!place) return;

      await place.fetchFields({ fields: ["id", "formattedAddress", "location"] });

      onSelectRef.current({
        placeId: place.id,
        formattedAddress: place.formattedAddress ?? undefined,
        lat: place.location?.lat(),
        lng: place.location?.lng(),
      });
    };

    (async () => {
      const { PlaceAutocompleteElement } = await loadGoogleMapsLibrary("places");

      if (cancelled || !containerRef.current) return;

      element = new PlaceAutocompleteElement();
      if (placeholder) {
        element.setAttribute("placeholder", placeholder);
      }
      element.addEventListener("gmp-select", handleSelect);
      containerRef.current.appendChild(element);
    })();

    return () => {
      cancelled = true;
      if (element) {
        element.removeEventListener("gmp-select", handleSelect);
        element.remove();
      }
    };
  }, [placeholder]);

  return <div ref={containerRef} className={className} />;
}
