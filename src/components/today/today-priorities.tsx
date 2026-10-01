"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { CheckCircle2, Plus, X } from "lucide-react";
import type { NowTask, TodayFocus } from "@/features/today/types";
import { selectFocusCandidates } from "@/features/today/focus";
import { saveTodayFocusAction } from "@/features/today/focus-actions";
import { todayWorkspaceResource } from "@/features/today/workspace-resource";
import { taskRecordHref } from "@/features/today/record-links";
import { CompleteTaskControl } from "./complete-task-control";

export function TodayPriorities({ focus }: { focus: TodayFocus }) {
  const [editing, setEditing] = useState(false);
  const [selectedIds, setSelectedIds] = useState(focus.selectedIds);
  const [previousIds, setPreviousIds] = useState(focus.selectedIds);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const saving = useRef(false);
  const all = [...focus.selectedTasks, ...focus.candidates];
  const selected = (editing ? selectedIds : focus.selectedIds).map((id) =>
    all.find((task) => task.id === id) ?? { id, title: "任务已不可用", status: "unavailable", due_at: null, importance: null } as NowTask);
  const candidates = selectFocusCandidates(focus.candidates, query, selectedIds);

  function begin() {
    setSelectedIds(focus.selectedIds);
    setPreviousIds(focus.selectedIds);
    setQuery(""); setMessage(""); setFailed(false); setEditing(true);
  }
  function save() {
    if (saving.current) return;
    saving.current = true;
    startTransition(async () => {
      try {
        const result = await saveTodayFocusAction({ date: focus.date, taskIds: selectedIds, previousIds });
        setMessage(result.message); setFailed(!result.ok);
        if (!result.ok) return;
        todayWorkspaceResource.mutate((workspace) => workspace ? { ...workspace, focus: {
          ...focus, selectedIds, selectedTasks: selected.filter((task) => task.status !== "unavailable"),
        } } : workspace);
        setPreviousIds(selectedIds); setEditing(false);
        todayWorkspaceResource.invalidate();
        void todayWorkspaceResource.revalidate({ force: true }).catch(() => {});
      } catch {
        setFailed(true); setMessage("未能确认今日重点的保存结果。你的选择仍保留，请先载入最新重点核对。");
      } finally { saving.current = false; }
    });
  }

  function reload() {
    if (saving.current) return;
    saving.current = true;
    startTransition(async () => {
      try {
        todayWorkspaceResource.invalidate();
        const workspace = await todayWorkspaceResource.revalidate({ force: true });
        if (!workspace.focus?.available) throw new Error("focus_unavailable");
        setSelectedIds(workspace.focus.selectedIds);
        setPreviousIds(workspace.focus.selectedIds);
        setMessage("已载入最新重点，请重新选择后保存。"); setFailed(false);
      } catch { setFailed(true); setMessage("最新状态读取失败，当前选择仍保留。请重试。"); }
      finally { saving.current = false; }
    });
  }

  return <section aria-labelledby="today-priorities-heading" className="border-y border-[var(--separator)] py-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 id="today-priorities-heading" className="text-[15px] font-semibold">今日重点 <span className="ml-1 text-[11px] font-normal text-[var(--text-tertiary)]">{selected.length}/3</span></h2>
        <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">自己选 1–3 件今天值得推进的事，没有截止日期也可以</p>
      </div>
      {!editing && focus.available ? <button type="button" onClick={begin} className="min-h-11 shrink-0 px-2 text-[12px] font-medium text-[var(--accent)]">{selected.length ? "调整" : "选择重点"}</button> : null}
    </div>
    {!focus.available ? <div className="mt-3 text-[12px] text-[var(--text-secondary)]" role="status">今日重点暂不可用，其他日程和到期提醒仍可查看。<button type="button" onClick={() => { void todayWorkspaceResource.revalidate({ force: true }).catch(() => {}); }} className="ml-2 min-h-11 text-[var(--accent)]">重试</button></div> : null}
    {selected.length ? <ol className="mt-3 divide-y divide-[var(--separator)]">
      {selected.map((task, index) => <li key={task.id} className="flex min-h-14 items-center gap-2">
        <span className="w-4 text-[11px] tabular-nums text-[var(--text-tertiary)]">{index + 1}</span>
        <div className="min-w-0 flex-1 py-2">
          <Link href={taskRecordHref(task.id)} className={`block break-words text-[13px] font-medium hover:text-[var(--accent)] ${task.status === "completed" ? "text-[var(--text-tertiary)] line-through" : ""}`}>{task.title || "未命名任务"}</Link>
          <span className="mt-1 block text-[10px] text-[var(--text-tertiary)]">Microsoft To Do · {task.status === "completed" ? "今天已完成" : task.due_at ? "已设截止时间" : "无截止日期"}</span>
        </div>
        {editing ? <button type="button" disabled={pending} aria-label={`移除重点 ${task.title}`} onClick={() => setSelectedIds((ids) => ids.filter((id) => id !== task.id))} className="inline-flex size-11 shrink-0 items-center justify-center text-[var(--text-secondary)] disabled:opacity-50"><X className="size-4" /></button>
          : task.status === "completed" ? <CheckCircle2 className="mr-3 size-4 text-[var(--success)]" aria-label="已完成" />
          : task.status !== "unavailable" ? <CompleteTaskControl taskId={task.id} title={task.title} compact /> : null}
      </li>)}
    </ol> : !editing && focus.available ? <p className="mt-4 text-[12px] text-[var(--text-tertiary)]">还没选重点。到期事项会单独提醒，不会自动替你决定今天的重心。</p> : null}
    {editing ? <div className="mt-3 border-t border-[var(--separator)] pt-3">
      <label className="block text-[11px] text-[var(--text-secondary)]" htmlFor="today-priority-search">选择已有任务（最近 200 条未完成任务）</label>
      <input id="today-priority-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务，包括没有截止日期的任务" className="mt-2 min-h-11 w-full rounded-lg bg-[var(--surface-control)] px-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" />
      <ul className="mt-2 max-h-64 overflow-y-auto">
        {candidates.slice(0, 30).map((task) => <li key={task.id}><button type="button" disabled={pending || selectedIds.length >= 3} onClick={() => setSelectedIds((ids) => [...ids, task.id])} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-[var(--surface-hover)] disabled:opacity-40"><Plus className="size-3.5 shrink-0" /><span className="min-w-0 break-words text-[12px]">{task.title || "未命名任务"}<span className="ml-2 text-[10px] text-[var(--text-tertiary)]">{task.due_at ? "有截止时间" : "无截止日期"}</span></span></button></li>)}
      </ul>
      {!candidates.length ? <p className="py-3 text-[12px] text-[var(--text-tertiary)]">没有匹配的未完成任务。<Link href="/tasks?create=1" className="ml-1 text-[var(--accent)]">新建任务</Link></p> : null}
      {selectedIds.length === 3 ? <p className="mt-2 text-[11px] text-[var(--text-secondary)]">已选满 3 件，移除一件后可替换</p> : null}
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={pending} onClick={save} className="min-h-11 rounded-lg bg-[var(--accent)] px-4 text-[12px] font-medium text-white disabled:opacity-50">{pending ? "保存中…" : failed ? "重试保存" : "保存重点"}</button>
        <button type="button" disabled={pending} onClick={() => { setEditing(false); setMessage(""); }} className="min-h-11 rounded-lg px-3 text-[12px] text-[var(--text-secondary)]">取消</button>
        {failed ? <button type="button" disabled={pending} onClick={reload} className="min-h-11 px-2 text-[12px] text-[var(--accent)]">载入最新重点</button> : null}
      </div>
    </div> : null}
    {message ? <p role={failed ? "alert" : "status"} className={`mt-3 text-[12px] leading-5 ${failed ? "text-[var(--danger)]" : "text-[var(--text-secondary)]"}`}>{message}</p> : null}
  </section>;
}
