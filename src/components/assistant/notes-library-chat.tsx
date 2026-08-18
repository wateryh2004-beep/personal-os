"use client";

import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import { ArrowUp, LoaderCircle, Plus, RotateCcw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import type { AgentAction } from "@/features/assistant/types";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";
import { AgentActionCard } from "./agent-action-card";
import { AgentActionGroup } from "./agent-action-group";
import { AgentSources } from "./agent-sources";
import { errorMessage, runError, type RunPayload, type RunStep } from "./agent-errors";

const runStorageKey = "personal-os:agent:notes-library:run:v1";
const draftStorageKey = "personal-os:agent:notes-library:draft:v1";

const quickPrompts = [
  "我最近 1 个月写了什么？",
  "我最近在纠结什么？",
  "最近有哪些主题反复出现？",
  "帮我整理最近的笔记",
  "把根目录散落的文件归进文件夹",
];

/**
 * 笔记库全屏对话工作区：独立的只读+整理子 AI，与全局 Personal OS Agent 分开，
 * 只装配笔记工具（searchNotes/listRecentNotes/readNotesBatch/readNote +
 * 修改/新建提案），走独立的 notes-library surface 与独立会话持久化。
 *
 * 布局：占满 Notes 工作区的沉浸式对话（标题栏 + 滚动消息区 + 大输入框），
 * 左侧目录树由 NotesWorkspaceShell 提供。
 */
export function NotesLibraryChat() {
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
            title: "笔记库",
          },
        },
      });
    } catch {
      setLocalError("无法连接笔记库 AI。会话和草稿仍已保留，请稍后重试。");
    } finally {
      pendingSubmitRef.current = false;
    }
  }, [clearError, ensureRun, sendMessage]);

  const newRun = () => {
    if (waiting) void stop();
    runIdRef.current = null;
    setActiveRunId(null);
    localStorage.removeItem(runStorageKey);
    setMessages([]); setSteps([]); setActions([]); setLocalError(null); clearError();
  };
  const currentError = localError ?? errorMessage(error);
  const stateLabel = restoring ? "正在恢复" : waiting ? steps.at(-1)?.title ?? "正在思考" : actions.some((action) => action.status === "proposed") ? "等待确认" : "";

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface-canvas)]">
      <header className="flex shrink-0 items-center justify-between border-b px-5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[var(--surface-canvas)] text-[var(--accent)]"><Sparkles className="size-3.5" aria-hidden="true" /></span>
          <h1 className="truncate text-sm font-medium text-[var(--text-primary)]">问笔记库</h1>
          {stateLabel ? <span className="truncate text-xs text-[var(--text-tertiary)]">{stateLabel}</span> : null}
        </div>
        <button type="button" onClick={newRun} className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-md)] px-2 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"><Plus className="size-3.5" aria-hidden="true" />新会话</button>
      </header>

      <div className="workspace-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
          {!messages.length && !restoring ? (
            <div className="py-12">
              <h2 className="text-lg font-medium text-[var(--text-primary)]">想深入了解你的笔记库？</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">我会读取你近期和相关的笔记，总结、回顾、找反复出现的主题，也能跨多篇笔记做综合分析（只基于你亲手写的内容，AI 生成的冗余文档会自动跳过）。对笔记的修改会先提出提案，确认后才执行。</p>
              <div className="mt-6 space-y-1">{quickPrompts.map((prompt) => <button key={prompt} type="button" onClick={() => void submitText(prompt)} className="block w-full rounded-[var(--radius-md)] px-3 py-2.5 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">{prompt}</button>)}</div>
            </div>
          ) : null}

          {restoring ? <p role="status" className="py-8 text-center text-xs text-[var(--text-tertiary)]">正在恢复会话…</p> : null}

          <div className="space-y-6">
            {messages.map((message) => (
              <div key={message.id} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                {message.role === "user"
                  ? <div className="max-w-[85%] whitespace-pre-wrap rounded-[var(--radius-md)] bg-[var(--accent-soft)] px-4 py-2.5 text-sm leading-6 text-[var(--text-primary)]">{message.parts.filter((part) => part.type === "text").map((part) => part.type === "text" ? part.text : "").join("\n")}</div>
                  : <div className="min-w-0 max-w-[92%] text-sm leading-6 text-[var(--text-primary)]">{message.parts.filter((part) => part.type === "text").map((part, index) => part.type === "text" ? <ReactMarkdown key={index} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{part.text}</ReactMarkdown> : null)}</div>}
              </div>
            ))}
          </div>

          {waiting ? <p role="status" className="mt-4 inline-flex items-center gap-2 text-xs text-[var(--text-tertiary)]"><LoaderCircle className="size-3.5 animate-spin" />{steps.at(-1)?.title ?? "正在整理上下文…"}</p> : null}

          {currentError ? (
            <div className="mt-4 rounded-[var(--radius-md)] border border-red-200 bg-red-50 p-4 text-xs text-red-800">
              <p>{currentError}</p>
              <button type="button" onClick={() => { clearError(); setLocalError(null); const last = [...messages].reverse().find((message) => message.role === "user"); const previous = last?.parts.filter((part) => part.type === "text").map((part) => part.type === "text" ? part.text : "").join("\n"); const retryText = previous || input; if (retryText) void submitText(retryText); }} className="mt-2 inline-flex items-center gap-1 font-medium"><RotateCcw className="size-3" />重试</button>
            </div>
          ) : null}

          <AgentSources steps={steps} />
          {actions.length ? <section className="mt-4 space-y-2"><h3 className="text-xs font-medium text-[var(--text-secondary)]">待确认操作</h3><AgentActionGroup actions={actions} onChanged={() => void refreshRun()} />{actions.map((action) => <AgentActionCard key={action.id} action={action} onChanged={() => void refreshRun()} />)}</section> : null}
        </div>
      </div>

      <footer className="shrink-0 border-t bg-[var(--surface-app)] p-4">
        <form onSubmit={(event) => { event.preventDefault(); void submitText(input); }} className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2 rounded-[var(--radius-md)] border bg-[var(--surface-canvas)] p-2 transition-colors focus-within:border-[var(--accent)]">
            <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submitText(input); } }} rows={3} maxLength={10_000} placeholder="询问笔记库，或要求跨多篇笔记综合分析…" className="max-h-48 min-h-[3.5rem] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-6 outline-none" aria-label="询问笔记库" />
            <button type="submit" disabled={waiting || !input.trim()} className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent)] text-white transition-opacity disabled:opacity-40" aria-label="发送">{waiting ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}</button>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--text-tertiary)]">
            <span>Enter 发送 · Shift Enter 换行</span>
            <span>只读分析 + 整理提案（确认后才执行）</span>
          </div>
        </form>
      </footer>
    </div>
  );
}
