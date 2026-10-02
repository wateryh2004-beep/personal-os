"use client";

import { useWorkspaceResourceLease } from "@/lib/workspace-resource-cache";

import { useRef, useState, useTransition } from "react";
import { Check, CheckCircle2, LoaderCircle } from "lucide-react";
import { completeMicrosoftTodoTaskAction } from "@/features/tasks/microsoft-todo";
import { todayWorkspaceResource as todayResource } from "@/features/today/workspace-resource";
import { tasksWorkspaceResource as tasksResource } from "@/features/tasks/workspace-resource";
import { useActionFeedback } from "@/components/shared/action-feedback";

type CompleteTaskControlProps = { taskId: string; title: string; compact?: boolean };

export function CompleteTaskControl({ taskId, title, compact = false }: CompleteTaskControlProps) {
  const tasksWorkspaceResource = useWorkspaceResourceLease(tasksResource);
  const todayWorkspaceResource = useWorkspaceResourceLease(todayResource);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const [completed, setCompleted] = useState(false);
  const inFlight = useRef(false);
  const { show } = useActionFeedback();
  const label = title || "未命名任务";

  function complete() {
    if (inFlight.current || completed) return;
    inFlight.current = true;
    setFailed(false);
    startTransition(async () => {
      try {
        const form = new FormData(); form.set("task_id", taskId);
        await completeMicrosoftTodoTaskAction(form);
        setCompleted(true);
        tasksWorkspaceResource.mutate((workspace) => workspace ? { ...workspace, tasks: workspace.tasks.map((task) => task.id === taskId ? { ...task, status: "completed", completedAt: new Date().toISOString() } : task) } : workspace);
        tasksWorkspaceResource.invalidate();
        window.dispatchEvent(new CustomEvent("personal-os:tasks-mutated", { detail: { actionType: "tasks.complete", proposal: { taskId } } }));
        show({ message: "任务已完成", tone: "success" });
        todayWorkspaceResource.invalidate();
        void todayWorkspaceResource.revalidate({ force: true }).catch(() => {});
      } catch {
        setFailed(true);
        show({ message: "未能确认完成结果，请刷新核对后重试。", tone: "error" });
      } finally { inFlight.current = false; }
    });
  }

  return <div className="flex shrink-0 flex-col items-center">
    <button type="button" onClick={complete} disabled={pending || completed} aria-busy={pending}
      aria-label={pending ? `正在完成 ${label}` : completed ? `已完成 ${label}` : failed ? `重试完成 ${label}` : `完成 ${label}`}
      className={compact
        ? "pressable inline-flex size-11 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] disabled:cursor-wait disabled:text-[var(--accent)] sm:size-8"
        : "pressable inline-flex min-h-11 items-center gap-1 rounded-[8px] px-2 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-60 sm:min-h-8"}>
      {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : compact ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <Check className="size-3.5" aria-hidden="true" />}
      {!compact ? pending ? "完成中…" : completed ? "已完成" : failed ? "重试" : "完成" : null}
    </button>
    {failed && compact ? <span role="alert" className="text-[10px] text-[var(--danger)]">点此重试</span> : null}
  </div>;
}
