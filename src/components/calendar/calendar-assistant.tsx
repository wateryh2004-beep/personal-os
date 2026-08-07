"use client";

import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { useActionState, useEffect, useRef, useState } from "react";
import { createCalendarEvent, deleteCalendarEvent, type CalendarCreateState } from "@/features/calendar/actions";
import { loadWorkspaceSession, saveWorkspaceSession } from "@/lib/workspace-session";

type CalendarProposal = { proposal: { subject: string; description: string | null; startsAt: string; endsAt: string; locationName: string | null; isAllDay: boolean } };
type CalendarDeleteProposal = { proposal: { providerEventId: string; subject: string; startsAt: string; endsAt: string } };
const initialCalendarCreateState: CalendarCreateState = { status: "idle", message: "" };
const calendarSessionKey = "calendar:assistant";
type CalendarAssistantSession = { messages: UIMessage[]; input: string; stoppedMessage: string | null; interrupted: boolean };

function calendarAiErrorMessage(error: Error) {
  try {
    const value = JSON.parse(error.message) as { error?: unknown };
    if (typeof value.error === "string") return value.error;
  } catch { /* Stream errors are already server-sanitized text. */ }
  return error.message || "DeepSeek 暂时没有完成回答，请重试。";
}

function CalendarProposalForm({ event }: { event: CalendarProposal["proposal"] }) {
  const [state, formAction, pending] = useActionState(createCalendarEvent, initialCalendarCreateState);
  return <form action={formAction} className="mt-2 border border-[#365F78] bg-[#EDF3F6] p-3 text-left text-sm"><p className="font-medium">{event.subject}</p>{event.description ? <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-zinc-600">{event.description}</p> : null}<p className="mt-2 text-zinc-600">{new Date(event.startsAt).toLocaleString("zh-CN")} — {new Date(event.endsAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</p><input type="hidden" name="subject" value={event.subject} /><input type="hidden" name="description" value={event.description ?? ""} /><input type="hidden" name="starts_at" value={event.startsAt} /><input type="hidden" name="ends_at" value={event.endsAt} /><input type="hidden" name="location_name" value={event.locationName ?? ""} /><input type="hidden" name="is_all_day" value={event.isAllDay ? "on" : ""} /><button disabled={pending} className="mt-3 bg-[#365F78] px-3 py-1.5 text-xs text-white disabled:opacity-60">{pending ? "正在创建…" : "确认创建日程"}</button>{state.status !== "idle" ? <p role="status" className={`mt-2 text-xs ${state.status === "success" ? "text-[#365F78]" : "text-red-700"}`}>{state.message}</p> : null}</form>;
}

function CalendarDeleteProposalForm({ event }: { event: CalendarDeleteProposal["proposal"] }) {
  const [state, formAction, pending] = useActionState(deleteCalendarEvent, initialCalendarCreateState);
  return <form action={formAction} className="mt-2 border border-red-200 bg-red-50 p-3 text-left text-sm"><p className="font-medium text-red-900">删除这条日程？</p><p className="mt-1 text-zinc-700">{event.subject} · {new Date(event.startsAt).toLocaleString("zh-CN")} — {new Date(event.endsAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</p><p className="mt-1 text-xs text-zinc-500">此操作会从 Outlook 删除这一条日程，不能批量删除。</p><input type="hidden" name="provider_event_id" value={event.providerEventId} /><input type="hidden" name="subject" value={event.subject} /><input type="hidden" name="starts_at" value={event.startsAt} /><input type="hidden" name="ends_at" value={event.endsAt} /><button disabled={pending} className="mt-3 bg-red-700 px-3 py-1.5 text-xs text-white disabled:opacity-60">{pending ? "正在删除…" : "确认删除日程"}</button>{state.status !== "idle" ? <p role="status" className={`mt-2 text-xs ${state.status === "success" ? "text-[#365F78]" : "text-red-700"}`}>{state.message}</p> : null}</form>;
}

export function CalendarAssistant() {
  const [input, setInput] = useState("");
  const [stoppedMessage, setStoppedMessage] = useState<string | null>(null);
  const restoredRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { messages, setMessages, sendMessage, status, error, stop, clearError } = useChat({
    transport: new DefaultChatTransport({ api: "/api/calendar/assistant" }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });
  const waiting = status !== "ready";

  useEffect(() => {
    const snapshot = loadWorkspaceSession<CalendarAssistantSession>(calendarSessionKey);
    const timer = window.setTimeout(() => {
      if (snapshot) {
        setMessages(snapshot.messages);
        setInput(snapshot.input);
        setStoppedMessage(snapshot.interrupted ? "上一次生成因切换页面而暂停。你可以继续提问。" : snapshot.stoppedMessage);
      }
      restoredRef.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [setMessages]);

  useEffect(() => {
    if (!restoredRef.current) return;
    saveWorkspaceSession(calendarSessionKey, { messages, input, stoppedMessage, interrupted: waiting });
  }, [input, messages, stoppedMessage, waiting]);

  useEffect(() => {
    if (!waiting && timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [waiting]);

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  const stopGeneration = (message: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    void stop();
    setStoppedMessage(message);
  };

  return <section><div className="border-b pb-4"><p className="text-xs font-medium tracking-wide text-zinc-500">AI CALENDAR</p><h2 className="mt-1 text-lg font-semibold tracking-tight">日历助手</h2><p className="mt-1 text-sm text-zinc-500">例如：“明天下午两点到三点和张三开会”或“我这周哪天有空？”</p></div><div className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">{!messages.length ? <p className="border-l-2 border-[#365F78] bg-[#EDF3F6] px-3 py-3 text-sm leading-6 text-zinc-600">AI 只生成提案；创建或删除均需你点击一次确认。删除只支持一条明确日程。</p> : messages.map((message) => <div key={message.id} className={message.role === "user" ? "ml-8 text-right" : "mr-8"}>{message.parts.map((part, index) => { if (part.type === "text") return <p key={index} className={message.role === "user" ? "inline-block bg-[#EDF3F6] px-3 py-2 text-sm" : "whitespace-pre-wrap text-sm leading-6 text-zinc-700"}>{part.text}</p>; if (part.type === "tool-proposeCalendarEvent" && part.state === "output-available") { const output = part.output as CalendarProposal; return <CalendarProposalForm key={part.toolCallId} event={output.proposal} />; } if (part.type === "tool-proposeCalendarDelete" && part.state === "output-available") { const output = part.output as CalendarDeleteProposal; return <CalendarDeleteProposalForm key={part.toolCallId} event={output.proposal} />; } return null; })}</div>)}</div>{stoppedMessage ? <p role="status" className="mt-3 text-sm text-zinc-600">{stoppedMessage}</p> : null}{error && !stoppedMessage ? <p role="status" className="mt-3 text-sm text-red-700">{calendarAiErrorMessage(error)}</p> : null}<form className="mt-4 border-t pt-4" onSubmit={(event) => { event.preventDefault(); if (!input.trim() || waiting) return; clearError(); setStoppedMessage(null); sendMessage({ text: input }); setInput(""); timeoutRef.current = setTimeout(() => stopGeneration("回答超时，已停止。请重试。"), 18_500); }}><label className="sr-only" htmlFor="calendar-ai-input">向日历助手提问</label><div className="flex gap-2"><input id="calendar-ai-input" value={input} onChange={(event) => setInput(event.target.value)} disabled={waiting} maxLength={2000} className="min-w-0 flex-1 border bg-white px-3 py-2 text-sm" placeholder="问问你的日程，或用自然语言创建日程…" />{waiting ? <button type="button" className="border px-3 py-2 text-sm" onClick={() => stopGeneration("已停止生成。你可以立即发送新的问题。")}>停止</button> : <button className="bg-[#365F78] px-3 py-2 text-sm text-white">发送</button>}</div></form></section>;
}
