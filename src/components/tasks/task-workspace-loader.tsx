"use client";

import { TasksShell } from "./tasks-workspace-skeleton";
import { MicrosoftDeviceConnect } from "@/components/calendar/microsoft-device-connect";
import { TaskWorkspace } from "@/components/tasks/task-workspace";
import type { TaskDayBounds } from "@/features/tasks/task-view";
import {
  tasksWorkspaceResource,
} from "@/features/tasks/workspace-resource";
import { useWorkspaceResource } from "@/lib/workspace-resource-cache";
import { WorkspaceReadError } from "@/components/shared/workspace-read-error";

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
  initialDayBounds,
  initialCreateOpen = false,
  initialTaskId,
}: {
  initialDayBounds: TaskDayBounds;
  initialCreateOpen?: boolean;
  initialTaskId?: string;
}) {
  const snapshot = useWorkspaceResource(tasksWorkspaceResource, "tasks");

  const data = snapshot.data;
  if (!data && snapshot.error) return <WorkspaceReadError resource={tasksWorkspaceResource} />;
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
      initialDayBounds={initialDayBounds}
      initialCreateOpen={initialCreateOpen}
      initialTaskId={initialTaskId}
    />
  );
}