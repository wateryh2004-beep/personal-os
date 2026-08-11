export const todoStatuses = ["notStarted", "inProgress", "completed", "waitingOnOthers", "deferred"] as const;
export const todoImportances = ["low", "normal", "high"] as const;

export type TodoStatus = (typeof todoStatuses)[number];
export type TodoImportance = (typeof todoImportances)[number];

/** Provider-backed task DTO used by Tasks UI, actions, and agent proposals. */
export type TodoTask = {
  id: string;
  providerTaskId: string;
  todoListId: string;
  title: string;
  bodyText: string | null;
  status: TodoStatus;
  importance: TodoImportance;
  dueAt: string | null;
  completedAt: string | null;
  lastModifiedAt: string | null;
};

export type TodoList = { id: string; displayName: string; isDefault: boolean };

export type CreateTaskInput = {
  todoListId: string;
  title: string;
  bodyText: string | null;
  importance: TodoImportance;
  dueAt: string | null;
};

/** `undefined` leaves a field intact; `null` explicitly clears nullable fields. */
export type UpdateTaskPatch = {
  title?: string;
  bodyText?: string | null;
  importance?: TodoImportance;
  dueAt?: string | null;
};
