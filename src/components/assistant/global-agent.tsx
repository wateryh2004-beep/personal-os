"use client";

import type { AgentActionFixtureTransport } from "@/features/assistant/action-fixtures";
import { assertContinuousFixtureTransport } from "@/features/testing/continuous-fixture-gate";

import { takeAssistantSubmission } from "@/features/assistant/pending-submission";
import { useContinuousAssistantChat } from "./use-continuous-assistant-chat";
import { usePathname } from "next/navigation";
import { ArrowUp, Plus, RotateCcw, Square } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { AISidecar } from "@/components/ai/ai-sidecar";
import {
  assistantContextEvent,
  getAssistantContext,
  type AssistantLiveContext,
} from "@/features/assistant/client-context";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";
import { AgentActionCard } from "./agent-action-card";
import { AgentActionGroup } from "./agent-action-group";
import { AgentSources } from "./agent-sources";
import { AssistantStreamSources } from "./assistant-stream-sources";
import { perfMark } from "@/lib/perf";
import { errorMessage } from "./agent-errors";

const surfaceLabels: Record<string, string> = {
  calendar: "日历",
  tasks: "任务",
  inbox: "Inbox",
  career: "职业",
  notes: "笔记",
  projects: "项目",
  briefing: "Briefing",
  memory: "Memory",
  files: "文件",
  shopping: "购物",
  travel: "旅行",
  global: "全局",
};

function surfaceForPath(pathname: string) {
  const value = pathname.split("/").filter(Boolean)[0];
  return value && value in surfaceLabels ? value : "global";
}

function entityForPath(pathname: string) {
  const match = pathname.match(/^\/notes\/([0-9a-f-]{36})$/i);
  return match ? ({ type: "note", id: match[1] } as const) : null;
}

function suggestionsForSurface(surface: string) {
  if (surface === "calendar") return ["我今天剩下还有什么安排？", "帮我看看这周哪里比较挤", "把这个日程改到明天下午"];
  if (surface === "tasks") return ["我现在最该先做哪几个任务？", "有哪些快到期的事情？", "把这个任务改到周五前完成"];
  if (surface === "notes") return ["这和我之前写过的哪些想法有关？", "找出相关笔记", "我最近在这个主题上的想法有什么变化？"];
  if (surface === "career") return ["结合我的现状，下一步最值得做什么？", "我最近的职业方向有没有变化？", "找出和当前选择最相关的经历"];
  return ["我最近到底在忙什么？", "我下周有哪些重要安排？", "找出最近记录里反复出现的主题"];
}

export function GlobalAgent({ open, onClose, actionTransport }: { open: boolean; onClose: () => void; actionTransport?: AgentActionFixtureTransport }) {
  assertContinuousFixtureTransport(actionTransport);
  useEffect(() => perfMark("agent-lazy-mounted"), []);
  const pathname = usePathname();
  const currentSurface = surfaceForPath(pathname);
  const { input, setInput, messages, error, waiting, submit, stop, reset, runtime, refreshRun, recoveryUnavailable } = useContinuousAssistantChat({ surface: "global" }, "全局 AI 输入");
  const [liveContext, setLiveContext] = useState<AssistantLiveContext | null>(() => getAssistantContext());
  const steps = runtime.run?.steps ?? [];
  const actions = runtime.run?.actions ?? [];
  const activeRunId = runtime.runId;
  const restoring = runtime.restoring;
  const currentError = runtime.notice ?? errorMessage(error);
  useEffect(() => {
    const handler = (event: Event) => { const next = (event as CustomEvent<AssistantLiveContext>).detail; setLiveContext(next?.entity ? next : null); };
    window.addEventListener(assistantContextEvent, handler);
    return () => window.removeEventListener(assistantContextEvent, handler);
  }, []);
  useEffect(() => {
    if (!open || !activeRunId) return;
    const supabase = createBrowserSupabaseClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => void refreshRun(), 80); };
    const channel = supabase.channel(`agent-run:${activeRunId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_actions", filter: `run_id=eq.${activeRunId}` }, schedule).subscribe();
    void refreshRun();
    return () => { if (timer) clearTimeout(timer); void supabase.removeChannel(channel); };
  }, [open, activeRunId, refreshRun]);
  const submitText = useCallback(async (value: string) => {
    if (!open || restoring || waiting || !value.trim()) return;
    const selectedText = window.getSelection()?.toString().trim().slice(0, 4_000) || null;
    const active = getAssistantContext();
    await submit({ text: value, currentPath: pathname, currentEntity: active?.entity ?? entityForPath(pathname), surfaceContext: selectedText ? { type: "text", title: "当前选中文字", content: selectedText } : undefined });
  }, [open, pathname, restoring, submit, waiting]);
  useEffect(() => {
    const drain = () => { if (!waiting) { const query = takeAssistantSubmission(); if (query) void submitText(query); } };
    const handler = (event: Event) => { const query = (event as CustomEvent<{ query?: string }>).detail?.query; if (query) void submitText(query); else drain(); };
    window.addEventListener("personal-os:agent-submit", handler); drain();
    return () => window.removeEventListener("personal-os:agent-submit", handler);
  }, [submitText, waiting]);
  const newRun = reset;
  const contextSuffix = liveContext?.entity ? (liveContext.surface === "calendar" ? " · 已选中日程" : " · 已选中任务") : "";
  const stateLabel = restoring ? "正在恢复" : waiting ? steps.at(-1)?.title ?? "正在回答" : actions.some(action => action.status === "proposed") ? "等待确认" : "";
  const footer = (
    <form onSubmit={(event) => { event.preventDefault(); if (!waiting) void submitText(input); }} className="space-y-2">
      <div className="flex items-end gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-canvas)] p-2 transition-[border-color,box-shadow] focus-within:border-[color-mix(in_srgb,var(--accent)_48%,var(--border-subtle))] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_8%,transparent)]">
        <textarea data-assistant-input="global" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !waiting) { event.preventDefault(); void submitText(input); } }} rows={2} maxLength={10_000} placeholder={`问 ${surfaceLabels[currentSurface]}，或直接说要做什么…`} className="max-h-36 min-h-10 flex-1 resize-none bg-transparent px-1 py-1 text-sm leading-6 outline-none placeholder:text-[var(--text-tertiary)]" aria-label="询问 Personal OS" />
        {waiting ? <button type="button" onClick={() => void stop()} className="flex size-11 shrink-0 items-center justify-center rounded-[9px] md:size-8 bg-[var(--text-primary)] text-white" aria-label="停止生成"><Square className="size-3 fill-current" /></button> : <button type="submit" disabled={!input.trim()} className="flex size-11 shrink-0 items-center justify-center rounded-[9px] md:size-8 bg-[var(--accent)] text-white transition-transform active:scale-[0.96] disabled:opacity-35" aria-label="发送"><ArrowUp className="size-4" /></button>}
      </div>
      <div className="flex items-center justify-between text-[12px] text-[var(--text-tertiary)]"><span>Enter 发送 · Shift Enter 换行</span><button type="button" onClick={newRun} className="inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-[var(--surface-hover)]"><Plus className="size-3" />新会话</button></div>
    </form>
  );

  return <AISidecar open={open} onClose={onClose} title="Personal OS" context={`${surfaceLabels[currentSurface]}${contextSuffix}`} status={stateLabel} footer={footer} className="lg:h-[calc(var(--app-viewport-height)-var(--toolbar-height))]">
    <div className="space-y-4">
      {recoveryUnavailable ? <p role="status" className="text-xs text-[var(--danger)]">当前输入仍可使用，本标签页恢复暂不可用。</p> : null}
      {!messages.length && !restoring ? <div className="py-6"><div className="inline-flex rounded-full bg-[var(--surface-hover)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-secondary)]">当前 · {surfaceLabels[currentSurface]}{contextSuffix}</div><h3 className="mt-4 text-[17px] font-semibold tracking-[-0.025em] text-[var(--text-primary)]">直接告诉我你要解决什么</h3><p className="mt-2 max-w-sm text-[13px] leading-6 text-[var(--text-secondary)]">我会先直接回答；只有问题确实依赖你的数据时才读取对应内容。需要修改 Personal OS 时，会先给你确认。</p><div className="mt-5 space-y-1">{suggestionsForSurface(currentSurface).map((prompt) => <button key={prompt} type="button" onClick={() => void submitText(prompt)} className="block w-full rounded-[9px] px-2.5 py-2.5 text-left text-[12.5px] leading-5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">{prompt}</button>)}</div></div> : null}
      {messages.map((message) => <div key={message.id} className={message.role === "user" ? "ml-8" : "mr-1"}>{message.role === "user" ? <div className="rounded-[12px] bg-[var(--accent-soft)] px-3 py-2 text-sm leading-6 text-[var(--text-primary)]">{message.parts.filter((part) => part.type === "text").map((part) => part.type === "text" ? part.text : "").join("\n")}</div> : <div className="text-sm leading-6 text-[var(--text-primary)]">{message.parts.filter((part) => part.type === "text").map((part, index) => part.type === "text" ? <ReactMarkdown key={index} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{part.text}</ReactMarkdown> : null)}{!activeRunId && message.metadata?.sources?.length ? <AssistantStreamSources sources={message.metadata.sources} /> : null}</div>}</div>)}
      {waiting ? <p role="status" className="text-xs text-[var(--text-tertiary)]">{steps.at(-1)?.title ?? "正在整理…"}</p> : null}
      {currentError ? <div className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 p-3 text-xs text-red-800"><p>{currentError}</p><button type="button" onClick={() => { const last = [...messages].reverse().find((message) => message.role === "user"); const previous = last?.parts.filter((part) => part.type === "text").map((part) => part.type === "text" ? part.text : "").join("\n"); const retryText = input.trim() ? input : previous; if (retryText) void submitText(retryText); }} className="mt-2 inline-flex items-center gap-1 font-medium"><RotateCcw className="size-3" />重试</button></div> : null}
      {activeRunId ? <AgentSources steps={steps} /> : null}
      {actions.length ? <section className="space-y-2"><h3 className="text-xs font-medium text-[var(--text-secondary)]">需要你确认</h3><AgentActionGroup verificationTransport={actionTransport} actions={actions} onChanged={() => void refreshRun()} />{actions.map((action) => <AgentActionCard verificationTransport={actionTransport} key={action.id} action={action} onChanged={() => void refreshRun()} />)}</section> : null}
    </div>
  </AISidecar>;
}
