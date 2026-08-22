import Link from "next/link";
import { CircleAlert } from "lucide-react";
import type { NowWorkspace } from "@/features/today/types";
import { buildTodayFocusStack } from "@/features/today/utils";
import { CompleteTaskControl } from "./complete-task-control";
import { TodaySectionHeader } from "./section-header";

export function TodayFocusStack({ workspace }: { workspace: NowWorkspace }) {
  const stack = buildTodayFocusStack(workspace.tasks, workspace.attention, workspace.nextAction);
  const isEmpty = !stack.tasks.length && !stack.attention.length;

  return (
    <section aria-labelledby="today-focus-heading">
      <TodaySectionHeader href="/tasks" label="Tasks">
        <span id="today-focus-heading">任务与关注</span>
      </TodaySectionHeader>

      <div className="mt-3 border-t border-[var(--separator)] pt-2">
        {workspace.availability.tasks === "unavailable" ? (
          <p className="pb-2 pt-1 text-[11px] leading-5 text-[var(--text-secondary)]">
            Tasks 暂不可用，其他关注事项仍显示在下方。
          </p>
        ) : null}

        {stack.tasks.length ? (
          <ul className="divide-y divide-[var(--separator)]">
            {stack.tasks.map(({ task, label }) => (
              <li key={task.id} className="flex min-h-11 items-center gap-1.5">
                <CompleteTaskControl taskId={task.id} title={task.title} compact />
                <Link href="/tasks" className="min-w-0 flex-1 py-2 group">
                  <span className="block truncate text-[13px] font-medium text-[var(--text-primary)] transition-colors ui-transition group-hover:text-[var(--accent)]">
                    {task.title || "未命名任务"}
                  </span>
                </Link>
                <span className={`shrink-0 text-[10px] tabular-nums ${label === "已逾期" ? "text-[var(--danger)]" : "text-[var(--text-tertiary)]"}`}>
                  {label}
                  {task.importance === "high" ? " · 高" : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {stack.attention.length ? (
          <ul className={stack.tasks.length ? "border-t border-[var(--separator)] pt-1" : ""}>
            {stack.attention.map((item) => (
              <li key={item.id}>
                <Link href={item.href} className="group flex gap-2.5 py-2.5">
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-[var(--warning)]" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-medium text-[var(--text-primary)] transition-colors ui-transition group-hover:text-[var(--accent)]">
                      {item.title}
                    </span>
                    {item.description ? (
                      <span className="mt-0.5 block truncate text-[11px] leading-5 text-[var(--text-secondary)]">
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
          <p className="py-5 text-[12px] leading-5 text-[var(--text-secondary)]">
            今天没有到期任务，也没有需要立刻处理的提醒。
          </p>
        ) : null}
      </div>
    </section>
  );
}
