import { describe, expect, it } from "vitest";
import {
  classifyCareerMilestones,
  daysUntilCareerMilestone,
  getCareerMilestoneTemporalState,
  selectOpenCareerMilestones,
} from "@/features/career/milestone-temporal";

const today = "2026-08-09";
const milestone = (id: string, target_date: string, status = "planned", importance = "normal") => ({ id, target_date, status, importance });

describe("career milestone temporal semantics", () => {
  it("keeps signed date differences without turning historical dates into today", () => {
    expect(daysUntilCareerMilestone("2026-07-15", today)).toBe(-25);
    expect(daysUntilCareerMilestone(today, today)).toBe(0);
    expect(daysUntilCareerMilestone("2026-08-10", today)).toBe(1);
  });

  it("classifies past status separately while keeping today and future date-based", () => {
    const classified = classifyCareerMilestones([
      milestone("past-open", "2026-07-15"),
      milestone("past-done", "2026-07-15", "completed"),
      milestone("today-open", today),
      milestone("today-done", today, "completed"),
      milestone("future", "2026-08-10"),
    ], today);
    expect(classified.pastUnresolved.map((item) => item.id)).toEqual(["past-open"]);
    expect(classified.pastCompleted.map((item) => item.id)).toEqual(["past-done"]);
    expect(classified.today.map((item) => item.id)).toEqual(["today-open", "today-done"]);
    expect(classified.upcoming.map((item) => item.id)).toEqual(["future"]);
    expect(getCareerMilestoneTemporalState(milestone("skipped", "2026-07-15", "skipped"), today)).toBe("past_completed");
  });

  it("selects only open milestones inside the requested surface window", () => {
    const values = [
      milestone("past", "2026-07-15"),
      milestone("today", today),
      milestone("today-done", today, "completed"),
      milestone("tomorrow", "2026-08-10"),
      milestone("plus-7", "2026-08-16"),
      milestone("plus-30", "2026-09-08"),
      milestone("plus-31", "2026-09-09"),
    ];
    expect(selectOpenCareerMilestones(values, today, 7).map((item) => item.id)).toEqual(["today", "tomorrow", "plus-7"]);
    expect(selectOpenCareerMilestones(values, today, 30).map((item) => item.id)).toEqual(["today", "tomorrow", "plus-7", "plus-30"]);
  });

  it.each([
    ["past", "completed", "past_completed", false],
    ["past", "planned", "past_unresolved", false],
    ["past", "in_progress", "past_unresolved", false],
    ["today", "planned", "today", true],
    ["today", "in_progress", "today", true],
    ["today", "completed", "today", false],
    ["future", "planned", "future", true],
    ["future", "in_progress", "future", true],
    ["future", "completed", "future", false],
  ] as const)("classifies %s + %s and applies open-surface visibility", (dateKind, status, state, visible) => {
    const targetDate = dateKind === "past" ? "2026-08-08" : dateKind === "today" ? today : "2026-08-10";
    const value = milestone(`${dateKind}-${status}`, targetDate, status);
    expect(getCareerMilestoneTemporalState(value, today)).toBe(state);
    expect(selectOpenCareerMilestones([value], today, 30).length > 0).toBe(visible);
  });
});
