"use client";

import { SourceLink as Link } from "@/components/workflow-continuity/source-link";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { useWorkflowDraft } from "@/features/workflow-continuity/drafts";
import {
  Archive,
  FileText,
  Plus,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  createCalendarEvent,
  type CalendarCreateState,
} from "@/features/calendar/actions";
import {
  archiveInboxItem,
  cancelInboxUndispatchedIntent,
  captureInboxItem,
  convertInboxToDailyNote,
  convertInboxToNote,
  convertInboxToProject,
  convertInboxToLink,
  readInboxProjectChoices,
  dismissInboxProposal,
  reclassifyInboxItem,
  restoreInboxItem,
} from "@/features/inbox/actions";
import type { InboxProposal } from "@/features/inbox/schemas";
import {
  initialInboxCaptureState,
  initialInboxClassifyState,
} from "@/features/inbox/state";
import {
  createMicrosoftTodoTaskAction,
  type TodoCreateState,
} from "@/features/tasks/microsoft-todo";
import { useActionFeedback } from "@/components/shared/action-feedback";

type InboxItem = {
  id: string;
  content_markdown: string;
  created_at: string;
  processed_at: string | null;
  converted_task_id: string | null;
  converted_todo_task_id: string | null;
  converted_note_id: string | null;
  archived_at?: string | null;
  ai_proposal: InboxProposal | null;
  ai_status: "ready" | "failed" | null;
  ai_error: string | null;
};
type TodoList = { id: string; display_name: string; is_default: boolean };
type ManualKind = "task" | "calendar" | "note" | "daily" | "project" | "link";

const calendarInitial: CalendarCreateState = { status: "idle", message: "" };
const todoInitial: TodoCreateState = { status: "idle", message: "" };
const proposalCardClass =
  "mt-2.5 rounded-[11px] bg-[color-mix(in_srgb,var(--accent-soft)_62%,var(--surface-canvas))] p-3";
const primaryActionClass =
  "pressable h-8 rounded-[8px] bg-[var(--accent)] px-2.5 text-[12px] font-medium text-white hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_18%,transparent)] disabled:cursor-not-allowed disabled:opacity-60";

const inboxDraftSchema = z.object({ title: z.string().max(500).optional(), body: z.string().max(10_000).optional(), listId: z.string().max(36).optional(), dueAt: z.string().max(50).optional(), startsAt: z.string().max(50).optional(), endsAt: z.string().max(50).optional(), projectId: z.string().max(36).optional(), url: z.string().max(2048).optional(), requestId: z.uuid() }).strict();
type InboxFormDraft = z.infer<typeof inboxDraftSchema>;
function useInboxFormDraft(item: InboxItem, kind: ManualKind, initial: Omit<InboxFormDraft,"requestId">, result: { status: string }) {
  const draft = useWorkflowDraft({ kind: "capture", id: `inbox-${kind}-${item.id}`, label: `收集箱 · ${firstLine(item.content_markdown).slice(0,50)}`, resumeHref: `/inbox?entry=${item.id}&draft=${kind}`, initialValue: { ...initial, requestId: crypto.randomUUID() }, parse: value => { const parsed = inboxDraftSchema.safeParse(value); return parsed.success ? parsed.data : null; } });
  const submitted = useRef<InboxFormDraft | null>(null);
  const clear = draft.clear;
  useEffect(() => { if (result.status === "success" && submitted.current) clear(submitted.current); }, [result, clear]);
  return { ...draft, submit: () => { submitted.current = draft.value; }, patch: (value: Partial<InboxFormDraft>) => draft.setValue(previous => ({ ...previous, ...value })) };
}

function firstLine(text: string) {
  return text.split(/\n/)[0].trim();
}

/** 任一确认/识别动作成功后刷新服务端列表，让条目落到对应分区。 */
function useRefreshOnSuccess(status: string) {
  const router = useRouter();
  useEffect(() => {
    if (status !== "success") return;
    const timer = window.setTimeout(() => router.refresh(), 120);
    return () => window.clearTimeout(timer);
  }, [status, router]);
}

function ProposalCard({
  proposal,
  inboxId,
  lists,
}: {
  proposal: InboxProposal;
  inboxId: string;
  lists: TodoList[];
}) {
  if (proposal.target === "task")
    return <TaskProposal proposal={proposal} lists={lists} inboxId={inboxId} />;
  if (proposal.target === "calendar")
    return <CalendarProposal proposal={proposal} inboxId={inboxId} />;
  if (proposal.target === "note")
    return <NoteProposal proposal={proposal} inboxId={inboxId} />;
  return <DailyProposal inboxId={inboxId} />;
}

function TaskProposal({
  proposal,
  lists,
  inboxId,
}: {
  proposal: Extract<InboxProposal, { target: "task" }>;
  lists: TodoList[];
  inboxId: string;
}) {
  const [state, action, pending] = useActionState(
    createMicrosoftTodoTaskAction,
    todoInitial,
  );
  useRefreshOnSuccess(state.status);
  const list = lists.find((item) => item.id === proposal.todoListId);
  if (!list)
    return (
      <p className="mt-3 rounded-[9px] bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-800">
        目标 To Do 清单尚未同步。请先刷新任务。
      </p>
    );
  return (
    <form
      action={action}
      className={proposalCardClass}
    >
      <p className="text-[12.5px] font-semibold text-[var(--text-primary)]">{proposal.title}</p>
      {proposal.bodyText ? (
        <p className="mt-1 whitespace-pre-wrap text-[12px] leading-5 text-[var(--text-secondary)]">
          {proposal.bodyText}
        </p>
      ) : null}
      <p className="mt-2 text-[12px] text-[var(--text-tertiary)]">
        任务 · {list.display_name}
        {proposal.dueAt
          ? ` · ${new Date(proposal.dueAt).toLocaleString("zh-CN")}`
          : ""}
      </p>
      <input type="hidden" name="todo_list_id" value={proposal.todoListId} />
      <input type="hidden" name="title" value={proposal.title} />
      <input type="hidden" name="body_text" value={proposal.bodyText ?? ""} />
      <input type="hidden" name="importance" value={proposal.importance} />
      <input type="hidden" name="due_at" value={proposal.dueAt ?? ""} />
      <input type="hidden" name="inbox_id" value={inboxId} />
      <button
        disabled={pending}
        className={`mt-3 ${primaryActionClass}`}
      >
        {pending ? "正在创建…" : "同意，创建任务"}
      </button>
      {state.status !== "idle" ? (
        <p
          role="status"
          className={`mt-2 text-[12px] ${state.status === "success" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function CalendarProposal({
  proposal,
  inboxId,
}: {
  proposal: Extract<InboxProposal, { target: "calendar" }>;
  inboxId: string;
}) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(
    createCalendarEvent,
    calendarInitial,
  );
  useRefreshOnSuccess(state.status);
  return (
    <form
      action={action}
      className={proposalCardClass}
    >
      <p className="text-[12.5px] font-semibold text-[var(--text-primary)]">{proposal.subject}</p>
      {proposal.description ? (
        <p className="mt-1 whitespace-pre-wrap text-[12px] leading-5 text-[var(--text-secondary)]">
          {proposal.description}
        </p>
      ) : null}
      <p className="mt-2 text-[12px] text-[var(--text-tertiary)]">
        日程 · {new Date(proposal.startsAt).toLocaleString("zh-CN")}
      </p>
      <input type="hidden" name="subject" value={proposal.subject} />
      <input
        type="hidden"
        name="description"
        value={proposal.description ?? ""}
      />
      <input type="hidden" name="request_id" value={requestId} /><input type="hidden" name="starts_at" value={proposal.startsAt} />
      <input type="hidden" name="ends_at" value={proposal.endsAt} />
      <input
        type="hidden"
        name="location_name"
        value={proposal.locationName ?? ""}
      />
      <input
        type="hidden"
        name="is_all_day"
        value={proposal.isAllDay ? "on" : ""}
      />
      <input type="hidden" name="inbox_id" value={inboxId} />
      <button
        disabled={pending}
        className={`mt-3 ${primaryActionClass}`}
      >
        {pending ? "正在创建…" : "同意，创建日程"}
      </button>
      {state.status !== "idle" ? (
        <p
          role="status"
          className={`mt-2 text-[12px] ${state.status === "success" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function NoteProposal({
  proposal,
  inboxId,
}: {
  proposal: Extract<InboxProposal, { target: "note" }>;
  inboxId: string;
}) {
  const [state, action, pending] = useActionState(
    convertInboxToNote,
    initialInboxCaptureState,
  );
  useRefreshOnSuccess(state.status);
  return (
    <form
      action={action}
      className={proposalCardClass}
    >
      <p className="text-[12.5px] font-semibold text-[var(--text-primary)]">{proposal.title}</p>
      <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[12px] leading-5 text-[var(--text-secondary)]">
        {proposal.bodyMarkdown}
      </p>
      <input type="hidden" name="inbox_id" value={inboxId} />
      <input type="hidden" name="title" value={proposal.title} />
      <input type="hidden" name="body_markdown" value={proposal.bodyMarkdown} />
      <button
        disabled={pending}
        className={`mt-3 ${primaryActionClass}`}
      >
        {pending ? "正在创建…" : "同意，创建笔记"}
      </button>
      {state.status !== "idle" ? (
        <p
          role="status"
          className={`mt-2 text-[12px] ${state.status === "success" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function DailyProposal({ inboxId }: { inboxId: string }) {
  const [state, action, pending] = useActionState(
    convertInboxToDailyNote,
    initialInboxCaptureState,
  );
  useRefreshOnSuccess(state.status);
  return (
    <form
      action={action}
      className={proposalCardClass}
    >
      <p className="text-[12.5px] font-semibold text-[var(--text-primary)]">写入今日日记</p>
      <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">
        确认后会追加到今天日记的“感受与想法”，并保留收集箱来源。
      </p>
      <input type="hidden" name="inbox_id" value={inboxId} />
      <button
        disabled={pending || state.status === "success"}
        className={`mt-3 inline-flex items-center gap-1 ${primaryActionClass}`}
      >
        <FileText size={14} />
        {pending ? "正在写入…" : state.status === "success" ? "已写入" : "同意，写入今日日记"}
      </button>
      {state.status !== "idle" ? (
        <p
          role="status"
          className={`mt-2 text-[12px] ${state.status === "success" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
        >
          {state.message}
          {state.destinationHref ? (
            <Link className="ml-2 underline" href={state.destinationHref}>
              打开日记
            </Link>
          ) : null}
        </p>
      ) : null}
    </form>
  );
}

function DismissProposalControl({ inboxId }: { inboxId: string }) {
  const [state, action, pending] = useActionState(
    dismissInboxProposal,
    initialInboxClassifyState,
  );
  useRefreshOnSuccess(state.status);
  return (
    <form action={action} className="mt-2">
      <input type="hidden" name="inbox_id" value={inboxId} />
      <button
        disabled={pending}
        className="text-[12px] text-[var(--text-tertiary)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline disabled:opacity-50"
      >
        {pending ? "处理中…" : "不是这个，放回收集盒"}
      </button>
      {state.status === "error" ? (
        <span role="status" className="ml-2 text-[12px] text-[var(--danger)]">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

function ReclassifyControl({ inboxId }: { inboxId: string }) {
  const [state, action, pending] = useActionState(
    reclassifyInboxItem,
    initialInboxClassifyState,
  );
  useRefreshOnSuccess(state.status);
  return (
    <form action={action}>
      <input type="hidden" name="inbox_id" value={inboxId} />
      <button
        disabled={pending}
        className="pressable inline-flex items-center gap-1 rounded-[7px] px-1 py-0.5 text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-50"
      >
        <Sparkles size={13} />
        {pending ? "识别中…" : "智能整理"}
      </button>
      {state.status !== "idle" ? (
        <span
          role="status"
          className={`ml-2 text-[12px] ${state.status === "success" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
        >
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

function ArchiveInboxControl({ inboxId }: { inboxId: string }) {
  const [state, action, pending] = useActionState(
    archiveInboxItem,
    initialInboxCaptureState,
  );
  const { show } = useActionFeedback();
  const router = useRouter();
  useRefreshOnSuccess(state.status);
  useEffect(() => {
    if (state.status !== "success") return;
    show({ message: "已归档收集箱记录", tone: "success", undo: () => {
      const form = new FormData(); form.set("inbox_id", inboxId);
      void restoreInboxItem(initialInboxCaptureState, form).then((result) => { if (result.status === "success") router.refresh(); else show({ message: result.message, tone: "error" }); }).catch(() => show({ message: "恢复失败，该项目仍在归档区。", tone: "error" }));
    } });
  }, [inboxId, router, show, state.status]);
  return (
    <form action={action} className="shrink-0">
      <input type="hidden" name="inbox_id" value={inboxId} />
      <button disabled={pending} aria-label="归档这条记录" title="归档（可撤回）" className="pressable rounded-[8px] p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"><Archive size={16} /></button>
      {state.status === "error" ? (
        <p role="status" className="mt-1 max-w-44 text-right text-[12px] text-[var(--danger)]">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function RestoreInboxControl({ inboxId }: { inboxId: string }) {
  const [state, action, pending] = useActionState(
    restoreInboxItem,
    initialInboxCaptureState,
  );
  return (
    <form action={action}>
      <input type="hidden" name="inbox_id" value={inboxId} />
      <button
        disabled={pending}
        className="pressable inline-flex items-center gap-1 rounded-[7px] px-1 py-0.5 text-[12px] font-medium text-[var(--accent)] disabled:opacity-50"
      >
        <RotateCcw size={13} />
        {pending ? "恢复中…" : "恢复"}
      </button>
      {state.status === "error" ? (
        <p role="status" className="mt-1 text-[12px] text-[var(--danger)]">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}
function toLocalInput(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}
function addHoursToInput(input: string, hours: number) {
  if (!input) return "";
  const date = new Date(input);
  date.setHours(date.getHours() + hours);
  return toLocalInput(date);
}
function inputToIso(input: string) {
  return input ? new Date(input).toISOString() : "";
}

const inputClass =
  "ui-field h-9 w-full rounded-[9px] border border-transparent bg-[var(--surface-control)] px-2.5 text-[12.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_14%,transparent)]";

function ManualTaskForm({
  item,
  lists,
}: {
  item: InboxItem;
  lists: TodoList[];
}) {
  const [state, action, pending] = useActionState(
    createMicrosoftTodoTaskAction,
    todoInitial,
  );
  useRefreshOnSuccess(state.status);
  const defaultList = lists.find((list) => list.is_default) ?? lists[0];
  const draft = useInboxFormDraft(item, "task", { title: firstLine(item.content_markdown).slice(0,500), listId: defaultList?.id ?? "", dueAt: "" }, state);
  const listId = draft.value.listId ?? "", dueAt = draft.value.dueAt ?? "";
  return (
    <form action={action} onSubmitCapture={draft.submit} className={`${proposalCardClass} space-y-2`}>
      <p className="text-xs font-semibold text-[var(--foreground)]">手动转成任务</p>
      <input type="hidden" name="todo_list_id" value={listId} />
      <input type="hidden" name="importance" value="normal" />
      <input type="hidden" name="due_at" value={inputToIso(dueAt)} />
      <input type="hidden" name="inbox_id" value={item.id} />
      <input type="hidden" name="body_text" value={item.content_markdown} />
      <input aria-label="标题"
        name="title"
        required
        maxLength={500}
        value={draft.value.title ?? ""} onChange={event => draft.patch({ title: event.target.value })}
        placeholder="任务标题"
        className={inputClass}
      />
      <div className="flex gap-2">
        <select aria-label="任务清单"
          value={listId}
          onChange={(event) => draft.patch({ listId: event.target.value })}
          className={inputClass}
        >
          {lists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.display_name}
            </option>
          ))}
        </select>
        <input
          type="datetime-local"
          value={dueAt}
          onChange={(event) => draft.patch({ dueAt: event.target.value })}
          className={inputClass}
          aria-label="截止时间（可选）"
        />
      </div>
      <button
        disabled={pending}
        className={primaryActionClass}
      >
        {pending ? "正在创建…" : "创建任务"}
      </button>
      {state.status !== "idle" ? (
        <p
          role="status"
          className={`text-[12px] ${state.status === "success" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function ManualCalendarForm({ item }: { item: InboxItem }) {
  const [state, action, pending] = useActionState(
    createCalendarEvent,
    calendarInitial,
  );
  useRefreshOnSuccess(state.status);
  const [initialRange] = useState(() => {
    const start = new Date();
    start.setHours(start.getHours() + 1, 0, 0, 0);
    const end = new Date(start.getTime() + 3_600_000);
    return { start: toLocalInput(start), end: toLocalInput(end) };
  });
  const draft = useInboxFormDraft(item, "calendar", { title: firstLine(item.content_markdown).slice(0,500), startsAt: initialRange.start, endsAt: initialRange.end }, state);
  const startsAt = draft.value.startsAt ?? "", endsAt = draft.value.endsAt ?? "", requestId = draft.value.requestId;
  const setStart = (value: string) => draft.patch({ startsAt: value, endsAt: addHoursToInput(value,1) });
  const setEnd = (value: string) => draft.patch({ endsAt: value });
  return (
    <form action={action} onSubmitCapture={draft.submit} className={`${proposalCardClass} space-y-2`}>
      <p className="text-xs font-semibold text-[var(--foreground)]">手动转成日程</p>
      <input type="hidden" name="request_id" value={requestId} /><input type="hidden" name="starts_at" value={inputToIso(startsAt)} />
      <input type="hidden" name="ends_at" value={inputToIso(endsAt)} />
      <input type="hidden" name="is_all_day" value="" />
      <input type="hidden" name="inbox_id" value={item.id} />
      <input type="hidden" name="description" value={item.content_markdown} />
      <input aria-label="日程标题"
        name="subject"
        required
        maxLength={500}
        value={draft.value.title ?? ""} onChange={event => draft.patch({ title: event.target.value })}
        placeholder="日程标题"
        className={inputClass}
      />
      <div className="flex gap-2">
        <input
          type="datetime-local"
          value={startsAt}
          onChange={(event) => setStart(event.target.value)}
          className={inputClass}
          aria-label="开始时间"
        />
        <input
          type="datetime-local"
          value={endsAt}
          onChange={(event) => setEnd(event.target.value)}
          className={inputClass}
          aria-label="结束时间"
        />
      </div>
      <button
        disabled={pending}
        className={primaryActionClass}
      >
        {pending ? "正在创建…" : "创建日程"}
      </button>
      {state.status !== "idle" ? (
        <p
          role="status"
          className={`text-[12px] ${state.status === "success" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function ManualNoteForm({ item }: { item: InboxItem }) {
  const [state, action, pending] = useActionState(
    convertInboxToNote,
    initialInboxCaptureState,
  );
  useRefreshOnSuccess(state.status);
  const draft = useInboxFormDraft(item, "note", { title: firstLine(item.content_markdown).slice(0,240), body: item.content_markdown }, state);
  return (
    <form action={action} onSubmitCapture={draft.submit} className={`${proposalCardClass} space-y-2`}>
      <p className="text-xs font-semibold text-[var(--foreground)]">手动转成笔记</p>
      <input type="hidden" name="inbox_id" value={item.id} />
      <input aria-label="标题"
        name="title"
        required
        maxLength={240}
        value={draft.value.title ?? ""} onChange={event=>draft.patch({ title:event.target.value })}
        placeholder="笔记标题"
        className={inputClass}
      />
      <textarea aria-label="正文"
        name="body_markdown"
        rows={3}
        maxLength={10_000}
        value={draft.value.body ?? ""} onChange={event=>draft.patch({ body:event.target.value })}
        className={inputClass}
      />
      <button
        disabled={pending}
        className={primaryActionClass}
      >
        {pending ? "正在创建…" : "创建笔记"}
      </button>
      {state.status !== "idle" ? (
        <p
          role="status"
          className={`text-[12px] ${state.status === "success" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
        >
          {state.message}
          {state.destinationHref ? (
            <Link className="ml-2 underline" href={state.destinationHref}>
              打开笔记
            </Link>
          ) : null}
        </p>
      ) : null}
    </form>
  );
}

function ManualMaterialForm({ item, kind }: { item: InboxItem; kind: "project" | "link" }) {
  const [state, action, pending] = useActionState(kind === "project" ? convertInboxToProject : convertInboxToLink, initialInboxCaptureState);
  useRefreshOnSuccess(state.status);
  const [choices, setChoices] = useState<Awaited<ReturnType<typeof readInboxProjectChoices>> | null>(null);
  useEffect(() => { if (kind !== "project") return; const current = captureWorkspaceScope(); let active = true; void readInboxProjectChoices().then(value => { if (active && current()) setChoices(value); }).catch(() => { if (active && current()) setChoices({ projects: [], unavailable: true, truncated: false }); }); return () => { active = false; }; }, [kind]);
  const link = item.content_markdown.match(/https?:\/\/[^\s<>]+/)?.[0] ?? "";
  const draft = useInboxFormDraft(item, kind, { title: firstLine(item.content_markdown).slice(0,240), url: link, projectId: "" }, state);
  return <form action={action} onSubmitCapture={draft.submit} className={`${proposalCardClass} space-y-2`}>
    <p className="text-xs font-semibold">{kind === "project" ? "保存为项目资料" : "保存链接笔记"}</p>
    <input type="hidden" name="inbox_id" value={item.id} /><input type="hidden" name="body_markdown" value={item.content_markdown} />
    <input aria-label="资料标题" name="title" required maxLength={240} value={draft.value.title??""} onChange={event=>draft.patch({title:event.target.value})} className={inputClass}/>
    {kind === "project" ? <><select aria-label="关联项目" name="project_id" value={draft.value.projectId??""} onChange={event=>draft.patch({projectId:event.target.value})} required className={inputClass}><option value="">选择项目</option>{choices?.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select>{choices?.unavailable ? <p role="alert">项目暂不可用，请重试。</p> : choices?.truncated ? <p>显示最近 200 个项目。</p> : null}</> : <input aria-label="原始链接" name="url" type="url" required value={draft.value.url??""} onChange={event=>draft.patch({url:event.target.value})} className={inputClass}/>}
    <button disabled={pending || (kind === "project" && (!choices || choices.unavailable))} className={primaryActionClass}>{pending ? "正在保存…" : "确认保存"}</button>
    {state.message ? <p role="status" className="text-xs">{state.message}</p> : null}
  </form>;
}

function InboxTriageQueue({ items, archivedItems, lists }: { items: InboxItem[]; archivedItems: InboxItem[]; lists: TodoList[] }) {
  const [queue, setQueue] = useState(() => items.filter(item => !item.processed_at).map(item => item.id));
  const [history, setHistory] = useState<string[]>([]);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [kind, setKind] = useState<ManualKind>("task");
  const search = useSearchParams();
  const requestedEntry = search.get("entry"), requestedKind = search.get("draft");
  useEffect(() => {
    if (!requestedEntry || !items.some(item=>item.id===requestedEntry && !item.processed_at) || !["task","calendar","note","daily","project","link"].includes(requestedKind??"")) return;
    const timer = window.setTimeout(() => { setQueue(previous=>[requestedEntry,...previous.filter(id=>id!==requestedEntry)]); setReviewId(null); setKind(requestedKind as ManualKind); },0);
    return ()=>window.clearTimeout(timer);
  }, [requestedEntry, requestedKind, items]);
  const heading = useRef<HTMLHeadingElement>(null);
  const terminal = new Set([...items.filter(item => item.processed_at), ...archivedItems].map(item => item.id));
  const activeId = queue.find(id => !terminal.has(id));
  const handledHistory = [...queue.filter(id => terminal.has(id)), ...history];
  useEffect(() => { heading.current?.focus(); }, [activeId]);
  const current = [...items,...archivedItems].find(item => item.id === (reviewId ?? activeId));
  const start = () => { setQueue(items.filter(item => !item.processed_at).map(item => item.id)); setHistory([]); setReviewId(null); };
  return <section className="my-5 rounded-[var(--radius-lg)] border border-[var(--separator)] bg-[var(--surface-canvas)] p-4" aria-label="连续整理收集箱">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 ref={heading} tabIndex={-1} className="font-serif text-lg outline-none">一条一条，整理清楚</h2><span className="text-xs text-[var(--text-secondary)]">已处理 {queue.filter(id=>terminal.has(id)).length} · 当前队列 {queue.filter(id=>!terminal.has(id)).length}</span></div>
    {current ? <article key={current.id} className="mt-3"><p className="whitespace-pre-wrap break-words text-sm leading-7">{current.content_markdown}</p>
      {reviewId || current.processed_at || current.archived_at ? <div className="mt-3 flex flex-wrap items-center gap-3 text-xs"><span>上条记录{current.processed_at ? " · 已处理" : " · 稍后处理"}</span>{current.converted_note_id ? <Link href={`/notes/${current.converted_note_id}`}>打开生成的笔记</Link> : null}{current.converted_todo_task_id ? <Link href={`/tasks?task=${current.converted_todo_task_id}`}>打开任务</Link> : null}<button type="button" onClick={()=>setReviewId(null)} className="min-h-11 px-3">继续当前队列</button></div> : <>
        <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label="整理去向">{([["task","任务"],["note","笔记"],["link","链接"],["project","项目资料"],["calendar","日程"],["daily","今日日记"]] as const).map(([value,label])=><button key={value} type="button" aria-pressed={kind===value} onClick={()=>setKind(value)} className={`min-h-11 rounded-md px-3 text-xs ${kind===value?"bg-[var(--accent-soft)] text-[var(--accent)]":"hover:bg-[var(--surface-hover)]"}`}>{label}</button>)}</div>
        <ManualImportForm kind={kind} item={current} lists={lists}/>
        <div className="mt-2 flex items-center gap-3"><button type="button" className="min-h-11 px-2 text-xs" onClick={()=>{setHistory(previous=>[...previous,current.id]);setQueue(previous=>previous.filter(id=>id!==current.id));heading.current?.focus();}}>稍后处理</button><ArchiveInboxControl inboxId={current.id}/></div>
      </>}
    </article> : <div className="py-5 text-sm"><p>{activeId ? "当前记录暂不可用，尚未确认处理。可刷新后继续。" : "本轮已整理完。稍后处理的内容仍在收集盒。"}</p><button type="button" className="mt-2 min-h-11 rounded-md border px-3" onClick={start}>重新整理待处理内容</button></div>}
    {handledHistory.length ? <button type="button" onClick={()=>setReviewId(handledHistory[handledHistory.length-1])} className="mt-2 min-h-11 text-xs text-[var(--accent)]">回看上一条</button> : null}
  </section>;
}

function InboxIntentRecovery({ inboxId }: { inboxId: string }) {
  const [state, action, pending] = useActionState(cancelInboxUndispatchedIntent, initialInboxCaptureState);
  useRefreshOnSuccess(state.status);
  return <details className="mt-2 text-xs text-[var(--text-secondary)]">
    <summary className="min-h-11 cursor-pointer py-3">上次提交需要处理</summary>
    <p className="leading-6">只可取消尚未发送的任务或日程。结果未知时保留来源，请先到 Microsoft To Do 或 Outlook 核对；重新创建不会绕过待核对记录。</p>
    <form action={action}><input type="hidden" name="inbox_id" value={inboxId} />
      <button disabled={pending} className="ui-action-secondary mt-2 min-h-11 px-3">{pending ? "正在核对…" : "取消尚未发送的意图"}</button>
      {state.message ? <p role="status" className="mt-2 leading-6">{state.message}</p> : null}
    </form>
  </details>;
}

function ManualImportForm({
  kind,
  item,
  lists,
}: {
  kind: ManualKind;
  item: InboxItem;
  lists: TodoList[];
}) {
  const content = kind === "task" ? <ManualTaskForm item={item} lists={lists} />
    : kind === "calendar" ? <ManualCalendarForm item={item} />
      : kind === "note" ? <ManualNoteForm item={item} />
        : kind === "project" || kind === "link" ? <ManualMaterialForm item={item} kind={kind} />
          : <DailyProposal inboxId={item.id} />;
  return <>{content}<InboxIntentRecovery inboxId={item.id} /></>;
}

export function InboxWorkspace({
  items,
  archivedItems,
  lists,
}: {
  items: InboxItem[];
  archivedItems: InboxItem[];
  lists: TodoList[];
}) {
  const router = useRouter();
  const [captureState, captureAction, capturePending] = useActionState(
    captureInboxItem,
    initialInboxCaptureState,
  );
  const captureDraft = useWorkflowDraft({ kind:"capture",id:"inbox-capture",label:"收集箱 · 未完成记录",resumeHref:"/inbox",initialValue:"",parse:value=>typeof value==="string"&&value.length<=10_000?value:null });
  const captureInput = captureDraft.value, setCaptureInput = captureDraft.setValue;
  const captureSubmitted = useRef("");
  const commitCapture = captureDraft.commit;
  const [manual, setManual] = useState<{ id: string; kind: ManualKind } | null>(
    null,
  );

  useEffect(() => {
    if (captureState.status !== "success") return;
    const timer = window.setTimeout(() => {
      const submitted = captureSubmitted.current;
      commitCapture(submitted, value => value === submitted ? "" : value);
      router.refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [captureState, router, commitCapture]);

  const readyItems = items.filter(
    (item) => item.ai_status === "ready" && item.ai_proposal && !item.processed_at,
  );
  const collectionItems = items.filter(
    (item) => item.ai_status !== "ready" && !item.processed_at,
  );
  const processedItems = items.filter((item) => item.processed_at);
  const toggleManual = (id: string, kind: ManualKind) =>
    setManual((current) =>
      current && current.id === id && current.kind === kind ? null : { id, kind },
    );

  return (
    <div>
      <form action={captureAction} onSubmitCapture={()=>{captureSubmitted.current=captureInput;}} className="border-b border-[var(--separator)] pb-5">
        <label htmlFor="inbox-capture" className="sr-only">
          记录想法
        </label>
        <textarea
          id="inbox-capture"
          name="content"
          value={captureInput}
          onChange={(event) => setCaptureInput(event.target.value)}
          maxLength={10_000}
          rows={3}
          placeholder="想到什么，就先记下来…"
          className="ui-field min-h-24 w-full resize-y rounded-[11px] border border-transparent bg-[var(--surface-control)] px-3 py-2.5 text-[13px] leading-5.5 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]"
        />
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <p className="text-[12px] leading-5 text-[var(--text-tertiary)]">
            写入后自动识别：任务、日程、笔记或今日日记，点同意即可。
          </p>
          <button
            disabled={capturePending}
            className="pressable inline-flex h-9 items-center gap-1.5 rounded-[9px] bg-[var(--accent)] px-3 text-[12px] font-medium text-white hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)] disabled:opacity-50"
          >
            <Plus size={16} />
            {capturePending ? "正在识别…" : "加入收集箱"}
          </button>
        </div>
        {captureState.status !== "idle" ? (
          <p
            role="status"
            className={`mt-2.5 text-[12px] ${captureState.status === "success" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
          >
            {captureState.message}
          </p>
        ) : null}
      </form>

      <InboxTriageQueue items={items} archivedItems={archivedItems} lists={lists}/>
      {readyItems.length ? (
        <section className="mt-5">
          <h2 className="border-b border-[var(--separator)] pb-2.5 text-[13px] font-semibold text-[var(--text-primary)]">
            已识别，待确认{" "}
            <span className="ml-1 font-mono text-[12px] font-normal tabular-nums text-[var(--text-tertiary)]">
              {readyItems.length}
            </span>
          </h2>
          <ul className="divide-y divide-[var(--separator)]">
            {readyItems.map((item) => (
              <li key={item.id} className="py-3.5">
                <div className="flex items-start justify-between gap-4">
                  <p className="min-w-0 whitespace-pre-wrap text-[12.5px] leading-5.5 text-[var(--text-primary)]">
                    {item.content_markdown}
                  </p>
                  <ArchiveInboxControl inboxId={item.id} />
                </div>
                <div className="mt-1 flex items-center gap-3 text-[12px] text-[var(--text-tertiary)]">
                  <span>
                    {new Date(item.created_at).toLocaleString("zh-CN", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="text-[var(--accent)]">AI 识别为 {proposalLabel(item.ai_proposal)}</span>
                </div>
                {item.ai_proposal ? (
                  <ProposalCard
                    proposal={item.ai_proposal}
                    inboxId={item.id}
                    lists={lists}
                  />
                ) : null}
                <DismissProposalControl inboxId={item.id} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-5">
        <h2 className="border-b border-[var(--separator)] pb-2.5 text-[13px] font-semibold text-[var(--text-primary)]">
          收集盒{" "}
          <span className="ml-1 font-mono text-[12px] font-normal tabular-nums text-[var(--text-tertiary)]">
            {collectionItems.length}
          </span>
        </h2>
        {!collectionItems.length ? (
          <div className="py-12 text-center">
            <InboxIcon />
            <p className="mt-2.5 text-[12px] leading-5 text-[var(--text-secondary)]">
              这里放无法自动识别的记录，可手动选择去向。
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--separator)]">
            {collectionItems.map((item) => (
              <li key={item.id} className="py-3.5">
                <div className="flex items-start justify-between gap-4">
                  <p className="min-w-0 whitespace-pre-wrap text-[12.5px] leading-5.5 text-[var(--text-primary)]">
                    {item.content_markdown}
                  </p>
                  <ArchiveInboxControl inboxId={item.id} />
                </div>
                <div className="mt-1 flex items-center gap-3 text-[12px] text-[var(--text-tertiary)]">
                  <span>
                    {new Date(item.created_at).toLocaleString("zh-CN", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {item.ai_status === "failed" ? (
                    <span className="text-[var(--text-secondary)]">
                      AI 未能识别{item.ai_error ? `：${item.ai_error}` : ""}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <ReclassifyControl inboxId={item.id} />
                  <span className="text-[var(--separator)]">|</span>
                  <button
                    type="button"
                    onClick={() => toggleManual(item.id, "task")}
                    className="pressable rounded-[7px] px-1 py-0.5 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]"
                  >
                    转任务
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleManual(item.id, "calendar")}
                    className="pressable rounded-[7px] px-1 py-0.5 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]"
                  >
                    转日程
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleManual(item.id, "note")}
                    className="pressable rounded-[7px] px-1 py-0.5 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]"
                  >
                    转笔记
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleManual(item.id, "daily")}
                    className="pressable rounded-[7px] px-1 py-0.5 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]"
                  >
                    写今日日记
                  </button>
                </div>
                {manual && manual.id === item.id ? (
                  <ManualImportForm kind={manual.kind} item={item} lists={lists} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {processedItems.length ? (
        <details className="mt-7 border-t border-[var(--separator)] pt-3.5">
          <summary className="pressable inline-flex cursor-pointer list-none rounded-[7px] px-1 py-0.5 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">
            已整理 · {processedItems.length}
          </summary>
          <ul className="mt-3 divide-y divide-[var(--separator)]">
            {processedItems.map((item) => (
              <li key={item.id} className="flex items-start gap-4 py-3">
                <p className="min-w-0 flex-1 whitespace-pre-wrap text-[12px] leading-5.5 text-[var(--text-secondary)]">
                  {item.content_markdown}
                </p>
                <span className="flex items-center gap-2 text-xs text-[var(--accent)]">
                  已整理
                  {item.converted_note_id ? (
                    <Link
                      href={`/notes/${item.converted_note_id}`}
                      className="font-medium underline underline-offset-2"
                    >
                      打开笔记
                    </Link>
                  ) : null}
                </span>
                <ArchiveInboxControl inboxId={item.id} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {archivedItems.length ? (
        <details className="mt-7 border-t border-[var(--separator)] pt-3.5">
          <summary className="pressable inline-flex cursor-pointer list-none rounded-[7px] px-1 py-0.5 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">
            已归档 · {archivedItems.length}
          </summary>
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">
            归档内容仍然保留，可随时恢复到收集箱。
          </p>
          <ul className="mt-3 divide-y divide-[var(--separator)]">
            {archivedItems.map((item) => (
              <li key={item.id} className="flex items-start gap-4 py-3">
                <p className="min-w-0 flex-1 whitespace-pre-wrap text-[12px] leading-5.5 text-[var(--text-secondary)]">
                  {item.content_markdown}
                </p>
                <RestoreInboxControl inboxId={item.id} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function proposalLabel(proposal: InboxProposal | null) {
  if (!proposal) return "";
  switch (proposal.target) {
    case "task":
      return "任务";
    case "calendar":
      return "日程";
    case "note":
      return "笔记";
    case "daily":
      return "今日日记";
  }
}

function InboxIcon() {
  return (
    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
      <Archive size={19} />
    </div>
  );
}
