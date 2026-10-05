"use client";

import { useWorkspaceResourceLease } from "@/lib/workspace-resource-cache";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { CheckCircle2, Plus, Search, X } from "lucide-react";
import type { NowTask, TodayFocus } from "@/features/today/types";
import { selectFocusCandidates } from "@/features/today/focus";
import { saveTodayFocusAction } from "@/features/today/focus-actions";
import { todayWorkspaceResource as todayResource } from "@/features/today/workspace-resource";
import { taskRecordHref } from "@/features/today/record-links";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CompleteTaskControl } from "./complete-task-control";
import { priorityDueLabel } from "@/features/today/presentation";
import { DeferTaskControl } from "./today-commitments";

export function TodayPriorities({ focus, timezone = "Asia/Shanghai" }: { focus: TodayFocus; timezone?: string }) {
  const todayWorkspaceResource = useWorkspaceResourceLease(todayResource);
  const [editing, setEditing] = useState(false);
  const [selectedIds, setSelectedIds] = useState(focus.selectedIds);
  const [previousIds, setPreviousIds] = useState(focus.selectedIds);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const saving = useRef(false);
  const editorTitle = useRef<HTMLHeadingElement>(null);
  const all = [...focus.selectedTasks, ...focus.candidates];
  const resolveTasks = (ids: string[]) => ids.map((id) =>
    all.find((task) => task.id === id) ?? { id, title: "任务已不可用", status: "unavailable", due_at: null, importance: null } as NowTask);
  const savedSelected = resolveTasks(focus.selectedIds);
  const selected = resolveTasks(selectedIds);
  const candidates = selectFocusCandidates(focus.candidates, query, selectedIds);

  function begin() {
    setSelectedIds(focus.selectedIds);
    setPreviousIds(focus.selectedIds);
    setQuery(""); setMessage(""); setFailed(false); setEditing(true);
  }
  function cancel() {
    if (saving.current) return;
    setEditing(false); setMessage("");
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

  return <section aria-labelledby="today-priorities-heading" className={`today-priorities min-w-0 ${savedSelected.length ? "rounded-[20px] bg-[var(--accent-soft)] px-4 pb-1 pt-3 sm:px-5" : "border-b border-[var(--separator)] py-1"}`}>
    <div className="flex min-h-12 items-center justify-between gap-3">
      <h2 id="today-priorities-heading" className={savedSelected.length ? "text-[14px] font-semibold text-[var(--accent)]" : "text-[15px] font-medium"}>
        {savedSelected.length || !focus.available ? "今日重点" : "今天想推进什么？"}
      </h2>
      {focus.available ? <button type="button" onClick={begin} aria-haspopup="dialog" aria-expanded={editing} className="min-h-11 shrink-0 rounded-lg px-2 text-[13px] font-medium text-[var(--accent)] hover:bg-[var(--surface-hover)]">{savedSelected.length ? "调整" : "选择重点"}</button> : null}
    </div>
    {!focus.available ? <div className="pb-3 text-[13px] text-[var(--text-secondary)]" role="status">今日重点暂不可用，其他日程和到期提醒仍可查看。<button type="button" onClick={() => { void todayWorkspaceResource.revalidate({ force: true }).catch(() => {}); }} className="ml-2 min-h-11 text-[var(--accent)]">重试</button></div> : null}
    {savedSelected.length ? <ol aria-label="已保存的今日重点" className="divide-y divide-[var(--separator)]">
      {savedSelected.map((task, index) => <li key={task.id} className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-2.5 py-3">
        <span className="pt-1 text-[12px] tabular-nums text-[var(--accent)] opacity-65" aria-hidden="true">{index + 1}</span>
        <div className="min-w-0">
          <Link href={taskRecordHref(task.id)} className={`block break-words text-[18px] font-semibold leading-[1.5] tracking-[-0.02em] hover:text-[var(--accent)] sm:text-[20px] ${task.status === "completed" ? "text-[var(--text-tertiary)] line-through" : "text-[var(--text-primary)]"}`}>{task.title || "未命名任务"}</Link>
          <div className="mt-1 flex min-h-11 items-center justify-between gap-2">
            <span className="text-[12px] leading-5 text-[var(--text-secondary)]">{priorityDueLabel(task, focus.date, timezone)}</span>
            {task.status === "completed" ? <CheckCircle2 className="mr-3 size-4 shrink-0 text-[var(--success)]" aria-label="已完成" />
              : task.status !== "unavailable" ? <div className="flex shrink-0 items-center gap-0.5">{task.due_at ? <DeferTaskControl task={task} timezone={timezone} /> : null}<CompleteTaskControl taskId={task.id} title={task.title} compact /></div> : null}
          </div>
        </div>
      </li>)}
    </ol> : null}
    <Sheet open={editing} canDismiss={() => !saving.current} onOpenChange={(open) => { if (!open) cancel(); }}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto max-h-[85dvh] min-h-0 w-full max-w-xl gap-0 overflow-hidden"
        style={{ maxHeight: "min(85dvh, var(--app-viewport-height, 100dvh))", bottom: "max(0px, calc(100dvh - var(--app-viewport-height, 100dvh)))" }}
        onOpenAutoFocus={(event) => { event.preventDefault(); editorTitle.current?.focus({ preventScroll: true }); }}
        onEscapeKeyDown={(event) => { if (saving.current) event.preventDefault(); }}
        onPointerDownOutside={(event) => { if (saving.current) event.preventDefault(); }}
      >
        <SheetHeader className="shrink-0 px-5 pb-3 pt-5 pr-16">
          <SheetTitle ref={editorTitle} className="text-[18px]">选择今日重点</SheetTitle>
          <SheetDescription>最多选择 3 件想推进的任务，按选择顺序显示</SheetDescription>
          <button type="button" disabled={pending} onClick={cancel} aria-label="关闭重点选择" className="absolute right-2 top-3 inline-flex size-11 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] disabled:opacity-50"><X className="size-5" aria-hidden="true" /></button>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
          <div className="rounded-xl bg-[var(--accent-soft)] px-3 py-2">
            <p className="text-[12px] font-medium leading-6 text-[var(--accent)]">已选 {selectedIds.length} / 3</p>
            {selected.length ? <ol aria-label="待保存的今日重点" className="divide-y divide-[var(--separator)]">
              {selected.map((task, index) => <li key={task.id} className="flex min-h-12 items-center gap-2">
                <span className="w-4 shrink-0 text-[12px] tabular-nums text-[var(--text-tertiary)]" aria-hidden="true">{index + 1}</span>
                <span className="min-w-0 flex-1 break-words py-2 text-[14px] font-medium">{task.title || "未命名任务"}</span>
                <button type="button" disabled={pending} aria-label={`移除重点 ${task.title || "未命名任务"}`} onClick={() => setSelectedIds((ids) => ids.filter((id) => id !== task.id))} className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] disabled:opacity-50"><X className="size-4" aria-hidden="true" /></button>
              </li>)}
            </ol> : <p className="pb-1 text-[13px] leading-5 text-[var(--text-secondary)]">从下面选择任务</p>}
          </div>
          <label className="mt-4 block text-[12px] text-[var(--text-secondary)]" htmlFor="today-priority-search">选择已有任务（最近 200 条未完成任务）</label>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-[var(--text-tertiary)]" aria-hidden="true" />
            <input id="today-priority-search" type="search" value={query} disabled={pending} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务" className="min-h-11 w-full rounded-lg bg-[var(--surface-control)] py-2 pl-9 pr-3 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] sm:text-[14px]" />
          </div>
          <ul aria-label="可选任务" className="mt-2 divide-y divide-[var(--separator)]">
            {candidates.slice(0, 30).map((task) => <li key={task.id}><button type="button" disabled={pending || selectedIds.length >= 3} aria-label={`选择重点 ${task.title || "未命名任务"}`} onClick={() => setSelectedIds((ids) => ids.length < 3 && !ids.includes(task.id) ? [...ids, task.id] : ids)} className="flex min-h-14 w-full items-center gap-3 rounded-lg px-1 py-3 text-left hover:bg-[var(--surface-hover)] disabled:opacity-40"><Plus className="size-4 shrink-0 text-[var(--accent)]" aria-hidden="true" /><span className="min-w-0 break-words text-[14px]">{task.title || "未命名任务"}<span className="mt-0.5 block text-[12px] text-[var(--text-tertiary)]">{task.due_at ? "有截止时间" : "无截止日期"}</span></span></button></li>)}
          </ul>
          {!candidates.length ? <p className="py-3 text-[13px] text-[var(--text-tertiary)]">没有匹配的未完成任务。<Link href="/tasks?create=1" className="ml-1 text-[var(--accent)]">新建任务</Link></p> : null}
          {selectedIds.length === 3 ? <p className="mt-2 text-[12px] text-[var(--text-secondary)]">已选满 3 件，移除一件后可替换</p> : null}
        </div>
        <SheetFooter className="sticky bottom-0 shrink-0 bg-[var(--surface-canvas)] px-5 pt-3">
          {message ? <p role={failed ? "alert" : "status"} className={`text-[13px] leading-5 ${failed ? "text-[var(--danger)]" : "text-[var(--text-secondary)]"}`}>{message}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={save} className="min-h-11 flex-1 rounded-lg bg-[var(--accent)] px-4 text-[14px] font-medium text-white disabled:opacity-50">{pending ? "保存中…" : failed ? "重试保存" : "保存重点"}</button>
            <button type="button" disabled={pending} onClick={cancel} className="min-h-11 rounded-lg px-4 text-[14px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] disabled:opacity-50">取消</button>
            {failed ? <button type="button" disabled={pending} onClick={reload} className="min-h-11 w-full rounded-lg px-2 text-[13px] text-[var(--accent)] disabled:opacity-50">载入最新重点</button> : null}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
    {!editing && message ? <p role={failed ? "alert" : "status"} className={`pb-3 text-[13px] leading-5 ${failed ? "text-[var(--danger)]" : "text-[var(--text-secondary)]"}`}>{message}</p> : null}
  </section>;
}
