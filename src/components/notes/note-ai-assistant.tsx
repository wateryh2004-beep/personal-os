"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Check,
  CheckSquare,
  ChevronDown,
  Copy,
  FileText,
  Languages,
  Lightbulb,
  ListOrdered,
  ListTree,
  Quote,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { AISidecar } from "@/components/ai/ai-sidecar";
import {
  type NoteAiState,
} from "@/features/notes/ai-actions";
import {
  isDiscussionOperation,
  isRewriteOperation,
  noteAiOperationLabel,
  noteAiUserMessage,
  type NoteAiOperation,
} from "@/features/notes/ai-prompts";
import { adoptionHunks, adoptHunks } from "@/features/notes/partial-adoption";
import { wordDiff } from "@/features/notes/diff-preview";
import { assertContinuousFixtureTransport } from "@/features/testing/continuous-fixture-gate";
import type { AiActionFixtureTransport } from "@/features/assistant/ai-action-fixtures";
import { captureNoteAiBaseline, applyNoteAiSuggestion } from "@/features/assistant/note-ai-live";
import { startAiAction, getAiActionRecords, getAiActionServerRecords, subscribeAiActionRecords, toggleNoteAiHunk, consumeAiAction, type AiActionRecord } from "@/features/assistant/ai-action-runtime";
import { captureNavigationIntent } from "@/features/workflow-continuity/navigation-intent";
import { registerAiResumeConsumer, notifyAiResumeReady } from "@/features/assistant/ai-continuity";
import { captureWorkspaceScope, registerWorkspaceScopeCleanup } from "@/lib/workspace-resource-cache";
import { useWorkflowDraft } from "@/features/workflow-continuity/drafts";
import { z } from "zod";
import type { DeepSeekModelId } from "@/lib/ai/deepseek";
import { WORKSPACE_SESSION_TTL_MS } from "@/lib/workspace-session";

const questionEditLeases = new WeakMap<() => boolean, { edited: boolean; expiresAt: number }>();

export type NoteSelection = {
  text: string;
  from?: number;
  to?: number;
  sourceMarkdown?: string;
  isCurrent?: () => boolean;
  contextBefore?: string;
  contextAfter?: string;
  rect: { left: number; top: number };
  replace: (text: string) => boolean;
  insertBelow: (text: string) => boolean;
};
type Request = {
  operation: NoteAiOperation;
  baselineTitle?: string;
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
  ["extractKeyInsights", "提炼洞见", <Quote key="insights" />],
  ["translateNote", "翻译全文", <Languages key="translate" />],
  ["outlineNote", "生成大纲", <ListOrdered key="outline" />],
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

/** 线程 → 模型上下文：优先保留最近几轮及回答末尾，供长回答续写。 */
function threadToHistory(thread: ThreadItem[]) {
  return thread.slice(-16).map((item) => ({
    role: item.role,
    content: item.content.slice(-16_000),
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
  bodyMarkdown,
  defaultModel,
  selection,
  onClearSelection,
  insertionRole = "main",
  fixtureTransport,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  noteId: string;
  insertionRole?: "main" | "reference";
  fixtureTransport?: AiActionFixtureTransport;
  title: string;
  bodyMarkdown: string;
  defaultModel: DeepSeekModelId;
  selection: NoteSelection | null;
  onClearSelection: () => void;
  onReplaceNote: (text: string, expected?: string) => boolean | void;
  onInsertNote: (text: string, expected?: string) => boolean | void;
  onReplaceTitle: (title: string, expectedTitle?: string) => boolean | void;
}) {
  assertContinuousFixtureTransport(fixtureTransport);
  const [model, setModel] = useState<DeepSeekModelId>(defaultModel);
  const { value: question, setValue: setDraftQuestion, recoveryUnavailable, isCurrent: draftIsCurrent, scopeRevoked } = useWorkflowDraft({ kind: "note", id: `${noteId}:ai-question`, label: "笔记 AI 输入", resumeAiTarget: { kind: "note-input", noteId, role: insertionRole }, resumeHref: `/notes/${noteId}`, initialValue: "", ttlMs: 900_000, parse: value => { const result = z.string().max(10_000).safeParse(value); return result.success ? result.data : null; } });
  const [result, setResult] = useState<NoteAiState>({
    status: "idle",
    message: "",
    suggestion: "",
  });
  const [request, setRequest] = useState<Request | null>(null);
  const [customSelection, setCustomSelection] = useState<NoteSelection | null>(
    null,
  );
  const [moreSelectionText, setMoreSelectionText] = useState<string | null>(null);
  const [chosenHunks, setChosenHunks] = useState<Set<number>>(new Set());
  const [showDiff, setShowDiff] = useState(true);
  const [usePersonalContext, setUsePersonalContext] = useState(true);
  const operationRecords = useSyncExternalStore(subscribeAiActionRecords, getAiActionRecords, getAiActionServerRecords);
  const [selectedOperationId, setSelectedOperationId] = useState<string | null>(null);
  const matchingOperations = useMemo(() => operationRecords.filter(item => item.kind === "note-suggestion" && item.input.kind === "note-suggestion" && item.input.baseline.noteId === noteId && item.input.baseline.role === insertionRole && item.current()) as AiActionRecord<"note-suggestion">[], [operationRecords, noteId, insertionRole]);
  const activeOperation = matchingOperations.find(item => item.id === selectedOperationId && !item.consumed) ?? [...matchingOperations].reverse().find(item => !item.consumed);
  const currentOperationScope = activeOperation?.current;
  const setQuestion: typeof setDraftQuestion = useCallback(next => {
    if (!draftIsCurrent()) return;
    if (currentOperationScope) questionEditLeases.set(currentOperationScope, { edited: true, expiresAt: questionEditLeases.get(currentOperationScope)?.expiresAt ?? 0 });
    setDraftQuestion(next);
  }, [draftIsCurrent, currentOperationScope, setDraftQuestion]);
  const pending = matchingOperations.some(item => item.status === "running");
  const resultSelection = activeOperation?.input.baseline.selection ?? null;
  const requestSerial = useRef(0);
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const resumeState = useRef({ matchingOperations, onOpen, open });
  useLayoutEffect(() => { resumeState.current = { matchingOperations, onOpen, open }; }, [matchingOperations, onOpen, open]);
  type ExactHistory = { runId: string; serial: number; controller: AbortController; current: () => boolean; read: Promise<boolean> };
  const explicitHistory = useRef<ExactHistory | null>(null);
  const recoveredQuestionId = useRef<string | null>(null);

  useLayoutEffect(() => { notifyAiResumeReady(target => (target.kind === "note-history" || target.kind === "note-suggestion" || target.kind === "note-input") && target.noteId === noteId && (target.kind !== "note-input" || target.role === insertionRole)); }, [open, runId, thread, activeOperation?.id, noteId, insertionRole]);

  useEffect(() => {
    if (!activeOperation || activeOperation.consumed) return;
    const input = activeOperation.input;
    const questionLease = questionEditLeases.get(activeOperation.current);
    if (draftIsCurrent() && (questionLease?.expiresAt ?? activeOperation.updatedAt + WORKSPACE_SESSION_TTL_MS) > Date.now() && activeOperation.status !== "running" && activeOperation.status !== "succeeded" && input.operation === "askNote" && input.instruction && recoveredQuestionId.current !== activeOperation.id && !questionLease?.edited) {
      recoveredQuestionId.current = activeOperation.id;
      const instruction = input.instruction;
      setDraftQuestion(current => current || instruction);
    }
    setRequest({ operation: input.operation, baselineTitle: input.baseline.title, scope: input.scope, instruction: input.instruction, content: input.content, contextBefore: input.contextBefore, contextAfter: input.contextAfter });
    setChosenHunks(new Set(activeOperation.selectedHunks));
    if (activeOperation.result) {
      setResult(activeOperation.result);
      if (activeOperation.result.runId) setRunId(activeOperation.result.runId);
      const suggestion = activeOperation.result.suggestion;
      if (suggestion) setThread(before => before.some(item => item.current && item.content === suggestion) ? before : [...before, { id: `note-ai-assistant-${input.id}`, role: "assistant", content: suggestion, current: true }]);
    } else if (activeOperation.status !== "running") setResult({ status: "error", message: activeOperation.error || "请求结果待核对，原文与输入保留。", suggestion: "" });
  }, [activeOperation, draftIsCurrent, setDraftQuestion]);
  useEffect(() => {
    let mounted = true;
    const unregister = registerAiResumeConsumer(target => (target.kind === "note-suggestion" && target.noteId === noteId && resumeState.current.matchingOperations.some(item => item.id === target.proposalId && !item.consumed)) || (target.kind === "note-input" && target.noteId === noteId && target.role === insertionRole) || (target.kind === "note-history" && target.noteId === noteId && insertionRole === "main"), async (target, context) => {
      const navigation = captureNavigationIntent(), scope = captureWorkspaceScope();
      const current = () => mounted && draftIsCurrent() && scope() && navigation() && (!context || context.current());
      if (!current()) return false;
      if (target.kind === "note-history") {
        let exact = explicitHistory.current;
        if (!exact || exact.runId !== target.runId || exact.serial !== requestSerial.current || !exact.current()) {
          exact?.controller.abort();
          const serial = ++requestSerial.current, controller = new AbortController();
          const value: ExactHistory = { runId: target.runId, serial, controller, current, read: Promise.resolve(false) };
          // Establish the explicit lease before onOpen can start its automatic latest read.
          explicitHistory.current = value;
          value.read = (async () => {
            try {
              const response = await fetch(`/api/assistant/runs/${target.runId}?surface=notes&entityType=note&entityId=${noteId}`, { cache: "no-store", signal: controller.signal });
              if (!response.ok || !current() || explicitHistory.current !== value || requestSerial.current !== serial) return false;
              const payload = await response.json() as { messages?: Array<{id:string;role:string;parts:Array<{type:string;text?:string}>}> };
              if (!current() || explicitHistory.current !== value || requestSerial.current !== serial) return false;
              setRunId(target.runId);
              setThread((payload.messages ?? []).map(message => ({ id: message.id, role: message.role === "user" ? "user" : "assistant", content: message.parts.filter(part => part.type === "text").map(part => part.text || "").join("\n") })));
              return true;
            } catch { return false; }
          })();
          exact = value;
          resumeState.current.onOpen();
        }
        if (!await exact.read || !current()) return false;
      } else {
        resumeState.current.onOpen();
        if (target.kind === "note-suggestion") setSelectedOperationId(target.proposalId);
      }
      const focusTarget = () => {
        if (!current() || !resumeState.current.open) return false;
        if (target.kind === "note-suggestion" && resultRef.current?.dataset.proposalId !== target.proposalId) return false;
        if (target.kind === "note-history" && historyRef.current?.dataset.historyRunId !== target.runId) return false;
        const focus = target.kind === "note-input" ? document.querySelector<HTMLTextAreaElement>(`[data-note-ai-input="${noteId}:${insertionRole}"]`) : target.kind === "note-history" ? historyRef.current : resultRef.current;
        if (!focus?.isConnected) return false;
        focus.focus(); return document.activeElement === focus;
      };
      if (focusTarget()) return true;
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      return focusTarget();
    });
    return () => { mounted = false; explicitHistory.current?.controller.abort(); explicitHistory.current = null; unregister(); };
  }, [noteId, insertionRole, draftIsCurrent]);
  useEffect(() => registerWorkspaceScopeCleanup(() => { requestSerial.current += 1; explicitHistory.current?.controller.abort(); explicitHistory.current = null; setResult({ status: "idle", message: "", suggestion: "" }); setRequest(null); setThread([]); setRunId(null); }), []);
  // 打开面板时从云端恢复这篇笔记的 AI 讨论线程。父组件用 key={note.id} 挂载，
  // 切换笔记会整体重挂载，不需要手动清空旧线程。
  useEffect(() => {
    if (!open || !draftIsCurrent()) return;
    const current = captureWorkspaceScope();
    const controller = new AbortController();
    const serial = requestSerial.current;
    const timer = window.setTimeout(async () => {
      if (!draftIsCurrent() || !current() || controller.signal.aborted || requestSerial.current !== serial) return;
      if (!explicitHistory.current && requestSerial.current === serial) setRestoring(true);
      try {
          const response = await fetch(`/api/assistant/runs?noteId=${encodeURIComponent(noteId)}`, {
            cache: "no-store", signal: controller.signal,
          });
          if (response.ok && current() && !controller.signal.aborted && requestSerial.current === serial && !explicitHistory.current) {
            const payload = (await response.json()) as {
              run?: { id?: string } | null;
              messages?: Array<{
                id: string;
                role: string;
                parts: Array<{ type: string; text?: string }>;
              }>;
            };
            if (!current() || controller.signal.aborted || requestSerial.current !== serial || explicitHistory.current) return;
            const messages = payload.messages;
            if (payload.run?.id && Array.isArray(messages) && messages.length) {
              setRunId(payload.run.id);
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
            }
          }
        } catch { /* 恢复失败不阻塞面板，下次打开仍会从数据库重试。 */ }
      if (current() && !controller.signal.aborted && requestSerial.current === serial && !explicitHistory.current) setRestoring(false);
    }, 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [open, noteId, draftIsCurrent]);
  const run = (next: Request, targetSelection: Pick<NoteSelection, "text" | "from" | "to"> | null = null, continuationAfter?: string) => {
    if (!draftIsCurrent()) { setResult(before => ({ ...before, status: "error", message: "工作区已变化，请重新打开此 AI 入口。" })); return false; }
    if (pending) return false;
    const selected = next.scope === "selection" && targetSelection && targetSelection.from !== undefined && targetSelection.to !== undefined ? { from: targetSelection.from, to: targetSelection.to, text: targetSelection.text } : null;
    const baseline = captureNoteAiBaseline(noteId, insertionRole, selected, isDiscussionOperation(next.operation));
    if (!baseline || !next.content.trim() || (next.scope === "selection" && !selected) || (next.scope === "note" && next.content !== baseline.sourceMarkdown)) {
      setResult(before => ({ ...before, status: "error", message: "原文或编辑状态已改变。建议仍保留，请返回编辑并重新核对选区。" })); return false;
    }
    explicitHistory.current?.controller.abort(); explicitHistory.current = null;
    requestSerial.current += 1;
    const userText = noteAiUserMessage(next.operation, next.instruction, next.scope);
    try {
      setSelectedOperationId(null);
      const id = crypto.randomUUID();
      const record = startAiAction({ kind: "note-suggestion", id, baseline, operation: next.operation, scope: next.scope, instruction: next.instruction, content: next.content, model: next.operation === "generateTitle" ? "deepseek-v4-pro" : model, usePersonalContext, runId, history: threadToHistory(thread), contextBefore: next.contextBefore, contextAfter: next.contextAfter, continuationAfter }, fixtureTransport);
      if (record.id !== id) return false;
      questionEditLeases.set(record.current, { edited: false, expiresAt: Date.now() + WORKSPACE_SESSION_TTL_MS });
      setThread(before => [...before, { id: `note-ai-user-${crypto.randomUUID()}`, role: "user", content: userText }]);
      setResult({ status: "idle", message: "", suggestion: "" });
      if (next.operation === "askNote" && next.instruction) {
        const submitted = next.instruction;
        setDraftQuestion(current => current === submitted ? "" : current);
        void record.completion.then(() => {
          const latest = getAiActionRecords().find(item => item.id === id);
          if (record.current() && latest && latest.status !== "succeeded" && !questionEditLeases.get(record.current)?.edited) setDraftQuestion(current => current || submitted);
        });
      }
      return true;
    } catch (error) { setResult(before => ({ ...before, status: "error", message: error instanceof Error ? error.message : "暂时无法开始，输入仍保留。" })); return false; }
  };
  const runNote = (operation: NoteAiOperation) => {
    run({
      operation,
      scope: "note",
      content: bodyMarkdown,
      instruction: operation === "askNote" ? question : undefined,
    });
  };
  const apply = (mode: "replace" | "insert", partial?: string) => {
    if (!result.suggestion || !request) return;
    const suggestion = partial ?? result.suggestion;
    if (!activeOperation?.current()) return;
    const text = request.scope === "selection" ? suggestion : partial === undefined ? `${noteAiAttribution(request.operation)}${suggestion}` : `${suggestion}\n\n> 本次选择的段落修改由 AI 协助生成，经手动确认采纳。`;
    const applied = applyNoteAiSuggestion(activeOperation.input.baseline, { mode, text });
    if (applied.status !== "applied") { setResult(before => ({ ...before, status: "error", message: "原文、版本或编辑实例已改变，未覆盖。建议与原基线保留，请重新核对。" })); return; }
    consumeAiAction(activeOperation.id);
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
    onOpen();
  };
  const rewrite = result.operation
    ? isRewriteOperation(result.operation as NoteAiOperation)
    : false;
  const discussion = request ? isDiscussionOperation(request.operation) : false;
  // 词级 diff：rewrite 类操作拿原文本对比还原后的结果；大文档或非 rewrite 返回 null。
  const diffSegments = useMemo(() => {
    if (!result.suggestion || !request || !rewrite) return null;
    return wordDiff(request.content, result.suggestion);
  }, [request, result.suggestion, rewrite]);
  const hunks = useMemo(() => rewrite && request && result.suggestion ? adoptionHunks(request.content, result.suggestion) : null, [request, result.suggestion, rewrite]);
  const statusColor =
    result.status === "error" ? "text-red-700" : "text-[var(--accent)]";
  const replaceLabel = request?.scope === "selection"
    ? "确认并替换所选文字"
    : "确认并替换全文";
  const insertLabel = request?.scope === "selection"
    ? "插入到选区下方"
    : "插入到笔记末尾";
  const discardResult = () => {
    if (activeOperation) questionEditLeases.set(activeOperation.current, { edited: true, expiresAt: questionEditLeases.get(activeOperation.current)?.expiresAt ?? 0 });
    setRequest(null);
    setResult({ status: "idle", message: "", suggestion: "" });
    if (activeOperation) consumeAiAction(activeOperation.id);
  };
  const continueResult = () => {
    if (!request || !result.suggestion) return;
    run({ ...request, instruction: `${request.instruction ? `${request.instruction}\n\n` : ""}请从上一段被截断的位置继续。` }, resultSelection, result.suggestion.slice(-32_000));
  };

  useEffect(() => {
    if (!result.suggestion) return;
    const frame = window.requestAnimationFrame(() => {
      resultRef.current?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [result.suggestion]);

  return (
    <>
      {recoveryUnavailable ? <p role="status" className="text-xs text-[var(--danger)]">{scopeRevoked ? "工作区已变化，请重新打开此 AI 入口。" : "当前输入仍可使用，本标签页恢复暂不可用。"}</p> : null}
      {selection ? (
        <div
          aria-label="所选文字 AI 工具"
          className="fixed z-40 flex max-w-[calc(100vw-16px)] items-center gap-0.5 rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--border)_75%,var(--accent)_25%)] bg-[var(--surface-elevated)] p-1 shadow-[0_10px_24px_rgba(24,24,27,0.12),0_1px_3px_rgba(24,24,27,0.06)]"
          role="toolbar"
          style={{
            left: `clamp(8px, ${selection.rect.left}px, calc(100vw - 210px))`,
            top: Math.max(8, selection.rect.top - 42),
          }}
        >
          <button
            type="button"
            onClick={() => selectionOperation("polishSelection")}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-[var(--radius-md)] bg-[var(--accent-soft)] px-2.5 text-xs font-medium text-[var(--accent)] transition-colors hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]"
          >
            <Sparkles className="size-3.5" aria-hidden="true" />
            润色
          </button>
          <button
            type="button"
            onClick={() => selectionOperation("shortenSelection")}
            className="h-8 shrink-0 rounded-[var(--radius-md)] px-2.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]"
          >
            精简
          </button>
          <button
            type="button"
            aria-expanded={moreSelectionText === selection.text}
            aria-haspopup="menu"
            onClick={() =>
              setMoreSelectionText((value) =>
                value === selection.text ? null : selection.text,
              )
            }
            className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-[var(--radius-md)] px-2 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]"
          >
            更多
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </button>
          {moreSelectionText === selection.text ? (
            <div role="menu" className="absolute right-0 top-10 z-50 grid w-32 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-1 shadow-[0_12px_28px_rgba(24,24,27,0.12)]">
              {[
                ["discussSelection", "讨论"],
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
                  role="menuitem"
                  onClick={() => {
                    selectionOperation(operation as NoteAiOperation);
                    setMoreSelectionText(null);
                  }}
                  className="rounded-[var(--radius-md)] px-2.5 py-2 text-left text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus-visible:bg-[var(--accent-soft)] focus-visible:outline-none"
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  startCustomSelection();
                  setMoreSelectionText(null);
                }}
                className="rounded-[var(--radius-md)] px-2.5 py-2 text-left text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus-visible:bg-[var(--accent-soft)] focus-visible:outline-none"
              >
                自定义…
              </button>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => {
              onClearSelection();
              setMoreSelectionText(null);
            }}
            className="ml-0.5 inline-flex h-8 shrink-0 items-center rounded-[var(--radius-md)] px-2 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]"
            aria-label="关闭所选文字 AI 工具"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <AISidecar
        open={open}
        onClose={onClose}
        context="当前笔记"
        footer={
          <div className="space-y-3">
            {result.suggestion && request?.operation === "generateTitle" ? <div className="space-y-2"><p className="text-xs">标题建议尚未写入</p><button type="button" className="min-h-11 rounded-md bg-[var(--accent)] px-3 text-xs text-white" onClick={() => {
              if (!activeOperation?.current() || applyNoteAiSuggestion(activeOperation.input.baseline, { mode: "title", text: result.suggestion }).status !== "applied") { setResult(current => ({ ...current, status: "error", message: "标题已改变，建议保留，请重新核对。" })); return; }
              consumeAiAction(activeOperation.id);
              setRequest(null); setResult({ status: "success", message: "标题建议已采纳，等待自动保存。", suggestion: "" });
            }}>确认采纳标题</button><button type="button" onClick={discardResult} className="min-h-11 px-3 text-xs">放弃建议</button></div> : null}
            {result.suggestion && request?.operation !== "generateTitle" && !discussion ? (
              <div aria-label="AI 结果确认操作" className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-[var(--text-primary)]">AI 结果待确认</p>
                  <span className="text-[12px] text-[var(--text-tertiary)]">尚未写入笔记</span>
                </div>
                {hunks?.length ? <fieldset className="max-h-56 space-y-2 overflow-auto rounded-[var(--radius-md)] border p-2">
                  <legend className="px-1 text-xs">按完整段落采纳</legend>
                  {hunks.map((hunk) => <label key={hunk.id} className="flex min-h-11 items-start gap-2 text-xs">
                    <input type="checkbox" checked={chosenHunks.has(hunk.id)} onChange={(event) => { if (activeOperation) toggleNoteAiHunk(activeOperation.id, hunk.id, event.target.checked); }} />
                    <span className="min-w-0 whitespace-pre-wrap break-words">{hunk.after || `删除：${hunk.before}`}</span>
                  </label>)}
                  <button type="button" disabled={!chosenHunks.size} onClick={() => request && apply("replace", adoptHunks(request.content, hunks, chosenHunks))} className="min-h-11 rounded-md border px-3 disabled:opacity-40">确认采纳 {chosenHunks.size} 处</button>
                </fieldset> : null}
                <div className="grid gap-2 sm:grid-cols-2">
                  {rewrite ? (
                    <button
                      onClick={() => apply("replace")}
                      className="min-h-10 rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-2 text-xs font-medium text-white shadow-sm transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                    >
                      {replaceLabel}
                    </button>
                  ) : null}
                  <button
                    onClick={() => apply("insert")}
                    className={`min-h-10 rounded-md px-3 py-2 text-xs font-medium ${rewrite ? "border bg-[var(--surface-canvas)] text-[var(--text-primary)]" : "bg-[var(--accent)] text-white sm:col-span-2"}`}
                  >
                    确认并{insertLabel}
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <button
                    onClick={() => void navigator.clipboard?.writeText(result.suggestion)}
                    className="pressable inline-flex min-h-8 items-center gap-1 rounded-[7px] px-1 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                  >
                    <Copy className="size-3" aria-hidden="true" />
                    复制
                  </button>
                  <button
                    onClick={() => result.truncated ? continueResult() : request && run(request, resultSelection)}
                    className="pressable min-h-8 rounded-[7px] px-1 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                  >
                    {result.truncated ? "从截断处继续" : "重新生成"}
                  </button>
                  <button
                    onClick={discardResult}
                    className="pressable min-h-8 rounded-[7px] px-1 text-[12px] text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
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
                  className="pressable min-h-8 rounded-[7px] px-1 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                >
                  重新生成
                </button>
              </div>
            ) : null}
            <div className="flex items-center justify-between border-t border-[var(--separator)] pt-2">
              <span className="text-[12px] text-[var(--text-tertiary)]">模型</span>
              <select aria-label="AI 模型" value={model} onChange={(event) => setModel(event.target.value as DeepSeekModelId)} className="h-7 rounded-[7px] bg-transparent px-1.5 text-[12px] text-[var(--text-tertiary)] outline-none hover:bg-[var(--surface-hover)]"><option value="deepseek-v4-flash">DeepSeek V4 Flash</option><option value="deepseek-v4-pro">DeepSeek V4 Pro</option></select>
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
            <div ref={historyRef} data-history-run-id={runId ?? undefined} tabIndex={-1} className="mb-4.5 space-y-3.5 border-b border-[var(--separator)] pb-4.5">
              {thread.map((item) =>
                item.role === "user" ? (
                  <div key={item.id} className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-[10px] bg-[var(--accent-soft)] px-3 py-2 text-[12.5px] leading-5.5 text-[var(--text-primary)]">
                      {item.content}
                    </div>
                  </div>
                ) : item.current && result.suggestion ? null : (
                  <div key={item.id} className="space-y-1">
                    <div className="text-[12.5px] leading-5.5 text-[var(--text-primary)]">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeSanitize]}
                      >
                        {item.content}
                      </ReactMarkdown>
                    </div>
                    {item.applied ? (
                      <p className="inline-flex items-center gap-1 text-[12px] text-emerald-700">
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
              className="mb-3 text-[12px] text-[var(--text-tertiary)]"
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
                className="pressable flex min-h-10 items-center gap-2 rounded-[10px] bg-[var(--surface-control)] px-3 py-2 text-left text-[12.5px] text-[var(--text-secondary)] hover:bg-[var(--surface-control-hover)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-[color-mix(in_srgb,var(--accent)_22%,transparent)] disabled:opacity-50"
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
          <div className="mt-4.5 border-t border-[var(--separator)] pt-3.5">
            <label className="sr-only" htmlFor="note-ai-question">
              {customSelection ? "处理所选文字" : "继续讨论这篇笔记"}
            </label>
            <textarea
              id="note-ai-question"
              data-note-ai-input={`${noteId}:${insertionRole}`}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={
                customSelection
                  ? "说明如何处理所选文字…"
                  : "继续讨论这篇笔记，或结合你的 Personal OS 分析…"
              }
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  if (!pending && question.trim() && (customSelection || bodyMarkdown.trim())) {
                    if (customSelection) {
                      run({ operation: "customSelection", scope: "selection", content: customSelection.text, instruction: question, contextBefore: customSelection.contextBefore, contextAfter: customSelection.contextAfter }, customSelection);
                    } else {
                      runNote("askNote");
                    }
                  }
                }
              }}
              className="ui-field min-h-24 w-full resize-none rounded-[10px] border border-transparent bg-[var(--surface-control)] px-3 py-2.5 text-[12.5px] leading-5.5 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]"
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
              className="pressable mt-2 h-9 rounded-[9px] bg-[var(--accent)] px-3.5 text-[12.5px] font-medium text-white hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-50"
            >
              {pending ? "正在生成…" : "发送"}
            </button>
            {customSelection ? (
              <button
                onClick={() => setCustomSelection(null)}
                className="ml-3 text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              >
                改为询问全文
              </button>
            ) : null}
            {!customSelection ? (
              <label className="ml-4 inline-flex items-center gap-2 text-[12px] text-[var(--text-tertiary)]">
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
            <div aria-hidden="true" className="mt-4 border-t border-[var(--separator)] pt-3.5">
              <div className="h-3 w-28 animate-pulse rounded bg-[var(--surface-hover)]" />
              <div className="mt-3 space-y-2">
                <div className="h-3 w-full animate-pulse rounded bg-[var(--surface-hover)]" />
                <div className="h-3 w-11/12 animate-pulse rounded bg-[var(--surface-hover)]" />
                <div className="h-3 w-4/5 animate-pulse rounded bg-[var(--surface-hover)]" />
              </div>
            </div>
          ) : null}
          {result.status !== "idle" ? (
            <p role="status" className={`mt-3.5 text-[12px] ${statusColor}`}>
              {result.message}
            </p>
          ) : null}
          {result.suggestion ? (
            <div ref={resultRef} data-proposal-id={activeOperation?.id} tabIndex={-1} className="mt-4 border-t border-[var(--separator)] pt-3.5">
              <div className="flex items-center justify-between gap-3 pb-2.5">
                <div>
                  <p className="text-[12.5px] font-semibold text-[var(--text-primary)]">{discussion ? "讨论回复" : "AI 结果预览"}</p>
                  <p className="mt-0.5 text-[12px] leading-5 text-[var(--text-secondary)]">{discussion ? "这段回复已保存到本篇笔记的讨论历史，不会写入正文。" : "使用底部固定确认区决定是否写入笔记。"}</p>
                </div>
                <div className="flex items-center gap-2">
                  {diffSegments ? (
                    <div className="flex overflow-hidden rounded-md border border-[var(--surface-hover)] text-[12px]">
                      <button
                        type="button"
                        onClick={() => setShowDiff(true)}
                        className={`px-2 py-1 ${showDiff ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"}`}
                      >
                        对比
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDiff(false)}
                        className={`px-2 py-1 ${!showDiff ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"}`}
                      >
                        纯结果
                      </button>
                    </div>
                  ) : null}
                  <span className="rounded bg-[var(--surface-hover)] px-2 py-1 text-[12px] text-[var(--text-tertiary)]">{request?.scope === "selection" ? `所选文字 · ${request.content.length} 字` : "当前笔记"}</span>
                </div>
              </div>
              {diffSegments && showDiff ? (
                <div className="whitespace-pre-wrap rounded-[9px] border border-[var(--separator)] bg-[var(--surface-canvas)] p-3 font-sans text-[12.5px] leading-5.5 text-[var(--text-primary)]">
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
                <pre className="whitespace-pre-wrap rounded-[9px] border border-[var(--separator)] bg-[var(--surface-canvas)] p-3 font-sans text-[12.5px] leading-5.5 text-[var(--text-primary)]">{result.suggestion}</pre>
              )}
              {result.warning ? (
                <p role="status" className="mt-2.5 rounded-[9px] bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-800">
                  {result.warning}
                </p>
              ) : null}
              {result.truncated ? (
                <button onClick={continueResult} className="pressable mt-2.5 h-8 rounded-[8px] px-2.5 text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]">
                  从截断处继续
                </button>
              ) : null}
              {result.contextSources?.length ? (
                <details className="mt-3.5 border-t border-[var(--separator)] pt-3 text-[12px]">
                  <summary className="pressable inline-flex cursor-pointer list-none rounded-[7px] px-1 py-0.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">
                    本次提供给 AI 的上下文 · {result.contextSources.length} 项
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {result.contextSources.map((source) => (
                      <li
                        key={source.id}
                        className="flex items-start justify-between gap-3"
                      >
                        <div>
                          <p className="font-medium text-[var(--text-primary)]">
                            {source.domain} · {source.title}
                          </p>
                          <p className="mt-0.5 text-[var(--text-secondary)]">
                            {source.reasons.join("；")}
                          </p>
                        </div>
                        {source.href ? (
                          <a
                            className="text-[var(--accent)] hover:underline"
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
