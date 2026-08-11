import type { TripStop } from "../types";

export function buildTripRoute(stops: TripStop[]) {
  const orderedStops = [...stops].sort((left, right) => left.sortOrder - right.sortOrder);
  const resolvedStops = orderedStops.filter((stop): stop is TripStop & { latitude: number; longitude: number } => stop.latitude !== null && stop.longitude !== null);
  return {
    orderedStops,
    resolvedStops,
    unresolvedCount: orderedStops.length - resolvedStops.length,
    coordinates: resolvedStops.map((stop) => [stop.longitude, stop.latitude] as [number, number]),
    geoJson: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: resolvedStops.map((stop) => [stop.longitude, stop.latitude]) } },
  } as const;
}
