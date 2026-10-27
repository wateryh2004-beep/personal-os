"use client";

import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";

type LocatedStop = {
  id: string;
  placeName: string;
  latitude: number;
  longitude: number;
};
const routeSourceId = "trip-route";

export function TravelMap({
  stops,
  selectedStopId,
  onSelectStop,
}: {
  stops: LocatedStop[];
  selectedStopId?: string | null;
  onSelectStop?: (id: string) => void;
}) {
  const selectRef = useRef(onSelectStop);
  useEffect(() => {
    selectRef.current = onSelectStop;
  }, [onSelectStop]);
  const container = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const initialStops = useRef(stops);
  const fittedCoordinates = useRef("");

  // MapLibre has a high creation cost. Create it once per mounted map and
  // reconcile route/markers below when stops are edited or reordered.
  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const first = initialStops.current[0];
    const map = new maplibregl.Map({
      container: container.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: first ? [first.longitude, first.latitude] : [116.4074, 39.9042],
      zoom: first ? 10 : 5,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container.current);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stopMotion = () => {
      if (motion.matches) map.stop();
    };
    motion.addEventListener("change", stopMotion);
    return () => {
      observer.disconnect();
      motion.removeEventListener("change", stopMotion);
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => {
      const accent = container.current
        ? getComputedStyle(container.current)
            .getPropertyValue("--accent")
            .trim() || "#37594B"
        : "#37594B";
      const coordinates = stops.map((stop) => [stop.longitude, stop.latitude]);
      const feature = {
        type: "Feature" as const,
        properties: {},
        geometry: { type: "LineString" as const, coordinates },
      };
      const source = map.getSource(routeSourceId) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (source) source.setData(feature);
      else {
        map.addSource(routeSourceId, { type: "geojson", data: feature });
        map.addLayer({
          id: routeSourceId,
          type: "line",
          source: routeSourceId,
          paint: {
            "line-color": accent,
            "line-width": 4,
            "line-opacity": 0.85,
          },
        });
      }
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = stops.map((stop, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = String(index + 1);
        button.setAttribute("aria-label", `定位 ${stop.placeName}`);
        button.dataset.stopId = stop.id;
        Object.assign(button.style, {
          minWidth: "44px",
          minHeight: "44px",
          borderRadius: "50%",
          background: accent,
          color: "var(--accent-foreground, #fff)",
          border: "2px solid var(--background)",
          fontWeight: "600",
        });
        button.addEventListener("click", () => selectRef.current?.(stop.id));
        return new maplibregl.Marker({ element: button })
          .setLngLat([stop.longitude, stop.latitude])
          .addTo(map);
      });
      if (!stops.length) return;
      const geometryKey = coordinates
        .map((point) => point.join(","))
        .sort()
        .join(";");
      if (fittedCoordinates.current === geometryKey) return;
      fittedCoordinates.current = geometryKey;
      const duration = window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches
        ? 0
        : 320;
      const bounds = new maplibregl.LngLatBounds();
      stops.forEach((stop) => bounds.extend([stop.longitude, stop.latitude]));
      if (stops.length === 1)
        map.easeTo({
          center: [stops[0].longitude, stops[0].latitude],
          zoom: 12,
          duration,
        });
      else map.fitBounds(bounds, { padding: 48, maxZoom: 12, duration });
    };
    if (map.isStyleLoaded()) update();
    else map.once("load", update);
    return () => {
      map.off("load", update);
    };
  }, [stops]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const marker of markersRef.current)
      marker
        .getElement()
        .setAttribute(
          "aria-pressed",
          String(marker.getElement().dataset.stopId === selectedStopId),
        );
    const stop = stops.find((item) => item.id === selectedStopId);
    if (stop)
      map.easeTo({
        center: [stop.longitude, stop.latitude],
        duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 320,
      });
  }, [selectedStopId, stops]);
  return (
    <div
      ref={container}
      className="mt-3 h-72 overflow-hidden rounded border bg-[var(--surface-control)]"
      aria-label="旅行路线地图"
    />
  );
}
