import { describe, expect, it } from "vitest";
import { priorityDueLabel, todayPresentation } from "@/features/today/presentation";
import type { NowWorkspace } from "@/features/today/types";

const task = (id: string, due_at: string | null = "2026-10-01T08:00:00Z") => ({ id, title: id, due_at, status: "notStarted", importance: "normal" });
const priority = task("selected");
const due = task("due");
const other = task("other");
const commitment = (row: ReturnType<typeof task>) => ({ id: `task-${row.id}`, kind: "task" as const, title: row.title, whyNow: "今天到期", constraint: "今天", href: `/tasks?task=${row.id}`, source: { domain: "tasks" as const, entityId: row.id, label: "Microsoft To Do" }, task: row });

describe("Today presents one primary action per task", () => {
  it("keeps explicit priorities, removes their duplicate reminders, and shows remaining work once", () => {
    const workspace = {
      focus: { date: "2026-10-01", selectedIds: [priority.id], selectedTasks: [priority], candidates: [], available: true },
      commitments: [commitment(priority), commitment(due)],
      tasks: { overdue: [], today: [priority, due, other], upcoming: [] },
      attention: [],
      calendar: { today: [] },
      nextAction: { kind: "none" },
    } as unknown as NowWorkspace;
    const result = todayPresentation(workspace);
    expect(result.commitments.map((item) => item.task?.id)).toEqual([due.id]);
    expect(result.remainingWorkspace.tasks.today.map((item) => item.id)).toEqual([other.id]);
    expect(result.priorityReminderCount).toBe(1);
    expect(workspace.focus?.selectedIds).toEqual([priority.id]);
    expect(workspace.tasks.today).toEqual([priority, due, other]);
  });

  it("does not promote undated tasks or remove their explicit selection", () => {
    const undated = task("undated", null);
    expect(priorityDueLabel(undated, "2026-10-01", "Asia/Shanghai")).toBe("无截止日期");
    expect(priorityDueLabel({ ...undated, status: "completed" }, "2026-10-01", "Asia/Shanghai")).toBe("今天已完成");
  });

  it("moves only visible calendar reminders into the timeline and preserves other events", () => {
    const event = (index: number) => ({ id: `event-${index}`, subject: `日程 ${index}`, starts_at: `2026-10-01T${String(index + 1).padStart(2, "0")}:00:00Z`, ends_at: `2026-10-01T${String(index + 2).padStart(2, "0")}:00:00Z`, is_all_day: false, location_name: null });
    const events = Array.from({ length: 7 }, (_, index) => event(index));
    const eventReminder = (index: number) => ({ id: `reminder-${index}`, kind: "event", title: `日程 ${index}`, source: { domain: "calendar", entityId: events[index].id, label: "Calendar" }, href: `/calendar?event=${events[index].id}` });
    const workspace = { commitments: [eventReminder(0), eventReminder(6)], tasks: { overdue: [], today: [], upcoming: [] }, calendar: { today: events }, nextAction: { kind: "none" }, attention: [] } as unknown as NowWorkspace;
    const result = todayPresentation(workspace);
    expect(result.scheduleReminderCount).toBe(1);
    expect(result.commitments.map((item) => item.id)).toEqual(["reminder-6"]);
  });

  it("keeps Inbox in the workspace without treating its backlog as urgent work", () => {
    const inbox = { id: "inbox", kind: "inbox", title: "整理 Inbox", href: "/inbox", source: { domain: "inbox", entityId: null, label: "Inbox" } };
    const workspace = {
      commitments: [inbox, commitment(due)],
      inboxCount: 3,
      tasks: { overdue: [], today: [due], upcoming: [] },
      calendar: { today: [] },
      nextAction: { kind: "inbox" },
      attention: [],
    } as unknown as NowWorkspace;
    const result = todayPresentation(workspace);
    expect(result.commitments).toEqual([commitment(due)]);
    expect(result.remainingWorkspace.inboxCount).toBe(3);
    expect(workspace.commitments).toEqual([inbox, commitment(due)]);
    expect(workspace.nextAction.kind).toBe("inbox");
  });

  it("describes due status using the owner's calendar date", () => {
    expect(priorityDueLabel(task("one", "2026-09-30T20:00:00Z"), "2026-10-01", "Asia/Shanghai")).toBe("今天到期");
    expect(priorityDueLabel(task("one", "2026-09-29T20:00:00Z"), "2026-10-01", "Asia/Shanghai")).toContain("已逾期");
    expect(priorityDueLabel(task("one", "2026-10-02T08:00:00Z"), "2026-10-01", "Asia/Shanghai")).toBe("10/02 到期");
  });
});
