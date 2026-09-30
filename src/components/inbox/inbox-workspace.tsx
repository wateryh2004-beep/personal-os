"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  FileText,
  Plus,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import {
  createCalendarEvent,
  type CalendarCreateState,
} from "@/features/calendar/actions";
import {
  archiveInboxItem,
  captureInboxItem,
  convertInboxToDailyNote,
  convertInboxToNote,
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
type ManualKind = "task" | "calendar" | "note" | "daily";

const calendarInitial: CalendarCreateState = { status: "idle", message: "" };
const todoInitial: TodoCreateState = { status: "idle", message: "" };
const proposalCardClass =
  "mt-2.5 rounded-[11px] bg-[color-mix(in_srgb,var(--accent-soft)_62%,var(--surface-canvas))] p-3";
const primaryActionClass =
  "pressable h-8 rounded-[8px] bg-[var(--accent)] px-2.5 text-[11.5px] font-medium text-white hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_18%,transparent)] disabled:cursor-not-allowed disabled:opacity-60";

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
      <p className="mt-3 rounded-[9px] bg-amber-50 px-3 py-2 text-[11.5px] leading-5 text-amber-800">
        目标 To Do 清单尚未同步。请先刷新 Tasks。
      </p>
    );
  return (
    <form
      action={action}
      className={proposalCardClass}
    >
      <p className="text-[12.5px] font-semibold text-[var(--text-primary)]">{proposal.title}</p>
      {proposal.bodyText ? (
        <p className="mt-1 whitespace-pre-wrap text-[11px] leading-5 text-[var(--text-secondary)]">
          {proposal.bodyText}
        </p>
      ) : null}
      <p className="mt-2 text-[10.5px] text-[var(--text-tertiary)]">
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
          className={`mt-2 text-[10.5px] ${state.status === "success" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
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
        <p className="mt-1 whitespace-pre-wrap text-[11px] leading-5 text-[var(--text-secondary)]">
          {proposal.description}
        </p>
      ) : null}
      <p className="mt-2 text-[10.5px] text-[var(--text-tertiary)]">
        日程 · {new Date(proposal.startsAt).toLocaleString("zh-CN")}
      </p>
      <input type="hidden" name="subject" value={proposal.subject} />
      <input
        type="hidden"
        name="description"
        value={proposal.description ?? ""}
      />
      <input type="hidden" name="starts_at" value={proposal.startsAt} />
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
          className={`mt-2 text-[10.5px] ${state.status === "success" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
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
      <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[11px] leading-5 text-[var(--text-secondary)]">
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
          className={`mt-2 text-[10.5px] ${state.status === "success" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
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
      <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">
        确认后会追加到今天日记的“感受与想法”，并保留 Inbox 来源。
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
          className={`mt-2 text-[10.5px] ${state.status === "success" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
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
        className="text-[10.5px] text-[var(--text-tertiary)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline disabled:opacity-50"
      >
        {pending ? "处理中…" : "不是这个，放回收集盒"}
      </button>
      {state.status === "error" ? (
        <span role="status" className="ml-2 text-[10.5px] text-[var(--danger)]">
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
        className="pressable inline-flex items-center gap-1 rounded-[7px] px-1 py-0.5 text-[10.5px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-50"
      >
        <Sparkles size={13} />
        {pending ? "识别中…" : "智能整理"}
      </button>
      {state.status !== "idle" ? (
        <span
          role="status"
          className={`ml-2 text-[10.5px] ${state.status === "success" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
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
    show({ message: "已归档 Inbox 项", tone: "success", undo: () => {
      const form = new FormData(); form.set("inbox_id", inboxId);
      void restoreInboxItem(initialInboxCaptureState, form).then((result) => { if (result.status === "success") router.refresh(); else show({ message: result.message, tone: "error" }); }).catch(() => show({ message: "恢复失败，该项目仍在归档区。", tone: "error" }));
    } });
  }, [inboxId, router, show, state.status]);
  return (
    <form action={action} className="shrink-0">
      <input type="hidden" name="inbox_id" value={inboxId} />
      <button disabled={pending} aria-label="归档这条 Inbox" title="归档（可撤回）" className="pressable rounded-[8px] p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"><Archive size={16} /></button>
      {state.status === "error" ? (
        <p role="status" className="mt-1 max-w-44 text-right text-[10.5px] text-[var(--danger)]">
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
        className="pressable inline-flex items-center gap-1 rounded-[7px] px-1 py-0.5 text-[10.5px] font-medium text-[var(--accent)] disabled:opacity-50"
      >
        <RotateCcw size={13} />
        {pending ? "恢复中…" : "恢复"}
      </button>
      {state.status === "error" ? (
        <p role="status" className="mt-1 text-[10.5px] text-[var(--danger)]">
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
  "h-9 w-full rounded-[9px] border border-transparent bg-[var(--surface-control)] px-2.5 text-[12.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_14%,transparent)]";

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
  const [listId, setListId] = useState(defaultList?.id ?? "");
  const [dueAt, setDueAt] = useState("");
  return (
    <form action={action} className={`${proposalCardClass} space-y-2`}>
      <p className="text-xs font-semibold text-[var(--foreground)]">手动转成任务</p>
      <input type="hidden" name="todo_list_id" value={listId} />
      <input type="hidden" name="importance" value="normal" />
      <input type="hidden" name="due_at" value={inputToIso(dueAt)} />
      <input type="hidden" name="inbox_id" value={item.id} />
      <input type="hidden" name="body_text" value={item.content_markdown} />
      <input
        name="title"
        required
        maxLength={500}
        defaultValue={firstLine(item.content_markdown).slice(0, 500)}
        placeholder="任务标题"
        className={inputClass}
      />
      <div className="flex gap-2">
        <select
          value={listId}
          onChange={(event) => setListId(event.target.value)}
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
          onChange={(event) => setDueAt(event.target.value)}
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
          className={`text-[10.5px] ${state.status === "success" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
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
  const [range, setRange] = useState(() => {
    const start = new Date();
    start.setHours(start.getHours() + 1, 0, 0, 0);
    const end = new Date(start.getTime() + 3_600_000);
    return { start: toLocalInput(start), end: toLocalInput(end) };
  });
  const { start: startsAt, end: endsAt } = range;
  const setStart = (value: string) =>
    setRange({ start: value, end: addHoursToInput(value, 1) });
  const setEnd = (value: string) => setRange((current) => ({ ...current, end: value }));
  return (
    <form action={action} className={`${proposalCardClass} space-y-2`}>
      <p className="text-xs font-semibold text-[var(--foreground)]">手动转成日程</p>
      <input type="hidden" name="starts_at" value={inputToIso(startsAt)} />
      <input type="hidden" name="ends_at" value={inputToIso(endsAt)} />
      <input type="hidden" name="is_all_day" value="" />
      <input type="hidden" name="inbox_id" value={item.id} />
      <input type="hidden" name="description" value={item.content_markdown} />
      <input
        name="subject"
        required
        maxLength={500}
        defaultValue={firstLine(item.content_markdown).slice(0, 500)}
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
          className={`text-[10.5px] ${state.status === "success" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
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
  return (
    <form action={action} className={`${proposalCardClass} space-y-2`}>
      <p className="text-xs font-semibold text-[var(--foreground)]">手动转成笔记</p>
      <input type="hidden" name="inbox_id" value={item.id} />
      <input
        name="title"
        required
        maxLength={240}
        defaultValue={firstLine(item.content_markdown).slice(0, 240)}
        placeholder="笔记标题"
        className={inputClass}
      />
      <textarea
        name="body_markdown"
        rows={3}
        maxLength={10_000}
        defaultValue={item.content_markdown}
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
          className={`text-[10.5px] ${state.status === "success" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
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

function ManualImportForm({
  kind,
  item,
  lists,
}: {
  kind: ManualKind;
  item: InboxItem;
  lists: TodoList[];
}) {
  if (kind === "task") return <ManualTaskForm item={item} lists={lists} />;
  if (kind === "calendar") return <ManualCalendarForm item={item} />;
  if (kind === "note") return <ManualNoteForm item={item} />;
  return <DailyProposal inboxId={item.id} />;
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
  const [captureInput, setCaptureInput] = useState("");
  const [manual, setManual] = useState<{ id: string; kind: ManualKind } | null>(
    null,
  );

  useEffect(() => {
    if (captureState.status !== "success") return;
    const timer = window.setTimeout(() => {
      setCaptureInput("");
      router.refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [captureState.status, router]);

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
      <form action={captureAction} className="border-b border-[var(--separator)] pb-5">
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
          className="min-h-24 w-full resize-y rounded-[11px] border border-transparent bg-[var(--surface-control)] px-3 py-2.5 text-[13px] leading-5.5 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]"
        />
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <p className="text-[10.5px] leading-5 text-[var(--text-tertiary)]">
            写入后自动识别：任务、日程、笔记或今日日记，点同意即可。
          </p>
          <button
            disabled={capturePending}
            className="pressable inline-flex h-9 items-center gap-1.5 rounded-[9px] bg-[var(--accent)] px-3 text-[12px] font-medium text-white hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)] disabled:opacity-50"
          >
            <Plus size={16} />
            {capturePending ? "正在识别…" : "加入 Inbox"}
          </button>
        </div>
        {captureState.status !== "idle" ? (
          <p
            role="status"
            className={`mt-2.5 text-[11px] ${captureState.status === "success" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
          >
            {captureState.message}
          </p>
        ) : null}
      </form>

      {readyItems.length ? (
        <section className="mt-5">
          <h2 className="border-b border-[var(--separator)] pb-2.5 text-[13px] font-semibold text-[var(--text-primary)]">
            已识别，待确认{" "}
            <span className="ml-1 font-mono text-[10.5px] font-normal tabular-nums text-[var(--text-tertiary)]">
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
                <div className="mt-1 flex items-center gap-3 text-[10.5px] text-[var(--text-tertiary)]">
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
          <span className="ml-1 font-mono text-[10.5px] font-normal tabular-nums text-[var(--text-tertiary)]">
            {collectionItems.length}
          </span>
        </h2>
        {!collectionItems.length ? (
          <div className="py-12 text-center">
            <InboxIcon />
            <p className="mt-2.5 text-[11.5px] leading-5 text-[var(--text-secondary)]">
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
                <div className="mt-1 flex items-center gap-3 text-[10.5px] text-[var(--text-tertiary)]">
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
                    className="pressable rounded-[7px] px-1 py-0.5 text-[10.5px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]"
                  >
                    转任务
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleManual(item.id, "calendar")}
                    className="pressable rounded-[7px] px-1 py-0.5 text-[10.5px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]"
                  >
                    转日程
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleManual(item.id, "note")}
                    className="pressable rounded-[7px] px-1 py-0.5 text-[10.5px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]"
                  >
                    转笔记
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleManual(item.id, "daily")}
                    className="pressable rounded-[7px] px-1 py-0.5 text-[10.5px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]"
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
          <summary className="pressable inline-flex cursor-pointer list-none rounded-[7px] px-1 py-0.5 text-[11.5px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">
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
          <summary className="pressable inline-flex cursor-pointer list-none rounded-[7px] px-1 py-0.5 text-[11.5px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">
            已归档 · {archivedItems.length}
          </summary>
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">
            归档内容仍然保留，可随时恢复到 Inbox。
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
