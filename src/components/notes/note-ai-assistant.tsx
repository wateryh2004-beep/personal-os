"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  CheckSquare,
  Copy,
  Lightbulb,
  ListTree,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { AISidecar } from "@/components/ai/ai-sidecar";
import {
  generateNoteAiSuggestion,
  type NoteAiState,
} from "@/features/notes/ai-actions";
import {
  isRewriteOperation,
  noteAiOperationLabel,
  type NoteAiOperation,
} from "@/features/notes/ai-prompts";
import type { DeepSeekModelId } from "@/lib/ai/deepseek";

export type NoteSelection = {
  text: string;
  rect: { left: number; top: number };
  replace: (text: string) => boolean;
  insertBelow: (text: string) => boolean;
};
type Request = {
  operation: NoteAiOperation;
  scope: "note" | "selection";
  instruction?: string;
  content: string;
};
const shortcuts: Array<[NoteAiOperation, string, React.ReactNode]> = [
  ["summarizeNote", "总结", <Sparkles key="summary" />],
  ["extractActions", "提取行动", <CheckSquare key="actions" />],
  ["restructureNote", "整理结构", <ListTree key="structure" />],
  ["polishNote", "润色全文", <WandSparkles key="polish" />],
  ["deepThinkNote", "深入思考", <Lightbulb key="think" />],
];

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
  const [usePersonalContext, setUsePersonalContext] = useState(true);
  const [pending, startTransition] = useTransition();
  const resultRef = useRef<HTMLDivElement>(null);
  const run = (next: Request, targetSelection: NoteSelection | null = null) => {
    if (!next.content.trim()) {
      setResult({
        status: "error",
        message: "先写一些内容，再让 AI 协助。",
        suggestion: "",
      });
      return;
    }
    setRequest(next);
    setResultSelection(next.scope === "selection" ? targetSelection : null);
    setResult({ status: "idle", message: "", suggestion: "" });
    const data = new FormData();
    data.set("note_id", noteId);
    data.set("title", title);
    data.set("content", next.content);
    data.set("operation", next.operation);
    data.set("scope", next.scope);
    data.set("model", model);
    data.set("use_personal_context", String(usePersonalContext));
    if (next.instruction) data.set("instruction", next.instruction);
    startTransition(async () =>
      setResult(await generateNoteAiSuggestion(data)),
    );
  };
  const runNote = (operation: NoteAiOperation) =>
    run({
      operation,
      scope: "note",
      content: bodyMarkdown,
      instruction: operation === "askNote" ? question : undefined,
    });
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
    } else if (mode === "replace") onReplaceNote(result.suggestion);
    else onInsertNote(result.suggestion);
    const appliedMessage = request.scope === "selection"
      ? mode === "replace" ? "已替换所选文字，笔记正在自动保存。" : "已插入到选区下方，笔记正在自动保存。"
      : mode === "replace" ? "已替换全文，笔记正在自动保存。" : "已插入到笔记末尾，笔记正在自动保存。";
    setRequest(null);
    setResultSelection(null);
    setResult({ status: "success", message: appliedMessage, suggestion: "" });
  };
  const selectionOperation = (operation: NoteAiOperation) => {
    if (!selection) return;
    onOpen();
    run({ operation, scope: "selection", content: selection.text }, selection);
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
            {result.suggestion ? (
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
            <div className="flex items-center justify-between border-t pt-2">
              <span className="text-[10px] text-[var(--text-tertiary)]">模型</span>
              <select aria-label="AI 模型" value={model} onChange={(event) => setModel(event.target.value as DeepSeekModelId)} className="h-7 bg-transparent text-xs text-[var(--text-tertiary)]"><option value="deepseek-v4-flash">DeepSeek V4 Flash</option><option value="deepseek-v4-pro">DeepSeek V4 Pro</option></select>
            </div>
          </div>
        }
      >
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
              {customSelection ? "处理所选文字" : "询问这篇笔记"}
            </label>
            <textarea
              id="note-ai-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={
                customSelection
                  ? "说明如何处理所选文字…"
                  : "询问这篇笔记，或结合你的 Personal OS 分析…"
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
                <span className="rounded bg-[var(--surface-hover)] px-2 py-1 text-[10px] text-[var(--text-tertiary)]">{request?.scope === "selection" ? `所选文字 · ${request.content.length} 字` : "当前笔记"}</span>
              </div>
              <pre className="whitespace-pre-wrap rounded-md border bg-white p-3 font-sans text-sm leading-6 text-zinc-700">{result.suggestion}</pre>
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
