import { describe, expect, it } from "vitest";
import {
  calendarEventOverlapsReviewPeriod,
  completedTaskFallsInReviewPeriod,
  countReviewEvidence,
  emptyReviewEvidence,
  getReviewPeriodBounds,
  noteChangedInReviewPeriod,
  openTaskIsRelevantToReview,
} from "@/features/reviews/evidence";
import { getReviewPeriod } from "@/features/reviews/periods";

describe("Review Evidence", () => {
  const daily = getReviewPeriod(
    "daily",
    new Date("2026-08-09T03:00:00.000Z"),
    "Asia/Shanghai",
  );
  const bounds = getReviewPeriodBounds(daily);

  it("uses the profile timezone daily boundary", () => {
    expect(bounds).toEqual({
      startIso: "2026-08-08T16:00:00.000Z",
      endExclusiveIso: "2026-08-09T16:00:00.000Z",
    });
  });

  it("reuses the Monday-to-Sunday weekly boundary", () => {
    const weekly = getReviewPeriod(
      "weekly",
      new Date("2026-08-09T03:00:00.000Z"),
      "Asia/Shanghai",
    );
    expect(weekly.startDate).toBe("2026-08-03");
    expect(weekly.endDate).toBe("2026-08-09");
    expect(getReviewPeriodBounds(weekly).endExclusiveIso).toBe(
      "2026-08-09T16:00:00.000Z",
    );
  });

  it("includes completed tasks only when completed_at is in the period", () => {
    expect(
      completedTaskFallsInReviewPeriod(
        { status: "completed", completed_at: "2026-08-09T02:00:00.000Z" },
        bounds,
      ),
    ).toBe(true);
    expect(
      completedTaskFallsInReviewPeriod(
        { status: "completed", completed_at: "2026-08-09T16:00:00.000Z" },
        bounds,
      ),
    ).toBe(false);
  });

  it("includes open tasks due or meaningfully changed in the period", () => {
    expect(
      openTaskIsRelevantToReview(
        {
          status: "notStarted",
          due_at: "2026-08-09T06:00:00.000Z",
          updated_at: "2026-08-01T00:00:00.000Z",
        },
        bounds,
      ),
    ).toBe(true);
    expect(
      openTaskIsRelevantToReview(
        {
          status: "inProgress",
          due_at: null,
          updated_at: "2026-08-09T04:00:00.000Z",
        },
        bounds,
      ),
    ).toBe(true);
  });

  it("detects calendar overlap rather than only matching start time", () => {
    expect(
      calendarEventOverlapsReviewPeriod(
        {
          starts_at: "2026-08-08T15:30:00.000Z",
          ends_at: "2026-08-08T16:30:00.000Z",
        },
        bounds,
      ),
    ).toBe(true);
  });

  it("includes notes created or updated in the period", () => {
    expect(
      noteChangedInReviewPeriod(
        {
          created_at: "2026-08-01T00:00:00.000Z",
          updated_at: "2026-08-09T07:00:00.000Z",
        },
        bounds,
      ),
    ).toBe(true);
  });

  it("represents empty evidence without inventing activity", () => {
    const evidence = emptyReviewEvidence({
      type: "daily",
      period: daily,
      generatedAt: "2026-08-09T03:00:00.000Z",
    });
    expect(countReviewEvidence(evidence)).toBe(0);
    expect(evidence.notes).toEqual([]);
  });
});
