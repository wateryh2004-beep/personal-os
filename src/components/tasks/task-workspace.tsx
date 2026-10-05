"use client";

import { useWorkspaceResourceLease } from "@/lib/workspace-resource-cache";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { releaseMobileBackLayerForNavigation } from "@/lib/mobile/use-mobile-back-layer";
import { formatDate } from "@/lib/format";
import { useWorkspaceScrollRestoration } from "@/components/shared/use-workspace-scroll-restoration";
import { tasksWorkspaceResource as tasksResource } from "@/features/tasks/workspace-resource";

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
  pending,
  onOpen,
  onToggle,
  onUpdate,
}: {
  task: TodoTask;
  selected: boolean;
  pending: boolean;
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
      aria-current={selected ? "true" : undefined}
      className={`ui-selectable-row group relative -mx-2 grid cursor-pointer grid-cols-[26px_minmax(0,1fr)_auto] items-start gap-2.5 rounded-[10px] px-2 py-[13px] pr-2 transition-[background-color,box-shadow] ui-transition after:absolute after:bottom-0 after:left-[36px] after:right-2 after:h-px after:bg-[var(--separator)] last:after:hidden focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)] ${
        selected ? "bg-[var(--surface-selected)] after:opacity-0" : "hover:bg-[var(--surface-hover)]"
      }`}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        disabled={pending}
        aria-busy={pending}
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
          className={`truncate text-[14px] font-medium leading-[22px] ${
            completed
              ? "text-[var(--text-tertiary)] line-through decoration-[color-mix(in_srgb,var(--text-tertiary)_55%,transparent)]"
              : "text-[var(--text-primary)]"
          }`}
        >
          {task.title}
        </h2>
        {task.bodyText ? (
          <p className="mt-1 line-clamp-1 max-w-[68ch] text-[13px] leading-5 text-[var(--text-secondary)]">
            {task.bodyText}
          </p>
        ) : null}
        {task.importance === "high" || dueLabel ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] leading-5 text-[var(--text-tertiary)]">
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
            disabled={pending}
            aria-label={`${task.title} 更多操作`}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            className={`pressable -my-2 inline-flex size-10 items-center justify-center rounded-[9px] text-[var(--text-tertiary)] hover:bg-[var(--surface-control)] hover:text-[var(--text-secondary)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] md:my-0 md:size-8 ui-more-action`}
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
  onUnconfirmed,
  onReveal,
}: {
  listId: string;
  listLabel: string;
  onCreated: (task: TodoTask | null, temporaryId?: string) => void;
  onUnconfirmed: () => void;
  onReveal: (task: TodoTask) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [createdTask, setCreatedTask] = useState<TodoTask | null>(null);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const submittingRef = useRef(false);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "").trim();
    if (!title || submittingRef.current) return;
    submittingRef.current = true;
    setMessage("");
    setCreatedTask(null);

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
      try {
        const result = await createMicrosoftTodoTaskAction({ status: "idle", message: "" }, form);
        setMessage(result.message);
        if (result.status === "success" && result.taskId) {
          setDraftTitle("");
          const created: TodoTask = {
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
          };
          onCreated(created, temporaryId);
          setCreatedTask(created);
          setMessage("已添加，未设截止时间");
        } else {
          onCreated(null, temporaryId);
          setDraftTitle(title);
          setOpen(true);
          setMessage("添加结果尚未确认，请重新读取后检查，避免重复创建。");
          onUnconfirmed();
        }
      } catch {
        onCreated(null, temporaryId);
        setDraftTitle(title);
        setOpen(true);
        setMessage("添加结果尚未确认，请重新读取后检查，避免重复创建。");
        onUnconfirmed();
      } finally {
        submittingRef.current = false;
      }
    });
  };

  return (
    <div className="py-2.5">
      {open ? (
        <form onSubmit={submit} className="flex items-center gap-2">
          <span className="inline-flex size-6 shrink-0 items-center justify-center text-[var(--accent)]">
            <Plus className="size-4" aria-hidden="true" />
          </span>
          <input
            autoFocus
            name="title"
            defaultValue={draftTitle}
            required
            maxLength={500}
            placeholder="新建任务"
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
            }}
            className="h-9 min-w-0 flex-1 border-0 border-b border-transparent bg-transparent px-0 text-[13.5px] text-[var(--text-primary)] outline-none transition-[border-color] ui-transition placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)]"
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
          disabled={pending}
          onClick={() => setOpen(true)}
          className="pressable inline-flex min-h-11 items-center gap-2 rounded-[8px] px-1 text-[12.5px] font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] sm:min-h-8"
        >
          <Plus className="size-4" aria-hidden="true" />
          新建任务
        </button>
      )}
      <p className="pl-8 text-[10px] leading-4 text-[var(--text-tertiary)]">
        添加到 {listLabel}
      </p>
      {message ? (
        <p role="status" className="mt-1 pl-8 text-[10.5px] text-[var(--text-tertiary)]">
          {message}
          {createdTask ? <button type="button" onClick={() => onReveal(createdTask)} className="pressable ml-2 inline-flex min-h-11 items-center rounded-md px-1 text-[12px] font-medium text-[var(--accent)]">查看任务</button> : null}
        </p>
      ) : null}
    </div>
  );
}

function TaskInspector({
  task,
  list,
  pending,
  onClose,
  update,
  remove,
}: {
  task: TodoTask;
  list: string;
  pending: boolean;
  onClose: () => void;
  update: (patch: UpdateTaskPatch) => Promise<void>;
  remove: () => Promise<void>;
}) {
  const [title, setTitle] = useState(task.title);
  const [body, setBody] = useState(task.bodyText ?? "");
  const [editing, setEditing] = useState<"title" | "body" | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [message, setMessage] = useState("");

  const savingRef = useRef(false);

  const save = async (patch: UpdateTaskPatch) => {
    if (savingRef.current || pending) return;
    savingRef.current = true;
    try {
      await update(patch);
      setEditing(null);
      setMessage("已保存");
    } catch {
      setMessage("保存结果尚未确认，请重新读取后检查。");
    } finally {
      savingRef.current = false;
    }
  };

  return (
    <Inspector open title="任务详情" onClose={onClose} className="tasks-inspector">
      <div className="space-y-0">
        <div className="flex justify-end pb-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="任务更多操作">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={pending} onSelect={() => setDeleteOpen(true)}>
                <Trash2 />删除任务
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <section className="border-b border-[var(--separator)] pb-4.5">
          {editing === "title" ? (
            <input
              autoFocus
              disabled={pending}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => {
                if (title !== task.title) void save({ title });
                else setEditing(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void save({ title });
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  setTitle(task.title);
                  setEditing(null);
                }
              }}
              className="w-full border-0 border-b border-[var(--accent)] bg-transparent px-0 pb-1 text-[18px] font-semibold tracking-[-0.025em] text-[var(--text-primary)] outline-none"
            />
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => { setTitle(task.title); setEditing("title"); }}
              className="w-full text-left text-[18px] font-semibold leading-6 tracking-[-0.03em] text-[var(--text-primary)]"
            >
              {task.title}
            </button>
          )}
        </section>

        <section className="border-b border-[var(--separator)] py-4.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10.5px] font-semibold tracking-[0.08em] text-[var(--text-tertiary)]">
              说明
            </p>
            {!editing && task.bodyText ? (
              <button
                type="button"
                disabled={pending}
              onClick={() => { setBody(task.bodyText ?? ""); setEditing("body"); }}
                className="text-[11px] font-medium text-[var(--accent)]"
              >
                编辑
              </button>
            ) : null}
          </div>
          {editing === "body" ? (
            <fieldset disabled={pending} aria-busy={pending}>
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
              className="mt-2.5 min-h-28 w-full resize-y rounded-[10px] border-0 bg-[var(--surface-control)] p-3 text-[12.5px] leading-5.5 outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_14%,transparent)]"
            />
            </fieldset>
          ) : task.bodyText ? (
            <div className="mt-1.5">
              <EntityMarkdown body={task.bodyText} className="text-[12.5px] leading-5.5 text-[var(--text-secondary)]" />
            </div>
          ) : (
            <button
              type="button"
              disabled={pending}
                onClick={() => { setBody(task.bodyText ?? ""); setEditing("body"); }}
              className="mt-1.5 text-left text-[12.5px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            >
              添加说明…
            </button>
          )}
        </section>

        <dl className="divide-y divide-[var(--border-subtle)] border-b border-[var(--border-subtle)]">
          <div className="grid grid-cols-[80px_minmax(0,1fr)] items-center gap-3 py-3">
            <dt className="text-[11.5px] text-[var(--text-tertiary)]">清单</dt>
            <dd className="text-[12.5px] text-[var(--text-primary)]">{list}</dd>
          </div>
          <div className="grid grid-cols-[84px_minmax(0,1fr)] items-center gap-3 py-3.5">
            <dt className="text-[12px] text-[var(--text-tertiary)]">截止日期</dt>
            <dd>
              <input
                type="datetime-local"
                disabled={pending}
                value={task.dueAt?.slice(0, 16) ?? ""}
                onChange={(event) =>
                  void save({
                    dueAt: event.target.value ? new Date(event.target.value).toISOString() : null,
                  })
                }
                className="ui-field h-8 max-w-full rounded-[9px] border-0 bg-[var(--surface-control)] px-2 text-[12px] text-[var(--text-primary)] outline-none"
              />
            </dd>
          </div>
          <div className="grid grid-cols-[84px_minmax(0,1fr)] items-center gap-3 py-3.5">
            <dt className="text-[12px] text-[var(--text-tertiary)]">优先级</dt>
            <dd>
              <select
                disabled={pending}
                value={task.importance}
                onChange={(event) =>
                  void save({ importance: event.target.value as TodoTask["importance"] })
                }
                className="ui-field h-8 rounded-[9px] border-0 bg-[var(--surface-control)] px-2 text-[12px] text-[var(--text-primary)] outline-none"
              >
                <option value="low">低</option>
                <option value="normal">普通</option>
                <option value="high">高</option>
              </select>
            </dd>
          </div>
        </dl>

        <div className="pt-4.5">
          <EntityBacklinks type="todo_task" id={task.id} />
        </div>

        {message ? (
          <p role="status" className="pt-3.5 text-[10.5px] text-[var(--text-tertiary)]">
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
              disabled={pending}
              onClick={() =>
                void remove()
                  .then(onClose)
                  .catch(() => setMessage("删除结果尚未确认，请重新读取后检查。"))
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

  const tasksWorkspaceResource = useWorkspaceResourceLease(tasksResource);
  const router = useRouter();
  const [rows, setRows] = useState(tasks);
  const rowsRef = useRef(tasks);
  const pendingPatches = useRef(new Map<string, Partial<TodoTask>>());
  const pendingBaselines = useRef(new Map<string, TodoTask>());
  const locallyPublishedRows = useRef(new WeakSet<TodoTask[]>());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [sessionReady, setSessionReady] = useState(false);
  const linkedTaskRef = useRef(initialTaskId);
  // undefined: route owns selection; string/null: a local replace is pending.
  const taskNavigationIntent = useRef<string | null | undefined>(undefined);
  const supersededTaskTargets = useRef(new Set<string | null>());
  const [taskNavigationVersion, setTaskNavigationVersion] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const retryingRef = useRef(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [view, setView] = useState<TaskView>(initialTaskId ? "all" : "today");
  const [listId, setListId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialTaskId ?? null);
  const [dayBounds, setDayBounds] = useState(initialDayBounds);
  const assistant = useWorkspacePanel("tasks-ai");
  const { show } = useActionFeedback();
  const listScrollRef = useWorkspaceScrollRestoration("tasks:list");

  useEffect(() => {
    const reconcileDay = window.setTimeout(() => setDayBounds(getLocalTaskDayBounds()), 0);
    return () => window.clearTimeout(reconcileDay);
  }, []);

  // Publish only local edits. Mirroring every render back into the resource can
  // overwrite a newer server response before its rows have reached this component.
  const updateRows = useCallback((updater: (current: TodoTask[]) => TodoTask[]) => {
    const next = updater(rowsRef.current);
    rowsRef.current = next;
    locallyPublishedRows.current.add(next);
    setRows(next);
    tasksWorkspaceResource.mutate((workspace) => workspace ? { ...workspace, tasks: next } : undefined);
  }, [tasksWorkspaceResource]);

  useEffect(() => {
    // Resource props also echo our optimistic cache writes. Only a server read
    // may advance the rollback baseline while an edit is pending.
    if (!locallyPublishedRows.current.has(tasks)) {
      for (const task of tasks) {
        if (pendingPatches.current.has(task.id)) pendingBaselines.current.set(task.id, task);
      }
    }
    const next = tasks.map((task) => ({ ...task, ...pendingPatches.current.get(task.id) }));
    for (const task of rowsRef.current) {
      if (!next.some((row) => row.id === task.id) && (task.id.startsWith("optimistic-") || pendingPatches.current.has(task.id))) next.push(task);
    }
    rowsRef.current = next;
    // The authoritative workspace can refresh without remounting this route.
    setRows(next);
  }, [tasks]);

  useEffect(() => {
    const restore = window.setTimeout(() => {
      if (!linkedTaskRef.current) {
        const session = loadWorkspaceSession<{ view?: TaskView; listId?: string | null; selectedId?: string | null }>("tasks:workspace");
        if (session?.view && Object.hasOwn(labels, session.view)) setView(session.view);
        if (session?.listId !== undefined) setListId(session.listId);
        if (session?.selectedId && rowsRef.current.some((task) => task.id === session.selectedId)) setSelectedId(session.selectedId);
      }
      setSessionReady(true);
    }, 0);
    return () => window.clearTimeout(restore);
  }, []);

  useEffect(() => {
    if (sessionReady) saveWorkspaceSession("tasks:workspace", { view, listId, selectedId });
  }, [listId, selectedId, sessionReady, view]);

  useEffect(() => {
    // Search-param navigation reuses the mounted workspace, including Back/Forward.
    linkedTaskRef.current = initialTaskId;
    const intent = taskNavigationIntent.current;
    if (intent !== undefined) {
      const incoming = initialTaskId ?? null;
      // Ignore only known older local responses. A newer external navigation
      // may cancel our replace, so its current-URL target must be allowed in.
      if (incoming !== intent && (supersededTaskTargets.current.has(incoming) || new URL(window.location.href).searchParams.get("task") !== incoming)) return;
      taskNavigationIntent.current = undefined;
      supersededTaskTargets.current.clear();
    }
    if (!initialTaskId) {
      // URL selection is external navigation state, including browser Back.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedId(null);
      return;
    }
    setSelectedId(initialTaskId);
    setListId(null);
    setView(rowsRef.current.find((task) => task.id === initialTaskId)?.status === "completed" ? "completed" : "all");
  }, [initialTaskId, taskNavigationVersion]);

  useEffect(() => {
    const acceptTarget = (target: string | null) => {
      supersededTaskTargets.current.clear();
      supersededTaskTargets.current.add(initialTaskId ?? null);
      taskNavigationIntent.current = target;
      setTaskNavigationVersion((current) => current + 1);
    };
    const acceptHistoryNavigation = () => {
      const target = new URL(window.location.href).searchParams.get("task");
      // Same-URL mobile overlay history is dismissal, not a new record request.
      if (target !== (initialTaskId ?? null)) acceptTarget(target);
    };
    const acceptNavigationStart = (event: Event) => {
      const href = (event as CustomEvent<{ href?: unknown }>).detail?.href;
      if (typeof href !== "string") return;
      let url: URL;
      try { url = new URL(href, window.location.origin); } catch { return; }
      if (url.origin === window.location.origin && url.pathname === window.location.pathname) acceptTarget(url.searchParams.get("task"));
    };
    const acceptLinkNavigation = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
      const url = new URL(link.href);
      if (url.origin === window.location.origin && url.pathname === window.location.pathname) acceptTarget(url.searchParams.get("task"));
    };
    window.addEventListener("popstate", acceptHistoryNavigation);
    window.addEventListener("personal-os:navigation-start", acceptNavigationStart);
    document.addEventListener("click", acceptLinkNavigation);
    return () => {
      window.removeEventListener("popstate", acceptHistoryNavigation);
      window.removeEventListener("personal-os:navigation-start", acceptNavigationStart);
      document.removeEventListener("click", acceptLinkNavigation);
    };
  }, [initialTaskId]);

  const closeTask = (id = selectedId) => {
    setSelectedId((current) => current === id ? null : current);
    const intent = taskNavigationIntent.current;
    // A completed older mutation must not dismiss a newer pending selection.
    if (intent !== undefined && intent !== id) return;
    const url = new URL(window.location.href);
    const linkedId = url.searchParams.get("task");
    if (intent === undefined && linkedId !== id) return;
    supersededTaskTargets.current.add(initialTaskId ?? null);
    if (intent !== undefined) supersededTaskTargets.current.add(intent);
    taskNavigationIntent.current = null;
    url.searchParams.delete("task");
    releaseMobileBackLayerForNavigation("side-panel:inspector");
    router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
  };

  useEffect(() => {
    if (!selectedId) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) closeTask();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  });

  const openTask = (task: TodoTask) => {
    setSelectedId(task.id);
    if ((initialTaskId && initialTaskId !== task.id) || taskNavigationIntent.current !== undefined) {
      supersededTaskTargets.current.add(initialTaskId ?? null);
      if (taskNavigationIntent.current !== undefined) supersededTaskTargets.current.add(taskNavigationIntent.current);
      taskNavigationIntent.current = task.id;
      const url = new URL(window.location.href);
      url.searchParams.set("task", task.id);
      router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
    }
  };

  const retryTasks = async () => {
    if (retryingRef.current) return;
    retryingRef.current = true;
    setRetrying(true);
    try { await tasksWorkspaceResource.revalidate({ force: true }); setTaskError(null); }
    catch { show({ message: "暂时无法读取任务，请稍后重试。", tone: "error" }); }
    finally { retryingRef.current = false; setRetrying(false); }
  };

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
      updateRows((current) => {
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
  }, [updateRows]);

  const mutate = async (
    id: string,
    apply: (task: TodoTask) => TodoTask,
    request: () => Promise<void>,
  ) => {
    if (pendingPatches.current.has(id)) return;
    const before = rowsRef.current.find((task) => task.id === id);
    if (!before || id.startsWith("optimistic-")) return;
    const optimistic = apply(before);
    const keys = (Object.keys(optimistic) as (keyof TodoTask)[]).filter((key) => optimistic[key] !== before[key]);
    const patch = Object.fromEntries(keys.map((key) => [key, optimistic[key]])) as Partial<TodoTask>;
    pendingPatches.current.set(id, patch);
    pendingBaselines.current.set(id, before);
    setPendingIds(new Set(pendingPatches.current.keys()));
    updateRows((current) => current.map((task) => task.id === id ? { ...task, ...patch } : task));
    try {
      await request();
    } catch (error) {
      setTaskError("操作结果尚未确认；本地显示已回退，请重新读取后检查。");
      // Only roll back fields still owned by this optimistic edit. Other rows
      // and newer agent/server changes must survive a failed request.
      const baseline = pendingBaselines.current.get(id) ?? before;
      updateRows((current) => current.map((task) => {
        if (task.id !== id) return task;
        const rollback = Object.fromEntries(keys.filter((key) => task[key] === optimistic[key]).map((key) => [key, baseline[key]]));
        return { ...task, ...rollback };
      }));
      throw error;
    } finally {
      pendingPatches.current.delete(id);
      pendingBaselines.current.delete(id);
      setPendingIds(new Set(pendingPatches.current.keys()));
    }
  };

  const toggle = async (task: TodoTask) => {
    if (pendingPatches.current.has(task.id) || task.id.startsWith("optimistic-")) return;
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
              show({ message: "恢复结果尚未确认，请重新读取后检查。", tone: "error" }),
            );
          },
        });
      }
    } catch {
      show({ message: "更新结果尚未确认，请重新读取后检查。", tone: "error" });
    }
  };

  const visible = useMemo(
    () => selectTasksForView(rows, { view, listId, dayBounds }),
    [dayBounds, listId, rows, view],
  );

  const onCreated = (task: TodoTask | null, temporaryId?: string) =>
    updateRows((current) =>
      temporaryId
        ? task?.id
          ? [...current.filter((row) => row.id !== temporaryId && row.id !== task.id), current.find((row) => row.id === task.id) ?? task]
          : current.filter((row) => row.id !== temporaryId)
        : task ? [...current, task] : current,
    );

  const updateFromRow = (task: TodoTask, patch: UpdateTaskPatch) => {
    void mutate(
      task.id,
      (row) => ({ ...row, ...patch }),
      () => updateMicrosoftTodoTaskAction({ taskId: task.id, ...patch }),
    ).catch(() => show({ message: "更新结果尚未确认，请重新读取后检查。", tone: "error" }));
  };

  return (
    <section className="tasks-workspace flex h-[calc(var(--app-viewport-height)-var(--toolbar-height)-var(--tab-bar-height))] min-h-0 overflow-hidden bg-[var(--surface-canvas)]">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="shrink-0 px-5 pb-2.5 pt-[18px] sm:px-7 lg:px-10">
          <div className="mx-auto flex max-w-[980px] items-start justify-between gap-3.5">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2.5">
                <h1 className="page-title">
                  任务
                </h1>
                <span className="text-[12px] leading-5 tabular-nums text-[var(--text-tertiary)]">
                  {visible.length}
                </span>
              </div>
              <nav
                className="tasks-view-tabs mt-2.5 flex items-center gap-4.5 overflow-x-auto"
                aria-label="任务视图"
              >
                {(["today", "upcoming", "all", "completed"] as TaskView[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setView(item)}
                    aria-pressed={view === item}
                    className={`relative shrink-0 pb-2 text-[13px] leading-5 font-medium transition-colors ui-transition ${
                      view === item
                        ? "text-[var(--text-primary)] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[var(--accent)]"
                        : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                    }`}
                  >
                    {labels[item]}
                  </button>
                ))}
              </nav>

              <div className="mt-2.5 xl:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`切换任务清单，当前：${currentListLabel}`}
                      className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-[9px] bg-[var(--surface-control)] px-3 text-[12px] font-medium text-[var(--text-secondary)] transition-colors ui-transition hover:text-[var(--text-primary)] sm:min-h-9"
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
              <Button variant="ghost" size="sm" onClick={assistant.toggle} aria-label="打开任务 AI">
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

        <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1fr)_216px]">
          <main ref={listScrollRef} className="workspace-scroll overflow-y-auto px-5 sm:px-7 lg:px-10">
            <div className="mx-auto max-w-[748px] pb-8">
              {quickAddTarget ? (
                <QuickAdd
                  listId={quickAddTarget.id}
                  listLabel={quickAddTarget.displayName}
                  onCreated={onCreated}
                  onReveal={(task) => {
                    setView("all");
                    if (listId && listId !== task.todoListId) setListId(task.todoListId);
                    openTask(task);
                  }}
                  onUnconfirmed={() => setTaskError("添加结果尚未确认，请重新读取后检查，避免重复创建。")}
                />
              ) : null}
              {taskError ? <p role="status" className="mb-3 text-xs leading-5 text-[var(--warning)]">{taskError} <button type="button" disabled={retrying} onClick={() => void retryTasks()} className="ml-2 font-medium underline">{retrying ? "读取中…" : "重新读取"}</button></p> : null}
              <div className="border-t border-[var(--separator)]">
                {visible.length ? (
                  visible.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      selected={task.id === selectedId}
                      pending={pendingIds.has(task.id) || task.id.startsWith("optimistic-")}
                      onOpen={() => openTask(task)}
                      onToggle={() => void toggle(task)}
                      onUpdate={(patch) => updateFromRow(task, patch)}
                    />
                  ))
                ) : (
                  <div className="flex min-h-60 flex-col justify-center py-14 text-left">
                    <CheckCircle2
                      className="size-5 text-[var(--text-tertiary)]"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    <h2 className="mt-3.5 text-[14px] font-medium text-[var(--text-primary)]">
                      {view === "completed" ? "还没有已完成的任务" : "这里暂时没有任务"}
                    </h2>
                    <p className="mt-1 max-w-sm text-[12px] leading-5.5 text-[var(--text-secondary)]">
                      {view === "today"
                        ? "今天没有到期事项。可以把注意力留给真正需要推进的事情。"
                        : "切换视图或清单，也可以直接新建一条任务。"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </main>

          <aside className="hidden border-l border-[var(--separator)] px-3.5 py-4.5 xl:block">
            <p className="px-2 text-[10px] font-semibold tracking-[0.08em] text-[var(--text-tertiary)]">
              清单
            </p>
            <div className="mt-1.5 space-y-px">
              <button
                type="button"
                onClick={() => setListId(null)}
                aria-pressed={!listId}
                className={`block h-8 w-full truncate rounded-[9px] px-2 text-left text-[12.5px] transition-colors ui-transition ${
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
                  className={`block h-8 w-full truncate rounded-[9px] px-2 text-left text-[12.5px] transition-colors ui-transition ${
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

      {selectedId && !selected ? (
        <Inspector open title="任务详情" onClose={() => closeTask(selectedId)} className="tasks-inspector">
          <p role="status" className="text-sm text-[var(--text-secondary)]">没有找到这条任务，可能已删除或尚未同步。</p>
          <Button className="mt-3" variant="outline" disabled={retrying} onClick={() => void retryTasks()}>{retrying ? "读取中…" : "重新读取"}</Button>
        </Inspector>
      ) : null}
      {selected ? (
        <TaskInspector
          key={selected.id}
          task={selected}
          pending={pendingIds.has(selected.id) || selected.id.startsWith("optimistic-")}
          list={listName(lists, selected.todoListId)}
          onClose={() => closeTask(selectedId)}
          update={(patch) =>
            mutate(
              selected.id,
              (task) => ({ ...task, ...patch }),
              () => updateMicrosoftTodoTaskAction({ taskId: selected.id, ...patch }),
            )
          }
          remove={async () => {
            if (pendingPatches.current.has(selected.id)) throw new Error("task_mutation_pending");
            pendingPatches.current.set(selected.id, {});
            setPendingIds(new Set(pendingPatches.current.keys()));
            const form = new FormData();
            form.set("task_id", selected.id);
            try {
              await deleteMicrosoftTodoTaskAction(form);
              updateRows((current) => current.filter((task) => task.id !== selected.id));
            } catch (error) {
              setTaskError("删除结果尚未确认，请重新读取后检查。");
              throw error;
            } finally {
              pendingPatches.current.delete(selected.id);
              setPendingIds(new Set(pendingPatches.current.keys()));
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
