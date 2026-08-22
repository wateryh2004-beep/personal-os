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
        <div className="ui-skeleton-shimmer h-8 w-24 rounded-[7px]" />
        <div className="mt-4 flex gap-5">
          <div className="ui-skeleton-shimmer h-3 w-8 rounded-full" />
          <div className="ui-skeleton-shimmer h-3 w-16 rounded-full" />
          <div className="ui-skeleton-shimmer h-3 w-8 rounded-full" />
        </div>
      </div>
      <div className="mx-auto mt-8 max-w-[760px]">
        <div className="ui-skeleton-shimmer h-3 w-24 rounded-full" />
        <div className="mt-4 border-t border-[var(--separator)]">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="flex h-[66px] items-center gap-3 border-b border-[var(--separator)]">
              <div className="ui-skeleton-shimmer size-[18px] rounded-full" />
              <div className="min-w-0 flex-1">
                <div className="ui-skeleton-shimmer h-3.5 w-[min(320px,72%)] rounded-full" />
                <div className="ui-skeleton-shimmer mt-2 h-2.5 w-24 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WorkspaceMessage({ tone, title, children }: { tone: "danger" | "warning"; title?: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-[760px] px-5 py-8 sm:px-7">
      {title ? <h1 className="text-[28px] font-semibold tracking-[-0.035em] text-[var(--text-primary)]">{title}</h1> : null}
      <div className="mt-5 border-t border-[var(--separator)] pt-5">
        <p className={`border-l-2 pl-3 text-[13px] leading-6 text-[var(--text-secondary)] ${tone === "danger" ? "border-[var(--danger)]" : "border-[var(--warning)]"}`}>
          {children}
        </p>
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
    return <WorkspaceMessage tone="danger" title="任务">无法读取 Microsoft To Do 缓存。请检查数据库连接。</WorkspaceMessage>;
  }
  if (data.schemaMissing) {
    return <WorkspaceMessage tone="warning">Microsoft To Do 数据库尚未升级。部署后请应用本次 migration，才能同步任务。</WorkspaceMessage>;
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
