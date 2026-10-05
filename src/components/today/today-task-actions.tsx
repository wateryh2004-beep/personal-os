"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { ArrowUpRight, MoreHorizontal, TimerReset, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useActionFeedback } from "@/components/shared/action-feedback";
import { shiftCalendarCursor } from "@/features/calendar/timezone";
import { deferMicrosoftTodoTaskAction } from "@/features/tasks/microsoft-todo";
import { tasksWorkspaceResource as tasksResource } from "@/features/tasks/workspace-resource";
import { taskRecordHref } from "@/features/today/record-links";
import type { NowTask } from "@/features/today/types";
import { todayWorkspaceResource as todayResource } from "@/features/today/workspace-resource";
import { useWorkspaceResourceLease } from "@/lib/workspace-resource-cache";

type DeferTaskControlProps = {
  task: NowTask;
  timezone: string;
  sheet?: boolean;
  onPendingChange?: (pending: boolean) => void;
  onDeferred?: () => void;
};

/** One guarded write path shared by legacy controls and the quiet task sheet. */
export function DeferTaskControl({ task, timezone, sheet = false, onPendingChange, onDeferred }: DeferTaskControlProps) {
  const tasksWorkspaceResource = useWorkspaceResourceLease(tasksResource);
  const todayWorkspaceResource = useWorkspaceResourceLease(todayResource);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const { show } = useActionFeedback();
  return <div className={sheet ? "w-full" : "contents"}>
    <button
      type="button"
      disabled={pending}
      aria-busy={pending}
      aria-label={`${pending ? "正在延后" : failed ? "重试延后" : "延后到明天"} ${task.title || "未命名任务"}`}
      onClick={() => {
        if (inFlight.current) return;
        inFlight.current = true;
        onPendingChange?.(true);
        startTransition(async () => {
          setFailed(false);
          let succeeded = false;
          try {
            const form = new FormData();
            form.set("task_id", task.id);
            const dueAt = shiftCalendarCursor(new Date(), timezone, 1).toISOString();
            form.set("due_at", dueAt);
            await deferMicrosoftTodoTaskAction(form);
            tasksWorkspaceResource.mutate((workspace) => workspace ? { ...workspace, tasks: workspace.tasks.map((row) => row.id === task.id ? { ...row, dueAt } : row) } : workspace);
            tasksWorkspaceResource.invalidate();
            show({ message: "已延后到明天", tone: "success" });
            todayWorkspaceResource.invalidate();
            void todayWorkspaceResource.revalidate({ force: true }).catch(() => {});
            succeeded = true;
          } catch {
            setFailed(true);
            show({ message: "未能确认延后结果，请刷新核对后重试。", tone: "error" });
          } finally {
            inFlight.current = false;
            onPendingChange?.(false);
          }
          if (succeeded) onDeferred?.();
        });
      }}
      className={sheet
        ? "today-calm-press flex min-h-14 w-full items-center gap-3 border-t border-[var(--separator)] py-3 text-left text-[15px] text-[var(--text-primary)] disabled:opacity-50"
        : "pressable inline-flex min-h-11 items-center gap-1 rounded-[8px] px-1.5 text-[12px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-50 sm:min-h-8"}
    >
      <TimerReset className={sheet ? "size-[18px] shrink-0 text-[var(--text-secondary)]" : "size-3.5"} aria-hidden="true" />
      {pending ? "延后中…" : failed ? "重试延后" : sheet ? "延后到明天" : "明天"}
    </button>
    {sheet && failed ? <p role="alert" className="pb-3 text-[13px] leading-5 text-[var(--danger)]">结果尚未确认，任务仍保留。请刷新核对后重试。</p> : null}
  </div>;
}

export function TodayTaskActions({ task, timezone }: { task: NowTask; timezone: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const title = useRef<HTMLHeadingElement>(null);
  const taskTitle = task.title || "未命名任务";
  const changePending = (value: boolean) => { inFlight.current = value; setPending(value); };
  const close = () => { if (!inFlight.current) setOpen(false); };
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label={`更多操作：${taskTitle}`} aria-haspopup="dialog" aria-expanded={open} className="today-calm-press inline-flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]">
      <MoreHorizontal className="size-[18px]" aria-hidden="true" />
    </button>
    <Sheet open={open} canDismiss={() => !inFlight.current} onOpenChange={(value) => { if (!value) close(); }}>
      <SheetContent side="bottom" showCloseButton={false} className="today-calm-sheet mx-auto max-h-[85dvh] w-full max-w-xl gap-0 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]" style={{ maxHeight: "min(85dvh, var(--app-viewport-height, 100dvh))", bottom: "max(0px, calc(100dvh - var(--app-viewport-height, 100dvh)))" }}
        onOpenAutoFocus={(event) => { event.preventDefault(); title.current?.focus({ preventScroll: true }); }}
        onEscapeKeyDown={(event) => { if (inFlight.current) event.preventDefault(); }}
        onPointerDownOutside={(event) => { if (inFlight.current) event.preventDefault(); }}>
        <SheetHeader className="px-0 pb-4 pt-5 pr-11">
          <SheetTitle ref={title} className="break-words text-[18px] font-medium leading-7">{taskTitle}</SheetTitle>
          <SheetDescription>任务操作</SheetDescription>
          <button type="button" disabled={pending} onClick={close} aria-label="关闭任务操作" className="absolute right-2 top-3 inline-flex size-11 items-center justify-center rounded-full text-[var(--text-secondary)] disabled:opacity-50"><X className="size-5" aria-hidden="true" /></button>
        </SheetHeader>
        <Link href={taskRecordHref(task.id)} aria-disabled={pending || undefined} tabIndex={pending ? -1 : undefined} onClick={(event) => { if (inFlight.current) event.preventDefault(); else close(); }} className="today-calm-press flex min-h-14 items-center gap-3 border-t border-[var(--separator)] py-3 text-[15px] text-[var(--accent)] aria-disabled:opacity-50"><ArrowUpRight className="size-[18px]" aria-hidden="true" />打开任务</Link>
        {task.status !== "completed" && task.status !== "unavailable" ? <DeferTaskControl task={task} timezone={timezone} sheet onPendingChange={changePending} onDeferred={close} /> : null}
      </SheetContent>
    </Sheet>
  </>;
}
