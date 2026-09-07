import type { TodoList, TodoTask } from "./types";

export type TaskView = "today" | "upcoming" | "all" | "completed";

export type TaskDayBounds = {
  startMs: number;
  endMs: number;
};

type ViewOptions = {
  view: TaskView;
  listId: string | null;
  dayBounds: TaskDayBounds;
};

const timestamp = (value: string | null) => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const highPriorityRank = (task: TodoTask) => (task.importance === "high" ? 0 : 1);

export function getLocalTaskDayBounds(now = new Date()): TaskDayBounds {
  return {
    startMs: new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(),
    endMs: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime(),
  };
}

export function resolveQuickAddTarget(
  lists: TodoList[],
  selectedListId: string | null,
): TodoList | null {
  if (selectedListId) {
    const selected = lists.find((list) => list.id === selectedListId);
    if (selected) return selected;
  }
  return lists.find((list) => list.isDefault) ?? lists[0] ?? null;
}

export function selectTasksForView(
  rows: TodoTask[],
  { view, listId, dayBounds }: ViewOptions,
): TodoTask[] {
  const candidates = rows
    .map((task, index) => ({
      task,
      index,
      dueAtMs: timestamp(task.dueAt),
      completedAtMs: timestamp(task.completedAt),
    }))
    .filter(({ task, dueAtMs }) => {
      if (!task.title || (listId && task.todoListId !== listId)) return false;
      if (view === "completed") return task.status === "completed";
      if (task.status === "completed") return false;
      if (view === "today") return dueAtMs !== null && dueAtMs < dayBounds.endMs;
      if (view === "upcoming") return dueAtMs !== null && dueAtMs >= dayBounds.endMs;
      return true;
    });

  if (view === "all") return candidates.map(({ task }) => task);

  candidates.sort((left, right) => {
    if (view === "completed") {
      if (left.completedAtMs === null && right.completedAtMs !== null) return 1;
      if (left.completedAtMs !== null && right.completedAtMs === null) return -1;
      if (left.completedAtMs !== null && right.completedAtMs !== null) {
        const completionOrder = right.completedAtMs - left.completedAtMs;
        if (completionOrder !== 0) return completionOrder;
      }
      return left.index - right.index;
    }

    if (view === "upcoming") {
      const dueOrder = (left.dueAtMs ?? Number.POSITIVE_INFINITY) - (right.dueAtMs ?? Number.POSITIVE_INFINITY);
      if (dueOrder !== 0) return dueOrder;
      const priorityOrder = highPriorityRank(left.task) - highPriorityRank(right.task);
      return priorityOrder || left.index - right.index;
    }

    const leftOverdue = left.dueAtMs !== null && left.dueAtMs < dayBounds.startMs;
    const rightOverdue = right.dueAtMs !== null && right.dueAtMs < dayBounds.startMs;
    if (leftOverdue !== rightOverdue) return leftOverdue ? -1 : 1;

    if (!leftOverdue && left.dueAtMs !== null && right.dueAtMs !== null) {
      const dueOrder = left.dueAtMs - right.dueAtMs;
      if (dueOrder !== 0) return dueOrder;
    }

    const priorityOrder = highPriorityRank(left.task) - highPriorityRank(right.task);
    return priorityOrder || left.index - right.index;
  });

  return candidates.map(({ task }) => task);
}
