"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, MoreHorizontal, RefreshCw, RotateCcw, Sparkles } from "lucide-react";
import { AISidecar } from "@/components/ai/ai-sidecar";
import { Inspector } from "@/components/shared/inspector";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MicrosoftTodoCreateDialog } from "@/components/tasks/microsoft-todo-create-dialog";
import { TaskAssistant } from "@/components/tasks/task-assistant";
import { completeMicrosoftTodoTaskAction, reopenMicrosoftTodoTaskAction, syncAndBackupMicrosoftTodoAction, syncMicrosoftTodoAction } from "@/features/tasks/microsoft-todo";
import { useWorkspacePanel } from "@/components/layout/workspace-panel-provider";

type TodoList = { id: string; display_name: string; is_default: boolean };
type TodoTask = { id: string; title: string; body_text: string | null; status: string; due_at: string | null; completed_at: string | null; todo_list_id: string; importance: string };
type Filter = "all" | "priority" | "due";

function TaskRow({ task, listName, onOpen }: { task: TodoTask; listName: string; onOpen: () => void }) {
  return <article className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 border-b px-3 py-3 last:border-b-0 hover:bg-[var(--surface-hover)]">
    <form action={completeMicrosoftTodoTaskAction}><input type="hidden" name="task_id" value={task.id} /><button aria-label={`完成 ${task.title}`} className="mt-0.5 rounded-full text-[var(--text-tertiary)] hover:text-[var(--accent)]"><CheckCircle2 className="size-[19px]" aria-hidden="true" /></button></form>
    <button type="button" onClick={onOpen} className="min-w-0 text-left"><h2 className="truncate text-sm font-medium">{task.title || "无标题任务"}</h2>{task.body_text ? <p className="mt-1 line-clamp-1 text-xs text-[var(--text-secondary)]">{task.body_text}</p> : null}</button>
    <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]"><span className={task.importance === "high" ? "text-[var(--accent)]" : ""}>{task.importance === "high" ? "高优先级" : listName}</span>{task.due_at ? <time className="font-mono tabular-nums">{new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(task.due_at))}</time> : null}</div>
  </article>;
}

export function TaskWorkspace({ lists, tasks, initialCreateOpen = false }: { lists: TodoList[]; tasks: TodoTask[]; initialCreateOpen?: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedTask, setSelectedTask] = useState<TodoTask | null>(null);
  const tasksAssistant = useWorkspacePanel("tasks-ai");
  const tasksInspector = useWorkspacePanel("tasks-inspector");
  const listNames = useMemo(() => new Map(lists.map((list) => [list.id, list.display_name])), [lists]);
  const active = tasks.filter((task) => task.status !== "completed");
  const completed = tasks.filter((task) => task.status === "completed");
  const visible = active.filter((task) => filter === "all" || (filter === "priority" && task.importance === "high") || (filter === "due" && Boolean(task.due_at)));
  const filterLabel: Record<Filter, string> = { all: "全部", priority: "高优先", due: "有截止日期" };
  const openTask = (task: TodoTask) => { setSelectedTask(task); tasksInspector.open(); };
  const closeInspector = () => { tasksInspector.close(); setSelectedTask(null); };
  return <section className="flex h-[calc(100dvh-var(--toolbar-height))] min-h-[540px] overflow-hidden bg-[var(--surface-canvas)]">
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex min-h-[var(--toolbar-height)] flex-wrap items-center justify-between gap-3 border-b px-4 py-2"><div className="flex items-center gap-1"><h1 className="mr-2 text-base font-semibold">Tasks</h1>{(["all", "priority", "due"] as Filter[]).map((item) => <button key={item} type="button" onClick={() => setFilter(item)} aria-pressed={filter === item} className={`rounded-[var(--radius-sm)] px-2 py-1 text-xs ${filter === item ? "bg-[var(--surface-selected)] text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"}`}>{filterLabel[item]}</button>)}</div><div className="flex items-center gap-1"><Button type="button" variant="ghost" size="sm" onClick={tasksAssistant.toggle} aria-pressed={tasksAssistant.isOpen}><Sparkles aria-hidden="true" />AI</Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Tasks 更多操作"><MoreHorizontal aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><form action={syncMicrosoftTodoAction}><button className="flex w-full items-center gap-2"><RefreshCw aria-hidden="true" />刷新 Microsoft To Do</button></form></DropdownMenuItem><DropdownMenuItem asChild><form action={syncAndBackupMicrosoftTodoAction}><button className="w-full text-left">对齐并备份</button></form></DropdownMenuItem></DropdownMenuContent></DropdownMenu><MicrosoftTodoCreateDialog lists={lists} initialOpen={initialCreateOpen} /></div></header>
      <div className="workspace-scroll min-h-0 flex-1 overflow-y-auto"><div className="grid min-h-full xl:grid-cols-[minmax(0,1fr)_240px]"><main className="min-w-0"><div className="flex items-center justify-between border-b px-4 py-3"><p className="text-xs text-[var(--text-secondary)]">{filterLabel[filter]} · {visible.length}</p><p className="text-xs text-[var(--text-tertiary)]">完成后自动同步</p></div>{visible.length ? <div>{visible.map((task) => <TaskRow key={task.id} task={task} listName={listNames.get(task.todo_list_id) || "任务"} onOpen={() => openTask(task)} />)}</div> : <div className="px-4 py-14 text-center"><p className="text-sm font-medium">没有符合条件的待办</p><p className="mt-2 text-xs text-[var(--text-secondary)]">可以新建任务，或切换筛选查看其他任务。</p></div>}</main><aside className="hidden border-l bg-[var(--surface-sidebar)] p-4 xl:block"><p className="text-xs font-medium text-[var(--text-tertiary)]">清单</p><div className="mt-3 space-y-1">{lists.map((list) => <div key={list.id} className="flex items-center justify-between py-1.5 text-sm"><span className="truncate">{list.display_name}</span><span className="font-mono text-xs text-[var(--text-tertiary)] tabular-nums">{active.filter((task) => task.todo_list_id === list.id).length}</span></div>)}</div>{completed.length ? <details className="mt-7 border-t pt-4"><summary className="cursor-pointer text-sm text-[var(--text-secondary)]">已完成 {completed.length}</summary><div className="mt-3 space-y-2">{completed.slice(0, 12).map((task) => <div key={task.id} className="flex items-center justify-between gap-2 text-xs"><span className="min-w-0 truncate text-[var(--text-tertiary)] line-through">{task.title || "无标题任务"}</span><form action={reopenMicrosoftTodoTaskAction}><input type="hidden" name="task_id" value={task.id} /><button aria-label={`恢复 ${task.title || "无标题任务"}`} className="shrink-0 text-[var(--accent)] hover:underline"><RotateCcw className="size-3.5" aria-hidden="true" /></button></form></div>)}</div></details> : null}</aside></div></div>
    </div>
    <Inspector open={tasksInspector.isOpen && Boolean(selectedTask)} title="任务详情" onClose={closeInspector}>{selectedTask ? <div className="space-y-6"><section><p className="text-xs text-[var(--text-tertiary)]">标题</p><p className="mt-1 text-sm font-medium">{selectedTask.title}</p></section>{selectedTask.body_text ? <section><p className="text-xs text-[var(--text-tertiary)]">说明</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">{selectedTask.body_text}</p></section> : null}<dl className="grid gap-3 text-sm"><div><dt className="text-xs text-[var(--text-tertiary)]">清单</dt><dd className="mt-1">{listNames.get(selectedTask.todo_list_id) || "任务"}</dd></div><div><dt className="text-xs text-[var(--text-tertiary)]">截止</dt><dd className="mt-1">{selectedTask.due_at ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "long", timeStyle: "short" }).format(new Date(selectedTask.due_at)) : "未设置"}</dd></div><div><dt className="text-xs text-[var(--text-tertiary)]">同步</dt><dd className="mt-1">Microsoft To Do</dd></div></dl></div> : null}</Inspector>
    <AISidecar open={tasksAssistant.isOpen} onClose={tasksAssistant.close} context="Tasks"><TaskAssistant lists={lists} /></AISidecar>
  </section>;
}
