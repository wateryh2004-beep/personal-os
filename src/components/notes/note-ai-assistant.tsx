"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Check,
  CheckSquare,
  Copy,
  FileText,
  Lightbulb,
  ListTree,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { AISidecar } from "@/components/ai/ai-sidecar";
import {
  generateNoteAiSuggestion,
  type NoteAiState,
} from "@/features/notes/ai-actions";
import {
  isRewriteOperation,
  noteAiOperationLabel,
  noteAiUserMessage,
  type NoteAiOperation,
} from "@/features/notes/ai-prompts";
import { wordDiff } from "@/features/notes/diff-preview";
import type { DeepSeekModelId } from "@/lib/ai/deepseek";

export type NoteSelection = {
  text: string;
  contextBefore?: string;
  contextAfter?: string;
  rect: { left: number; top: number };
  replace: (text: string) => boolean;
  insertBelow: (text: string) => boolean;
};
type Request = {
  operation: NoteAiOperation;
  scope: "note" | "selection";
  instruction?: string;
  content: string;
  contextBefore?: string;
  contextAfter?: string;
};
const shortcuts: Array<[NoteAiOperation, string, React.ReactNode]> = [
  ["summarizeNote", "总结", <Sparkles key="summary" />],
  ["extractActions", "提取行动", <CheckSquare key="actions" />],
  ["restructureNote", "整理结构", <ListTree key="structure" />],
  ["polishNote", "润色全文", <WandSparkles key="polish" />],
  ["deepThinkNote", "深入思考", <Lightbulb key="think" />],
  ["generateTitle", "生成标题", <FileText key="title" />],
];

/** 一篇笔记的 AI 多轮讨论线程：user 为发起的问题/操作，assistant 为 AI 回复。 */
type ThreadItem = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** 当前轮（结果预览区正在展示、尚未落笔/放弃）——渲染时跳过，避免与预览重复。 */
  current?: boolean;
  /** 已写入笔记（替换/插入/标题已替换）。 */
  applied?: boolean;
};

/** 每篇笔记一个持久化的 run：云端存 agent_messages，本机只存 runId 用于恢复。 */
const runStorageKey = (noteId: string) => `personal-os:note-ai:run:${noteId}:v1`;

/** 线程 → 模型上下文：只带最近几轮、每轮截断，避免超长笔记 + 长历史撑爆 prompt。 */
function threadToHistory(thread: ThreadItem[]) {
  return thread.slice(-10).map((item) => ({
    role: item.role,
    content: item.content.slice(0, 4_000),
  }));
}

/**
 * AI 内容落笔时的来源标注：分割线 + 「AI 生成 · 生成日期 · 基于什么操作」。
 * 让后来者一眼知道这段是谁写的、为什么写，避免一段语气不符的内容凭空出现。
 */
function noteAiAttribution(operation: NoteAiOperation) {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `---\n\n> 以下内容由 AI 生成于 ${date}，基于「${noteAiOperationLabel(operation)}」操作。\n\n`;
}

export function NoteAiAssistant({
  open,
  onOpen,
  onClose,
  noteId,
  title,
  bodyMarkdown,
  defaultModel,
  selection,
  onReplaceNote,
  onInsertNote,
  onReplaceTitle,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  noteId: string;
  title: string;
  bodyMarkdown: string;
  defaultModel: DeepSeekModelId;
  selection: NoteSelection | null;
  onReplaceNote: (text: string) => void;
  onInsertNote: (text: string) => void;
  onReplaceTitle: (title: string) => void;
}) {
  const [model, setModel] = useState<DeepSeekModelId>(defaultModel);
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<NoteAiState>({
    status: "idle",
    message: "",
    suggestion: "",
  });
  const [request, setRequest] = useState<Request | null>(null);
  const [resultSelection, setResultSelection] = useState<NoteSelection | null>(null);
  const [customSelection, setCustomSelection] = useState<NoteSelection | null>(
    null,
  );
  const [moreSelectionText, setMoreSelectionText] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(true);
  const [usePersonalContext, setUsePersonalContext] = useState(true);
  const [pending, startTransition] = useTransition();
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  // 打开面板时从云端恢复这篇笔记的 AI 讨论线程。父组件用 key={note.id} 挂载，
  // 切换笔记会整体重挂载，不需要手动清空旧线程。
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(async () => {
      setRestoring(true);
      const savedRunId = localStorage.getItem(runStorageKey(noteId));
      if (savedRunId) {
        try {
          const response = await fetch(`/api/assistant/runs/${savedRunId}`, {
            cache: "no-store",
          });
          if (response.ok) {
            const payload = (await response.json()) as {
              messages?: Array<{
                id: string;
                role: string;
                parts: Array<{ type: string; text?: string }>;
              }>;
            };
            const messages = payload.messages;
            if (Array.isArray(messages) && messages.length) {
              setRunId(savedRunId);
              setThread(
                messages.map((message) => ({
                  id: message.id,
                  role: message.role === "user" ? "user" : "assistant",
                  content: (message.parts ?? [])
                    .filter((part) => part.type === "text")
                    .map((part) => part.text ?? "")
                    .join("\n"),
                })),
              );
            } else {
              localStorage.removeItem(runStorageKey(noteId));
            }
          }
        } catch {
          /* 恢复失败不阻塞面板；runId 保留，下次打开可重试。 */
        }
      }
      setRestoring(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, noteId]);
  const run = (next: Request, targetSelection: NoteSelection | null = null) => {
    if (!next.content.trim()) {
      setResult({
        status: "error",
        message: "先写一些内容，再让 AI 协助。",
        suggestion: "",
      });
      return;
    }
    // 本轮用户消息先进线程；history 只取此前轮次，让模型延续上下文。
    const userText = noteAiUserMessage(
      next.operation,
      next.instruction,
      next.scope,
    );
    setThread((prev) => [
      ...prev,
      { id: `note-ai-user-${Date.now()}`, role: "user", content: userText },
    ]);
    setRequest(next);
    setResultSelection(next.scope === "selection" ? targetSelection : null);
    setResult({ status: "idle", message: "", suggestion: "" });
    const data = new FormData();
    data.set("note_id", noteId);
    data.set("title", title);
    data.set("content", next.content);
    data.set("operation", next.operation);
    data.set("scope", next.scope);
    data.set("model", next.operation === "generateTitle" ? "deepseek-v4-pro" : model);
    data.set("use_personal_context", String(usePersonalContext));
    if (runId) data.set("run_id", runId);
    const history = threadToHistory(thread);
    if (history.length) data.set("history", JSON.stringify(history));
    if (next.instruction) data.set("instruction", next.instruction);
    if (next.contextBefore) data.set("context_before", next.contextBefore);
    if (next.contextAfter) data.set("context_after", next.contextAfter);
    startTransition(async () => {
      const nextResult = await generateNoteAiSuggestion(data);
      if (nextResult.runId) {
        setRunId(nextResult.runId);
        localStorage.setItem(runStorageKey(noteId), nextResult.runId);
      }
      if (nextResult.suggestion) {
        setThread((prev) => [
          ...prev,
          {
            id: `note-ai-assistant-${Date.now()}`,
            role: "assistant",
            content: nextResult.suggestion,
            current: true,
          },
        ]);
      }
      if (next.operation === "generateTitle" && nextResult.suggestion) {
        // 标题是自动替换的，立即标记为已写入（撤回由标题栏负责）。
        setThread((prev) =>
          prev.map((item) =>
            item.current ? { ...item, applied: true, current: false } : item,
          ),
        );
      }
      setResult(nextResult);
    });
  };
  const runNote = (operation: NoteAiOperation) => {
    run({
      operation,
      scope: "note",
      content: bodyMarkdown,
      instruction: operation === "askNote" ? question : undefined,
    });
    if (operation === "askNote") setQuestion("");
  };
  const apply = (mode: "replace" | "insert") => {
    if (!result.suggestion || !request) return;
    if (request.scope === "selection") {
      if (!resultSelection) {
        setResult({ status: "error", message: "原选区已经失效，请重新选择文字后再生成。", suggestion: "" });
        return;
      }
      const applied = mode === "replace"
        ? resultSelection.replace(result.suggestion)
        : resultSelection.insertBelow(result.suggestion);
      if (!applied) {
        setResult({ status: "error", message: "所选文字已发生变化。为避免覆盖错误内容，请重新选择后再生成。", suggestion: "" });
        return;
      }
    } else {
      // 落笔时在 AI 内容前标注来源（分割线 + 生成日期 + 请求目的）。
      // 选区操作不加，避免在段落中间插入分割线打断文档。
      const attributed = `${noteAiAttribution(request.operation)}${result.suggestion}`;
      if (mode === "replace") onReplaceNote(attributed);
      else onInsertNote(attributed);
    }
    const appliedMessage = request.scope === "selection"
      ? mode === "replace" ? "已替换所选文字，笔记正在自动保存。" : "已插入到选区下方，笔记正在自动保存。"
      : mode === "replace" ? "已替换全文，笔记正在自动保存。" : "已插入到笔记末尾，笔记正在自动保存。";
    // 本轮 AI 回复标记为"已写入"，对话继续不中断。
    setThread((prev) =>
      prev.map((item) =>
        item.current ? { ...item, applied: true, current: false } : item,
      ),
    );
    setRequest(null);
    setResultSelection(null);
    setResult({ status: "success", message: appliedMessage, suggestion: "" });
  };
  const selectionOperation = (operation: NoteAiOperation) => {
    if (!selection) return;
    onOpen();
    run(
      {
        operation,
        scope: "selection",
        content: selection.text,
        contextBefore: selection.contextBefore,
        contextAfter: selection.contextAfter,
      },
      selection,
    );
  };
  const startCustomSelection = () => {
    if (!selection) return;
    setCustomSelection(selection);
    setQuestion("");
    onOpen();
  };
  const rewrite = result.operation
    ? isRewriteOperation(result.operation as NoteAiOperation)
    : false;
  // 词级 diff：rewrite 类操作拿原文本对比还原后的结果；大文档或非 rewrite 返回 null。
  const diffSegments = useMemo(() => {
    if (!result.suggestion || !request || !rewrite) return null;
    return wordDiff(request.content, result.suggestion);
  }, [request, result.suggestion, rewrite]);
  const statusColor =
    result.status === "error" ? "text-red-700" : "text-[#365F78]";
  const replaceLabel = request?.scope === "selection"
    ? "确认并替换所选文字"
    : "确认并替换全文";
  const insertLabel = request?.scope === "selection"
    ? "插入到选区下方"
    : "插入到笔记末尾";
  const discardResult = () => {
    setRequest(null);
    setResultSelection(null);
    setResult({ status: "idle", message: "", suggestion: "" });
  };

  // 生成标题是「直接替换」型操作：结果返回后立即替换标题，撤回由标题栏负责。
  useEffect(() => {
    if (
      request?.operation === "generateTitle" &&
      result.status === "success" &&
      result.suggestion
    ) {
      onReplaceTitle(result.suggestion);
    }
  }, [request?.operation, result.status, result.suggestion, onReplaceTitle]);

  useEffect(() => {
    if (!result.suggestion) return;
    const frame = window.requestAnimationFrame(() => {
      resultRef.current?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [result.suggestion]);

  return (
    <>
      {selection ? (
        <div
          aria-label="所选文字 AI 工具"
          className="fixed z-40 flex max-w-[calc(100vw-16px)] items-center gap-1 rounded-[var(--radius-md)] border bg-[var(--surface-elevated)] p-1 shadow-sm"
          role="toolbar"
          style={{
            left: `clamp(8px, ${selection.rect.left}px, calc(100vw - 210px))`,
            top: Math.max(8, selection.rect.top - 38),
          }}
        >
          <button type="button" onClick={() => selectionOperation("polishSelection")} className="inline-flex h-8 shrink-0 items-center gap-1 rounded px-2 text-xs hover:bg-[var(--surface-hover)]"><Sparkles className="size-3" aria-hidden="true" />AI</button>
          <button
            type="button"
            onClick={() => selectionOperation("polishSelection")}
            className="h-8 shrink-0 rounded px-2 text-xs hover:bg-[var(--surface-hover)]"
          >
            润色
          </button>
          <button
            type="button"
            onClick={() => selectionOperation("shortenSelection")}
            className="h-8 shrink-0 rounded px-2 text-xs hover:bg-[var(--surface-hover)]"
          >
            精简
          </button>
          <button
            type="button"
            aria-expanded={moreSelectionText === selection.text}
            onClick={() =>
              setMoreSelectionText((value) =>
                value === selection.text ? null : selection.text,
              )
            }
            className="h-8 shrink-0 rounded px-2 text-xs hover:bg-[var(--surface-hover)]"
          >
            更多
          </button>
          {moreSelectionText === selection.text ? (
            <div className="absolute right-0 top-8 z-50 grid w-28 rounded-md border bg-white p-1 shadow-sm">
              {[
                ["explainSelection", "解释"],
                ["clarifySelection", "更清晰"],
                ["formalSelection", "更正式"],
                ["naturalSelection", "更自然"],
                ["actionsSelection", "提取行动"],
                ["listSelection", "转换列表"],
              ].map(([operation, label]) => (
                <button
                  type="button"
                  key={operation}
                  onClick={() => {
                    selectionOperation(operation as NoteAiOperation);
                    setMoreSelectionText(null);
                  }}
                  className="rounded px-2 py-1.5 text-left text-xs hover:bg-[var(--surface-hover)]"
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  startCustomSelection();
                  setMoreSelectionText(null);
                }}
                className="rounded px-2 py-1.5 text-left text-xs hover:bg-[var(--surface-hover)]"
              >
                自定义…
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <AISidecar
        open={open}
        onClose={onClose}
        context="当前笔记"
        footer={
          <div className="space-y-3">
            {result.suggestion && request?.operation !== "generateTitle" ? (
              <div aria-label="AI 结果确认操作" className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-[var(--text-primary)]">AI 结果待确认</p>
                  <span className="text-[10px] text-[var(--text-tertiary)]">尚未写入笔记</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {rewrite ? (
                    <button
                      onClick={() => apply("replace")}
                      className="min-h-10 rounded-md bg-[#365F78] px-3 py-2 text-xs font-medium text-white"
                    >
                      {replaceLabel}
                    </button>
                  ) : null}
                  <button
                    onClick={() => apply("insert")}
                    className={`min-h-10 rounded-md px-3 py-2 text-xs font-medium ${rewrite ? "border bg-white text-[var(--text-primary)]" : "bg-[#365F78] text-white sm:col-span-2"}`}
                  >
                    确认并{insertLabel}
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <button
                    onClick={() => void navigator.clipboard?.writeText(result.suggestion)}
                    className="inline-flex min-h-8 items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    <Copy className="size-3" aria-hidden="true" />
                    复制
                  </button>
                  <button
                    onClick={() => request && run(request, resultSelection)}
                    className="min-h-8 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    重新生成
                  </button>
                  <button
                    onClick={discardResult}
                    className="min-h-8 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  >
                    放弃
                  </button>
                </div>
              </div>
            ) : null}
            {result.suggestion && request?.operation === "generateTitle" ? (
              <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
                <p className="text-xs font-medium text-emerald-800">
                  已替换标题为「{result.suggestion}」
                </p>
                <p className="text-xs text-emerald-700">
                  不满意可点笔记标题栏旁的「撤回标题」按钮恢复原标题。
                </p>
                <button
                  onClick={() => request && run(request, resultSelection)}
                  className="min-h-8 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  重新生成
                </button>
              </div>
            ) : null}
            <div className="flex items-center justify-between border-t pt-2">
              <span className="text-[10px] text-[var(--text-tertiary)]">模型</span>
              <select aria-label="AI 模型" value={model} onChange={(event) => setModel(event.target.value as DeepSeekModelId)} className="h-7 bg-transparent text-xs text-[var(--text-tertiary)]"><option value="deepseek-v4-flash">DeepSeek V4 Flash</option><option value="deepseek-v4-pro">DeepSeek V4 Pro</option></select>
            </div>
          </div>
        }
      >
          {restoring ? (
            <p className="mb-4 text-xs text-[var(--text-tertiary)]">
              正在恢复这篇笔记的 AI 讨论…
            </p>
          ) : null}
          {thread.length ? (
            <div className="mb-5 space-y-4 border-b border-[var(--border-subtle)] pb-5">
              {thread.map((item) =>
                item.role === "user" ? (
                  <div key={item.id} className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-[var(--radius-md)] bg-[var(--accent-soft)] px-3 py-2 text-sm leading-6 text-[var(--text-primary)]">
                      {item.content}
                    </div>
                  </div>
                ) : item.current && result.suggestion ? null : (
                  <div key={item.id} className="space-y-1">
                    <div className="text-sm leading-6 text-[var(--text-primary)]">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeSanitize]}
                      >
                        {item.content}
                      </ReactMarkdown>
                    </div>
                    {item.applied ? (
                      <p className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
                        <Check className="size-3" aria-hidden="true" />
                        已写入笔记
                      </p>
                    ) : null}
                  </div>
                ),
              )}
            </div>
          ) : null}
          {pending && request ? (
            <p
              role="status"
              aria-live="polite"
              className="mb-3 text-xs text-[var(--text-tertiary)]"
            >
              正在{noteAiOperationLabel(request.operation)}（{request.content.length} 字）
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            {shortcuts.map(([operation, label, icon]) => (
              <button
                key={operation}
                disabled={pending || !bodyMarkdown.trim()}
                onClick={() => runNote(operation)}
                className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--surface-hover)] px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-selected)] disabled:opacity-50"
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
          <div className="mt-5 border-t pt-4">
            <label className="sr-only" htmlFor="note-ai-question">
              {customSelection ? "处理所选文字" : "继续讨论这篇笔记"}
            </label>
            <textarea
              id="note-ai-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={
                customSelection
                  ? "说明如何处理所选文字…"
                  : "继续讨论这篇笔记，或结合你的 Personal OS 分析…"
              }
              className="min-h-24 w-full resize-none rounded-md border bg-white px-3 py-2 text-sm"
            />
            <button
              disabled={
                pending ||
                !question.trim() ||
                (!customSelection && !bodyMarkdown.trim())
              }
              onClick={() =>
                customSelection
                  ? run({
                      operation: "customSelection",
                      scope: "selection",
                      content: customSelection.text,
                      instruction: question,
                      contextBefore: customSelection.contextBefore,
                      contextAfter: customSelection.contextAfter,
                    }, customSelection)
                  : runNote("askNote")
              }
              className="mt-2 rounded-md bg-[#365F78] px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {pending ? "正在生成…" : "发送"}
            </button>
            {customSelection ? (
              <button
                onClick={() => setCustomSelection(null)}
                className="ml-3 text-xs text-zinc-500 hover:text-zinc-800"
              >
                改为询问全文
              </button>
            ) : null}
            {!customSelection ? (
              <label className="ml-4 inline-flex items-center gap-2 text-xs text-zinc-500">
                <input
                  type="checkbox"
                  checked={usePersonalContext}
                  onChange={(event) =>
                    setUsePersonalContext(event.target.checked)
                  }
                />
                使用个人上下文
              </label>
            ) : null}
          </div>
          {pending && request ? (
            <div aria-hidden="true" className="mt-4 border-t pt-4">
              <div className="h-3 w-28 animate-pulse rounded bg-[var(--surface-hover)]" />
              <div className="mt-3 space-y-2">
                <div className="h-3 w-full animate-pulse rounded bg-[var(--surface-hover)]" />
                <div className="h-3 w-11/12 animate-pulse rounded bg-[var(--surface-hover)]" />
                <div className="h-3 w-4/5 animate-pulse rounded bg-[var(--surface-hover)]" />
              </div>
            </div>
          ) : null}
          {result.status !== "idle" ? (
            <p role="status" className={`mt-4 text-sm ${statusColor}`}>
              {result.message}
            </p>
          ) : null}
          {result.suggestion ? (
            <div ref={resultRef} className="mt-4 border-t pt-4">
              <div className="flex items-center justify-between gap-3 pb-3">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">AI 结果预览</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">使用底部固定确认区决定是否写入笔记。</p>
                </div>
                <div className="flex items-center gap-2">
                  {diffSegments ? (
                    <div className="flex overflow-hidden rounded-md border border-[var(--surface-hover)] text-[10px]">
                      <button
                        type="button"
                        onClick={() => setShowDiff(true)}
                        className={`px-2 py-1 ${showDiff ? "bg-[#365F78] text-white" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"}`}
                      >
                        对比
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDiff(false)}
                        className={`px-2 py-1 ${!showDiff ? "bg-[#365F78] text-white" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"}`}
                      >
                        纯结果
                      </button>
                    </div>
                  ) : null}
                  <span className="rounded bg-[var(--surface-hover)] px-2 py-1 text-[10px] text-[var(--text-tertiary)]">{request?.scope === "selection" ? `所选文字 · ${request.content.length} 字` : "当前笔记"}</span>
                </div>
              </div>
              {diffSegments && showDiff ? (
                <div className="whitespace-pre-wrap rounded-md border bg-white p-3 font-sans text-sm leading-6 text-zinc-700">
                  {diffSegments.map((segment, index) =>
                    segment.type === "equal" ? (
                      <span key={index}>{segment.text}</span>
                    ) : segment.type === "insert" ? (
                      <span key={index} className="rounded bg-green-100 px-0.5 text-green-900">
                        {segment.text}
                      </span>
                    ) : (
                      <span key={index} className="rounded bg-red-50 px-0.5 text-red-500 line-through">
                        {segment.text}
                      </span>
                    ),
                  )}
                </div>
              ) : (
                <pre className="whitespace-pre-wrap rounded-md border bg-white p-3 font-sans text-sm leading-6 text-zinc-700">{result.suggestion}</pre>
              )}
              {result.warning ? (
                <p role="status" className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {result.warning}
                </p>
              ) : null}
              {result.contextSources?.length ? (
                <details className="mt-4 border-t pt-3 text-xs">
                  <summary className="cursor-pointer text-zinc-500">
                    本次提供给 AI 的上下文 · {result.contextSources.length} 项
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {result.contextSources.map((source) => (
                      <li
                        key={source.id}
                        className="flex items-start justify-between gap-3"
                      >
                        <div>
                          <p className="font-medium text-zinc-700">
                            {source.domain} · {source.title}
                          </p>
                          <p className="mt-0.5 text-zinc-500">
                            {source.reasons.join("；")}
                          </p>
                        </div>
                        {source.href ? (
                          <a
                            className="text-[#365F78] hover:underline"
                            href={source.href}
                          >
                            打开
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ) : null}
      </AISidecar>
    </>
  );
}
