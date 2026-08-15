import Link from "next/link";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { completeMicrosoftTodoTaskAction } from "@/features/tasks/microsoft-todo";
import type { NowWorkspace } from "@/features/today/types";
import { buildTodayFocusStack } from "@/features/today/utils";
import { TodaySectionHeader } from "./section-header";

export function TodayFocusStack({ workspace }: { workspace: NowWorkspace }) {
  const stack = buildTodayFocusStack(
    workspace.tasks,
    workspace.attention,
    workspace.nextAction,
  );
  const isEmpty = !stack.tasks.length && !stack.attention.length;

  return (
    <section
      aria-labelledby="today-focus-heading"
      className="rounded-lg border bg-[var(--surface-canvas)]"
    >
      <div className="border-b px-5 py-3.5">
        <TodaySectionHeader href="/tasks" label="打开 Tasks">
          <span id="today-focus-heading">任务与关注</span>
        </TodaySectionHeader>
      </div>
      <div className="px-5 py-4">
        {workspace.availability.tasks === "unavailable" ? (
          <p className="pb-3 text-sm text-[var(--text-secondary)]">
            Tasks 暂不可用，其他关注事项仍显示在下方。
          </p>
        ) : null}
        {stack.tasks.length ? (
          <ul className="divide-y">
            {stack.tasks.map(({ task, label }) => (
              <li key={task.id} className="flex items-center gap-2.5">
                <form action={completeMicrosoftTodoTaskAction}>
                  <input type="hidden" name="task_id" value={task.id} />
                  <button
                    aria-label={`完成 ${task.title}`}
                    className="rounded-full text-[var(--text-tertiary)] hover:text-[var(--accent)]"
                  >
                    <CheckCircle2 className="size-[18px]" aria-hidden="true" />
                  </button>
                </form>
                <Link href="/tasks" className="min-w-0 flex-1 py-2.5 hover:text-[var(--accent)]">
                  <span className="block truncate text-sm font-medium">
                    {task.title || "未命名任务"}
                  </span>
                </Link>
                <span
                  className={`shrink-0 text-[11px] ${label === "已逾期" ? "text-[var(--danger)]" : "text-[var(--text-tertiary)]"}`}
                >
                  {label}
                  {task.importance === "high" ? " · 高" : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {stack.attention.length ? (
          <ul className={stack.tasks.length ? "border-t" : ""}>
            {stack.attention.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="flex gap-2.5 rounded-[var(--radius-sm)] py-2.5 hover:bg-[var(--surface-hover)]"
                >
                  <CircleAlert
                    className="mt-0.5 size-4 shrink-0 text-[var(--warning)]"
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    {item.description ? (
                      <span className="mt-0.5 block truncate text-xs text-[var(--text-secondary)]">
                        {item.description}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        {isEmpty && workspace.availability.tasks === "ready" ? (
          <p className="py-6 text-sm text-[var(--text-secondary)]">
            今天没有到期任务，也没有需要立刻处理的提醒。
          </p>
        ) : null}
      </div>
    </section>
  );
}
