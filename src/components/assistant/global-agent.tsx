"use client";

import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import { usePathname } from "next/navigation";
import { ArrowUp, LoaderCircle, Plus, RotateCcw, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { AISidecar } from "@/components/ai/ai-sidecar";
import type { AgentAction } from "@/features/assistant/types";
import { decideContextGate } from "@/features/assistant/kernel/context-gate";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";
import { AgentActionCard } from "./agent-action-card";
import { AgentActionGroup } from "./agent-action-group";
import { AgentSources } from "./agent-sources";
import { perfMark } from "@/lib/perf";
import { errorMessage, runError, type RunPayload, type RunStep } from "./agent-errors";

const runStorageKey = "personal-os:agent:active-run:v1";
const draftStorageKey = "personal-os:agent:draft:v1";

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
  return match ? { type: "note", id: match[1] } : null;
}

function suggestionsForSurface(surface: string) {
  if (surface === "calendar") return ["我今天剩下还有什么安排？", "帮我看看这周哪里比较挤", "把这个日程改到明天下午"];
  if (surface === "tasks") return ["我现在最该先做哪几个任务？", "有哪些快到期的事情？", "把这个任务改到周五前完成"];
  if (surface === "notes") return ["这和我之前写过的哪些想法有关？", "找出相关笔记", "我最近在这个主题上的想法有什么变化？"];
  if (surface === "career") return ["结合我的现状，下一步最值得做什么？", "我最近的职业方向有没有变化？", "找出和当前选择最相关的经历"];
  return ["我最近到底在忙什么？", "我下周有哪些重要安排？", "找出最近记录里反复出现的主题"];
}

export function GlobalAgent({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    perfMark("agent-lazy-mounted");
  }, []);

  const pathname = usePathname();
  const currentSurface = surfaceForPath(pathname);
  const runIdRef = useRef<string | null>(null);
  const pendingSubmitRef = useRef(false);
  const [input, setInput] = useState("");
  const [steps, setSteps] = useState<RunStep[]>([]);
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [restoring, setRestoring] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/assistant" }), []);
  const { messages, setMessages, sendMessage, status, error, stop, clearError } = useChat({
    transport,
    onFinish: () => {
      void refreshRun();
    },
  });
  const waiting = status !== "ready";

  const refreshRun = useCallback(async () => {
    const runId = runIdRef.current;
    if (!runId) return;
    try {
      const response = await fetch(`/api/assistant/runs/${runId}`, { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as RunPayload;
      setSteps(payload.steps ?? []);
      setActions(payload.actions ?? []);
      setLocalError(runError(payload));
      if (!waiting && (payload.messages?.length ?? 0) > messages.length) setMessages(payload.messages ?? []);
    } catch {
      // Streaming chat remains usable if persistence refresh is temporarily offline.
    }
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
            const payload = (await response.json()) as RunPayload;
            setMessages(payload.messages ?? []);
            setSteps(payload.steps ?? []);
            setActions(payload.actions ?? []);
            setLocalError(runError(payload));
          } else {
            runIdRef.current = null;
            setActiveRunId(null);
            localStorage.removeItem(runStorageKey);
          }
        } catch {
          // Preserve the id so a later retry can restore an action run.
        }
      }
      setRestoring(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [setMessages]);

  useEffect(() => {
    localStorage.setItem(draftStorageKey, input);
  }, [input]);

  const ensureRun = useCallback(async () => {
    if (runIdRef.current) return runIdRef.current;
    const response = await fetch("/api/assistant/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        surface: "global",
        currentPath: pathname,
        currentEntity: entityForPath(pathname),
      }),
    });
    const payload = (await response.json()) as { runId?: string; error?: string };
    if (!response.ok || !payload.runId) throw new Error(payload.error || "Agent 操作会话暂时不可用。");
    runIdRef.current = payload.runId;
    setActiveRunId(payload.runId);
    localStorage.setItem(runStorageKey, payload.runId);
    return payload.runId;
  }, [pathname]);

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

  const submitText = useCallback(
    async (value: string) => {
      const text = value.trim();
      if (!text || pendingSubmitRef.current) return;
      pendingSubmitRef.current = true;
      try {
        const selectedText = window.getSelection()?.toString().trim().slice(0, 4_000) || null;
        const gate = decideContextGate({
          message: text,
          surface: "global",
          currentPath: pathname,
          hasCurrentSurface: Boolean(selectedText),
        });
        const shouldPersist = Boolean(runIdRef.current) || gate.mode === "action";
        const runId = shouldPersist ? await ensureRun() : null;

        clearError();
        setLocalError(null);
        setInput("");
        localStorage.removeItem(draftStorageKey);
        await sendMessage(
          { text },
          {
            body: {
              surface: "global",
              runId,
              currentPath: pathname,
              currentEntity: entityForPath(pathname),
              surfaceContext: {
                type: selectedText ? "text" : "global_page",
                title: selectedText ? "当前选中文字" : surfaceLabels[currentSurface],
                content: selectedText,
              },
            },
          },
        );
      } catch {
        setLocalError("Personal OS AI 暂时没有完成这次请求。你的输入仍保留在当前会话中，可以直接重试。");
      } finally {
        pendingSubmitRef.current = false;
      }
    },
    [clearError, currentSurface, ensureRun, pathname, sendMessage],
  );

  useEffect(() => {
    const handler = (event: Event) => {
      const query = (event as CustomEvent<{ query?: string }>).detail?.query?.trim();
      if (query) void submitText(query);
    };
    window.addEventListener("personal-os:agent-submit", handler);
    return () => window.removeEventListener("personal-os:agent-submit", handler);
  }, [submitText]);

  const newRun = () => {
    if (waiting) void stop();
    runIdRef.current = null;
    setActiveRunId(null);
    localStorage.removeItem(runStorageKey);
    setMessages([]);
    setSteps([]);
    setActions([]);
    setLocalError(null);
    clearError();
  };

  const currentError = localError ?? errorMessage(error);
  const stateLabel = restoring
    ? "正在恢复"
    : waiting
      ? steps.at(-1)?.title ?? "正在回答"
      : actions.some((action) => action.status === "proposed")
        ? "等待确认"
        : "";

  const footer = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!waiting) void submitText(input);
      }}
      className="space-y-2"
    >
      <div className="flex items-end gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-canvas)] p-2 transition-[border-color,box-shadow] focus-within:border-[color-mix(in_srgb,var(--accent)_48%,var(--border-subtle))] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_8%,transparent)]">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !waiting) {
              event.preventDefault();
              void submitText(input);
            }
          }}
          rows={2}
          maxLength={10_000}
          placeholder={`问 ${surfaceLabels[currentSurface]}，或直接说要做什么…`}
          className="max-h-36 min-h-10 flex-1 resize-none bg-transparent px-1 py-1 text-sm leading-6 outline-none placeholder:text-[var(--text-tertiary)]"
          aria-label="询问 Personal OS"
        />
        {waiting ? (
          <button
            type="button"
            onClick={() => void stop()}
            className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-[var(--text-primary)] text-white"
            aria-label="停止生成"
          >
            <Square className="size-3 fill-current" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-[var(--accent)] text-white transition-transform active:scale-[0.96] disabled:opacity-35"
            aria-label="发送"
          >
            <ArrowUp className="size-4" />
          </button>
        )}
      </div>
      <div className="flex items-center justify-between text-[10.5px] text-[var(--text-tertiary)]">
        <span>Enter 发送 · Shift Enter 换行</span>
        <button type="button" onClick={newRun} className="inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-[var(--surface-hover)]">
          <Plus className="size-3" />新会话
        </button>
      </div>
    </form>
  );

  return (
    <AISidecar
      open={open}
      onClose={onClose}
      title="Personal OS"
      context={surfaceLabels[currentSurface]}
      status={stateLabel}
      footer={footer}
      className="lg:h-[calc(var(--app-viewport-height)-var(--toolbar-height))]"
    >
      <div className="space-y-4">
        {!messages.length && !restoring ? (
          <div className="py-6">
            <div className="inline-flex rounded-full bg-[var(--surface-hover)] px-2.5 py-1 text-[10.5px] font-medium text-[var(--text-secondary)]">
              当前 · {surfaceLabels[currentSurface]}
            </div>
            <h3 className="mt-4 text-[17px] font-semibold tracking-[-0.025em] text-[var(--text-primary)]">直接告诉我你要解决什么</h3>
            <p className="mt-2 max-w-sm text-[13px] leading-6 text-[var(--text-secondary)]">
              我会先直接回答；只有问题确实依赖你的数据时才读取对应内容。需要修改 Personal OS 时，会先给你确认。
            </p>
            <div className="mt-5 space-y-1">
              {suggestionsForSurface(currentSurface).map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void submitText(prompt)}
                  className="block w-full rounded-[9px] px-2.5 py-2.5 text-left text-[12.5px] leading-5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((message) => (
          <div key={message.id} className={message.role === "user" ? "ml-8" : "mr-1"}>
            {message.role === "user" ? (
              <div className="rounded-[12px] bg-[var(--accent-soft)] px-3 py-2 text-sm leading-6 text-[var(--text-primary)]">
                {message.parts
                  .filter((part) => part.type === "text")
                  .map((part) => (part.type === "text" ? part.text : ""))
                  .join("\n")}
              </div>
            ) : (
              <div className="prose-ai text-sm leading-6 text-[var(--text-primary)]">
                {message.parts
                  .filter((part) => part.type === "text")
                  .map((part, index) =>
                    part.type === "text" ? (
                      <ReactMarkdown key={index} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                        {part.text}
                      </ReactMarkdown>
                    ) : null,
                  )}
              </div>
            )}
          </div>
        ))}

        {waiting ? (
          <p role="status" className="inline-flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
            <LoaderCircle className="size-3.5 animate-spin" />
            {steps.at(-1)?.title ?? "正在回答…"}
          </p>
        ) : null}

        {currentError ? (
          <div className="rounded-[10px] border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">
            <p>{currentError}</p>
            <button
              type="button"
              onClick={() => {
                clearError();
                setLocalError(null);
                const last = [...messages].reverse().find((message) => message.role === "user");
                const previous = last?.parts
                  .filter((part) => part.type === "text")
                  .map((part) => (part.type === "text" ? part.text : ""))
                  .join("\n");
                const retryText = previous || input;
                if (retryText) void submitText(retryText);
              }}
              className="mt-2 inline-flex items-center gap-1 font-medium"
            >
              <RotateCcw className="size-3" />重试
            </button>
          </div>
        ) : null}

        {steps.length ? <AgentSources steps={steps} /> : null}

        {actions.length ? (
          <section className="space-y-2.5 border-t border-[var(--border-subtle)] pt-3">
            <h3 className="text-[11px] font-medium text-[var(--text-secondary)]">需要你确认</h3>
            <AgentActionGroup actions={actions} onChanged={() => void refreshRun()} />
            {actions.map((action) => (
              <AgentActionCard key={action.id} action={action} onChanged={() => void refreshRun()} />
            ))}
          </section>
        ) : null}
      </div>
    </AISidecar>
  );
}
