"use client";

import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import { useChat } from "@ai-sdk/react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
  type CalendarCreateState,
} from "@/features/calendar/actions";
import {
  loadWorkspaceSession,
  saveWorkspaceSession,
} from "@/lib/workspace-session";

type AssistantModel = "deepseek-v4-flash" | "deepseek-v4-pro";
type CalendarProposal = {
  proposal: {
    subject: string;
    description: string | null;
    startsAt: string;
    endsAt: string;
    isAllDay: boolean;
    locationName: string | null;
  };
};
type CalendarDeleteProposal = {
  proposal: {
    providerEventId: string;
    subject: string;
    startsAt: string;
    endsAt: string;
    isAllDay: boolean;
  };
};
type CalendarUpdateProposal = {
  proposal: CalendarProposal["proposal"] & {
    providerEventId: string;
    originalSubject: string;
    originalStartsAt: string;
    originalEndsAt: string;
  };
};
type CalendarAssistantSession = {
  messages: UIMessage[];
  input: string;
  model: AssistantModel;
  stoppedMessage: string | null;
  interrupted: boolean;
};
const initialCalendarCreateState: CalendarCreateState = {
  status: "idle",
  message: "",
};
const calendarSessionKey = "calendar:assistant";

function eventTime(event: { startsAt: string; endsAt: string; isAllDay?: boolean }, timezone: string) {
  if (event.isAllDay) return "全天";
  const date = new Intl.DateTimeFormat("zh-CN", { timeZone: timezone, month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(event.startsAt));
  const end = new Intl.DateTimeFormat("zh-CN", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(event.endsAt));
  return `${date} — ${end}`;
}

function calendarAiErrorMessage(error: Error) {
  try {
    const value = JSON.parse(error.message) as { error?: unknown };
    if (typeof value.error === "string") return value.error;
  } catch {
    /* The Route Handler only returns safe text. */
  }
  return error.message || "DeepSeek 暂时没有完成回答，请重试。";
}

function CalendarProposalForm({
  event,
  timezone,
}: {
  event: CalendarProposal["proposal"];
  timezone: string;
}) {
  const [state, formAction, pending] = useActionState(
    createCalendarEvent,
    initialCalendarCreateState,
  );
  return (
    <form
      action={formAction}
      className="mt-2 border border-[#365F78] bg-[#EDF3F6] p-3 text-left text-sm"
    >
      <p className="font-medium">{event.subject}</p>
      {event.description ? (
        <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-zinc-600">
          {event.description}
        </p>
      ) : null}
      <p className="mt-2 text-zinc-600">
        {eventTime(event, timezone)} · {timezone}
      </p>
      <input type="hidden" name="subject" value={event.subject} />
      <input type="hidden" name="description" value={event.description ?? ""} />
      <input type="hidden" name="starts_at" value={event.startsAt} />
      <input type="hidden" name="ends_at" value={event.endsAt} />
      <input
        type="hidden"
        name="location_name"
        value={event.locationName ?? ""}
      />
      <input
        type="hidden"
        name="is_all_day"
        value={event.isAllDay ? "on" : ""}
      />
      <button
        disabled={pending || state.status === "success"}
        className="mt-3 bg-[#365F78] px-3 py-1.5 text-xs text-white disabled:opacity-60"
      >
        {pending ? "正在创建…" : state.status === "success" ? "已创建" : "确认创建日程"}
      </button>
      {state.status !== "idle" ? (
        <p
          role="status"
          className={`mt-2 text-xs ${state.status === "success" ? "text-[#365F78]" : "text-red-700"}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function CalendarDeleteProposalForm({
  event,
  timezone,
}: {
  event: CalendarDeleteProposal["proposal"];
  timezone: string;
}) {
  const [state, formAction, pending] = useActionState(
    deleteCalendarEvent,
    initialCalendarCreateState,
  );
  return (
    <form
      action={formAction}
      className="mt-2 border border-red-200 bg-red-50 p-3 text-left text-sm"
    >
      <p className="font-medium text-red-900">删除这条日程？</p>
      <p className="mt-1 text-zinc-700">
        {event.subject} · {eventTime(event, timezone)} · {timezone}
      </p>
      <input
        type="hidden"
        name="provider_event_id"
        value={event.providerEventId}
      />
      <input type="hidden" name="subject" value={event.subject} />
      <input type="hidden" name="starts_at" value={event.startsAt} />
      <input type="hidden" name="ends_at" value={event.endsAt} />
      <input type="hidden" name="is_all_day" value={event.isAllDay ? "on" : ""} />
      <button
        disabled={pending || state.status === "success"}
        className="mt-3 bg-red-700 px-3 py-1.5 text-xs text-white disabled:opacity-60"
      >
        {pending ? "正在删除…" : state.status === "success" ? "已删除" : "确认删除日程"}
      </button>
      {state.status !== "idle" ? (
        <p
          role="status"
          className={`mt-2 text-xs ${state.status === "success" ? "text-[#365F78]" : "text-red-700"}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function CalendarUpdateProposalForm({ event, timezone }: { event: CalendarUpdateProposal["proposal"]; timezone: string }) {
  const [state, formAction, pending] = useActionState(updateCalendarEvent, initialCalendarCreateState);
  return <form action={formAction} className="mt-2 border border-[#b8cbd6] bg-[#f5f9fb] p-3 text-left text-sm">
    <p className="font-medium">修改日程：{event.subject}</p>
    <p className="mt-1 text-xs text-zinc-500">原时间：{eventTime({ startsAt: event.originalStartsAt, endsAt: event.originalEndsAt }, timezone)}</p>
    <p className="mt-1 text-zinc-700">新时间：{eventTime(event, timezone)} · {timezone}</p>
    {event.locationName ? <p className="mt-1 text-xs text-zinc-500">{event.locationName}</p> : null}
    <input type="hidden" name="provider_event_id" value={event.providerEventId}/><input type="hidden" name="original_subject" value={event.originalSubject}/><input type="hidden" name="original_starts_at" value={event.originalStartsAt}/><input type="hidden" name="original_ends_at" value={event.originalEndsAt}/><input type="hidden" name="subject" value={event.subject}/><input type="hidden" name="description" value={event.description ?? ""}/><input type="hidden" name="starts_at" value={event.startsAt}/><input type="hidden" name="ends_at" value={event.endsAt}/><input type="hidden" name="location_name" value={event.locationName ?? ""}/><input type="hidden" name="is_all_day" value={event.isAllDay ? "on" : ""}/>
    <button disabled={pending || state.status === "success"} className="mt-3 bg-[#365F78] px-3 py-1.5 text-xs text-white disabled:opacity-60">{pending ? "正在更新…" : state.status === "success" ? "已更新" : "确认修改日程"}</button>
    {state.status !== "idle" ? <p role="status" className={`mt-2 text-xs ${state.status === "success" ? "text-[#365F78]" : "text-red-700"}`}>{state.message}</p> : null}
  </form>;
}

export function CalendarAssistant({ timezone }: { timezone: string }) {
  const [input, setInput] = useState("");
  const [model, setModel] = useState<AssistantModel>("deepseek-v4-flash");
  const [stoppedMessage, setStoppedMessage] = useState<string | null>(null);
  const restoredRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/assistant",
        body: () => ({ surface: "calendar", model }),
      }),
    [model],
  );
  const {
    messages,
    setMessages,
    sendMessage,
    status,
    error,
    stop,
    clearError,
  } = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });
  const waiting = status !== "ready";

  useEffect(() => {
    const snapshot =
      loadWorkspaceSession<CalendarAssistantSession>(calendarSessionKey);
    const timer = window.setTimeout(() => {
      if (snapshot) {
        setMessages(snapshot.messages);
        setInput(snapshot.input);
        setModel(
          snapshot.model === "deepseek-v4-pro"
            ? "deepseek-v4-pro"
            : "deepseek-v4-flash",
        );
        setStoppedMessage(
          snapshot.interrupted
            ? "上一次生成因切换页面而暂停。"
            : snapshot.stoppedMessage,
        );
      }
      restoredRef.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [setMessages]);
  useEffect(() => {
    if (restoredRef.current)
      saveWorkspaceSession(calendarSessionKey, {
        messages,
        input,
        model,
        stoppedMessage,
        interrupted: waiting,
      });
  }, [input, messages, model, stoppedMessage, waiting]);
  useEffect(() => {
    if (!waiting && timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [waiting]);
  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );
  const stopGeneration = (message: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    void stop();
    setStoppedMessage(message);
  };

  return (
    <section className="flex h-[min(66dvh,560px)] min-h-[420px] flex-col overflow-hidden border bg-white">
      <div className="flex items-center justify-between border-b p-2">
        <div className="px-2"><p className="text-sm font-medium">AI 日历</p><p className="text-[11px] text-zinc-500">时间按 {timezone} 处理</p></div>
        <div className="flex items-center gap-2"><button type="button" disabled={waiting || messages.length === 0} onClick={() => { setMessages([]); setStoppedMessage(null); }} className="px-2 py-1 text-xs text-zinc-500 hover:text-zinc-900 disabled:opacity-40">清空</button>
        <div className="inline-flex border">
          <button
            type="button"
            disabled={waiting}
            onClick={() => setModel("deepseek-v4-flash")}
            className={`px-3 py-1 text-xs ${model === "deepseek-v4-flash" ? "bg-[#EDF3F6] text-[#365F78]" : "text-zinc-500"}`}
          >
            Flash
          </button>
          <button
            type="button"
            disabled={waiting}
            onClick={() => setModel("deepseek-v4-pro")}
            className={`border-l px-3 py-1 text-xs ${model === "deepseek-v4-pro" ? "bg-[#EDF3F6] text-[#365F78]" : "text-zinc-500"}`}
          >
            Pro
          </button>
        </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? <p className="py-16 text-center text-sm text-zinc-400">告诉我你要创建、查找、修改或删除什么日程。</p> : null}
        {messages.map((message) => (
          <div
            key={message.id}
            className={message.role === "user" ? "ml-8 text-right" : "mr-8"}
          >
            {message.parts.map((part, index) => {
              if (part.type === "text")
                return (
                  <p
                    key={index}
                    className={
                      message.role === "user"
                        ? "inline-block bg-[#EDF3F6] px-3 py-2 text-sm"
                        : "whitespace-pre-wrap text-sm leading-6 text-zinc-700"
                    }
                  >
                    {part.text}
                  </p>
                );
              if (
                part.type === "tool-proposeCalendarEvent" &&
                part.state === "output-available"
              )
                return (
                  <CalendarProposalForm
                    key={part.toolCallId}
                    event={(part.output as CalendarProposal).proposal}
                    timezone={timezone}
                  />
                );
              if (
                part.type === "tool-proposeCalendarDelete" &&
                part.state === "output-available"
              )
                return (
                  <CalendarDeleteProposalForm
                    key={part.toolCallId}
                    event={(part.output as CalendarDeleteProposal).proposal}
                    timezone={timezone}
                  />
                );
              if (part.type === "tool-proposeCalendarUpdate" && part.state === "output-available")
                return <CalendarUpdateProposalForm key={part.toolCallId} event={(part.output as CalendarUpdateProposal).proposal} timezone={timezone} />;
              return null;
            })}
          </div>
        ))}
      </div>
      {stoppedMessage ? (
        <p role="status" className="px-4 pb-2 text-xs text-zinc-500">
          {stoppedMessage}
        </p>
      ) : null}
      {error && !stoppedMessage ? (
        <p role="status" className="px-4 pb-2 text-xs text-red-700">
          {calendarAiErrorMessage(error)}
        </p>
      ) : null}
      <form
        className="border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!input.trim() || waiting) return;
          clearError();
          setStoppedMessage(null);
          sendMessage({ text: input });
          setInput("");
          timeoutRef.current = setTimeout(
            () => stopGeneration("回答超时，已停止。"),
            18_500,
          );
        }}
      >
        <label className="sr-only" htmlFor="calendar-ai-input">
          输入消息
        </label>
        <div className="flex gap-2">
          <input
            id="calendar-ai-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={waiting}
            maxLength={2_000}
            className="min-w-0 flex-1 border bg-white px-3 py-2 text-sm"
            placeholder="输入消息…"
          />
          {waiting ? (
            <button
              type="button"
              className="border px-3 py-2 text-sm"
              onClick={() => stopGeneration("已停止生成。")}
            >
              停止
            </button>
          ) : (
            <button className="bg-[#365F78] px-3 py-2 text-sm text-white">
              发送
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
