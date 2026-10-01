"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { CalendarPlus, Check, CheckSquare2, ChevronDown, Inbox, TimerReset } from "lucide-react";
import type { NowCommitment } from "@/features/today/types";
import { CompleteTaskControl } from "./complete-task-control";
import { shiftCalendarCursor } from "@/features/calendar/timezone";
import { tasksWorkspaceResource } from "@/features/tasks/workspace-resource";
import { todayWorkspaceResource } from "@/features/today/workspace-resource";
import { useActionFeedback } from "@/components/shared/action-feedback";
import { deferMicrosoftTodoTaskAction } from "@/features/tasks/microsoft-todo";

const DEFAULT_VISIBLE = 5;

function openCreate(kind: "task" | "calendar" | "inbox", title: string) {
  window.dispatchEvent(new CustomEvent("personal-os:create-open", { detail: { kind, title } }));
}

const actionClass =
  "pressable inline-flex min-h-11 sm:min-h-8 items-center gap-1 rounded-[8px] px-1.5 text-[11px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-50";

function DeferTaskControl({ task, timezone }: { task: NonNullable<NowCommitment["task"]>; timezone: string }) {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const { show } = useActionFeedback();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (inFlight.current) return;
        inFlight.current = true;
        startTransition(async () => {
          setFailed(false);
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
          } catch {
            setFailed(true);
            show({ message: "未能确认延后结果，请刷新核对后重试。", tone: "error" });
          } finally { inFlight.current = false; }
        });
      }}
      className={actionClass}
    >
      <TimerReset className="size-3.5" aria-hidden="true" />
      {pending ? "延后中…" : failed ? "重试延后" : "明天"}
    </button>
  );
}

function CommitmentActions({ item, timezone }: { item: NowCommitment; timezone: string }) {
  if (item.kind === "task" && item.task) {
    return (
      <div className="flex items-center gap-0.5">
        <DeferTaskControl task={item.task} timezone={timezone} />
        <CompleteTaskControl taskId={item.task.id} title={item.task.title} compact />
      </div>
    );
  }
  if (item.kind === "event") {
    return (
      <div className="flex items-center gap-0.5">
        <button type="button" onClick={() => openCreate("task", `跟进：${item.title}`)} className={actionClass}>
          <CheckSquare2 className="size-3.5" aria-hidden="true" /> 转任务
        </button>
        <button type="button" onClick={() => openCreate("inbox", item.title)} className={actionClass}>
          <Inbox className="size-3.5" aria-hidden="true" /> 暂存
        </button>
      </div>
    );
  }
  if (item.kind === "milestone") {
    return (
      <div className="flex items-center gap-0.5">
        <button type="button" onClick={() => openCreate("task", item.title)} className={actionClass}>
          <CheckSquare2 className="size-3.5" aria-hidden="true" /> 转任务
        </button>
        <button type="button" onClick={() => openCreate("calendar", item.title)} className={actionClass}>
          <CalendarPlus className="size-3.5" aria-hidden="true" /> 安排
        </button>
      </div>
    );
  }
  return (
    <Link href="/inbox" className={actionClass}>
      <Inbox className="size-3.5" aria-hidden="true" /> 整理
    </Link>
  );
}

export function TodayCommitments({ commitments, timezone }: { commitments: NowCommitment[]; timezone: string }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? commitments : commitments.slice(0, DEFAULT_VISIBLE);

  return (
    <section aria-labelledby="today-commitments-heading" className="border-y border-[var(--separator)]">
      <div className="flex min-h-12 flex-wrap items-end justify-between gap-2.5 py-3">
        <div>
          <h2 id="today-commitments-heading" className="text-[14px] font-semibold tracking-[-0.01em]">
            到期与临近提醒
          </h2>
          <p className="mt-0.5 text-[10.5px] text-[var(--text-tertiary)]">
            来自截止时间、日程和职业节点，不会自动加入今日重点
          </p>
        </div>
        {commitments.length ? (
          <span className="text-[10.5px] tabular-nums text-[var(--text-tertiary)]">
            {commitments.length} 项
          </span>
        ) : null}
      </div>

      {visible.length ? (
        <ul className="divide-y divide-[var(--separator)] border-t border-[var(--separator)]">
          {visible.map((item) => (
            <li key={item.id} className="grid gap-2 py-[13px] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-5">
              <div className="min-w-0">
                <Link
                  href={item.href}
                  className="block truncate text-[12.5px] font-medium text-[var(--text-primary)] transition-colors ui-transition hover:text-[var(--accent)]"
                >
                  {item.title}
                </Link>
                <p className="mt-1 line-clamp-2 text-[10.5px] leading-[1.55] text-[var(--text-secondary)]">
                  {item.whyNow} · {item.constraint}
                </p>
                <p className="mt-1 text-[9.5px] text-[var(--text-tertiary)]">{item.source.label}</p>
              </div>
              <div className="-ml-1 shrink-0 sm:ml-0">
                <CommitmentActions item={item} timezone={timezone} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-2 border-t border-[var(--separator)] py-5 text-[12px] text-[var(--text-secondary)]">
          <Check className="size-4 text-[var(--success)]" aria-hidden="true" />
          暂无足够依据推荐下一步。先把新想法记到收集箱即可。
        </div>
      )}

      {commitments.length > DEFAULT_VISIBLE ? (
        <div className="border-t border-[var(--separator)] py-2">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="pressable inline-flex items-center gap-1 rounded-[8px] px-1 py-0.5 text-[11px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          >
            {expanded ? "收起" : `还有 ${commitments.length - DEFAULT_VISIBLE} 项`}
            <ChevronDown className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </section>
  );
}
