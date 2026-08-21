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

function DeferTaskControl({ task }: { task: NonNullable<NowCommitment["task"]> }) {
  const [pending, startTransition] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => startTransition(async () => { const form = new FormData(); form.set("task_id", task.id); form.set("due_at", new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()); await deferMicrosoftTodoTaskAction(form); })} className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-md)] px-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)] disabled:opacity-60">
      <TimerReset className="size-3.5" aria-hidden="true" /> {pending ? "延后中…" : "明天"}
    </button>
  );
}

function CommitmentActions({ item }: { item: NowCommitment }) {
  if (item.kind === "task" && item.task) return <div className="flex items-center gap-1"><DeferTaskControl task={item.task} /><CompleteTaskControl taskId={item.task.id} title={item.task.title} /></div>;
  if (item.kind === "event") return <div className="flex items-center gap-1"><button type="button" onClick={() => openCreate("task", `跟进：${item.title}`)} className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-md)] px-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]"><CheckSquare2 className="size-3.5" aria-hidden="true" /> 转任务</button><button type="button" onClick={() => openCreate("inbox", item.title)} className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-md)] px-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]"><Inbox className="size-3.5" aria-hidden="true" /> 暂存</button></div>;
  if (item.kind === "milestone") return <div className="flex items-center gap-1"><button type="button" onClick={() => openCreate("task", item.title)} className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-md)] px-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]"><CheckSquare2 className="size-3.5" aria-hidden="true" /> 转任务</button><button type="button" onClick={() => openCreate("calendar", item.title)} className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-md)] px-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]"><CalendarPlus className="size-3.5" aria-hidden="true" /> 安排日程</button></div>;
  return <Link href="/inbox" className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-md)] px-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]"><Inbox className="size-3.5" aria-hidden="true" /> 整理</Link>;
}

export function TodayCommitments({ commitments }: { commitments: NowCommitment[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? commitments : commitments.slice(0, DEFAULT_VISIBLE);
  return (
    <section aria-labelledby="today-commitments-heading" className="rounded-lg border border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] bg-[var(--accent-soft)]/40">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color-mix(in_srgb,var(--accent)_18%,var(--border))] px-5 py-3.5">
        <div><p className="text-xs font-medium text-[var(--accent)]">今日承诺</p><h2 id="today-commitments-heading" className="mt-0.5 text-base font-semibold">只做有依据的下一步</h2></div>
        <span className="text-xs text-[var(--text-secondary)]">默认最多 {DEFAULT_VISIBLE} 项</span>
      </div>
      {visible.length ? <ul className="divide-y divide-[color-mix(in_srgb,var(--accent)_12%,var(--border))] px-5">{visible.map((item) => <li key={item.id} className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><Link href={item.href} className="block truncate text-sm font-medium hover:text-[var(--accent)]">{item.title}</Link><p className="mt-1 text-xs text-[var(--text-secondary)]"><span className="font-medium text-[var(--text-primary)]">为什么现在：</span>{item.whyNow} · {item.constraint}</p><p className="mt-1 text-[11px] text-[var(--text-tertiary)]">依据：{item.source.label}</p></div><div className="shrink-0"><CommitmentActions item={item} /></div></li>)}</ul> : <div className="px-5 py-8 text-sm text-[var(--text-secondary)]"><Check className="mr-1 inline size-4 text-[var(--success)]" aria-hidden="true" />暂无足够依据推荐下一步。你可以先记录到 Inbox。</div>}
      {commitments.length > DEFAULT_VISIBLE ? <div className="border-t border-[color-mix(in_srgb,var(--accent)_12%,var(--border))] px-5 py-2.5"><button type="button" onClick={() => setExpanded((value) => !value)} className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline">{expanded ? "收起额外推荐" : `展开另外 ${commitments.length - DEFAULT_VISIBLE} 项`}<ChevronDown className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" /></button></div> : null}
    </section>
  );
}
