"use client";

import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, type RefObject } from "react";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";
import type { ApplyContext, RestoreAck } from "@/features/workbench/view-state-registry";
import type { ViewStateOf } from "@/features/workbench/view-state-contracts";
type MapPosition = NonNullable<ViewStateOf<"travel">["map"]>;
export type TravelMapController = { capture: () => MapPosition | null; restore: (position: MapPosition, context: ApplyContext) => Promise<RestoreAck> };

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
  controllerRef,
}: {
  stops: LocatedStop[];
  selectedStopId?: string | null;
  onSelectStop?: (id: string) => void;
  controllerRef?: RefObject<TravelMapController | null>;
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
    if (!map || !controllerRef) return;
    const owner = captureWorkspaceScope(); let disposed = false;
    const capture = () => {
      if (disposed || !owner()) return null;
      const center = map.getCenter().wrap(), zoom = map.getZoom();
      if (![center.lat, center.lng, zoom].every(Number.isFinite)) return null;
      return { latitude: center.lat, longitude: center.lng, zoom };
    };
    const handle: TravelMapController = { capture, restore: (position, context) => new Promise(resolve => {
      if (disposed || !owner() || !context.current()) { resolve({ status: "cancelled" }); return; }
      if (!map.isStyleLoaded()) { resolve({ status: "partial", reason: "unavailable" }); return; }
      let settled = false;
      const finish = (ack: RestoreAck) => { if (settled) return; settled = true; clearTimeout(timer); map.off("render", rendered); context.signal.removeEventListener("abort", cancelled); resolve(ack); };
      const cancelled = () => finish({ status: "cancelled" });
      const rendered = () => {
        if (disposed || !owner() || !context.current()) { cancelled(); return; }
        const actual = capture();
        if (actual && Math.abs(actual.latitude - position.latitude) < 1e-7 && Math.abs(actual.longitude - position.longitude) < 1e-7 && Math.abs(actual.zoom - position.zoom) < 1e-7) finish({ status: "applied" });
      };
      const timer = setTimeout(() => finish({ status: "partial", reason: "unavailable" }), 1500);
      context.signal.addEventListener("abort", cancelled, { once: true }); map.on("render", rendered);
      map.stop(); map.jumpTo({ center: [position.longitude, position.latitude], zoom: position.zoom }); map.triggerRepaint();
    }) };
    controllerRef.current = handle;
    return () => { disposed = true; if (controllerRef.current === handle) controllerRef.current = null; };
  }, [controllerRef]);

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
