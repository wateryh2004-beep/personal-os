"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  generateNoteAiSuggestion,
  type NoteAiState,
} from "@/features/notes/ai-actions";
import {
  isDiscussionOperation,
  isRewriteOperation,
  noteAiOperationLabel,
  noteAiUserMessage,
  type NoteAiOperation,
} from "@/features/notes/ai-prompts";
import { wordDiff } from "@/features/notes/diff-preview";
import { NoteAiSegmentReview } from "./note-ai-segment-review";
import {
  buildAiSegmentReview,
  chooseAiReviewHunk, chooseAllAiReviewHunks, reviseAiReviewHunk,
  assembleAiSegmentReview, countAiReviewDecisions,
  type AiSegmentReview, type AiReviewDecision,
} from "@/features/notes/editor/ai-segment-review";
import { noteAiSections } from "@/features/notes/editor/ai-section-scope";
import { preservesProtectedNoteStructures } from "@/features/notes/ai-protect";
import type { AiApplicationInput } from "@/features/notes/editor/ai-apply-safety";
import type { DeepSeekModelId } from "@/lib/ai/deepseek";
import type { NoteWritingMode } from "@/features/assistant/writing-modes";

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
  scope: "note" | "selection" | "section";
  sectionRange?: { from: number; to: number };
  instruction?: string;
  content: string;
  contextBefore?: string;
  contextAfter?: string;
  expectedRevision: number;
  expectedTitle: string;
  expectedBody: string;
};
type RunInput = Omit<Request, "expectedRevision" | "expectedTitle" | "expectedBody"> & Partial<Pick<Request, "expectedRevision" | "expectedTitle" | "expectedBody">>;
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

export function NoteAiAssistant({
  open,
  onOpen,
  onClose,
  noteId,
  title,
  bodyMarkdown,
  getRevision,
  onPrepareApply,
  selection,
  onClearSelection,
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
  getRevision: () => number;
  onPrepareApply: (input: AiApplicationInput) => Promise<{ ok: boolean; message: string }>;
  selection: NoteSelection | null;
  onClearSelection: () => void;
  onReplaceNote: (text: string) => void;
  onInsertNote: (text: string) => void;
  onReplaceTitle: (title: string, original: Pick<AiApplicationInput, "expectedRevision" | "expectedTitle" | "expectedBody">) => boolean;
}) {
  const [writingMode, setWritingMode] = useState<NoteWritingMode>("fast");
  const [question, setQuestion] = useState("");
  const sections = useMemo(() => noteAiSections(bodyMarkdown), [bodyMarkdown]);
  const [sectionId, setSectionId] = useState("whole");
  const [reviewPlan, setReviewPlan] = useState<AiSegmentReview | null>(null);
  const [reviewError, setReviewError] = useState("");
  const [refiningHunk, setRefiningHunk] = useState<string | null>(null);
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
  const [applying, setApplying] = useState(false);
  const sequenceRef = useRef(0);
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
      try {
          const response = await fetch(`/api/assistant/runs?noteId=${encodeURIComponent(noteId)}`, {
            cache: "no-store",
          });
          if (response.ok) {
            const payload = (await response.json()) as {
              run?: { id?: string } | null;
              messages?: Array<{
                id: string;
                role: string;
                parts: Array<{ type: string; text?: string }>;
              }>;
            };
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
      setRestoring(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, noteId]);
  const run = (next: RunInput, targetSelection: NoteSelection | null = null, continuationAfter?: string) => {
    const launched: Request = { ...next, expectedRevision: next.expectedRevision ?? getRevision(), expectedTitle: next.expectedTitle ?? title, expectedBody: next.expectedBody ?? bodyMarkdown };
    const sequence = ++sequenceRef.current;
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
    setReviewPlan(null);
    setReviewError("");
    setRequest(launched);
    setResultSelection(next.scope === "selection" ? targetSelection : null);
    setResult({ status: "idle", message: "", suggestion: "" });
    const data = new FormData();
    data.set("note_id", noteId);
    data.set("title", title);
    data.set("content", next.content);
    data.set("operation", next.operation);
    data.set("scope", next.scope);
    data.set("writing_mode", next.operation === "generateTitle" ? "fast" : writingMode);
    data.set("use_personal_context", String(usePersonalContext));
    if (runId) data.set("run_id", runId);
    const history = threadToHistory(thread);
    if (history.length) data.set("history", JSON.stringify(history));
    if (next.instruction) data.set("instruction", next.instruction);
    if (next.contextBefore) data.set("context_before", next.contextBefore);
    if (next.contextAfter) data.set("context_after", next.contextAfter);
    if (continuationAfter) data.set("continuation_after", continuationAfter);
    startTransition(async () => {
      const nextResult = await generateNoteAiSuggestion(data);
      if (sequence !== sequenceRef.current) return;
      if (next.operation === "generateTitle" && nextResult.suggestion &&
          !onReplaceTitle(nextResult.suggestion, launched)) {
        setResult({ status: "error", message: "AI 生成期间标题或正文已被编辑，旧标题建议没有覆盖新内容。请重新生成。", suggestion: "" });
        return;
      }
      if (nextResult.runId) {
        setRunId(nextResult.runId);
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
      if (nextResult.status === "success" && nextResult.suggestion &&
          !nextResult.truncated && !nextResult.unsafeToApply &&
          isRewriteOperation(next.operation) && next.scope !== "selection") {
        setReviewPlan(buildAiSegmentReview(next.content, nextResult.suggestion));
      }
    });
  };
  const runNote = (operation: NoteAiOperation) => {
    // Title generation applies to the note title, not the selected chapter.
    const chapter = operation === "generateTitle" ? undefined : sections.find(section => section.id === sectionId);
    run({
      operation,
      scope: chapter ? "section" : "note",
      sectionRange: chapter ? { from: chapter.from, to: chapter.to } : undefined,
      content: chapter ? bodyMarkdown.slice(chapter.from, chapter.to) : bodyMarkdown,
      contextBefore: chapter ? bodyMarkdown.slice(Math.max(0, chapter.from - 800), chapter.from) : undefined,
      contextAfter: chapter ? bodyMarkdown.slice(chapter.to, chapter.to + 800) : undefined,
      instruction: operation === "askNote" ? question : undefined,
    });
    if (operation === "askNote") setQuestion("");
  };
  const apply = async (mode: "replace" | "insert") => {
    if (applying || pending || refiningHunk || !result.suggestion || !request || !result.runId) return;
    if (result.truncated || result.unsafeToApply) {
      setReviewError("结果不完整或存在信息遗漏风险，禁止覆盖原文；请选择更短的章节重新生成。");
      return;
    }
    let suggestion = result.suggestion;
    if (reviewPlan && rewrite && request.scope !== "selection") {
      if (mode === "insert") {
        setReviewError("逐段审阅只支持应用修改，请使用全文结果的复制功能保存其他版本。");
        return;
      }
      const decisions = countAiReviewDecisions(reviewPlan);
      if (decisions.pending) {
        setReviewError(`仍有 ${decisions.pending} 处未决定，请逐处接受或保留原文，也可以使用“全部接受”。`);
        return;
      }
      try {
        suggestion = assembleAiSegmentReview(reviewPlan);
      } catch {
        setReviewError("逐段合并失败，原文未改变；请重新生成后审阅。");
        return;
      }
    }
    if (rewrite && !preservesProtectedNoteStructures(request.content, suggestion)) {
      setReviewError("所选修改会删除、重复或改变原有的链接、表格、代码、图片或色块，已阻止写入。");
      return;
    }
    let finalBody: string | null = null;
    if (request.scope === "note" && mode === "replace") finalBody = suggestion;
    if (request.scope === "section") {
      const range = request.sectionRange;
      const source = request.expectedBody;
      if (!range || source.slice(range.from, range.to) !== request.content) {
        setReviewError("原章节锚点已经失效，请重新选择章节生成。");
        return;
      }
      if (mode === "replace") {
        finalBody = source.slice(0, range.from) + suggestion + source.slice(range.to);
      } else {
        const prefix = source.slice(0, range.to);
        const suffix = source.slice(range.to);
        finalBody = prefix + (prefix.endsWith("\n") ? "\n" : "\n\n") + suggestion +
          (suffix.startsWith("\n") ? "" : "\n") + suffix;
      }
      if (!preservesProtectedNoteStructures(source, finalBody)) {
        setReviewError("章节修改会破坏其他章节的格式或受保护结构，已阻止写入。");
        return;
      }
    }
    if (finalBody !== null && finalBody.length > 200_000) {
      setReviewError("本次应用超过单篇笔记的 20 万字符保存上限，已保留原文。");
      return;
    }
    if (finalBody !== null && finalBody === request.expectedBody) {
      setReviewError("所有修改均已选择保留原文，无需覆盖或创建新版本。");
      return;
    }
    setApplying(true);
    setReviewError("");
    try {
      const preflight = await onPrepareApply({
        expectedRevision: request.expectedRevision,
        expectedTitle: request.expectedTitle,
        expectedBody: request.expectedBody,
        operation: request.operation,
        mode,
        scope: request.scope,
        runId: result.runId,
      });
      if (!preflight.ok) {
        setReviewError(preflight.message);
        return;
      }
      if (request.scope === "selection") {
        if (!resultSelection) {
          setReviewError("选区已经失效，请重新选择文字后生成。");
          return;
        }
        const ok = mode === "replace"
          ? resultSelection.replace(suggestion)
          : resultSelection.insertBelow(suggestion);
        if (!ok) {
          setReviewError("所选文字已变化，旧结果没有应用。");
          return;
        }
      } else if (finalBody !== null) {
        onReplaceNote(finalBody);
      } else if (mode === "replace") {
        onReplaceNote(suggestion);
      } else {
        onInsertNote(suggestion);
      }
      const message = request.scope === "selection"
        ? (mode === "replace" ? "已替换选区，正在自动保存。" : "已插入选区下方，正在自动保存。")
        : (mode === "replace" ? "已应用审阅后的修改，正在自动保存。" : "已插入内容，正在自动保存。");
      setThread(previous => previous.map(item => item.current ? { ...item, applied: true, current: false } : item));
      setRequest(null);
      setResultSelection(null);
      setReviewPlan(null);
      setResult({ status: "success", message, suggestion: "" });
    } finally {
      setApplying(false);
    }
  };

  const refineReviewHunk = async (id: string, instruction: string) => {
    if (!reviewPlan || !request || !result.runId || refiningHunk || applying || pending) return;
    const hunk = reviewPlan.hunks.find(item => item.id === id);
    if (!hunk?.suggested.trim()) return;
    const generation = sequenceRef.current;
    setRefiningHunk(id);
    setReviewError("");
    const data = new FormData();
    data.set("note_id", noteId);
    data.set("title", request.expectedTitle);
    data.set("content", hunk.suggested.trim());
    data.set("operation", "customSelection");
    data.set("scope", "selection");
    data.set("run_id", result.runId);
    data.set("writing_mode", writingMode);
    data.set("use_personal_context", "false");
    data.set("instruction", instruction.trim() || "进一步润色这处文字，保留原有事实、语气和信息量。只返回可替换文字。");
    data.set("context_before", request.content.slice(Math.max(0, hunk.from - 500), hunk.from));
    data.set("context_after", request.content.slice(hunk.to, hunk.to + 500));
    try {
      const reply = await generateNoteAiSuggestion(data);
      if (generation !== sequenceRef.current) return;
      if (reply.status !== "success" || !reply.suggestion || reply.truncated || reply.unsafeToApply) {
        setReviewError(reply.message || "这一处重新生成失败，原审阅结果已保留。");
        return;
      }
      setReviewPlan(previous => previous && previous.source === request.content
        ? reviseAiReviewHunk(previous, id, reply.suggestion)
        : previous);
    } catch {
      if (generation === sequenceRef.current) setReviewError("该段重新生成失败；其他审阅决定仍已保留。");
    } finally {
      setRefiningHunk(null);
    }
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
  const discussion = request ? isDiscussionOperation(request.operation) : false;
  // 词级 diff：rewrite 类操作拿原文本对比还原后的结果；大文档或非 rewrite 返回 null。
  const diffSegments = useMemo(() => {
    if (!result.suggestion || !request || !result.operation ||
        !isRewriteOperation(result.operation as NoteAiOperation)) return null;
    return wordDiff(request.content, result.suggestion);
  }, [request, result.suggestion, result.operation]);
  const reviewCounts = reviewPlan ? countAiReviewDecisions(reviewPlan) : null;
  const reviewBusy = pending || applying || refiningHunk !== null;
  const statusColor =
    result.status === "error" ? "text-red-700" : "text-[var(--accent)]";
  const replaceLabel = request?.scope === "selection"
    ? "确认并替换所选文字"
    : "确认并替换全文";
  const insertLabel = request?.scope === "selection"
    ? "插入到选区下方"
    : "插入到笔记末尾";
  const discardResult = () => {
    setReviewPlan(null);
    setReviewError("");
    setRequest(null);
    setResultSelection(null);
    setResult({ status: "idle", message: "", suggestion: "" });
  };
  const continueResult = () => {
    if (!request || !result.suggestion) return;
    if (rewrite) { setReviewError("改写结果无法安全拼接续写。请缩小至章节后重新生成，原文没有改变。"); return; }
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
            {result.suggestion && request?.operation !== "generateTitle" && !discussion ? (
              <div aria-label="AI 结果确认操作" className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-[var(--text-primary)]">AI 结果待确认</p>
                  <span className="text-[12px] text-[var(--text-tertiary)]">尚未写入笔记</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {rewrite ? (
                    <button
                      disabled={reviewBusy || Boolean(result.truncated || result.unsafeToApply) || Boolean(reviewCounts?.pending) || Boolean(reviewPlan && !reviewPlan.hunks.length)}
                      onClick={() => void apply("replace")}
                      className="min-h-10 rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-2 text-xs font-medium text-white shadow-sm transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                    >
                      {reviewPlan && request?.scope !== "selection" ? "应用已审阅修改" : request?.scope === "section" ? "确认并替换章节" : replaceLabel}
                    </button>
                  ) : null}
                  <button
                    disabled={reviewBusy || Boolean(result.truncated || result.unsafeToApply) || Boolean(rewrite && reviewPlan)}
                    onClick={() => void apply("insert")}
                    className={`min-h-10 rounded-md px-3 py-2 text-xs font-medium ${rewrite ? "border bg-[var(--surface-canvas)] text-[var(--text-primary)]" : "bg-[var(--accent)] text-white sm:col-span-2"}`}
                  >
                    确认并{insertLabel}
                  </button>
                </div>
                {reviewPlan && rewrite ? (
                  <p className="text-[12px] text-[var(--text-secondary)]">
                    {reviewCounts?.pending ? `还有 ${reviewCounts.pending} 处等待决定；修改只会在最终确认时一起保存。` : "已完成逐段选择；最终写入前仍将检查原文版本。"}
                  </p>
                ) : null}
                {result.truncated || result.unsafeToApply ? (
                  <p role="alert" className="text-[12px] text-[var(--danger)]">内容不完整或存在遗漏风险，已禁止应用。</p>
                ) : null}
                {reviewError ? <p role="alert" className="text-[12px] text-[var(--danger)]">{reviewError}</p> : null}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <button
                    onClick={() => void navigator.clipboard?.writeText(result.suggestion)}
                    className="pressable inline-flex min-h-8 items-center gap-1 rounded-[7px] px-1 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                  >
                    <Copy className="size-3" aria-hidden="true" />
                    复制
                  </button>
                  <button
                    onClick={() => result.truncated && !rewrite ? continueResult() : request && run(request, resultSelection)}
                    className="pressable min-h-8 rounded-[7px] px-1 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                  >
                    {result.truncated && !rewrite ? "从截断处继续" : "重新生成"}
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
              <span className="text-[12px] text-[var(--text-tertiary)]">写作模式</span>
              <select aria-label="AI 写作模式" value={writingMode} onChange={(event) => setWritingMode(event.target.value as NoteWritingMode)} className="h-9 rounded-[7px] bg-[var(--surface-control)] px-2 text-[12px] text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
                <option value="fast">快速处理 · DeepSeek</option>
                <option value="quality">高质量写作 · OpenAI</option>
                <option value="deep">深度思考 · OpenAI</option>
              </select>
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
            <div className="mb-4.5 space-y-3.5 border-b border-[var(--separator)] pb-4.5">
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
          {sections.length ? (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <label htmlFor="note-ai-scope" className="text-[12px] font-medium text-[var(--text-secondary)]">处理范围</label>
              <select id="note-ai-scope" value={sectionId} onChange={event => setSectionId(event.target.value)}
                className="ui-field min-h-11 min-w-0 flex-1 rounded-[8px] border border-[var(--control-border)] bg-[var(--surface-control)] px-3 text-[16px] text-[var(--text-primary)] md:text-[13px]">
                <option value="whole">整篇笔记</option>
                {sections.map(section => (
                  <option key={section.id} value={section.id}>{"　".repeat(Math.max(0, section.level - 1))}{section.title}</option>
                ))}
              </select>
            </div>
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
            <div ref={resultRef} className="mt-4 border-t border-[var(--separator)] pt-3.5">
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
                  <span className="rounded bg-[var(--surface-hover)] px-2 py-1 text-[12px] text-[var(--text-tertiary)]">{request?.scope === "selection" ? `所选文字 · ${request.content.length} 字` : request?.scope === "section" ? `当前章节 · ${request.content.length} 字` : "当前笔记"}</span>
                  {result.modelId ? <span title="本次实际调用的模型" className="text-[11px] text-[var(--text-tertiary)]">{result.modelId}</span> : null}
                </div>
              </div>
              {reviewPlan && rewrite && showDiff ? (
                <NoteAiSegmentReview plan={reviewPlan} busy={reviewBusy} refining={refiningHunk}
                  onChoose={(id: string, decision: AiReviewDecision) => {
                    setReviewError("");
                    setReviewPlan(previous => previous ? chooseAiReviewHunk(previous, id, decision) : previous);
                  }}
                  onChooseAll={decision => {
                    setReviewError("");
                    setReviewPlan(previous => previous ? chooseAllAiReviewHunks(previous, decision) : previous);
                  }}
                  onRefine={(id, instruction) => void refineReviewHunk(id, instruction)}
                />
              ) : diffSegments && showDiff ? (
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
              {result.truncated && !rewrite ? (
                <button onClick={continueResult} className="pressable mt-2.5 h-8 rounded-[8px] px-2.5 text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]">
                  从截断处继续
                </button>
              ) : null}
              {result.truncated && rewrite ? (
                <p role="alert" className="mt-2 text-[12px] text-[var(--danger)]">
                  本次改写不完整且无法安全续接，请使用上方“处理范围”选择章节后重新生成。
                </p>
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
