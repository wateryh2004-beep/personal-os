"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { CheckCircle2, MoreHorizontal, RefreshCw, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { AISidecar } from "@/components/ai/ai-sidecar";
import { Inspector } from "@/components/shared/inspector";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MicrosoftTodoCreateDialog } from "@/components/tasks/microsoft-todo-create-dialog";
import { completeMicrosoftTodoTaskAction, createMicrosoftTodoTaskAction, deleteMicrosoftTodoTaskAction, reopenMicrosoftTodoTaskAction, syncAndBackupMicrosoftTodoAction, syncMicrosoftTodoAction, updateMicrosoftTodoTaskAction } from "@/features/tasks/microsoft-todo";
import type { TodoList, TodoTask, UpdateTaskPatch } from "@/features/tasks/types";
import { useWorkspacePanel } from "@/components/layout/workspace-panel-provider";
import { EntityBacklinks } from "@/components/links/entity-backlinks";
import { EntityMarkdown } from "@/components/links/entity-markdown";
import { MentionTextarea } from "@/components/links/entity-mention-textarea";
import { useActionFeedback } from "@/components/shared/action-feedback";
import { loadWorkspaceSession, saveWorkspaceSession } from "@/lib/workspace-session";
import { formatDate } from "@/lib/format";
import { useWorkspaceScrollRestoration } from "@/components/shared/use-workspace-scroll-restoration";

const TaskAssistant = dynamic(() => import("@/components/tasks/task-assistant").then((module) => module.TaskAssistant), { ssr: false });

type View = "today" | "upcoming" | "all" | "completed";
const labels: Record<View, string> = { today: "今天", upcoming: "即将到来", all: "全部", completed: "已完成" };
const startOfDay = () => new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
const listName = (lists: TodoList[], id: string) => lists.find((list) => list.id === id)?.displayName || "任务";

function TaskRow({ task, list, selected, onOpen, onToggle }: { task: TodoTask; list: string; selected: boolean; onOpen: () => void; onToggle: () => void }) {
  const completed = task.status === "completed";
  return <article onClick={onOpen} data-selected={selected || undefined} className={`grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] gap-3 border-b px-3 py-3 ${selected ? "bg-[var(--surface-selected)]" : "hover:bg-[var(--surface-hover)]"}`}><button onClick={(event) => { event.stopPropagation(); onToggle(); }} aria-label={`${completed ? "恢复" : "完成"} ${task.title}`} className="mt-0.5 text-[var(--text-tertiary)]">{completed ? <RotateCcw className="size-[18px] text-[var(--accent)]" /> : <CheckCircle2 className="size-[19px]" />}</button><div className="min-w-0"><h2 className={`truncate text-sm font-medium ${completed ? "line-through text-[var(--text-tertiary)]" : ""}`}>{task.title}</h2>{task.bodyText ? <p className="mt-1 line-clamp-1 text-xs text-[var(--text-secondary)]">{task.bodyText}</p> : null}</div><span className="text-xs text-[var(--text-tertiary)]">{task.importance === "high" ? "高优先" : task.dueAt ? formatDate(task.dueAt) : list}</span></article>;
}

function QuickAdd({ listId, onCreated }: { listId: string | undefined; onCreated: (task: TodoTask, temporaryId?: string) => void }) {
  const [open, setOpen] = useState(false); const [pending, start] = useTransition(); const [message, setMessage] = useState("");
  if (!listId) return null;
  const submit = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const title = String(form.get("title") || "").trim(); const temporaryId = `optimistic-${crypto.randomUUID()}`; onCreated({ id: temporaryId, providerTaskId: temporaryId, todoListId: listId, title, bodyText: null, status: "notStarted", importance: "normal", dueAt: null, completedAt: null, lastModifiedAt: null }); event.currentTarget.reset(); setOpen(false); start(async () => { const result = await createMicrosoftTodoTaskAction({ status: "idle", message: "" }, form); setMessage(result.message); if (result.status === "success" && result.taskId) onCreated({ id: result.taskId, providerTaskId: result.taskId, todoListId: listId, title, bodyText: null, status: "notStarted", importance: "normal", dueAt: null, completedAt: null, lastModifiedAt: null }, temporaryId); else onCreated({ id: "", providerTaskId: temporaryId, todoListId: listId, title: "", bodyText: null, status: "notStarted", importance: "normal", dueAt: null, completedAt: null, lastModifiedAt: null }, temporaryId); }); };
  return <div className="border-b px-4 py-3"><button type="button" onClick={() => setOpen(true)} className="text-sm text-[var(--accent)]">＋ 添加任务</button>{open ? <form onSubmit={submit} className="mt-2 flex gap-2"><input autoFocus name="title" required maxLength={500} placeholder="输入任务内容，按 Enter 创建…" onKeyDown={(event) => event.key === "Escape" && setOpen(false)} className="min-w-0 flex-1 rounded border bg-white px-3 py-2 text-sm"/><input type="hidden" name="todo_list_id" value={listId}/><input type="hidden" name="body_text" value=""/><input type="hidden" name="importance" value="normal"/><input type="hidden" name="due_at" value=""/><Button disabled={pending} size="sm">添加</Button></form> : null}{message ? <p role="status" className="mt-1 text-xs text-[var(--text-secondary)]">{message}</p> : null}</div>;
}

function TaskInspector({ task, list, onClose, update, remove }: { task: TodoTask; list: string; onClose: () => void; update: (patch: UpdateTaskPatch) => Promise<void>; remove: () => Promise<void> }) {
  const [title, setTitle] = useState(task.title); const [body, setBody] = useState(task.bodyText ?? ""); const [editing, setEditing] = useState<"title" | "body" | null>(null); const [deleteOpen, setDeleteOpen] = useState(false); const [message, setMessage] = useState("");
  const save = async (patch: UpdateTaskPatch) => { try { await update(patch); setEditing(null); setMessage("已保存"); } catch { setMessage("保存失败，已恢复原值。"); } };
  return <Inspector open title="任务详情" onClose={onClose}><div className="space-y-6"><div className="flex justify-end"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="任务更多操作"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem onSelect={() => setDeleteOpen(true)}><Trash2 />删除任务</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div><section><p className="text-xs text-[var(--text-tertiary)]">标题</p>{editing === "title" ? <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} onBlur={() => title !== task.title && void save({ title })} onKeyDown={(event) => { if (event.key === "Enter") void save({ title }); if (event.key === "Escape") { setTitle(task.title); setEditing(null); } }} className="mt-1 w-full border px-2 py-1 text-sm font-medium"/> : <button onClick={() => setEditing("title")} className="mt-1 text-left text-sm font-medium">{task.title}</button>}</section><section><div className="flex items-center justify-between"><p className="text-xs text-[var(--text-tertiary)]">说明</p>{!editing && task.bodyText ? <button onClick={() => setEditing("body")} className="text-xs text-[var(--accent)]">编辑</button> : null}</div>{editing === "body" ? <MentionTextarea autoFocus value={body} onChange={setBody} onBlur={() => body !== (task.bodyText ?? "") && void save({ bodyText: body || null })} rows={5} placeholder="输入 @ 引用笔记/日程/文件" className="mt-1 min-h-24 w-full border p-2 text-sm"/> : task.bodyText ? <div className="mt-1"><EntityMarkdown body={task.bodyText} className="text-sm leading-6"/></div> : <button onClick={() => setEditing("body")} className="mt-1 w-full text-left text-sm text-[var(--text-secondary)]">点击添加说明</button>}</section><dl className="grid gap-4 text-sm"><div><dt className="text-xs text-[var(--text-tertiary)]">清单</dt><dd>{list}</dd></div><div><dt className="text-xs text-[var(--text-tertiary)]">截止日期</dt><dd><input type="datetime-local" value={task.dueAt?.slice(0, 16) ?? ""} onChange={(event) => void save({ dueAt: event.target.value ? new Date(event.target.value).toISOString() : null })} className="border px-2 py-1"/></dd></div><div><dt className="text-xs text-[var(--text-tertiary)]">优先级</dt><dd><select value={task.importance} onChange={(event) => void save({ importance: event.target.value as TodoTask["importance"] })} className="border px-2 py-1"><option value="low">低</option><option value="normal">普通</option><option value="high">高</option></select></dd></div></dl><EntityBacklinks type="todo_task" id={task.id} />{message ? <p role="status" className="text-xs">{message}</p> : null}</div><Dialog open={deleteOpen} onOpenChange={setDeleteOpen}><DialogContent><h2 className="text-lg font-semibold">删除任务？</h2><p className="mt-2 text-sm">将从 Microsoft To Do 删除“{task.title}”。</p><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setDeleteOpen(false)}>取消</Button><Button onClick={() => void remove().then(onClose).catch(() => setMessage("删除失败，任务已恢复。"))}>删除</Button></div></DialogContent></Dialog></Inspector>;
}

export function TaskWorkspace({ lists, tasks, initialCreateOpen = false, initialTaskId }: { lists: TodoList[]; tasks: TodoTask[]; initialCreateOpen?: boolean; initialTaskId?: string }) {
  const [rows, setRows] = useState(tasks);
  const [view, setView] = useState<View>(initialTaskId ? "all" : "today");
  const [listId, setListId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialTaskId ?? null);
  const assistant = useWorkspacePanel("tasks-ai");
  const { show } = useActionFeedback();
  const listScrollRef = useWorkspaceScrollRestoration("tasks:list");
  useEffect(() => {
    if (initialTaskId) return;
    const restore = window.setTimeout(() => {
      const session = loadWorkspaceSession<{ view?: View; listId?: string | null; selectedId?: string | null }>("tasks:workspace");
      if (!session) return;
      if (session.view) setView(session.view);
      if (session.listId !== undefined) setListId(session.listId);
      if (session.selectedId && tasks.some((task) => task.id === session.selectedId)) setSelectedId(session.selectedId);
    }, 0);
    return () => window.clearTimeout(restore);
  }, [initialTaskId, tasks]);
  useEffect(() => { saveWorkspaceSession("tasks:workspace", { view, listId, selectedId }); }, [listId, selectedId, view]);
  const selected = rows.find((task) => task.id === selectedId) ?? null;
  const defaultListId = lists.find((list) => list.isDefault)?.id ?? lists[0]?.id;
  useEffect(() => {
    const reconcileAgentMutation = (event: Event) => {
      const detail = (event as CustomEvent<{ actionType?: string; proposal?: Record<string, unknown> }>).detail;
      const proposal = detail?.proposal;
      const taskId = typeof proposal?.taskId === "string" ? proposal.taskId : null;
      if (!taskId) return;
      setRows((current) => {
        if (detail.actionType === "tasks.delete") return current.filter((task) => task.id !== taskId);
        if (detail.actionType === "tasks.complete") return current.map((task) => task.id === taskId ? { ...task, status: "completed", completedAt: new Date().toISOString() } : task);
        if (detail.actionType === "tasks.reopen") return current.map((task) => task.id === taskId ? { ...task, status: "notStarted", completedAt: null } : task);
        if (detail.actionType === "tasks.update" && proposal?.patch && typeof proposal.patch === "object") return current.map((task) => task.id === taskId ? { ...task, ...(proposal.patch as UpdateTaskPatch) } : task);
        return current;
      });
    };
    window.addEventListener("personal-os:tasks-mutated", reconcileAgentMutation);
    return () => window.removeEventListener("personal-os:tasks-mutated", reconcileAgentMutation);
  }, []);
  const mutate = async (id: string, apply: (task: TodoTask) => TodoTask, request: () => Promise<void>) => {
    const before = rows; setRows((current) => current.map((task) => task.id === id ? apply(task) : task));
    try { await request(); } catch (error) { setRows(before); throw error; }
  };
  const toggle = async (task: TodoTask) => { const form = new FormData(); form.set("task_id", task.id); try { await mutate(task.id, (row) => task.status === "completed" ? { ...row, status: "notStarted", completedAt: null } : { ...row, status: "completed", completedAt: new Date().toISOString() }, () => task.status === "completed" ? reopenMicrosoftTodoTaskAction(form) : completeMicrosoftTodoTaskAction(form)); if (task.status !== "completed") show({ message: "任务已完成", tone: "success", undo: () => { const undo = new FormData(); undo.set("task_id", task.id); void mutate(task.id, (row) => ({ ...row, status: "notStarted", completedAt: null }), () => reopenMicrosoftTodoTaskAction(undo)).catch(() => show({ message: "恢复失败，任务状态已重新同步。", tone: "error" })); } }); } catch { show({ message: "更新失败，任务已恢复原状态。", tone: "error" }); } };
  const visible = useMemo(() => rows.filter((task) => { if (!task.title || (listId && task.todoListId !== listId)) return false; const due = task.dueAt ? new Date(task.dueAt).getTime() : null; if (view === "completed") return task.status === "completed"; if (task.status === "completed") return false; if (view === "today") return due !== null && due < startOfDay() + 86_400_000; if (view === "upcoming") return due !== null && due >= startOfDay() + 86_400_000; return true; }), [listId, rows, view]);
  const onCreated = (task: TodoTask, temporaryId?: string) => setRows((current) => temporaryId ? task.id ? [...current.filter((row) => row.id !== temporaryId), task] : current.filter((row) => row.id !== temporaryId) : [...current, task]);
  return <section className="flex h-[calc(var(--app-viewport-height)-var(--toolbar-height)-var(--tab-bar-height))] min-h-0 overflow-hidden bg-[var(--surface-canvas)]">
    <div className="flex min-w-0 flex-1 flex-col"><header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-4 py-2"><div className="flex min-w-0 items-center gap-1 overflow-x-auto"><h1 className="mr-2 font-semibold">Tasks</h1>{(["today", "upcoming", "all", "completed"] as View[]).map((item) => <button key={item} onClick={() => setView(item)} className={`rounded px-2 py-1 text-xs ${view === item ? "bg-[var(--surface-selected)] text-[var(--accent)]" : ""}`}>{labels[item]}</button>)}</div><div className="flex flex-wrap items-center gap-1"><Button variant="ghost" size="sm" onClick={assistant.toggle}><Sparkles />AI</Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem asChild><form action={syncMicrosoftTodoAction}><button className="flex gap-2"><RefreshCw />刷新</button></form></DropdownMenuItem><DropdownMenuItem asChild><form action={syncAndBackupMicrosoftTodoAction}><button>对齐并备份</button></form></DropdownMenuItem></DropdownMenuContent></DropdownMenu><MicrosoftTodoCreateDialog lists={lists} initialOpen={initialCreateOpen}/></div></header><QuickAdd listId={defaultListId} onCreated={onCreated}/><div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1fr)_240px]"><main ref={listScrollRef} className="workspace-scroll overflow-y-auto"><div className="border-b px-4 py-3 text-xs text-[var(--text-secondary)]">{labels[view]} · {visible.length}</div>{visible.map((task) => <TaskRow key={task.id} task={task} list={listName(lists, task.todoListId)} selected={task.id === selectedId} onOpen={() => setSelectedId(task.id)} onToggle={() => void toggle(task)}/>)}</main><aside className="hidden border-l p-4 xl:block"><p className="text-xs text-[var(--text-tertiary)]">清单</p><button onClick={() => setListId(null)} className="mt-3 block text-sm">全部清单</button>{lists.map((list) => <button key={list.id} onClick={() => setListId(list.id)} className="mt-2 block text-sm">{list.displayName}</button>)}</aside></div></div>
    {selected ? <TaskInspector task={selected} list={listName(lists, selected.todoListId)} onClose={() => setSelectedId(null)} update={(patch) => mutate(selected.id, (task) => ({ ...task, ...patch }), () => updateMicrosoftTodoTaskAction({ taskId: selected.id, ...patch }))} remove={async () => { const before = rows; setRows((current) => current.filter((task) => task.id !== selected.id)); const form = new FormData(); form.set("task_id", selected.id); try { await deleteMicrosoftTodoTaskAction(form); } catch (error) { setRows(before); throw error; } }} /> : null}
    {assistant.isOpen ? <AISidecar open onClose={assistant.close} context="Tasks"><TaskAssistant/></AISidecar> : null}
  </section>;
}
