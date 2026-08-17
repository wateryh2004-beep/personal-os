"use client";

import { createWorkspaceResource } from "@/lib/workspace-resource-cache";
import type { TodoList, TodoTask } from "./types";

export type TasksWorkspaceData = {
  connection: { id: string; status: string; oauth_connected_at: string | null; last_error_code: string | null } | null;
  lists: TodoList[];
  tasks: TodoTask[];
  unavailable: boolean;
  schemaMissing: boolean;
};

async function readTasksWorkspace(): Promise<TasksWorkspaceData> {
  const response = await fetch("/api/tasks/workspace", { cache: "no-store", credentials: "same-origin" });
  const body = await response.json() as TasksWorkspaceData & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "tasks_workspace_unavailable");
  return body;
}

export const tasksWorkspaceResource = createWorkspaceResource(
  "tasks:workspace-data",
  readTasksWorkspace,
  45_000,
);
