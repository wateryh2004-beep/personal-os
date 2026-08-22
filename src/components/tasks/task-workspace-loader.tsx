"use client";

import { useEffect, useSyncExternalStore } from "react";
import { MicrosoftDeviceConnect } from "@/components/calendar/microsoft-device-connect";
import { TaskWorkspace } from "@/components/tasks/task-workspace";
import { perfMark, perfMeasure } from "@/lib/perf";
import {
  tasksWorkspaceResource,
  type TasksWorkspaceData,
} from "@/features/tasks/workspace-resource";
import { useWorkspaceResourceLifecycle } from "@/lib/workspace-resource-cache";

function TasksShell() {
  return (
    <section
      aria-busy="true"
      className="h-[calc(var(--app-viewport-height)-var(--toolbar-height)-var(--tab-bar-height))] overflow-hidden bg-[var(--surface-canvas)] px-5 pt-5 sm:px-7 lg:px-10"
    >
      <div className="mx-auto max-w-[980px]">
        <div className="h-8 w-24 rounded-[var(--radius-sm)] bg-[var(--surface-hover)]" />
        <div className="mt-4 flex gap-5">
          <div className="h-4 w-8 rounded bg-[var(--surface-hover)]" />
          <div className="h-4 w-16 rounded bg-[var(--surface-hover)]" />
          <div className="h-4 w-8 rounded bg-[var(--surface-hover)]" />
        </div>
      </div>
      <div className="mx-auto mt-8 max-w-[760px]">
        <div className="h-8 w-24 rounded bg-[var(--surface-hover)]" />
        <div className="mt-3 border-t border-[var(--border-subtle)]">
          {[0, 1, 2].map((item) => (
            <div key={item} className="flex h-[66px] items-center gap-3 border-b border-[var(--border-subtle)]">
              <div className="size-[18px] rounded-full border border-[var(--border-strong)]" />
              <div className="min-w-0 flex-1">
                <div className="h-3.5 w-[min(320px,72%)] rounded bg-[var(--surface-hover)]" />
                <div className="mt-2 h-2.5 w-24 rounded bg-[var(--surface-hover)]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function TaskWorkspaceLoader({
  initialWorkspace,
  initialCreateOpen = false,
  initialTaskId,
}: {
  initialWorkspace: TasksWorkspaceData;
  initialCreateOpen?: boolean;
  initialTaskId?: string;
}) {
  const snapshot = useSyncExternalStore(
    tasksWorkspaceResource.subscribe,
    tasksWorkspaceResource.get,
    tasksWorkspaceResource.get,
  );
  useWorkspaceResourceLifecycle(tasksWorkspaceResource);

  useEffect(() => {
    const hadCachedData = tasksWorkspaceResource.get().data !== undefined;
    tasksWorkspaceResource.set(initialWorkspace);
    perfMark("workspace-visible", {
      workspace: "tasks",
      cached: hadCachedData,
      source: "rsc",
    });
    void tasksWorkspaceResource
      .revalidate()
      .then(() => perfMeasure("workspace-data-ready", "navigation-click", { workspace: "tasks" }))
      .catch(() => {});
  }, [initialWorkspace]);

  const data = snapshot.data ?? initialWorkspace;
  if (!data) return <TasksShell />;
  if (data.unavailable) {
    return (
      <section className="px-6 py-8">
        <h1 className="text-2xl font-semibold">任务</h1>
        <p className="mt-4 border-l-2 border-[var(--danger)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          无法读取 Microsoft To Do 缓存。请检查数据库连接。
        </p>
      </section>
    );
  }
  if (data.schemaMissing) {
    return (
      <section className="px-6 py-8">
        <p className="border-l-2 border-[var(--warning)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          Microsoft To Do 数据库尚未升级。部署后请应用本次 migration，才能同步任务。
        </p>
      </section>
    );
  }
  if (!data.connection || data.connection.last_error_code === "calendar_not_connected") {
    return <MicrosoftDeviceConnect reconnect={Boolean(data.connection)} />;
  }
  return (
    <TaskWorkspace
      lists={data.lists}
      tasks={data.tasks}
      initialCreateOpen={initialCreateOpen}
      initialTaskId={initialTaskId}
    />
  );
}
