import { describe, expect, it } from "vitest";
import { timelineCardRange, timelineDateLabel } from "@/features/career/roadmap-utils";

describe("career roadmap card layout", () => {
  it("gives one-day milestones enough readable room", () => {
    const range = timelineCardRange({ starts_on: null, target_date: "2026-12-31" });
    expect(range.isPoint).toBe(true);
    expect(range.width).toBe(0);
  });

  it("keeps cards inside the visible timeline at its end", () => {
    const range = timelineCardRange({ starts_on: "2026-08-07", target_date: "2026-11-02" });
    expect(range.width).toBeGreaterThan(10);
    expect(range.left + range.width).toBeLessThanOrEqual(100);
    expect(timelineDateLabel({ starts_on: "2026-08-07", target_date: "2026-11-02" })).toBe("08-07 — 11-02");
  });
});
