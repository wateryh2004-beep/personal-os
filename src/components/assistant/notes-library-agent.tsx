"use client";

import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import { ArrowUp, LoaderCircle, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { AISidecar } from "@/components/ai/ai-sidecar";
import type { AgentAction } from "@/features/assistant/types";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";
import { AgentActionCard } from "./agent-action-card";
import { AgentActionGroup } from "./agent-action-group";
import { AgentSources } from "./agent-sources";
import { errorMessage, runError, type RunPayload, type RunStep } from "./agent-errors";

const runStorageKey = "personal-os:agent:notes-library:run:v1";
const draftStorageKey = "personal-os:agent:notes-library:draft:v1";

const quickPrompts = [
  "我最近 5 天写了什么？",
  "我最近在纠结什么？",
  "最近有哪些主题反复出现？",
  "帮我整理最近的笔记",
];

/**
 * 笔记库文档小管家：独立的只读+整理子 AI，与全局 Personal OS Agent 分开，
 * 只装配笔记工具（searchNotes/listRecentNotes/readNotesBatch/readNote +
 * 修改/新建提案），走独立的 notes-library surface 与独立会话持久化。
 */
export function NotesLibraryAI({ open, onClose, folderName }: { open: boolean; onClose: () => void; folderName?: string }) {
  const runIdRef = useRef<string | null>(null);
  const pendingSubmitRef = useRef(false);
  const [input, setInput] = useState("");
  const [steps, setSteps] = useState<RunStep[]>([]);
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [restoring, setRestoring] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/assistant" }), []);
  const { messages, setMessages, sendMessage, status, error, stop, clearError } = useChat({ transport, onFinish: () => { void refreshRun(); } });
  const waiting = status !== "ready";

  const refreshRun = useCallback(async () => {
    const runId = runIdRef.current;
    if (!runId) return;
    try {
      const response = await fetch(`/api/assistant/runs/${runId}`, { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as RunPayload;
      setSteps(payload.steps ?? []);
      setActions(payload.actions ?? []);
      setLocalError(runError(payload));
      if (!waiting && (payload.messages?.length ?? 0) > messages.length) setMessages(payload.messages ?? []);
    } catch { /* Streaming messages remain usable if persistence refresh is offline. */ }
  }, [messages.length, setMessages, waiting]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const runId = localStorage.getItem(runStorageKey);
      const draft = localStorage.getItem(draftStorageKey);
      if (draft) setInput(draft);
      if (runId) {
        runIdRef.current = runId;
        setActiveRunId(runId);
        try {
          const response = await fetch(`/api/assistant/runs/${runId}`, { cache: "no-store" });
          if (response.ok) {
            const payload = await response.json() as RunPayload;
            setMessages(payload.messages ?? []);
            setSteps(payload.steps ?? []);
            setActions(payload.actions ?? []);
            setLocalError(runError(payload));
          } else {
            runIdRef.current = null;
            setActiveRunId(null);
            localStorage.removeItem(runStorageKey);
          }
        } catch { /* Keep the run id so a later retry can restore it. */ }
      }
      setRestoring(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [setMessages]);

  useEffect(() => { localStorage.setItem(draftStorageKey, input); }, [input]);

  const ensureRun = useCallback(async () => {
    if (runIdRef.current) return runIdRef.current;
    const response = await fetch("/api/assistant/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ surface: "notes-library" }),
    });
    const payload = await response.json() as { runId?: string; error?: string };
    if (!response.ok || !payload.runId) throw new Error(payload.error || "Agent 会话暂时不可用。");
    runIdRef.current = payload.runId;
    setActiveRunId(payload.runId);
    localStorage.setItem(runStorageKey, payload.runId);
    return payload.runId;
  }, []);

  useEffect(() => {
    if (!activeRunId) return;
    const supabase = createBrowserSupabaseClient();
    let refreshTimer: number | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void refreshRun(), 80);
    };
    const channel = supabase
      .channel(`agent-run:${activeRunId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_runs", filter: `id=eq.${activeRunId}` }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_messages", filter: `run_id=eq.${activeRunId}` }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_steps", filter: `run_id=eq.${activeRunId}` }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_actions", filter: `run_id=eq.${activeRunId}` }, scheduleRefresh)
      .subscribe((channelStatus) => {
        if (channelStatus === "SUBSCRIBED") scheduleRefresh();
      });
    return () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [activeRunId, refreshRun]);

  const submitText = useCallback(async (value: string) => {
    const text = value.trim();
    if (!text || pendingSubmitRef.current) return;
    pendingSubmitRef.current = true;
    try {
      const runId = await ensureRun();
      clearError();
      setLocalError(null);
      setInput("");
      localStorage.removeItem(draftStorageKey);
      await sendMessage({ text }, {
        body: {
          surface: "notes-library",
          runId,
          currentPath: "/notes",
          surfaceContext: {
            type: "global_page",
            title: folderName ? `笔记库 · ${folderName}` : "笔记库",
          },
        },
      });
    } catch {
      setLocalError("无法连接笔记库 AI。会话和草稿仍已保留，请稍后重试。");
    } finally {
      pendingSubmitRef.current = false;
    }
  }, [clearError, ensureRun, folderName, sendMessage]);

  const newRun = () => {
    if (waiting) void stop();
    runIdRef.current = null;
    setActiveRunId(null);
    localStorage.removeItem(runStorageKey);
    setMessages([]); setSteps([]); setActions([]); setLocalError(null); clearError();
  };
  const currentError = localError ?? errorMessage(error);
  const stateLabel = restoring ? "正在恢复" : waiting ? steps.at(-1)?.title ?? "正在思考" : actions.some((action) => action.status === "proposed") ? "等待确认" : "";
  const footer = <form onSubmit={(event) => { event.preventDefault(); void submitText(input); }} className="space-y-2"><div className="flex items-end gap-2 rounded-[var(--radius-md)] border bg-[var(--surface-canvas)] p-2 focus-within:border-[var(--accent)]"><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submitText(input); } }} rows={2} maxLength={10_000} placeholder="询问笔记库…" className="max-h-36 min-h-10 flex-1 resize-none bg-transparent px-1 py-1 text-sm outline-none" aria-label="询问笔记库"/><button type="submit" disabled={waiting || !input.trim()} className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent)] text-white disabled:opacity-40" aria-label="发送">{waiting ? <LoaderCircle className="size-4 animate-spin"/> : <ArrowUp className="size-4"/>}</button></div><div className="flex items-center justify-between text-[11px] text-[var(--text-tertiary)]"><span>Enter 发送 · Shift Enter 换行</span><button type="button" onClick={newRun} className="inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-[var(--surface-hover)]"><Plus className="size-3"/>新会话</button></div></form>;

  return <AISidecar open={open} onClose={onClose} title="笔记库" context={folderName ? `当前：${folderName}` : "文档小管家"} status={stateLabel} footer={footer} className="lg:h-[calc(var(--app-viewport-height)-var(--toolbar-height))]">
    <div className="space-y-4">
      {!messages.length && !restoring ? <div className="py-8"><h3 className="text-sm font-medium">想了解你的笔记库？</h3><p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">我会读取你近期和相关的笔记，总结、回顾、找反复出现的主题，也能对笔记提出整理提案（确认后才执行）。</p><div className="mt-4 space-y-1">{quickPrompts.map((prompt) => <button key={prompt} type="button" onClick={() => void submitText(prompt)} className="block w-full rounded-[var(--radius-sm)] px-2 py-2 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">{prompt}</button>)}</div></div> : null}
      {messages.map((message) => <div key={message.id} className={message.role === "user" ? "ml-8" : "mr-2"}>{message.role === "user" ? <div className="rounded-[var(--radius-md)] bg-[var(--accent-soft)] px-3 py-2 text-sm leading-6">{message.parts.filter((part) => part.type === "text").map((part) => part.type === "text" ? part.text : "").join("\n")}</div> : <div className="text-sm leading-6 text-[var(--text-primary)]">{message.parts.filter((part) => part.type === "text").map((part, index) => part.type === "text" ? <ReactMarkdown key={index} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{part.text}</ReactMarkdown> : null)}</div>}</div>)}
      {waiting ? <p role="status" className="inline-flex items-center gap-2 text-xs text-[var(--text-tertiary)]"><LoaderCircle className="size-3.5 animate-spin"/>{steps.at(-1)?.title ?? "正在整理上下文…"}</p> : null}
      {currentError ? <div className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 p-3 text-xs text-red-800"><p>{currentError}</p><button type="button" onClick={() => { clearError(); setLocalError(null); const last = [...messages].reverse().find((message) => message.role === "user"); const previous = last?.parts.filter((part) => part.type === "text").map((part) => part.type === "text" ? part.text : "").join("\n"); const retryText = previous || input; if (retryText) void submitText(retryText); }} className="mt-2 inline-flex items-center gap-1 font-medium"><RotateCcw className="size-3"/>重试</button></div> : null}
      <AgentSources steps={steps} />
      {actions.length ? <section className="space-y-2"><h3 className="text-xs font-medium text-[var(--text-secondary)]">待确认操作</h3><AgentActionGroup actions={actions} onChanged={() => void refreshRun()} />{actions.map((action) => <AgentActionCard key={action.id} action={action} onChanged={() => void refreshRun()} />)}</section> : null}
    </div>
  </AISidecar>;
}
