"use client";

import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";

type LocatedStop = { id: string; placeName: string; latitude: number; longitude: number };

export function TravelMap({ stops }: { stops: LocatedStop[] }) {
  const container = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: stops[0] ? [stops[0].longitude, stops[0].latitude] : [116.4074, 39.9042],
      zoom: stops.length > 1 ? 5 : 10,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.on("load", () => {
      const line = stops.map((stop) => [stop.longitude, stop.latitude]);
      if (line.length > 1) {
        map.addSource("trip-route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line } } });
        map.addLayer({ id: "trip-route", type: "line", source: "trip-route", paint: { "line-color": "#2563eb", "line-width": 4, "line-opacity": 0.85 } });
      }
      for (const [index, stop] of stops.entries()) {
        new maplibregl.Marker({ color: "#2563eb" }).setLngLat([stop.longitude, stop.latitude]).setPopup(new maplibregl.Popup({ offset: 18 }).setText(`${index + 1}. ${stop.placeName}`)).addTo(map);
      }
      if (stops.length) {
        const bounds = new maplibregl.LngLatBounds();
        stops.forEach((stop) => bounds.extend([stop.longitude, stop.latitude]));
        if (stops.length === 1) map.flyTo({ center: [stops[0].longitude, stops[0].latitude], zoom: 12 });
        else map.fitBounds(bounds, { padding: 48, maxZoom: 12 });
      }
    });
    mapRef.current = map;
    return () => { mapRef.current = null; map.remove(); };
  }, [stops]);

  return <div ref={container} className="mt-3 h-72 overflow-hidden rounded border bg-zinc-100" aria-label="旅行路线地图" />;
}
