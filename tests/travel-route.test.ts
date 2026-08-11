import { describe, expect, it } from "vitest";
import { buildTripRoute } from "@/features/travel/route/build-route";
describe("travel route", () => it("keeps unresolved stops in the itinerary but not the route", () => {
  const result = buildTripRoute([{ id:"a", placeName:"A", dayNumber:1, sortOrder:0, latitude:1, longitude:2 }, { id:"b", placeName:"B", dayNumber:1, sortOrder:1, latitude:null, longitude:null }, { id:"c", placeName:"C", dayNumber:2, sortOrder:2, latitude:3, longitude:4 }]);
  expect(result.orderedStops.map((stop) => stop.placeName)).toEqual(["A", "B", "C"]); expect(result.coordinates).toEqual([[2,1],[4,3]]); expect(result.unresolvedCount).toBe(1);
}));
