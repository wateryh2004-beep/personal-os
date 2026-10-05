"use client";

import { useWorkspaceResourceLease } from "@/lib/workspace-resource-cache";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, CheckCircle2, LoaderCircle } from "lucide-react";
import { completeMicrosoftTodoTaskAction, reopenMicrosoftTodoTaskAction } from "@/features/tasks/microsoft-todo";
import { todayWorkspaceResource as todayResource } from "@/features/today/workspace-resource";
import { tasksWorkspaceResource as tasksResource } from "@/features/tasks/workspace-resource";
import { useActionFeedback } from "@/components/shared/action-feedback";

type CompleteTaskControlProps = {
  taskId: string;
  title: string;
  compact?: boolean;
  /** Quiet, always 44px Today control; existing callers keep their behaviour. */
  calm?: boolean;
  /** Reopen restores only notStarted, so other statuses must not offer undo. */
  status?: string;
  /** Runs after confirmed feedback, just before the refreshed row can reflow. */
  onCompleted?: (taskId: string) => void;
};

export function CompleteTaskControl({ taskId, title, compact = false, calm = false, status, onCompleted }: CompleteTaskControlProps) {
  const tasksWorkspaceResource = useWorkspaceResourceLease(tasksResource);
  const todayWorkspaceResource = useWorkspaceResourceLease(todayResource);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const [completed, setCompleted] = useState(false);
  const inFlight = useRef(false);
  const operation = useRef(0);
  const mounted = useRef(true);
  const { show } = useActionFeedback();
  const label = title || "未命名任务";
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  function refreshToday() {
    todayWorkspaceResource.invalidate();
    void todayWorkspaceResource.revalidate({ force: true }).catch(() => {});
  }

  function complete() {
    if (inFlight.current || completed) return;
    inFlight.current = true;
    const version = ++operation.current;
    setFailed(false);
    startTransition(async () => {
      try {
        const form = new FormData(); form.set("task_id", taskId);
        await completeMicrosoftTodoTaskAction(form);
        setCompleted(true);
        tasksWorkspaceResource.mutate((workspace) => workspace ? { ...workspace, tasks: workspace.tasks.map((task) => task.id === taskId ? { ...task, status: "completed", completedAt: new Date().toISOString() } : task) } : workspace);
        tasksWorkspaceResource.invalidate();
        window.dispatchEvent(new CustomEvent("personal-os:tasks-mutated", { detail: { actionType: "tasks.complete", proposal: { taskId } } }));
        let undoStarted = false;
        const undo = calm && status === "notStarted" ? () => {
          if (undoStarted) return;
          undoStarted = true;
          operation.current += 1;
          const restore = new FormData(); restore.set("task_id", taskId);
          void reopenMicrosoftTodoTaskAction(restore).then(() => {
            if (mounted.current) { setCompleted(false); setFailed(false); }
            tasksWorkspaceResource.mutate((workspace) => workspace ? { ...workspace, tasks: workspace.tasks.map((task) => task.id === taskId ? { ...task, status: "notStarted", completedAt: null } : task) } : workspace);
            tasksWorkspaceResource.invalidate();
            window.dispatchEvent(new CustomEvent("personal-os:tasks-mutated", { detail: { actionType: "tasks.reopen", proposal: { taskId } } }));
            show({ message: `已恢复：${label}`, tone: "success" });
            refreshToday();
          }).catch(() => {
            // An unconfirmed restore never pretends the original write failed.
            show({ message: `未能确认“${label}”的恢复结果，请刷新核对。`, tone: "error" });
            tasksWorkspaceResource.invalidate();
            refreshToday();
          });
        } : undefined;
        show({ message: calm ? `已完成：${label}` : "任务已完成", tone: "success", ...(undo ? { undo } : {}) });
        const settle = () => {
          if (version !== operation.current) return;
          refreshToday();
          if (mounted.current) onCompleted?.(taskId);
        };
        // Animate only a confirmed result, never an optimistic success. Keep
        // invalidation alive after unmount; the lease protects owner changes.
        if (calm && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) window.setTimeout(settle, 220);
        else settle();
      } catch {
        setFailed(true);
        show({ message: "未能确认完成结果，请刷新核对后重试。", tone: "error" });
      } finally { inFlight.current = false; }
    });
  }

  const state = completed ? "completed" : pending ? "pending" : failed ? "failed" : "idle";
  return <div className={calm ? "today-task-completion flex shrink-0 flex-col items-center" : "flex shrink-0 flex-col items-center"} data-state={state}>
    <button type="button" onClick={complete} disabled={pending || completed} aria-busy={pending && !completed}
      aria-label={completed ? `已完成 ${label}` : pending ? `正在完成 ${label}` : failed ? `重试完成 ${label}` : `完成 ${label}`}
      className={calm
        ? "today-calm-press today-completion-control inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] disabled:cursor-default"
        : compact
          ? "pressable inline-flex size-11 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] disabled:cursor-wait disabled:text-[var(--accent)] sm:size-8"
          : "pressable inline-flex min-h-11 items-center gap-1 rounded-[8px] px-2 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-60 sm:min-h-8"}>
      {calm ? <>
        {!compact ? <span className="today-completion-label">{completed ? "已完成" : pending ? "完成中" : failed ? "重试" : "完成"}</span> : null}
        <svg className="today-completion-ring size-[21px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="today-completion-circle" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.35" />
          <path className="today-completion-check" d="m7.5 12 3 3 6-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" pathLength="1" style={{ opacity: completed ? 1 : 0 }} />
        </svg>
      </> : <>
        {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : compact ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <Check className="size-3.5" aria-hidden="true" />}
        {!compact ? pending ? "完成中…" : completed ? "已完成" : failed ? "重试" : "完成" : null}
      </>}
    </button>
    {failed && (compact || calm) ? <span role="alert" className="text-[10px] text-[var(--danger)]">点此重试</span> : null}
  </div>;
}
