"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CalendarPlus, Check, CheckSquare2, ChevronDown, Inbox, TimerReset } from "lucide-react";
import type { NowCommitment } from "@/features/today/types";
import { CompleteTaskControl } from "./complete-task-control";
import { deferMicrosoftTodoTaskAction } from "@/features/tasks/microsoft-todo";

const DEFAULT_VISIBLE = 5;

function openCreate(kind: "task" | "calendar" | "inbox", title: string) {
  window.dispatchEvent(new CustomEvent("personal-os:create-open", { detail: { kind, title } }));
}

const actionClass =
  "inline-flex h-7 items-center gap-1 rounded-[var(--radius-sm)] px-1.5 text-[11px] font-medium text-[var(--text-tertiary)] transition-[background-color,color] ui-transition hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-50";

function DeferTaskControl({ task }: { task: NonNullable<NowCommitment["task"]> }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const form = new FormData();
          form.set("task_id", task.id);
          form.set("due_at", new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
          await deferMicrosoftTodoTaskAction(form);
        })
      }
      className={actionClass}
    >
      <TimerReset className="size-3.5" aria-hidden="true" />
      {pending ? "延后中…" : "明天"}
    </button>
  );
}

function CommitmentActions({ item }: { item: NowCommitment }) {
  if (item.kind === "task" && item.task) {
    return (
      <div className="flex items-center gap-0.5">
        <DeferTaskControl task={item.task} />
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

export function TodayCommitments({ commitments }: { commitments: NowCommitment[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? commitments : commitments.slice(0, DEFAULT_VISIBLE);

  return (
    <section aria-labelledby="today-commitments-heading" className="border-y border-[var(--separator)]">
      <div className="flex flex-wrap items-end justify-between gap-3 py-3.5">
        <div>
          <h2 id="today-commitments-heading" className="text-[15px] font-semibold tracking-[-0.015em]">
            今日承诺
          </h2>
          <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">
            只保留有依据、值得现在处理的下一步
          </p>
        </div>
        {commitments.length ? (
          <span className="text-[11px] tabular-nums text-[var(--text-tertiary)]">
            {commitments.length} 项
          </span>
        ) : null}
      </div>

      {visible.length ? (
        <ul className="divide-y divide-[var(--separator)] border-t border-[var(--separator)]">
          {visible.map((item) => (
            <li key={item.id} className="grid gap-2 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-5">
              <div className="min-w-0">
                <Link
                  href={item.href}
                  className="block truncate text-[13px] font-medium text-[var(--text-primary)] transition-colors ui-transition hover:text-[var(--accent)]"
                >
                  {item.title}
                </Link>
                <p className="mt-1 line-clamp-2 text-[11px] leading-[1.55] text-[var(--text-secondary)]">
                  {item.whyNow} · {item.constraint}
                </p>
                <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">{item.source.label}</p>
              </div>
              <div className="-ml-1 shrink-0 sm:ml-0">
                <CommitmentActions item={item} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-2 border-t border-[var(--separator)] py-5 text-[12px] text-[var(--text-secondary)]">
          <Check className="size-4 text-[var(--success)]" aria-hidden="true" />
          暂无足够依据推荐下一步。先把新想法记到 Inbox 即可。
        </div>
      )}

      {commitments.length > DEFAULT_VISIBLE ? (
        <div className="border-t border-[var(--separator)] py-2.5">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            {expanded ? "收起" : `还有 ${commitments.length - DEFAULT_VISIBLE} 项`}
            <ChevronDown className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </section>
  );
}
