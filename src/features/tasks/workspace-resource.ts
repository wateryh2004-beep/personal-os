"use client";

import { createWorkspaceResource, readWorkspaceResponse } from "@/lib/workspace-resource-cache";
import type { TodoList, TodoTask } from "./types";

export type TasksWorkspaceData = {
  connection: { id: string; status: string; oauth_connected_at: string | null; last_error_code: string | null } | null;
  lists: TodoList[];
  tasks: TodoTask[];
  unavailable: boolean;
  schemaMissing: boolean;
};

async function readTasksWorkspace(signal?: AbortSignal): Promise<TasksWorkspaceData> {
  return readWorkspaceResponse<TasksWorkspaceData>("/api/tasks/workspace", signal);
}

export const tasksWorkspaceResource = createWorkspaceResource(
  "tasks:workspace-data",
  readTasksWorkspace,
  45_000,
);
