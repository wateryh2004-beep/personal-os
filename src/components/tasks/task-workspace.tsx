"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Flag,
  MoreHorizontal,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { AISidecar } from "@/components/ai/ai-sidecar";
import { Inspector } from "@/components/shared/inspector";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MicrosoftTodoCreateDialog } from "@/components/tasks/microsoft-todo-create-dialog";
import {
  completeMicrosoftTodoTaskAction,
  createMicrosoftTodoTaskAction,
  deleteMicrosoftTodoTaskAction,
  reopenMicrosoftTodoTaskAction,
  syncAndBackupMicrosoftTodoAction,
  syncMicrosoftTodoAction,
  updateMicrosoftTodoTaskAction,
} from "@/features/tasks/microsoft-todo";
import {
  getLocalTaskDayBounds,
  resolveQuickAddTarget,
  selectTasksForView,
  type TaskDayBounds,
  type TaskView,
} from "@/features/tasks/task-view";
import type { TodoList, TodoTask, UpdateTaskPatch } from "@/features/tasks/types";
import { useWorkspacePanel } from "@/components/layout/workspace-panel-provider";
import { EntityBacklinks } from "@/components/links/entity-backlinks";
import { EntityMarkdown } from "@/components/links/entity-markdown";
import { MentionTextarea } from "@/components/links/entity-mention-textarea";
import { useActionFeedback } from "@/components/shared/action-feedback";
import { loadWorkspaceSession, saveWorkspaceSession } from "@/lib/workspace-session";
import { formatDate } from "@/lib/format";
import { useWorkspaceScrollRestoration } from "@/components/shared/use-workspace-scroll-restoration";
import { tasksWorkspaceResource } from "@/features/tasks/workspace-resource";

const TaskAssistant = dynamic(
  () => import("@/components/tasks/task-assistant").then((module) => module.TaskAssistant),
  { ssr: false },
);

const labels: Record<TaskView, string> = {
  today: "今天",
  upcoming: "即将到来",
  all: "全部",
  completed: "已完成",
};

const listName = (lists: TodoList[], id: string) =>
  lists.find((list) => list.id === id)?.displayName || "任务";

const quickDueAt = (dayOffset: number) => {
  const due = new Date();
  due.setDate(due.getDate() + dayOffset);
  due.setHours(23, 59, 0, 0);
  return due.toISOString();
};

function TaskRow({
  task,
  selected,
  onOpen,
  onToggle,
  onUpdate,
}: {
  task: TodoTask;
  selected: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onUpdate: (patch: UpdateTaskPatch) => void;
}) {
  const completed = task.status === "completed";
  const dueLabel = task.dueAt ? formatDate(task.dueAt) : null;

  return (
    <article
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`打开任务：${task.title}`}
      data-selected={selected || undefined}
      className={`group relative grid cursor-pointer grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-2.5 border-b border-[var(--border-subtle)] py-3.5 pr-1 transition-colors ui-transition focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)] ${
        selected ? "bg-[var(--surface-selected)]" : "hover:bg-[var(--surface-hover)]"
      }`}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        aria-label={`${completed ? "恢复" : "完成"} ${task.title}`}
        className={`-m-2 mt-[-6px] inline-flex size-10 items-center justify-center rounded-full transition-[background-color,color] ui-transition sm:m-0 sm:mt-0.5 sm:size-6 ${
          completed
            ? "text-[var(--accent)] hover:bg-[var(--accent-soft)]"
            : "text-[var(--text-tertiary)] hover:bg-[var(--surface-control)] hover:text-[var(--accent)]"
        }`}
      >
        {completed ? (
          <span className="relative inline-flex size-[18px] items-center justify-center rounded-full bg-[var(--accent)] text-white">
            <Check className="size-3" strokeWidth={2.5} aria-hidden="true" />
          </span>
        ) : (
          <Circle className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />
        )}
      </button>

      <div className="min-w-0">
        <h2
          className={`truncate text-[14px] font-medium tracking-[-0.01em] ${
            completed
              ? "text-[var(--text-tertiary)] line-through decoration-[color-mix(in_srgb,var(--text-tertiary)_55%,transparent)]"
              : "text-[var(--text-primary)]"
          }`}
        >
          {task.title}
        </h2>
        {task.bodyText ? (
          <p className="mt-1 line-clamp-1 max-w-[68ch] text-[12px] leading-5 text-[var(--text-secondary)]">
            {task.bodyText}
          </p>
        ) : null}
        {task.importance === "high" || dueLabel ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] text-[var(--text-tertiary)]">
            {task.importance === "high" ? (
              <span className="font-medium text-[var(--warning)]">高优先级</span>
            ) : null}
            {dueLabel ? <span>{dueLabel}</span> : null}
          </div>
        ) : null}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`${task.title} 更多操作`}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            className={`-my-2 inline-flex size-10 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-tertiary)] transition-[background-color,color,opacity] ui-transition hover:bg-[var(--surface-control)] hover:text-[var(--text-secondary)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] md:my-0 md:size-8 md:focus:opacity-100 md:data-[state=open]:opacity-100 ${
              selected ? "md:opacity-70" : "md:opacity-0 md:group-hover:opacity-60"
            }`}
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem onSelect={onToggle} className="min-h-11 sm:min-h-9">
            {completed ? <RotateCcw /> : <Check />}
            {completed ? "恢复任务" : "完成任务"}
          </DropdownMenuItem>
          {!completed ? (
            <>
              <DropdownMenuItem
                onSelect={() => onUpdate({ dueAt: quickDueAt(0) })}
                className="min-h-11 sm:min-h-9"
              >
                <CalendarDays />设为今天
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onUpdate({ dueAt: quickDueAt(1) })}
                className="min-h-11 sm:min-h-9"
              >
                <CalendarDays />设为明天
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  onUpdate({ importance: task.importance === "high" ? "normal" : "high" })
                }
                className="min-h-11 sm:min-h-9"
              >
                <Flag />
                {task.importance === "high" ? "取消高优先级" : "设为高优先级"}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </article>
  );
}

function QuickAdd({
  listId,
  listLabel,
  onCreated,
}: {
  listId: string;
  listLabel: string;
  onCreated: (task: TodoTask, temporaryId?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "").trim();
    if (!title) return;

    const temporaryId = `optimistic-${crypto.randomUUID()}`;
    onCreated({
      id: temporaryId,
      providerTaskId: temporaryId,
      todoListId: listId,
      title,
      bodyText: null,
      status: "notStarted",
      importance: "normal",
      dueAt: null,
      completedAt: null,
      lastModifiedAt: null,
    });
    event.currentTarget.reset();
    setOpen(false);

    start(async () => {
      const result = await createMicrosoftTodoTaskAction({ status: "idle", message: "" }, form);
      setMessage(result.message);
      if (result.status === "success" && result.taskId) {
        onCreated(
          {
            id: result.taskId,
            providerTaskId: result.taskId,
            todoListId: listId,
            title,
            bodyText: null,
            status: "notStarted",
            importance: "normal",
            dueAt: null,
            completedAt: null,
            lastModifiedAt: null,
          },
          temporaryId,
        );
      } else {
        onCreated(
          {
            id: "",
            providerTaskId: temporaryId,
            todoListId: listId,
            title: "",
            bodyText: null,
            status: "notStarted",
            importance: "normal",
            dueAt: null,
            completedAt: null,
            lastModifiedAt: null,
          },
          temporaryId,
        );
      }
    });
  };

  return (
    <div className="py-3">
      {open ? (
        <form onSubmit={submit} className="flex items-center gap-2">
          <span className="inline-flex size-6 shrink-0 items-center justify-center text-[var(--accent)]">
            <Plus className="size-4" aria-hidden="true" />
          </span>
          <input
            autoFocus
            name="title"
            required
            maxLength={500}
            placeholder="新建任务"
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
            }}
            className="h-9 min-w-0 flex-1 border-0 border-b border-[var(--border-strong)] bg-transparent px-0 text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)]"
          />
          <input type="hidden" name="todo_list_id" value={listId} />
          <input type="hidden" name="body_text" value="" />
          <input type="hidden" name="importance" value="normal" />
          <input type="hidden" name="due_at" value="" />
          <Button disabled={pending} size="sm">
            {pending ? "添加中…" : "添加"}
          </Button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-11 items-center gap-2 text-[13px] font-medium text-[var(--accent)] transition-opacity ui-transition hover:opacity-75 sm:min-h-8"
        >
          <Plus className="size-4" aria-hidden="true" />
          新建任务
        </button>
      )}
      <p className="pl-8 text-[10.5px] leading-4 text-[var(--text-tertiary)]">
        添加到 {listLabel}
      </p>
      {message ? (
        <p role="status" className="mt-1 pl-8 text-[11px] text-[var(--text-tertiary)]">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function TaskInspector({
  task,
  list,
  onClose,
  update,
  remove,
}: {
  task: TodoTask;
  list: string;
  onClose: () => void;
  update: (patch: UpdateTaskPatch) => Promise<void>;
  remove: () => Promise<void>;
}) {
  const [title, setTitle] = useState(task.title);
  const [body, setBody] = useState(task.bodyText ?? "");
  const [editing, setEditing] = useState<"title" | "body" | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [message, setMessage] = useState("");

  const save = async (patch: UpdateTaskPatch) => {
    try {
      await update(patch);
      setEditing(null);
      setMessage("已保存");
    } catch {
      setMessage("保存失败，已恢复原值。");
    }
  };

  return (
    <Inspector open title="任务详情" onClose={onClose} className="tasks-inspector">
      <div className="space-y-0">
        <div className="flex justify-end pb-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="任务更多操作">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setDeleteOpen(true)}>
                <Trash2 />删除任务
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <section className="border-b border-[var(--border-subtle)] pb-5">
          {editing === "title" ? (
            <input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => {
                if (title !== task.title) void save({ title });
                else setEditing(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void save({ title });
                if (event.key === "Escape") {
                  setTitle(task.title);
                  setEditing(null);
                }
              }}
              className="w-full border-0 border-b border-[var(--accent)] bg-transparent px-0 pb-1 text-[19px] font-semibold tracking-[-0.025em] text-[var(--text-primary)] outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing("title")}
              className="w-full text-left text-[19px] font-semibold leading-7 tracking-[-0.025em] text-[var(--text-primary)]"
            >
              {task.title}
            </button>
          )}
        </section>

        <section className="border-b border-[var(--border-subtle)] py-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-tertiary)]">
              说明
            </p>
            {!editing && task.bodyText ? (
              <button
                type="button"
                onClick={() => setEditing("body")}
                className="text-[11px] font-medium text-[var(--accent)]"
              >
                编辑
              </button>
            ) : null}
          </div>
          {editing === "body" ? (
            <MentionTextarea
              autoFocus
              value={body}
              onChange={setBody}
              onBlur={() => {
                if (body !== (task.bodyText ?? "")) void save({ bodyText: body || null });
                else setEditing(null);
              }}
              rows={5}
              placeholder="输入 @ 引用笔记、日程或文件"
              className="mt-3 min-h-28 w-full resize-y rounded-[var(--radius-md)] border-0 bg-[var(--surface-control)] p-3 text-sm leading-6"
            />
          ) : task.bodyText ? (
            <div className="mt-2">
              <EntityMarkdown body={task.bodyText} className="text-sm leading-6" />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditing("body")}
              className="mt-2 text-left text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            >
              添加说明…
            </button>
          )}
        </section>

        <dl className="divide-y divide-[var(--border-subtle)] border-b border-[var(--border-subtle)]">
          <div className="grid grid-cols-[84px_minmax(0,1fr)] items-center gap-3 py-3.5">
            <dt className="text-[12px] text-[var(--text-tertiary)]">清单</dt>
            <dd className="text-[13px] text-[var(--text-primary)]">{list}</dd>
          </div>
          <div className="grid grid-cols-[84px_minmax(0,1fr)] items-center gap-3 py-3.5">
            <dt className="text-[12px] text-[var(--text-tertiary)]">截止日期</dt>
            <dd>
              <input
                type="datetime-local"
                value={task.dueAt?.slice(0, 16) ?? ""}
                onChange={(event) =>
                  void save({
                    dueAt: event.target.value ? new Date(event.target.value).toISOString() : null,
                  })
                }
                className="h-8 max-w-full rounded-[var(--radius-md)] border-0 bg-[var(--surface-control)] px-2 text-[12px] text-[var(--text-primary)] outline-none"
              />
            </dd>
          </div>
          <div className="grid grid-cols-[84px_minmax(0,1fr)] items-center gap-3 py-3.5">
            <dt className="text-[12px] text-[var(--text-tertiary)]">优先级</dt>
            <dd>
              <select
                value={task.importance}
                onChange={(event) =>
                  void save({ importance: event.target.value as TodoTask["importance"] })
                }
                className="h-8 rounded-[var(--radius-md)] border-0 bg-[var(--surface-control)] px-2 text-[12px] text-[var(--text-primary)] outline-none"
              >
                <option value="low">低</option>
                <option value="normal">普通</option>
                <option value="high">高</option>
              </select>
            </dd>
          </div>
        </dl>

        <div className="pt-5">
          <EntityBacklinks type="todo_task" id={task.id} />
        </div>

        {message ? (
          <p role="status" className="pt-4 text-[11px] text-[var(--text-tertiary)]">
            {message}
          </p>
        ) : null}
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <h2 className="text-lg font-semibold">删除任务？</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            将从 Microsoft To Do 删除“{task.title}”。
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                void remove()
                  .then(onClose)
                  .catch(() => setMessage("删除失败，任务已恢复。"))
              }
            >
              删除
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Inspector>
  );
}

export function TaskWorkspace({
  lists,
  tasks,
  initialDayBounds,
  initialCreateOpen = false,
  initialTaskId,
}: {
  lists: TodoList[];
  tasks: TodoTask[];
  initialDayBounds: TaskDayBounds;
  initialCreateOpen?: boolean;
  initialTaskId?: string;
}) {
  const [rows, setRows] = useState(tasks);
  const [view, setView] = useState<TaskView>(initialTaskId ? "all" : "today");
  const [listId, setListId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialTaskId ?? null);
  const [dayBounds, setDayBounds] = useState(initialDayBounds);
  const assistant = useWorkspacePanel("tasks-ai");
  const { show } = useActionFeedback();
  const listScrollRef = useWorkspaceScrollRestoration("tasks:list");

  useEffect(() => {
    setDayBounds(getLocalTaskDayBounds());
  }, []);

  useEffect(() => {
    if (initialTaskId) return;
    const restore = window.setTimeout(() => {
      const session = loadWorkspaceSession<{
        view?: TaskView;
        listId?: string | null;
        selectedId?: string | null;
      }>("tasks:workspace");
      if (!session) return;
      if (session.view) setView(session.view);
      if (session.listId !== undefined) setListId(session.listId);
      if (session.selectedId && tasks.some((task) => task.id === session.selectedId)) {
        setSelectedId(session.selectedId);
      }
    }, 0);
    return () => window.clearTimeout(restore);
  }, [initialTaskId, tasks]);

  useEffect(() => {
    saveWorkspaceSession("tasks:workspace", { view, listId, selectedId });
  }, [listId, selectedId, view]);

  useEffect(() => {
    tasksWorkspaceResource.mutate((workspace) =>
      workspace ? { ...workspace, lists, tasks: rows } : undefined,
    );
  }, [lists, rows]);

  const selected = rows.find((task) => task.id === selectedId) ?? null;
  const quickAddTarget = useMemo(() => resolveQuickAddTarget(lists, listId), [listId, lists]);
  const currentListLabel = listId ? listName(lists, listId) : "全部清单";

  useEffect(() => {
    const reconcileAgentMutation = (event: Event) => {
      const detail = (
        event as CustomEvent<{ actionType?: string; proposal?: Record<string, unknown> }>
      ).detail;
      const proposal = detail?.proposal;
      const taskId = typeof proposal?.taskId === "string" ? proposal.taskId : null;
      if (!taskId) return;
      setRows((current) => {
        if (detail.actionType === "tasks.delete") {
          return current.filter((task) => task.id !== taskId);
        }
        if (detail.actionType === "tasks.complete") {
          return current.map((task) =>
            task.id === taskId
              ? { ...task, status: "completed", completedAt: new Date().toISOString() }
              : task,
          );
        }
        if (detail.actionType === "tasks.reopen") {
          return current.map((task) =>
            task.id === taskId ? { ...task, status: "notStarted", completedAt: null } : task,
          );
        }
        if (
          detail.actionType === "tasks.update" &&
          proposal?.patch &&
          typeof proposal.patch === "object"
        ) {
          return current.map((task) =>
            task.id === taskId ? { ...task, ...(proposal.patch as UpdateTaskPatch) } : task,
          );
        }
        return current;
      });
    };
    window.addEventListener("personal-os:tasks-mutated", reconcileAgentMutation);
    return () => window.removeEventListener("personal-os:tasks-mutated", reconcileAgentMutation);
  }, []);

  const mutate = async (
    id: string,
    apply: (task: TodoTask) => TodoTask,
    request: () => Promise<void>,
  ) => {
    const before = rows;
    setRows((current) => current.map((task) => (task.id === id ? apply(task) : task)));
    try {
      await request();
    } catch (error) {
      setRows(before);
      throw error;
    }
  };

  const toggle = async (task: TodoTask) => {
    const form = new FormData();
    form.set("task_id", task.id);
    try {
      await mutate(
        task.id,
        (row) =>
          task.status === "completed"
            ? { ...row, status: "notStarted", completedAt: null }
            : { ...row, status: "completed", completedAt: new Date().toISOString() },
        () =>
          task.status === "completed"
            ? reopenMicrosoftTodoTaskAction(form)
            : completeMicrosoftTodoTaskAction(form),
      );
      if (task.status !== "completed") {
        show({
          message: "任务已完成",
          tone: "success",
          undo: () => {
            const undo = new FormData();
            undo.set("task_id", task.id);
            void mutate(
              task.id,
              (row) => ({ ...row, status: "notStarted", completedAt: null }),
              () => reopenMicrosoftTodoTaskAction(undo),
            ).catch(() =>
              show({ message: "恢复失败，任务状态已重新同步。", tone: "error" }),
            );
          },
        });
      }
    } catch {
      show({ message: "更新失败，任务已恢复原状态。", tone: "error" });
    }
  };

  const visible = useMemo(
    () => selectTasksForView(rows, { view, listId, dayBounds }),
    [dayBounds, listId, rows, view],
  );

  const onCreated = (task: TodoTask, temporaryId?: string) =>
    setRows((current) =>
      temporaryId
        ? task.id
          ? [...current.filter((row) => row.id !== temporaryId), task]
          : current.filter((row) => row.id !== temporaryId)
        : [...current, task],
    );

  const updateFromRow = (task: TodoTask, patch: UpdateTaskPatch) => {
    void mutate(
      task.id,
      (row) => ({ ...row, ...patch }),
      () => updateMicrosoftTodoTaskAction({ taskId: task.id, ...patch }),
    ).catch(() => show({ message: "更新失败，任务已恢复原状态。", tone: "error" }));
  };

  return (
    <section className="flex h-[calc(var(--app-viewport-height)-var(--toolbar-height)-var(--tab-bar-height))] min-h-0 overflow-hidden bg-[var(--surface-canvas)]">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="shrink-0 px-5 pb-3 pt-5 sm:px-7 lg:px-10">
          <div className="mx-auto flex max-w-[980px] items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2.5">
                <h1 className="text-[28px] font-semibold tracking-[-0.035em] text-[var(--text-primary)]">
                  任务
                </h1>
                <span className="text-[12px] tabular-nums text-[var(--text-tertiary)]">
                  {visible.length}
                </span>
              </div>
              <nav
                className="mt-3 flex items-center gap-5 overflow-x-auto"
                aria-label="任务视图"
              >
                {(["today", "upcoming", "all", "completed"] as TaskView[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setView(item)}
                    aria-pressed={view === item}
                    className={`relative shrink-0 pb-1.5 text-[12px] font-medium transition-colors ui-transition ${
                      view === item
                        ? "text-[var(--text-primary)] after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-[var(--text-primary)]"
                        : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                    }`}
                  >
                    {labels[item]}
                  </button>
                ))}
              </nav>

              <div className="mt-3 xl:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`切换任务清单，当前：${currentListLabel}`}
                      className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--surface-control)] px-3 text-[12px] font-medium text-[var(--text-secondary)] transition-colors ui-transition hover:text-[var(--text-primary)] sm:min-h-9"
                    >
                      <span className="text-[var(--text-tertiary)]">清单</span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate text-[var(--text-primary)]">{currentListLabel}</span>
                      <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-56">
                    <DropdownMenuItem
                      onSelect={() => setListId(null)}
                      className="min-h-11 sm:min-h-9"
                    >
                      <Check className={!listId ? "opacity-100" : "opacity-0"} />
                      全部清单
                    </DropdownMenuItem>
                    {lists.map((list) => (
                      <DropdownMenuItem
                        key={list.id}
                        onSelect={() => setListId(list.id)}
                        className="min-h-11 sm:min-h-9"
                      >
                        <Check className={listId === list.id ? "opacity-100" : "opacity-0"} />
                        {list.displayName}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="sm" onClick={assistant.toggle}>
                <Sparkles />
                <span className="hidden sm:inline">AI</span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="同步与更多操作">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <form action={syncMicrosoftTodoAction}>
                      <button className="flex w-full items-center gap-2">
                        <RefreshCw />刷新
                      </button>
                    </form>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <form action={syncAndBackupMicrosoftTodoAction}>
                      <button className="w-full text-left">对齐并备份</button>
                    </form>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <MicrosoftTodoCreateDialog lists={lists} initialOpen={initialCreateOpen} />
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1fr)_220px]">
          <main ref={listScrollRef} className="workspace-scroll overflow-y-auto px-5 sm:px-7 lg:px-10">
            <div className="mx-auto max-w-[760px] pb-8">
              {quickAddTarget ? (
                <QuickAdd
                  listId={quickAddTarget.id}
                  listLabel={quickAddTarget.displayName}
                  onCreated={onCreated}
                />
              ) : null}
              <div className="border-t border-[var(--border-subtle)]">
                {visible.length ? (
                  visible.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      selected={task.id === selectedId}
                      onOpen={() => setSelectedId(task.id)}
                      onToggle={() => void toggle(task)}
                      onUpdate={(patch) => updateFromRow(task, patch)}
                    />
                  ))
                ) : (
                  <div className="flex min-h-64 flex-col justify-center py-16 text-left">
                    <CheckCircle2
                      className="size-5 text-[var(--text-tertiary)]"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    <h2 className="mt-4 text-[15px] font-medium text-[var(--text-primary)]">
                      {view === "completed" ? "还没有已完成的任务" : "这里暂时没有任务"}
                    </h2>
                    <p className="mt-1.5 max-w-sm text-[13px] leading-6 text-[var(--text-secondary)]">
                      {view === "today"
                        ? "今天没有到期事项。可以把注意力留给真正需要推进的事情。"
                        : "切换视图或清单，也可以直接新建一条任务。"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </main>

          <aside className="hidden border-l border-[var(--border-subtle)] px-4 py-5 xl:block">
            <p className="px-2 text-[10.5px] font-medium uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
              清单
            </p>
            <div className="mt-2 space-y-0.5">
              <button
                type="button"
                onClick={() => setListId(null)}
                aria-pressed={!listId}
                className={`block h-8 w-full truncate rounded-[var(--radius-md)] px-2 text-left text-[12.5px] transition-colors ui-transition ${
                  !listId
                    ? "bg-[var(--surface-selected)] font-medium text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                }`}
              >
                全部清单
              </button>
              {lists.map((list) => (
                <button
                  key={list.id}
                  type="button"
                  onClick={() => setListId(list.id)}
                  aria-pressed={listId === list.id}
                  className={`block h-8 w-full truncate rounded-[var(--radius-md)] px-2 text-left text-[12.5px] transition-colors ui-transition ${
                    listId === list.id
                      ? "bg-[var(--surface-selected)] font-medium text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {list.displayName}
                </button>
              ))}
            </div>
          </aside>
        </div>
      </div>

      {selected ? (
        <TaskInspector
          task={selected}
          list={listName(lists, selected.todoListId)}
          onClose={() => setSelectedId(null)}
          update={(patch) =>
            mutate(
              selected.id,
              (task) => ({ ...task, ...patch }),
              () => updateMicrosoftTodoTaskAction({ taskId: selected.id, ...patch }),
            )
          }
          remove={async () => {
            const before = rows;
            setRows((current) => current.filter((task) => task.id !== selected.id));
            const form = new FormData();
            form.set("task_id", selected.id);
            try {
              await deleteMicrosoftTodoTaskAction(form);
            } catch (error) {
              setRows(before);
              throw error;
            }
          }}
        />
      ) : null}

      {assistant.isOpen ? (
        <AISidecar open onClose={assistant.close} context="Tasks">
          <TaskAssistant />
        </AISidecar>
      ) : null}
    </section>
  );
}
