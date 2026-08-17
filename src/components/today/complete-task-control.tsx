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
        className="inline-flex size-9 items-center justify-center rounded-full text-[var(--text-tertiary)] transition-[background-color,color,transform] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-wait disabled:bg-[var(--accent-soft)] disabled:text-[var(--accent)]"
      >
        {pending ? (
          <LoaderCircle className="size-[18px] animate-spin" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="size-[18px]" aria-hidden="true" />
        )}
        <span className="sr-only" aria-live="polite">
          {pending ? "正在完成任务…" : ""}
        </span>
      </button>
    );
  }

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] px-3 text-xs font-medium text-white shadow-sm transition-[opacity,transform] hover:brightness-95 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-wait disabled:opacity-75"
    >
      {pending ? (
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Check className="size-3.5" aria-hidden="true" />
      )}
      {pending ? "正在完成…" : "完成"}
    </button>
  );
}

/** Shows an immediate local acknowledgement while the provider-backed action finishes. */
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
