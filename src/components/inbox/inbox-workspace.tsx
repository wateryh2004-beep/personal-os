"use client";

import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import { Archive, Bot, CalendarDays, CheckSquare, FileText, LoaderCircle, Plus, Sparkles } from "lucide-react";
import { useActionState, useState } from "react";
import { createCalendarEvent, type CalendarCreateState } from "@/features/calendar/actions";
import { archiveInboxItem, captureInboxItem, convertInboxToNote, initialCaptureState } from "@/features/inbox/actions";
import type { InboxProposal } from "@/features/inbox/schemas";
import { openDailyNote } from "@/features/notes/actions";
import { createMicrosoftTodoTaskAction, type TodoCreateState } from "@/features/tasks/microsoft-todo";

type InboxItem = { id: string; content_markdown: string; created_at: string; processed_at: string | null; converted_task_id: string | null; converted_note_id: string | null };
type TodoList = { id: string; display_name: string; is_default: boolean };
type ProposalOutput = { proposal: InboxProposal };
type InboxToolPart = { type: string; state?: string; output?: unknown };
const calendarInitial: CalendarCreateState = { status: "idle", message: "" };
const todoInitial: TodoCreateState = { status: "idle", message: "" };

function ProposalCard({ proposal, inboxId, lists }: { proposal: InboxProposal; inboxId: string; lists: TodoList[] }) {
  if (proposal.target === "task") return <TaskProposal proposal={proposal} lists={lists} inboxId={inboxId} />;
  if (proposal.target === "calendar") return <CalendarProposal proposal={proposal} inboxId={inboxId} />;
  if (proposal.target === "note") return <NoteProposal proposal={proposal} inboxId={inboxId} />;
  return <form action={openDailyNote} className="mt-3 border border-[#b5c9d2] bg-[#edf3f6] p-3"><p className="text-sm font-medium text-zinc-900">写入今日日记</p><p className="mt-1 text-xs leading-5 text-zinc-600">会打开并归位到今天的日记；这条 Inbox 会继续保留，方便你复制内容后再归档。</p><button className="mt-3 inline-flex items-center gap-1 bg-[#365f78] px-3 py-1.5 text-xs text-white"><FileText size={14} />打开今日日记</button></form>;
}

function TaskProposal({ proposal, lists, inboxId }: { proposal: Extract<InboxProposal, { target: "task" }>; lists: TodoList[]; inboxId: string }) {
  const [state, action, pending] = useActionState(createMicrosoftTodoTaskAction, todoInitial);
  const list = lists.find((item) => item.id === proposal.todoListId);
  if (!list) return <p className="mt-3 border-l-2 border-amber-600 bg-amber-50 px-3 py-2 text-sm text-amber-800">目标 To Do 清单尚未同步。请先刷新 Tasks。</p>;
  return <form action={action} className="mt-3 border border-[#b5c9d2] bg-[#edf3f6] p-3"><p className="text-sm font-medium text-zinc-900">{proposal.title}</p>{proposal.bodyText ? <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-zinc-600">{proposal.bodyText}</p> : null}<p className="mt-2 text-xs text-zinc-600">任务 · {list.display_name}{proposal.dueAt ? ` · ${new Date(proposal.dueAt).toLocaleString("zh-CN")}` : ""}</p><input type="hidden" name="todo_list_id" value={proposal.todoListId} /><input type="hidden" name="title" value={proposal.title} /><input type="hidden" name="body_text" value={proposal.bodyText ?? ""} /><input type="hidden" name="importance" value={proposal.importance} /><input type="hidden" name="due_at" value={proposal.dueAt ?? ""} /><input type="hidden" name="inbox_id" value={inboxId} /><button disabled={pending} className="mt-3 bg-[#365f78] px-3 py-1.5 text-xs text-white disabled:opacity-60">{pending ? "正在创建…" : "确认创建任务"}</button>{state.status !== "idle" ? <p role="status" className={`mt-2 text-xs ${state.status === "success" ? "text-[#365f78]" : "text-red-700"}`}>{state.message}</p> : null}</form>;
}

function CalendarProposal({ proposal, inboxId }: { proposal: Extract<InboxProposal, { target: "calendar" }> ; inboxId: string }) {
  const [state, action, pending] = useActionState(createCalendarEvent, calendarInitial);
  return <form action={action} className="mt-3 border border-[#b5c9d2] bg-[#edf3f6] p-3"><p className="text-sm font-medium text-zinc-900">{proposal.subject}</p>{proposal.description ? <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-zinc-600">{proposal.description}</p> : null}<p className="mt-2 text-xs text-zinc-600">日程 · {new Date(proposal.startsAt).toLocaleString("zh-CN")}</p><input type="hidden" name="subject" value={proposal.subject} /><input type="hidden" name="description" value={proposal.description ?? ""} /><input type="hidden" name="starts_at" value={proposal.startsAt} /><input type="hidden" name="ends_at" value={proposal.endsAt} /><input type="hidden" name="location_name" value={proposal.locationName ?? ""} /><input type="hidden" name="is_all_day" value={proposal.isAllDay ? "on" : ""} /><input type="hidden" name="inbox_id" value={inboxId} /><button disabled={pending} className="mt-3 bg-[#365f78] px-3 py-1.5 text-xs text-white disabled:opacity-60">{pending ? "正在创建…" : "确认创建日程"}</button>{state.status !== "idle" ? <p role="status" className={`mt-2 text-xs ${state.status === "success" ? "text-[#365f78]" : "text-red-700"}`}>{state.message}</p> : null}</form>;
}

function NoteProposal({ proposal, inboxId }: { proposal: Extract<InboxProposal, { target: "note" }>; inboxId: string }) {
  const [state, action, pending] = useActionState(convertInboxToNote, initialCaptureState);
  return <form action={action} className="mt-3 border border-[#b5c9d2] bg-[#edf3f6] p-3"><p className="text-sm font-medium text-zinc-900">{proposal.title}</p><p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-zinc-600">{proposal.bodyMarkdown}</p><input type="hidden" name="inbox_id" value={inboxId} /><input type="hidden" name="title" value={proposal.title} /><input type="hidden" name="body_markdown" value={proposal.bodyMarkdown} /><button disabled={pending} className="mt-3 bg-[#365f78] px-3 py-1.5 text-xs text-white disabled:opacity-60">{pending ? "正在创建…" : "确认创建笔记"}</button>{state.status !== "idle" ? <p role="status" className={`mt-2 text-xs ${state.status === "success" ? "text-[#365f78]" : "text-red-700"}`}>{state.message}</p> : null}</form>;
}

export function InboxWorkspace({ items, lists }: { items: InboxItem[]; lists: TodoList[] }) {
  const [captureState, captureAction, capturePending] = useActionState(captureInboxItem, initialCaptureState);
  const [selected, setSelected] = useState<InboxItem | null>(null);
  const { messages, sendMessage, status, error, stop, clearError } = useChat({ transport: new DefaultChatTransport({ api: "/api/inbox/assistant" }) });
  const waiting = status !== "ready";

  const latestProposal = ([...messages].reverse().flatMap((message) => message.parts) as InboxToolPart[])
    .find((part) => part.type === "tool-proposeInboxDestination" && part.state === "output-available");
  const proposal = latestProposal ? (latestProposal.output as ProposalOutput).proposal : null;

  const organize = (item: InboxItem) => {
    if (waiting) return;
    clearError();
    setSelected(item);
    sendMessage({ text: item.content_markdown });
  };

  return <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
    <div>
      <form action={captureAction} className="border-b border-[#e7e5e4] pb-6">
        <label htmlFor="inbox-capture" className="sr-only">记录想法</label>
        <textarea id="inbox-capture" name="content" maxLength={10_000} rows={3} placeholder="想到什么，就先记下来…" className="w-full resize-none border border-[#d8d6d0] bg-white px-3 py-3 text-sm outline-none transition focus:border-[#365f78]" />
        <div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-zinc-500">先捕捉，之后再决定去向。</p><button disabled={capturePending} className="inline-flex items-center gap-2 bg-[#365f78] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"><Plus size={16} />{capturePending ? "正在保存…" : "加入 Inbox"}</button></div>
        {captureState.status !== "idle" ? <p role="status" className={`mt-3 text-sm ${captureState.status === "success" ? "text-[#365f78]" : "text-red-700"}`}>{captureState.message}</p> : null}
      </form>

      <div className="mt-6 flex items-center justify-between border-b border-[#e7e5e4] pb-3"><h2 className="font-semibold text-zinc-900">待整理 <span className="ml-1 font-mono text-sm font-normal text-zinc-400">{items.filter((item) => !item.processed_at).length}</span></h2></div>
      {!items.length ? <div className="py-16 text-center"><InboxIcon /><p className="mt-3 text-sm text-zinc-500">这里收集尚未决定去向的想法。</p></div> : <ul className="divide-y divide-[#eceae6]">{items.map((item) => <li key={item.id} className="py-4"><div className="flex items-start justify-between gap-4"><p className="min-w-0 whitespace-pre-wrap text-sm leading-6 text-zinc-800">{item.content_markdown}</p><form action={archiveInboxItem}><input type="hidden" name="inbox_id" value={item.id} /><button aria-label="归档这条 Inbox" className="shrink-0 rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"><Archive size={16} /></button></form></div><div className="mt-3 flex items-center gap-3"><span className="text-xs text-zinc-400">{new Date(item.created_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>{item.processed_at ? <span className="text-xs text-[#365f78]">已整理</span> : <button disabled={waiting} onClick={() => organize(item)} className="inline-flex items-center gap-1 text-xs font-medium text-[#365f78] hover:underline disabled:opacity-50"><Sparkles size={13} />AI 整理</button>}</div></li>)}</ul>}
    </div>

    <aside className="border-t border-[#e7e5e4] pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0"><div className="flex items-center gap-2"><Bot size={18} className="text-[#365f78]" /><h2 className="font-semibold text-zinc-900">AI 整理</h2></div><p className="mt-2 text-sm leading-6 text-zinc-500">选中一条 Inbox 后，让 AI 建议最合适的去向。</p>{selected ? <div className="mt-4 border border-[#e7e5e4] bg-white p-3"><p className="line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{selected.content_markdown}</p>{waiting ? <p className="mt-3 flex items-center gap-2 text-sm text-zinc-500"><LoaderCircle size={16} className="animate-spin" />正在整理… <button type="button" onClick={() => void stop()} className="ml-auto text-xs text-[#365f78] hover:underline">停止</button></p> : null}{proposal && !waiting ? <ProposalCard proposal={proposal} inboxId={selected.id} lists={lists} /> : null}{error ? <p role="status" className="mt-3 text-sm text-red-700">{error.message || "AI 暂时不可用，请重试。"}</p> : null}</div> : <div className="mt-4 border-l-2 border-[#365f78] bg-[#edf3f6] px-3 py-3 text-sm leading-6 text-zinc-600">可把想法整理成任务、日程、笔记，或转去写今日日记。</div>}<div className="mt-6 space-y-2 border-t border-[#e7e5e4] pt-4 text-sm text-zinc-600"><p className="flex gap-2"><CheckSquare size={16} className="mt-0.5 text-zinc-400" />任务会写入 Microsoft To Do</p><p className="flex gap-2"><CalendarDays size={16} className="mt-0.5 text-zinc-400" />日程会写入 Outlook</p><p className="flex gap-2"><FileText size={16} className="mt-0.5 text-zinc-400" />笔记保存在 Notes</p></div></aside>
  </div>;
}

function InboxIcon() { return <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#edf3f6] text-[#365f78]"><Archive size={19} /></div>; }
