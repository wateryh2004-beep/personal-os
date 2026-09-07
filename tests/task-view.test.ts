import { describe, expect, it } from "vitest";
import {
  resolveQuickAddTarget,
  selectTasksForView,
  type TaskDayBounds,
} from "../src/features/tasks/task-view";
import type { TodoList, TodoTask } from "../src/features/tasks/types";

const dayBounds: TaskDayBounds = {
  startMs: Date.parse("2026-09-07T00:00:00.000Z"),
  endMs: Date.parse("2026-09-08T00:00:00.000Z"),
};

const lists: TodoList[] = [
  { id: "11111111-1111-4111-8111-111111111111", displayName: "默认任务", isDefault: true },
  { id: "22222222-2222-4222-8222-222222222222", displayName: "工作", isDefault: false },
];

function task(
  id: string,
  overrides: Partial<TodoTask> = {},
): TodoTask {
  return {
    id,
    providerTaskId: id,
    todoListId: lists[0].id,
    title: id,
    bodyText: null,
    status: "notStarted",
    importance: "normal",
    dueAt: null,
    completedAt: null,
    lastModifiedAt: null,
    ...overrides,
  };
}

describe("resolveQuickAddTarget", () => {
  it("uses the currently selected Microsoft To Do list", () => {
    expect(resolveQuickAddTarget(lists, lists[1].id)).toEqual(lists[1]);
  });

  it("falls back to the default Microsoft To Do list for all lists", () => {
    expect(resolveQuickAddTarget(lists, null)).toEqual(lists[0]);
  });
});

describe("selectTasksForView", () => {
  it("orders Today as overdue, then due time, then high priority without mutating rows", () => {
    const rows = [
      task("today-normal", { dueAt: "2026-09-07T09:00:00.000Z" }),
      task("overdue-normal", { dueAt: "2026-09-06T12:00:00.000Z" }),
      task("today-high-later", { dueAt: "2026-09-07T10:00:00.000Z", importance: "high" }),
      task("overdue-high", { dueAt: "2026-09-05T12:00:00.000Z", importance: "high" }),
      task("today-high", { dueAt: "2026-09-07T09:00:00.000Z", importance: "high" }),
      task("no-due"),
    ];
    const originalOrder = rows.map(({ id }) => id);

    const result = selectTasksForView(rows, { view: "today", listId: null, dayBounds });

    expect(result.map(({ id }) => id)).toEqual([
      "overdue-high",
      "overdue-normal",
      "today-high",
      "today-normal",
      "today-high-later",
    ]);
    expect(rows.map(({ id }) => id)).toEqual(originalOrder);
  });

  it("orders Upcoming by dueAt and high priority for equal dueAt", () => {
    const rows = [
      task("later", { dueAt: "2026-09-10T09:00:00.000Z" }),
      task("same-normal", { dueAt: "2026-09-09T09:00:00.000Z" }),
      task("same-high", { dueAt: "2026-09-09T09:00:00.000Z", importance: "high" }),
      task("no-due"),
    ];

    expect(
      selectTasksForView(rows, { view: "upcoming", listId: null, dayBounds }).map(({ id }) => id),
    ).toEqual(["same-high", "same-normal", "later"]);
  });

  it("orders Completed by most recent completion and keeps missing timestamps stable at the end", () => {
    const rows = [
      task("missing-a", { status: "completed" }),
      task("older", { status: "completed", completedAt: "2026-09-05T09:00:00.000Z" }),
      task("newer", { status: "completed", completedAt: "2026-09-07T09:00:00.000Z" }),
      task("missing-b", { status: "completed" }),
    ];

    expect(
      selectTasksForView(rows, { view: "completed", listId: null, dayBounds }).map(({ id }) => id),
    ).toEqual(["newer", "older", "missing-a", "missing-b"]);
  });

  it("keeps All stable and applies the existing list filter locally", () => {
    const rows = [
      task("default-a"),
      task("work", { todoListId: lists[1].id }),
      task("default-b"),
      task("completed", { status: "completed", completedAt: "2026-09-07T09:00:00.000Z" }),
    ];

    expect(
      selectTasksForView(rows, { view: "all", listId: null, dayBounds }).map(({ id }) => id),
    ).toEqual(["default-a", "work", "default-b"]);
    expect(
      selectTasksForView(rows, { view: "all", listId: lists[1].id, dayBounds }).map(({ id }) => id),
    ).toEqual(["work"]);
  });
});
