import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { completeMicrosoftTodoTaskAction } from "@/features/tasks/microsoft-todo";
import type { NowNextAction } from "@/features/today/types";

function formatTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function actionCopy(next: Exclude<NowNextAction, { kind: "none" }>) {
  if (next.kind === "event") return "打开 Calendar";
  if (next.kind === "career_milestone") return "打开职业路线";
  if (next.kind === "inbox") return "整理 Inbox";
  return "打开 Tasks";
}

export function NextActionCard({
  next,
  timezone,
}: {
  next: NowNextAction;
  timezone: string;
}) {
  const title =
    next.kind === "task"
      ? next.task.title
      : next.kind === "event"
        ? next.event.subject
        : next.kind === "career_milestone"
          ? next.milestone.title
          : next.kind === "inbox"
            ? `整理 ${next.count} 条 Inbox`
            : "当前没有必须处理的事项";
  const detail =
    next.kind === "event"
      ? `${next.event.is_all_day ? "全天" : `${formatTime(next.event.starts_at, timezone)}–${formatTime(next.event.ends_at, timezone)}`}${next.event.location_name ? ` · ${next.event.location_name}` : ""}`
      : next.kind === "task" && next.task.importance === "high"
        ? "高优先级"
        : null;

  return (
    <section
      aria-labelledby="next-action-heading"
      className="border-l-2 border-[var(--accent)] bg-[var(--surface-canvas)] px-4 py-4 sm:px-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[var(--accent)]">下一步</p>
          <h2 id="next-action-heading" className="mt-1 truncate text-lg font-semibold">
            {title || "未命名事项"}
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {next.reason}
            {detail ? ` · ${detail}` : ""}
          </p>
        </div>
        {next.kind !== "none" ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <Link
              href={next.href}
              className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-md)] px-2.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]"
            >
              {actionCopy(next)}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
            {next.kind === "task" ? (
              <form action={completeMicrosoftTodoTaskAction}>
                <input type="hidden" name="task_id" value={next.task.id} />
                <button className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-md)] bg-[var(--accent)] px-3 text-xs font-medium text-white hover:opacity-90">
                  <Check className="size-3.5" aria-hidden="true" />
                  完成
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
