import { describe, expect, it, vi } from "vitest";
import { buildTodayComposition } from "@/features/today/composition";
import type { NowAttentionItem, NowCalendarEvent, NowCommitment, NowTask, NowWorkspace } from "@/features/today/types";

const snapshot = "2026-10-05T04:00:00Z";
const task = (id: string, due_at: string | null = "2026-10-05T10:00:00Z", status = "notStarted"): NowTask => ({
  id, title: id, due_at, status, importance: "normal",
});
const event = (id: string, starts_at: string, ends_at: string, is_all_day = false): NowCalendarEvent => ({
  id, subject: id, starts_at, ends_at, is_all_day, location_name: null,
});
const past = event("past", "2026-10-05T02:00:00Z", "2026-10-05T03:00:00Z");
const later = event("later", "2026-10-05T06:00:00Z", "2026-10-05T07:00:00Z");
const tomorrow = event("tomorrow", "2026-10-06T06:00:00Z", "2026-10-06T07:00:00Z");
const commitment = (item: NowTask): NowCommitment => ({
  id: `task-${item.id}`, kind: "task", title: item.title, whyNow: "任务今天到期", constraint: "今天",
  href: `/tasks?task=${encodeURIComponent(item.id)}`, source: { domain: "tasks", entityId: item.id, label: "Microsoft To Do" }, task: item,
});
const upcomingEvent = (item: NowCalendarEvent, id = `event-${item.id}`) => ({
  id, kind: "event" as const, title: item.subject, at: item.starts_at, href: `/calendar?event=${encodeURIComponent(item.id)}`,
});
function workspace(overrides: Partial<NowWorkspace> = {}): NowWorkspace {
  return {
    generatedAt: snapshot, timezone: "Asia/Shanghai",
    calendar: { today: [], upcoming: [], connection: null },
    tasks: { overdue: [], today: [], upcoming: [] }, career: { upcomingMilestones: [] },
    briefing: { entries: [], date: null }, inboxCount: 0, commitments: [],
    nextAction: { kind: "none", reason: "" }, todayBrief: [], attention: [], upcoming: [],
    availability: { calendar: "ready", tasks: "ready", career: "ready", inbox: "ready", briefing: "ready" },
    summary: { todayEventCount: 0, todayTaskCount: 0, attentionCount: 0 },
    focus: { date: "2026-10-05", selectedIds: [], selectedTasks: [], candidates: [], available: true },
    ...overrides,
  };
}
function focus(...tasks: NowTask[]): NonNullable<NowWorkspace["focus"]> {
  return { date: "2026-10-05", selectedIds: tasks.map((task) => task.id), selectedTasks: tasks, candidates: [], available: true };
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

describe("Today calm composition", () => {
  it("leaves a quiet lead without explicit focus instead of promoting a suggested task", () => {
    const due = task("due");
    const result = buildTodayComposition(workspace({
      tasks: { overdue: [], today: [due], upcoming: [] },
      nextAction: { kind: "task", task: due, reason: "今天值得推进", href: "/tasks?task=due" },
    }));
    expect(result.lead).toBeNull();
    expect(result.ledger).toMatchObject([{ kind: "task", task: due, dueState: "today" }]);
    expect(result.hasUnresolvedToday).toBe(true);
    expect(result.isEvening).toBe(false);
  });

  it("keeps three selections in explicit order and removes their duplicate obligations", () => {
    const first = task("first");
    const second = task("second", "2026-10-04T10:00:00Z");
    const third = task("third", null);
    const other = task("other");
    const selected = focus(third, first, second);
    selected.selectedTasks = [first, second, third];
    const result = buildTodayComposition(workspace({
      focus: selected, tasks: { overdue: [second], today: [first, other], upcoming: [] },
      commitments: [first, second, other].map(commitment),
      attention: [{ id: "overdue", kind: "task_overdue", priority: "medium", title: "1 项任务已经逾期", href: "/tasks" }],
    }));
    expect(result.lead).toEqual({ kind: "focus", task: third });
    expect(result.focusTasks).toEqual([third, first, second]);
    expect(result.ledger).toMatchObject([{ kind: "task", task: other }]);
    expect(result.focusTasks[2].due_at).toBe(second.due_at);
  });

  it("uses the first incomplete selected task without reordering or hiding completed choices", () => {
    const done = task("done", null, "completed");
    const active = task("active", null);
    const result = buildTodayComposition(workspace({ focus: focus(done, active) }));
    expect(result.lead).toEqual({ kind: "focus", task: active });
    expect(result.focusTasks).toEqual([done, active]);
    expect(buildTodayComposition(workspace({ focus: focus(done) })).lead).toBeNull();
  });

  it("lets an actual ongoing event lead while keeping all selected focuses", () => {
    const selected = [task("a"), task("b"), task("c")];
    const ongoing = event("ongoing", "2026-10-05T03:30:00Z", "2026-10-05T04:30:00Z");
    const result = buildTodayComposition(workspace({
      focus: focus(...selected), calendar: { today: [later, past, ongoing], upcoming: [], connection: null },
    }));
    expect(result.lead).toMatchObject({ kind: "event", event: ongoing, state: "ongoing", isEvening: false });
    expect(result.focusTasks).toEqual(selected);
    expect(result.ledger).toMatchObject([{ kind: "event", event: later }]);
    expect(result.pastEvents).toEqual([past]);
  });

  it("uses the existing 45-minute starting-soon window and actual instants with offsets", () => {
    const soon = event("soon", "2026-10-05T12:45:00+08:00", "2026-10-05T13:30:00+08:00");
    const chosen = task("chosen", null);
    const input = workspace({ focus: focus(chosen), calendar: { today: [later, soon], upcoming: [], connection: null } });
    expect(buildTodayComposition(input).lead).toMatchObject({ kind: "event", event: soon, state: "starting_soon" });
    const outside = { ...soon, starts_at: "2026-10-05T12:45:01+08:00" };
    expect(buildTodayComposition({ ...input, calendar: { ...input.calendar, today: [outside] } }).lead).toEqual({ kind: "focus", task: chosen });
  });

  it("promotes tomorrow only after today's obligations are resolved and keeps ended events separate", () => {
    const result = buildTodayComposition(workspace({
      calendar: { today: [past], upcoming: [tomorrow], connection: null },
      upcoming: [upcomingEvent(tomorrow, "noncanonical-row-id")],
    }));
    expect(result.lead).toEqual({ kind: "event", event: tomorrow, state: "upcoming", isEvening: true, href: "/calendar?event=tomorrow" });
    expect(result.isEvening).toBe(true);
    expect(result.hasUnresolvedToday).toBe(false);
    expect(result.pastEvents).toEqual([past]);
    expect(result.ledger).toEqual([]);
    expect(result.future).toEqual([]);
    expect(result.lead?.kind === "event" && result.lead.event.starts_at).toBe("2026-10-06T06:00:00Z");
  });

  it("can use the next real event on a day with no timed events but does not invent one", () => {
    expect(buildTodayComposition(workspace({ calendar: { today: [], upcoming: [tomorrow], connection: null } })).isEvening).toBe(true);
    const input = workspace({
      nextAction: { kind: "event", event: tomorrow, state: "upcoming", reason: "", href: "/calendar?event=tomorrow" },
      upcoming: [upcomingEvent(tomorrow)],
    });
    expect(buildTodayComposition(input).lead).toBeNull();
    expect(buildTodayComposition(input).future).toEqual(input.upcoming);
  });

  it("keeps a later-today event in the ledger instead of making a premature evening lead", () => {
    const result = buildTodayComposition(workspace({ calendar: { today: [past, later], upcoming: [tomorrow], connection: null } }));
    expect(result.lead).toBeNull();
    expect(result.ledger).toMatchObject([{ kind: "event", event: later }]);
    expect(result.isEvening).toBe(false);
  });

  it("never auto-selects an undated candidate or a high-importance future task", () => {
    const undated = task("undated", null);
    const future = { ...task("future", "2026-10-07T10:00:00Z"), importance: "high" };
    const input = workspace({
      focus: { ...focus(), candidates: [undated, future] },
      tasks: { overdue: [], today: [], upcoming: [future] },
      nextAction: { kind: "task", task: future, reason: "今天值得推进", href: "/tasks?task=future" },
    });
    expect(buildTodayComposition(input).lead).toBeNull();
    expect(buildTodayComposition(input).ledger).toEqual([]);
    expect(buildTodayComposition({ ...input, focus: focus(undated) }).lead).toEqual({ kind: "focus", task: undated });
  });

  it.each(["calendar", "tasks", "career"] as const)("does not claim an evening all-clear with %s unavailable", (source) => {
    const input = workspace({ calendar: { today: [past], upcoming: [tomorrow], connection: null } });
    input.availability[source] = "unavailable";
    const result = buildTodayComposition(input);
    expect(result.lead).toBeNull();
    expect(result.availability[source]).toBe("unavailable");
    expect(result.pastEvents).toEqual([past]);
  });

  it("does not invent a focus when focus is unavailable and retains known rows", () => {
    const chosen = task("chosen");
    const due = task("due");
    const input = workspace({ focus: { ...focus(chosen), available: false }, tasks: { overdue: [], today: [chosen, due], upcoming: [] } });
    const result = buildTodayComposition(input);
    expect(result.lead).toBeNull();
    expect(result.focusTasks).toEqual([chosen]);
    expect(result.ledger).toMatchObject([{ kind: "task", task: due }]);
    expect(result.focusAvailable).toBe(false);
    const unknownSelection = workspace({ focus: { ...focus(), selectedIds: ["missing"], available: false }, calendar: { today: [], upcoming: [tomorrow], connection: null } });
    expect(buildTodayComposition(unknownSelection).isEvening).toBe(false);
  });

  it("requires affirmative focus availability before treating an empty selection as resolved", () => {
    const result = buildTodayComposition(workspace({
      focus: undefined, calendar: { today: [], upcoming: [tomorrow], connection: null },
    }));
    expect(result.focusAvailable).toBe(false);
    expect(result.isEvening).toBe(false);
    expect(result.lead).toBeNull();
  });

  it("retains known incomplete selections as unresolved even when their focus source is unavailable", () => {
    const chosen = task("chosen", null);
    const result = buildTodayComposition(workspace({ focus: { ...focus(chosen), available: false } }));
    expect(result.lead).toBeNull();
    expect(result.hasUnresolvedToday).toBe(true);
  });

  it("never invents a start time for an all-day next event", () => {
    const allDay = event("all-day-tomorrow", "2026-10-05T16:00:00Z", "2026-10-06T16:00:00Z", true);
    const result = buildTodayComposition(workspace({ calendar: { today: [past], upcoming: [allDay, tomorrow], connection: null } }));
    expect(result.lead).toMatchObject({ kind: "event", event: allDay, state: "upcoming", isEvening: true });
    expect(result.lead?.kind === "event" && result.lead.event.is_all_day).toBe(true);
  });

  it("shows every overdue and today-due task beyond the old recommendation limit", () => {
    const overdue = Array.from({ length: 18 }, (_, index) => task(`overdue-${index}`, "2026-10-04T10:00:00Z"));
    const due = Array.from({ length: 12 }, (_, index) => task(`due-${index}`));
    const done = task("done", "2026-10-04T10:00:00Z", "completed");
    const result = buildTodayComposition(workspace({
      tasks: { overdue: [...overdue, done], today: [overdue[0], ...due], upcoming: [] },
      commitments: [...overdue, ...due].slice(0, 8).map(commitment),
      calendar: { today: [later], upcoming: [], connection: null },
    }));
    expect(result.ledger.filter((row) => row.kind === "task").map((row) => row.task.id)).toEqual([...overdue, ...due].map((row) => row.id));
    expect(result.ledger.slice(0, 18).every((row) => row.kind === "task" && row.dueState === "overdue")).toBe(true);
    expect(result.ledger.at(-1)).toMatchObject({ kind: "event", event: later });
  });

  it("keeps near milestones beyond capped commitments and deduplicates attention by source", () => {
    const milestones = Array.from({ length: 10 }, (_, index) => ({
      id: `milestone-${index}`, track_id: "track", career_direction_id: null, title: `节点 ${index}`,
      starts_on: null, target_date: "2026-10-06", status: "planned", importance: "normal",
    }));
    const attention: NowAttentionItem = { id: `milestone-${milestones[0].id}`, kind: "career_milestone_approaching", priority: "high", title: "节点临近", href: `/career/roadmap?milestone=${milestones[0].id}` };
    const result = buildTodayComposition(workspace({
      career: { upcomingMilestones: milestones }, attention: [attention],
      calendar: { today: [past], upcoming: [tomorrow], connection: null },
    }));
    expect(result.ledger).toHaveLength(10);
    expect(result.ledger.every((row) => row.kind === "commitment")).toBe(true);
    expect(result.hasUnresolvedToday).toBe(true);
    expect(result.isEvening).toBe(false);
  });

  it("preserves critical and distinct review obligations even when they share an overview link", () => {
    const attention: NowAttentionItem[] = [
      { id: "decision-one", kind: "decision_review_due", priority: "critical", title: "复核一", href: "/reviews" },
      { id: "decision-two", kind: "decision_review_due", priority: "medium", title: "复核二", href: "/reviews" },
      { id: "weekly", kind: "weekly_review_due", priority: "low", title: "周复盘", href: "/reviews" },
    ];
    const result = buildTodayComposition(workspace({ attention, calendar: { today: [past], upcoming: [tomorrow], connection: null } }));
    expect(result.ledger).toMatchObject(attention.map((item) => ({ kind: "attention", attention: item })));
    expect(result.isEvening).toBe(false);
  });

  it("deduplicates a lead event across reminders and future rows by record ID, never by title", () => {
    const soon = { ...event("a/b", "2026-10-05T04:15:00Z", "2026-10-05T05:00:00Z"), subject: "相同标题" };
    const other = { ...tomorrow, subject: "相同标题" };
    const result = buildTodayComposition(workspace({
      calendar: { today: [soon, soon], upcoming: [other], connection: null },
      commitments: [{ id: "event-reminder", kind: "event", title: soon.subject, whyNow: "即将开始", constraint: "", href: "/calendar?event=a%2Fb", source: { domain: "calendar", entityId: soon.id, label: "Outlook" } }],
      attention: [{ id: "soon-attention", kind: "calendar_upcoming", priority: "high", title: "即将开始", href: "/calendar?event=a%2Fb" }],
      upcoming: [upcomingEvent(soon, "different-row-id"), upcomingEvent(other)],
    }));
    expect(result.ledger).toEqual([]);
    expect(result.future).toEqual([upcomingEvent(other)]);
    expect(result.lead).toMatchObject({ kind: "event", event: soon });
  });

  it("keeps every supplied unrepresented future row without introducing another display cap", () => {
    const upcoming = Array.from({ length: 19 }, (_, index) => ({ id: `task-${index}`, kind: "task" as const, title: `未来 ${index}`, at: "2026-10-07T10:00:00Z", href: `/tasks?task=${index}` }));
    expect(buildTodayComposition(workspace({ upcoming })).future).toEqual(upcoming);
  });

  it("separates today's past events using local-day overlap and exclusive midnight ends", () => {
    const previousDay = event("previous", "2026-10-04T14:00:00Z", "2026-10-04T16:00:00Z");
    const overnight = event("overnight", "2026-10-04T15:00:00Z", "2026-10-04T17:00:00Z");
    const allDay = event("all-day", "2026-10-04T16:00:00Z", "2026-10-05T16:00:00Z", true);
    const result = buildTodayComposition(workspace({ calendar: { today: [previousDay, overnight, allDay, later], upcoming: [], connection: null } }));
    expect(result.pastEvents).toEqual([overnight]);
    expect(result.ledger).toMatchObject([{ kind: "event", event: allDay }, { kind: "event", event: later }]);
  });

  it("does not infer timing for invalid or missing timestamps and never depends on the render clock", () => {
    const invalid = { ...later, starts_at: "unknown", ends_at: "unknown" };
    const input = workspace({ calendar: { today: [past, invalid], upcoming: [tomorrow], connection: null } });
    expect(buildTodayComposition(input).ledger).toMatchObject([{ kind: "event", event: invalid }]);
    expect(buildTodayComposition(input).isEvening).toBe(false);
    const legacy = { ...input, generatedAt: undefined };
    expect(buildTodayComposition(legacy).pastEvents).toEqual([]);
    expect(buildTodayComposition(legacy).isEvening).toBe(false);
    const expected = buildTodayComposition(input);
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2099-01-01T00:00:00Z"));
      expect(buildTodayComposition(input)).toEqual(expected);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not treat inbox backlog as an urgent obligation and leaves the workspace immutable", () => {
    const input = deepFreeze(workspace({
      calendar: { today: [past], upcoming: [tomorrow], connection: null }, inboxCount: 8,
      commitments: [{ id: "inbox", kind: "inbox", title: "整理 8 条 Inbox", whyNow: "待整理", constraint: "8 条", href: "/inbox", source: { domain: "inbox", entityId: null, label: "Inbox" } }],
    }));
    const before = JSON.stringify(input);
    expect(buildTodayComposition(input).isEvening).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
    expect(input.inboxCount).toBe(8);
  });
});
