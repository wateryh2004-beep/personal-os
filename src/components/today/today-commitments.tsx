"use client";

import { DeferTaskControl } from "./today-task-actions";
export { DeferTaskControl } from "./today-task-actions";

import Link from "next/link";
import { useState } from "react";
import { CalendarPlus, Check, CheckSquare2, ChevronDown, Inbox } from "lucide-react";
import type { NowCommitment } from "@/features/today/types";
import { CompleteTaskControl } from "./complete-task-control";

const DEFAULT_VISIBLE = 5;

function openCreate(kind: "task" | "calendar" | "inbox", title: string) {
  window.dispatchEvent(new CustomEvent("personal-os:create-open", { detail: { kind, title } }));
}

const actionClass =
  "pressable inline-flex min-h-11 sm:min-h-8 items-center gap-1 rounded-[8px] px-1.5 text-[12px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-50";

export function CommitmentActions({ item, timezone }: { item: NowCommitment; timezone: string }) {
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

export function TodayCommitments({ commitments, timezone, priorityReminderCount = 0, scheduleReminderCount = 0 }: { commitments: NowCommitment[]; timezone: string; priorityReminderCount?: number; scheduleReminderCount?: number }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? commitments : commitments.slice(0, DEFAULT_VISIBLE);

  if (!commitments.length) return null;

  return (
    <section aria-labelledby="today-commitments-heading" className="min-w-0">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <div>
          <h2 id="today-commitments-heading" className="text-[16px] font-semibold leading-6">
            需要处理
          </h2>

        </div>
        {commitments.length ? (
          <span className="text-[12px] tabular-nums text-[var(--text-tertiary)]">
            {commitments.length} 项
          </span>
        ) : null}
      </div>

      {visible.length ? (
        <ul className="divide-y divide-[var(--separator)]">
          {visible.map((item) => (
            <li key={item.id} className="grid gap-1 py-3">
              <div className="min-w-0">
                <Link
                  href={item.href}
                  className="block line-clamp-2 text-[16px] leading-6 font-medium text-[var(--text-primary)] transition-colors ui-transition hover:text-[var(--accent)]"
                >
                  {item.title}
                </Link>
                <p className="mt-1 line-clamp-2 text-[13px] leading-[1.55] text-[var(--text-secondary)]">
                  {item.whyNow} · {item.constraint}
                </p>

              </div>
              {item.kind === "task" && item.task ? <div className="flex items-center justify-between gap-2"><details><summary className="min-h-11 cursor-pointer py-2.5 text-[13px] text-[var(--text-secondary)]">更多操作</summary><DeferTaskControl task={item.task} timezone={timezone} /><p className="pb-2 text-[12px] text-[var(--text-secondary)]">{item.source.label}</p></details><CompleteTaskControl taskId={item.task.id} title={item.task.title} compact /></div> : <details><summary className="min-h-11 cursor-pointer py-2.5 text-[13px] text-[var(--text-secondary)]">更多操作</summary><CommitmentActions item={item} timezone={timezone} /><p className="pb-2 text-[12px] text-[var(--text-secondary)]">{item.source.label}</p></details>}
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-2 border-t border-[var(--separator)] py-3 text-[13px] leading-[22px] text-[var(--text-secondary)]">
          <Check className="size-4 shrink-0 text-[var(--success)]" aria-hidden="true" />
          {priorityReminderCount || scheduleReminderCount ? "其余事项暂无到期或临近提醒。" : "暂无需要处理。"}
        </div>
      )}

      {commitments.length > DEFAULT_VISIBLE ? (
        <div className="border-t border-[var(--separator)] py-2">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="pressable inline-flex items-center gap-1 rounded-[8px] min-h-11 px-1 py-1 text-[13px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          >
            {expanded ? "收起" : `还有 ${commitments.length - DEFAULT_VISIBLE} 项`}
            <ChevronDown className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </section>
  );
}
