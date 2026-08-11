import "server-only";
import {
  completeMicrosoftTodoTask,
  createMicrosoftTodoTask,
  deleteMicrosoftTodoTask,
  reopenMicrosoftTodoTask,
  updateMicrosoftTodoTask,
} from "@/lib/adapters/microsoft-graph/todo";
import type { CreateTaskInput, UpdateTaskPatch } from "./types";

/** Single mutation contract for every Tasks entrypoint; Graph remains authoritative. */
export const microsoftTodoRepository = {
  create(connectionId: string, userId: string, input: CreateTaskInput) {
    return createMicrosoftTodoTask(connectionId, userId, input);
  },
  update(connectionId: string, userId: string, taskId: string, patch: UpdateTaskPatch) {
    return updateMicrosoftTodoTask(connectionId, userId, taskId, patch);
  },
  delete(connectionId: string, userId: string, taskId: string) {
    return deleteMicrosoftTodoTask(connectionId, userId, taskId);
  },
  complete(connectionId: string, userId: string, taskId: string) {
    return completeMicrosoftTodoTask(connectionId, userId, taskId);
  },
  reopen(connectionId: string, userId: string, taskId: string) {
    return reopenMicrosoftTodoTask(connectionId, userId, taskId);
  },
};
