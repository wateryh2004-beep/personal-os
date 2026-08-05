"use client";

import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
import { useChat } from "@ai-sdk/react";
import { useState } from "react";
import { requestCalendarEvent } from "@/features/calendar/actions";

type CalendarProposal = { proposal: { subject: string; startsAt: string; endsAt: string; locationName: string | null; isAllDay: boolean } };

export function CalendarAssistant() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/calendar/assistant" }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });
  return <section className="mt-8 border-t pt-6"><div><p className="text-xs font-medium tracking-wide text-zinc-500">AI CALENDAR</p><h2 className="mt-1 font-medium">日历助手</h2><p className="mt-1 text-sm text-zinc-500">例如：“明天下午两点到三点和张三开会”或“我这周哪天有空？”</p></div><div className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">{!messages.length ? <p className="text-sm text-zinc-500">AI 不会自行修改 Outlook。所有创建都需要你的批准与最终确认。</p> : messages.map((message) => <div key={message.id} className={message.role === "user" ? "ml-8 text-right" : "mr-8"}>{message.parts.map((part, index) => { if (part.type === "text") return <p key={index} className={message.role === "user" ? "inline-block bg-[#EDF3F6] px-3 py-2 text-sm" : "whitespace-pre-wrap text-sm leading-6 text-zinc-700"}>{part.text}</p>; if (part.type === "tool-proposeCalendarEvent" && part.state === "output-available") { const output = part.output as CalendarProposal; const event = output.proposal; return <form key={part.toolCallId} action={requestCalendarEvent} className="mt-2 border border-[#365F78] bg-[#EDF3F6] p-3 text-left text-sm"><p className="font-medium">日程提案</p><p className="mt-1 text-zinc-600">{event.subject} · {new Date(event.startsAt).toLocaleString("zh-CN")} — {new Date(event.endsAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</p><input type="hidden" name="subject" value={event.subject} /><input type="hidden" name="starts_at" value={event.startsAt} /><input type="hidden" name="ends_at" value={event.endsAt} /><input type="hidden" name="location_name" value={event.locationName ?? ""} /><input type="hidden" name="is_all_day" value={event.isAllDay ? "on" : ""} /><button className="mt-3 bg-[#365F78] px-3 py-1.5 text-xs text-white">创建待确认日程</button></form>; } return null; })}</div>)}</div>{error ? <p role="status" className="mt-3 text-sm text-red-700">{error.message || "AI 助手暂时不可用。请检查 Settings 中的 DeepSeek Key。"}</p> : null}<form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (!input.trim() || status !== "ready") return; sendMessage({ text: input }); setInput(""); }}><label className="sr-only" htmlFor="calendar-ai-input">向日历助手提问</label><input id="calendar-ai-input" value={input} onChange={(event) => setInput(event.target.value)} disabled={status !== "ready"} maxLength={2000} className="min-w-0 flex-1 border bg-white px-3 py-2 text-sm" placeholder="问问你的日程，或用自然语言创建日程…" /><button className="bg-[#365F78] px-3 py-2 text-sm text-white disabled:opacity-60" disabled={status !== "ready"}>{status === "ready" ? "发送" : "思考中…"}</button></form></section>;
}
