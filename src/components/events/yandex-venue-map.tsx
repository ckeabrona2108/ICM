"use client";

import * as React from "react";

type YandexVenueSuggestion = {
  id: string;
  name: string;
  city: string;
  address: string;
  placeId: string;
  mapProvider: string;
  latitude: number | null;
  longitude: number | null;
};

type YandexVenueMapProps = {
  latitude?: number | null;
  longitude?: number | null;
  title?: string;
  address?: string;
  className?: string;
  zoom?: number;
  emptyMessage?: string;
};

type YandexMapsApi = {
  Map: new (
    container: HTMLElement,
    state: Record<string, unknown>,
    options?: Record<string, unknown>
  ) => {
    destroy: () => void;
    geoObjects: { add: (geoObject: unknown) => void };
    behaviors: { disable: (behavior: string) => void };
  };
  Placemark: new (
    coordinates: [number, number],
    properties?: Record<string, unknown>,
    options?: Record<string, unknown>
  ) => unknown;
  ready: (callback: () => void) => void;
  geocode: (query: string, options?: Record<string, unknown>) => Promise<any>;
};

declare global {
  interface Window {
    ymaps?: YandexMapsApi;
    __icmYandexMapsPromise?: Promise<YandexMapsApi | null>;
  }
}

function getYandexMapsApiKey() {
  return process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY?.trim() ?? "";
}

export async function loadYandexMaps(): Promise<YandexMapsApi | null> {
  if (typeof window === "undefined") return null;
  if (window.ymaps) return window.ymaps;
  if (window.__icmYandexMapsPromise) return window.__icmYandexMapsPromise;

  const apiKey = getYandexMapsApiKey();
  if (!apiKey) return null;

  window.__icmYandexMapsPromise = new Promise<YandexMapsApi | null>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-yandex-maps="true"]');
    if (existingScript) {
      existingScript.addEventListener("load", () => {
        if (!window.ymaps) {
          reject(new Error("Yandex Maps script loaded without ymaps"));
          return;
        }
        window.ymaps.ready(() => resolve(window.ymaps ?? null));
      });
      existingScript.addEventListener("error", () => reject(new Error("Failed to load Yandex Maps")));
      return;
    }

    const script = document.createElement("script");
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU`;
    script.async = true;
    script.dataset.yandexMaps = "true";
    script.onload = () => {
      if (!window.ymaps) {
        reject(new Error("Yandex Maps script loaded without ymaps"));
        return;
      }
      window.ymaps.ready(() => resolve(window.ymaps ?? null));
    };
    script.onerror = () => reject(new Error("Failed to load Yandex Maps"));
    document.head.appendChild(script);
  });

  return window.__icmYandexMapsPromise;
}

function extractCity(metaData: any) {
  const components = Array.isArray(metaData?.Address?.Components) ? metaData.Address.Components : [];
  const locality =
    components.find((item: any) => item.kind === "locality")?.name ??
    components.find((item: any) => item.kind === "province")?.name ??
    components.find((item: any) => item.kind === "area")?.name ??
    "";
  return typeof locality === "string" ? locality : "";
}

export async function searchYandexVenues(query: string, limit = 6): Promise<YandexVenueSuggestion[]> {
  const clean = query.trim();
  if (!clean) return [];

  const ymaps = await loadYandexMaps();
  if (!ymaps) return [];

  const response = await ymaps.geocode(clean, { results: limit });
  const items: YandexVenueSuggestion[] = [];

  response.geoObjects.each((geoObject: any, index: number) => {
    const coordinates = geoObject.geometry?.getCoordinates?.();
    const metaData = geoObject.properties?.get?.("metaDataProperty.GeocoderMetaData") ?? {};
    const address =
      metaData?.text ??
      geoObject.getAddressLine?.() ??
      geoObject.properties?.get?.("description") ??
      "";
    const name =
      geoObject.properties?.get?.("name") ??
      metaData?.name ??
      address ??
      `Место ${index + 1}`;

    items.push({
      id: `yandex-${metaData?.id ?? `${name}-${index}`}`,
      name: typeof name === "string" ? name : `Место ${index + 1}`,
      city: extractCity(metaData),
      address: typeof address === "string" ? address : "",
      placeId: typeof metaData?.id === "string" ? metaData.id : "",
      mapProvider: "yandex",
      latitude: Array.isArray(coordinates) ? Number(coordinates[0]) : null,
      longitude: Array.isArray(coordinates) ? Number(coordinates[1]) : null
    });
  });

  return items.filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
}

export function YandexVenueMap({
  latitude,
  longitude,
  title,
  address,
  className,
  zoom = 16,
  emptyMessage = "После выбора площадки карта появится здесь."
}: YandexVenueMapProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = React.useRef<{ destroy: () => void } | null>(null);
  const hasCoordinates = typeof latitude === "number" && typeof longitude === "number";
  const apiKey = getYandexMapsApiKey();
  const shellClassName =
    className ??
    "h-[320px] overflow-hidden rounded-[28px] border border-white/[0.08] bg-black/20";

  React.useEffect(() => {
    if (!hasCoordinates || !containerRef.current) return;

    let cancelled = false;

    void loadYandexMaps()
      .then((ymaps) => {
        if (!ymaps || cancelled || !containerRef.current) return;
        mapInstanceRef.current?.destroy();

        const center: [number, number] = [latitude, longitude];
        const map = new ymaps.Map(
          containerRef.current,
          {
            center,
            zoom,
            controls: ["zoomControl", "fullscreenControl"]
          },
          {
            suppressMapOpenBlock: true
          }
        );

        const placemark = new ymaps.Placemark(
          center,
          {
            hintContent: title || address || "Площадка",
            balloonContentHeader: title || "Площадка",
            balloonContentBody: address || ""
          },
          {
            preset: "islands#violetIcon"
          }
        );

        map.geoObjects.add(placemark);
        map.behaviors.disable("scrollZoom");
        mapInstanceRef.current = map;
      })
      .catch(() => {
        mapInstanceRef.current?.destroy();
        mapInstanceRef.current = null;
      });

    return () => {
      cancelled = true;
      mapInstanceRef.current?.destroy();
      mapInstanceRef.current = null;
    };
  }, [address, hasCoordinates, latitude, longitude, title, zoom]);

  if (!apiKey) {
    return (
      <div className={`${shellClassName} flex items-center justify-center px-5 text-center text-sm text-white/52`}>
        Добавьте `NEXT_PUBLIC_YANDEX_MAPS_API_KEY`, чтобы показать интерактивную карту Яндекса.
      </div>
    );
  }

  if (!hasCoordinates) {
    return <div className={`${shellClassName} flex items-center justify-center px-5 text-center text-sm text-white/52`}>{emptyMessage}</div>;
  }

  return <div ref={containerRef} className={shellClassName} />;
}
