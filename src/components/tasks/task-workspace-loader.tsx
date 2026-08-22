"use client";

import { useEffect, useSyncExternalStore } from "react";
import { MicrosoftDeviceConnect } from "@/components/calendar/microsoft-device-connect";
import { TaskWorkspace } from "@/components/tasks/task-workspace";
import { perfMark, perfMeasure } from "@/lib/perf";
import { tasksWorkspaceResource, type TasksWorkspaceData } from "@/features/tasks/workspace-resource";
import { useWorkspaceResourceLifecycle } from "@/lib/workspace-resource-cache";

function TasksShell() {
  return <section aria-busy="true" className="flex h-[calc(var(--app-viewport-height)-var(--toolbar-height)-var(--tab-bar-height))] min-h-0 overflow-hidden bg-[var(--surface-canvas)]"><div className="flex min-w-0 flex-1 flex-col"><header className="flex min-h-14 items-center justify-between border-b px-4"><div className="h-5 w-44 rounded bg-[var(--surface-hover)]" /><div className="h-8 w-24 rounded bg-[var(--surface-hover)]" /></header><div className="divide-y"><div className="h-14 bg-[var(--surface-hover)]/60" /><div className="h-14" /><div className="h-14 bg-[var(--surface-hover)]/60" /></div></div></section>;
}

export function TaskWorkspaceLoader({ initialWorkspace, initialCreateOpen = false, initialTaskId }: { initialWorkspace: TasksWorkspaceData; initialCreateOpen?: boolean; initialTaskId?: string }) {
  const snapshot = useSyncExternalStore(tasksWorkspaceResource.subscribe, tasksWorkspaceResource.get, tasksWorkspaceResource.get);
  useWorkspaceResourceLifecycle(tasksWorkspaceResource);
  useEffect(() => {
    if (!tasksWorkspaceResource.get().data) tasksWorkspaceResource.set(initialWorkspace);
    perfMark("workspace-visible", { workspace: "tasks", cached: Boolean(tasksWorkspaceResource.get().data) });
    void tasksWorkspaceResource.revalidate().then(() => perfMeasure("workspace-data-ready", "navigation-click", { workspace: "tasks" })).catch(() => {});
  // The resource owns deduplication; the server snapshot changes only on a
  // new route payload, when it is safe to seed again if needed.
  }, [initialWorkspace]);

  const data = snapshot.data ?? initialWorkspace;
  if (!data) return <TasksShell />;
  if (data.unavailable) return <section><h1 className="text-2xl font-semibold">Tasks</h1><p className="mt-4 border-l-2 border-red-700 bg-red-50 px-3 py-2 text-sm text-red-800">无法读取 Microsoft To Do 缓存。请检查数据库连接。</p></section>;
  if (data.schemaMissing) return <section><p className="border-l-2 border-amber-600 bg-amber-50 px-3 py-2 text-sm text-amber-800">Microsoft To Do 数据库尚未升级。部署后请应用本次 migration，才能同步任务。</p></section>;
  if (!data.connection || data.connection.last_error_code === "calendar_not_connected") return <MicrosoftDeviceConnect reconnect={Boolean(data.connection)} />;
  return <TaskWorkspace lists={data.lists} tasks={data.tasks} initialCreateOpen={initialCreateOpen} initialTaskId={initialTaskId} />;
}
