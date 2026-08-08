import { describe, expect, it } from "vitest";
import { getReviewPeriod, getLocalWeekPeriod } from "@/features/reviews/periods";

describe("review periods", () => {
  it("uses the profile timezone for a stable daily key", () => {
    const instant = new Date("2026-08-08T15:30:00.000Z");
    expect(getReviewPeriod("daily", instant, "Asia/Tokyo").key).toBe("daily:2026-08-09");
    expect(getReviewPeriod("daily", instant, "Asia/Shanghai").key).toBe("daily:2026-08-08");
  });

  it("always uses Monday through Sunday for weekly periods across a year boundary", () => {
    expect(getLocalWeekPeriod(new Date("2027-01-01T12:00:00Z"), "Asia/Shanghai")).toEqual({ startDate: "2026-12-28", endDate: "2027-01-03" });
  });

  it("gives every weekly retry the same key", () => {
    const first = getReviewPeriod("weekly", new Date("2026-08-08T02:00:00Z"), "Asia/Shanghai");
    const second = getReviewPeriod("weekly", new Date("2026-08-09T14:00:00Z"), "Asia/Shanghai");
    expect(first.key).toBe("weekly:2026-08-03");
    expect(second.key).toBe(first.key);
  });
});
