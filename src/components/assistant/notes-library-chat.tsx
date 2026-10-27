"use client";

import type { AgentActionFixtureTransport } from "@/features/assistant/action-fixtures";
import { assertContinuousFixtureTransport } from "@/features/testing/continuous-fixture-gate";

import { useContinuousAssistantChat } from "./use-continuous-assistant-chat";
import { ArrowUp, LoaderCircle, Plus, RotateCcw, Sparkles } from "lucide-react";
import { useCallback, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { AgentActionCard } from "./agent-action-card";
import { AgentActionGroup } from "./agent-action-group";
import { AgentSources } from "./agent-sources";
import { errorMessage } from "./agent-errors";

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
export function NotesLibraryChat({ actionTransport }: { actionTransport?: AgentActionFixtureTransport } = {}) {
  assertContinuousFixtureTransport(actionTransport);
  const { input, setInput, messages, error, waiting, submit, reset, runtime, refreshRun, recoveryUnavailable } = useContinuousAssistantChat({ surface: "notes-library" }, "笔记库 AI 输入");
  const steps = runtime.run?.steps ?? [];
  const actions = runtime.run?.actions ?? [];
  const restoring = runtime.restoring;
  const currentError = runtime.notice ?? errorMessage(error);
  useEffect(() => {
    try { localStorage.removeItem("personal-os:agent:notes-library:draft:v1"); localStorage.removeItem("personal-os:agent:notes-library:run:v1"); } catch { /* Unowned legacy drafts are never adopted. */ }
  }, []);
  const submitText = useCallback(async (value: string) => {
    if (!value.trim() || waiting) return;
    await submit({ text: value, currentPath: "/notes/ask", currentEntity: null, surfaceContext: { type: "global_page", title: "笔记库" } });
  }, [submit, waiting]);
  const newRun = reset;
  const stateLabel = restoring ? "正在恢复" : waiting ? steps.at(-1)?.title ?? "正在思考" : actions.some(action => action.status === "proposed") ? "等待确认" : "";

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

          {recoveryUnavailable ? <p role="status" className="text-xs text-[var(--danger)]">当前输入仍可使用，本标签页恢复暂不可用。</p> : null}
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
              <button type="button" onClick={() => { const last = [...messages].reverse().find((message) => message.role === "user"); const previous = last?.parts.filter((part) => part.type === "text").map((part) => part.type === "text" ? part.text : "").join("\n"); const retryText = previous || input; if (retryText) void submitText(retryText); }} className="mt-2 inline-flex items-center gap-1 font-medium"><RotateCcw className="size-3" />重试</button>
            </div>
          ) : null}

          <AgentSources steps={steps} />
          {actions.length ? <section className="mt-4 space-y-2"><h3 className="text-xs font-medium text-[var(--text-secondary)]">待确认操作</h3><AgentActionGroup verificationTransport={actionTransport} actions={actions} onChanged={() => void refreshRun()} />{actions.map((action) => <AgentActionCard verificationTransport={actionTransport} key={action.id} action={action} onChanged={() => void refreshRun()} />)}</section> : null}
        </div>
      </div>

      <footer className="shrink-0 border-t bg-[var(--surface-app)] p-4">
        <form onSubmit={(event) => { event.preventDefault(); void submitText(input); }} className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2 rounded-[var(--radius-md)] border bg-[var(--surface-canvas)] p-2 transition-colors focus-within:border-[var(--accent)]">
            <textarea data-assistant-input="notes-library" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submitText(input); } }} rows={3} maxLength={10_000} placeholder="询问笔记库，或要求跨多篇笔记综合分析…" className="max-h-48 min-h-[3.5rem] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-6 outline-none" aria-label="询问笔记库" />
            <button type="submit" disabled={waiting || !input.trim()} className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent)] text-white transition-opacity disabled:opacity-40" aria-label="发送">{waiting ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}</button>
          </div>
          <div className="mt-2 flex items-center justify-between text-[12px] text-[var(--text-tertiary)]">
            <span>Enter 发送 · Shift Enter 换行</span>
            <span>只读分析 + 整理提案（确认后才执行）</span>
          </div>
        </form>
      </footer>
    </div>
  );
}
