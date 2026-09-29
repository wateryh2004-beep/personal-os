import { describe, expect, it } from "vitest";
import {
  buildMonthlyIssueTrend,
  countTags,
  readinessChecklist,
  sortPracticeQueue,
} from "@/features/interview/utils";

describe("Interview Lab utils", () => {
  it("prioritizes due review work before ready items", () => {
    const now = new Date("2026-09-29T00:00:00Z");
    const items = [
      { id: "ready", status: "ready", importance: "critical", next_practice_at: null, last_practiced_at: null },
      { id: "review", status: "needs_review", importance: "normal", next_practice_at: null, last_practiced_at: "2026-09-28T00:00:00Z" },
      { id: "future", status: "practicing", importance: "critical", next_practice_at: "2026-10-02T00:00:00Z", last_practiced_at: null },
    ];
    expect(sortPracticeQueue(items, now).map((item) => item.id)).toEqual(["review", "ready", "future"]);
  });

  it("requires message, logic, current answer and practice for ready", () => {
    expect(readinessChecklist({
      keyMessage: "A",
      answerLogic: "B",
      currentAnswerCount: 1,
      attemptCount: 1,
      evidenceCount: 0,
    })).toEqual({
      required: { keyMessage: true, answerLogic: true, currentAnswer: true, practiced: true },
      evidence: false,
      readyEligible: true,
    });
  });

  it("aggregates issue tags and monthly trend without scoring", () => {
    const rows = [
      { practiced_at: "2026-09-01T00:00:00Z", issue_tags: ["late_conclusion", "weak_evidence"] },
      { practiced_at: "2026-09-15T00:00:00Z", issue_tags: ["late_conclusion"] },
      { practiced_at: "2026-10-01T00:00:00Z", issue_tags: [] },
    ];
    expect(countTags(rows)[0]).toEqual({ tag: "late_conclusion", count: 2 });
    expect(buildMonthlyIssueTrend(rows)).toEqual([
      { month: "2026-09", attempts: 2, issueCount: 3, issuesPerAttempt: 1.5 },
      { month: "2026-10", attempts: 1, issueCount: 0, issuesPerAttempt: 0 },
    ]);
  });
});
