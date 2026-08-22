"use client";

import { Check, CheckCircle2, LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";
import { completeMicrosoftTodoTaskAction } from "@/features/tasks/microsoft-todo";

type CompleteTaskControlProps = {
  taskId: string;
  title: string;
  compact?: boolean;
};

function CompleteTaskSubmit({
  title,
  compact = false,
}: Omit<CompleteTaskControlProps, "taskId">) {
  const { pending } = useFormStatus();

  if (compact) {
    return (
      <button
        type="submit"
        disabled={pending}
        aria-label={pending ? `正在完成 ${title}` : `完成 ${title}`}
        aria-busy={pending}
        className="inline-flex size-7 items-center justify-center rounded-full text-[var(--text-tertiary)] transition-[background-color,color,transform] ui-transition hover:bg-[var(--surface-hover)] hover:text-[var(--accent)] active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] disabled:cursor-wait disabled:text-[var(--accent)]"
      >
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="size-4" aria-hidden="true" />
        )}
        <span className="sr-only" aria-live="polite">{pending ? "正在完成任务…" : ""}</span>
      </button>
    );
  }

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-sm)] px-2 text-[11px] font-medium text-[var(--accent)] transition-[background-color,opacity] ui-transition hover:bg-[var(--accent-soft)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <Check className="size-3.5" aria-hidden="true" />}
      {pending ? "完成中…" : "完成"}
    </button>
  );
}

export function CompleteTaskControl({
  taskId,
  title,
  compact = false,
}: CompleteTaskControlProps) {
  return (
    <form action={completeMicrosoftTodoTaskAction}>
      <input type="hidden" name="task_id" value={taskId} />
      <CompleteTaskSubmit title={title || "未命名任务"} compact={compact} />
    </form>
  );
}
