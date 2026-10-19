import { describe, expect, it } from "vitest";
import {
  buildMonthlyIssueTrend,
  countTags,
  readinessChecklist,
  requiresPersonalStory,
  rankSmartPracticeQueue,
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

it("does not label an unscheduled practiced question as due for review", () => {
  const base = { id: "p", status: "ready", importance: "high", attempt_count: 1, story_count: 1, usable_story_count: 1, last_practiced_at: "2026-10-18T00:00:00Z" };
  const now = new Date("2026-10-19T00:00:00Z");
  expect(rankSmartPracticeQueue([{ ...base, next_practice_at: null }], now)[0].practice_reasons).not.toContain("到期复习");
  expect(rankSmartPracticeQueue([{ ...base, next_practice_at: "2026-10-18T00:00:00Z" }], now)[0].practice_reasons).toContain("到期复习");
  expect(rankSmartPracticeQueue([{ ...base, next_practice_at: "2026-10-21T00:00:00Z" }], now)[0].practice_reasons).not.toContain("到期复习");
});


it("requests personal stories only for experience answers, never for technical cases", () => {
  expect(requiresPersonalStory("behavioral")).toBe(true);
  expect(requiresPersonalStory("resume")).toBe(true);
  expect(requiresPersonalStory("knowledge")).toBe(false);
  expect(requiresPersonalStory("business_commercial")).toBe(false);

  const base = { status: "needs_review", importance: "high", attempt_count: 0, story_count: 0, usable_story_count: 0, competency_count: 2, covered_competency_count: 0 };
  const queue = rankSmartPracticeQueue([
    { ...base, id: "finance", requires_story: false },
    { ...base, id: "behavioral", requires_story: true },
  ], new Date("2026-10-19T00:00:00Z"));
  const finance = queue.find((item) => item.id === "finance")!;
  const behavioral = queue.find((item) => item.id === "behavioral")!;
  expect(finance.practice_reasons).not.toContain("缺少可用故事");
  expect(finance.practice_reasons).not.toContain("能力证据不足");
  expect(behavioral.practice_reasons).toContain("缺少可用故事");
  expect(behavioral.practice_priority_score).toBeGreaterThan(finance.practice_priority_score);
});

it("does not treat an unset review date as a due-review boost", () => {
  const base = { status: "developing", importance: "high", attempt_count: 1, last_practiced_at: "2026-10-18T00:00:00Z" };
  const queue = rankSmartPracticeQueue([
    { ...base, id: "unscheduled", next_practice_at: null },
    { ...base, id: "due", next_practice_at: "2026-10-18T00:00:00Z" },
  ], new Date("2026-10-19T00:00:00Z"));
  expect(queue[0].id).toBe("due");
  expect(queue[0].practice_reasons).toContain("到期复习");
  expect(queue[1].practice_reasons).not.toContain("到期复习");
});
