import { describe, expect, it } from "vitest";
import { dateToX, getDurationLabelPosition, getTimelineDomain, getVisibleItemGeometry, isDuration, packIntervals, timelineCardRange, xToDate } from "@/features/career/roadmap-utils";

describe("career roadmap timeline", () => {
  const now = new Date("2026-08-07T12:00:00Z");
  const domain = getTimelineDomain(now, [{ starts_on: null, target_date: "2028-05-10" }]);

  it("starts at the current month minus the visible history", () => {
    expect(domain.start.toISOString().slice(0, 10)).toBe("2023-08-01");
  });

  it("keeps past and long-future dates in an expandable domain", () => {
    expect(dateToX("2026-07-01", domain, 92)).toBeGreaterThan(0);
    expect(dateToX("2028-05-10", domain, 92)).toBeGreaterThan(dateToX("2027-12-01", domain, 92));
    expect(domain.end.toISOString().slice(0, 10)).toBe("2031-05-01");
  });

  it("converts dates to x coordinates and snaps x back to a day", () => {
    const x = dateToX("2026-08-16", domain, 92);
    expect(xToDate(x, domain, 92)).toBe("2026-08-16");
  });

  it("distinguishes a duration from a point milestone", () => {
    expect(isDuration({ starts_on: "2026-08-07", target_date: "2026-09-07" })).toBe(true);
    expect(timelineCardRange({ starts_on: null, target_date: "2026-12-31" }).isPoint).toBe(true);
  });

  it("packs overlapping intervals into independent subrows", () => {
    const rows = packIntervals([
      { id: "a", starts_on: "2026-08-01", target_date: "2026-08-10" },
      { id: "b", starts_on: "2026-08-05", target_date: "2026-08-12" },
      { id: "c", starts_on: "2026-08-13", target_date: "2026-08-18" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].map((item) => item.id)).toEqual(["a", "c"]);
  });

  it("keeps an earlier duration identifiable when it intersects the visible range", () => {
    expect(getVisibleItemGeometry({ itemStart: "2026-06-01", itemEnd: "2026-11-01", viewportStart: "2026-08-01", viewportEnd: "2027-05-01" })).toMatchObject({ intersectsViewport: true, clippedLeft: true, clippedRight: false, visibleStart: "2026-08-01" });
    expect(getVisibleItemGeometry({ itemStart: "2026-09-01", itemEnd: "2026-11-01", viewportStart: "2026-08-01", viewportEnd: "2027-05-01" })).toMatchObject({ intersectsViewport: true, clippedLeft: false, clippedRight: false });
    expect(getVisibleItemGeometry({ itemStart: "2026-06-01", itemEnd: "2028-01-01", viewportStart: "2026-08-01", viewportEnd: "2027-05-01" })).toMatchObject({ intersectsViewport: true, clippedLeft: true, clippedRight: true });
    expect(getVisibleItemGeometry({ itemStart: "2025-01-01", itemEnd: "2026-07-01", viewportStart: "2026-08-01", viewportEnd: "2027-05-01" })).toMatchObject({ intersectsViewport: false });
  });

  it("moves the label into each visible portion without changing the bar range", () => {
    expect(getDurationLabelPosition({ barLeft: 0, barRight: 500, viewportLeft: 180, viewportRight: 700 })).toMatchObject({ intersectsViewport: true, left: 187 });
    expect(getDurationLabelPosition({ barLeft: 0, barRight: 500, viewportLeft: 340, viewportRight: 700 })).toMatchObject({ intersectsViewport: true, left: 347 });
    expect(getDurationLabelPosition({ barLeft: 0, barRight: 500, viewportLeft: 520, viewportRight: 700 })).toMatchObject({ intersectsViewport: false });
  });
});
