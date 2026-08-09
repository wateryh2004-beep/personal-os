import { describe, expect, it } from "vitest";
import { dateToX, getTimelineDomain, getVisibleItemGeometry, isDuration, packTimelineItems, trackRangeGeometry, xToDate } from "@/features/career/roadmap-utils";

describe("career roadmap timeline", () => {
  const now = new Date("2026-08-07T12:00:00Z");
  const domain = getTimelineDomain(
    now,
    [{ starts_on: null, target_date: "2028-05-10" }],
    [{ start_date: "2026-06-01", end_date: "2029-02-01" }],
  );

  it("starts at the current month minus visible history and includes future phases", () => {
    expect(domain.start.toISOString().slice(0, 10)).toBe("2023-08-01");
    expect(domain.end.toISOString().slice(0, 10)).toBe("2032-02-01");
  });

  it("keeps historical milestone points on their stored target date", () => {
    const historicalX = dateToX("2026-07-15", domain, 92);
    expect(historicalX).toBeGreaterThan(0);
    expect(xToDate(historicalX, domain, 92)).toBe("2026-07-15");
  });

  it("keeps track phases as their own background range", () => {
    const geometry = trackRangeGeometry({ start_date: "2026-08-01", end_date: "2026-10-01" }, domain, 92);
    expect(geometry?.width).toBeGreaterThan(180);
    expect(trackRangeGeometry({ start_date: null, end_date: "2026-10-01" }, domain, 92)).toBeNull();
  });

  it("uses starts_on as the explicit point/range setting", () => {
    expect(isDuration({ starts_on: null, target_date: "2026-08-10" })).toBe(false);
    expect(isDuration({ starts_on: "2026-08-10", target_date: "2026-08-10" })).toBe(true);
    expect(isDuration({ starts_on: "2026-08-01", target_date: "2026-08-10" })).toBe(true);
  });

  it("packs overlapping points and ranges into independent rows", () => {
    const rows = packTimelineItems([
      { id: "range", starts_on: "2026-08-01", target_date: "2026-08-10" },
      { id: "inside", starts_on: null, target_date: "2026-08-05" },
      { id: "after", starts_on: null, target_date: "2026-08-11" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].map((item) => item.id)).toEqual(["range", "after"]);
  });

  it("marks long ranges as clipped without changing their stored dates", () => {
    expect(getVisibleItemGeometry({
      itemStart: "2025-01-01",
      itemEnd: "2027-12-31",
      viewportStart: "2026-08-01",
      viewportEnd: "2026-12-31",
    })).toEqual({ intersectsViewport: true, clippedLeft: true, clippedRight: true });
  });
});
