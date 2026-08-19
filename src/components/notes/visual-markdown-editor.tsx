"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { EditorState } from "@codemirror/state";
import { indentUnit } from "@codemirror/language";
import { markdown as markdownExtension, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { EditorView } from "@codemirror/view";
import { startCompletion } from "@codemirror/autocomplete";
import { GFM } from "@lezer/markdown";
import { X } from "lucide-react";
import type { NoteSelection } from "@/components/notes/note-ai-assistant";
import {
  activeHeadingIndexAtLine,
  parseMarkdownOutline,
  type MarkdownOutlineItem,
} from "@/features/notes/editor/markdown-outline";
import { markdownEditorKeymap } from "@/features/notes/editor/markdown-keymap";
import { markdownEditorTheme } from "@/features/notes/editor/markdown-theme";
import { MarkdownToolbar } from "@/features/notes/editor/markdown-toolbar";
import { markdownImagePreview } from "@/features/notes/editor/markdown-image-preview";
import { createNoteLinkCompletion, extractNoteLinkQuery } from "@/features/notes/editor/note-link-completion";
import { noteLinkDecoration } from "@/features/notes/editor/note-link-decoration";
import type { EntityLinkSuggestion } from "@/features/links/types";
import type { NoteLinkSuggestion } from "@/features/notes/links/types";
import {
  addMarkdownUploadPlaceholder,
  findMarkdownUploadRange,
  markdownUploadPlaceholder,
  removeMarkdownUploadPlaceholder,
} from "@/features/notes/editor/markdown-upload-placeholder";
import { extractPastedUrl } from "@/features/links/link-url";

type VisualMarkdownEditorProps = {
  markdown: string;
  noteId: string;
  onChange: (value: string) => void;
  onImageUploadStatus?: (message: string) => void;
  onOpenAi?: () => void;
  onSelectionChange?: (selection: NoteSelection | null) => void;
};

let imageUploadSequence = 0;

const entityLabels: Record<string, string> = { note: "笔记", todo_task: "任务", calendar_event: "日程", document: "文件" };

function nextImageUploadId() {
  imageUploadSequence += 1;
  return `note-image-${Date.now()}-${imageUploadSequence}`;
}

function centerMobileCursor(currentView: EditorView) {
  if (
    !currentView.hasFocus ||
    currentView.composing ||
    !window.matchMedia("(max-width: 767px)").matches
  ) return;
  window.requestAnimationFrame(() => {
    if (!currentView.dom.isConnected || !currentView.hasFocus) return;
    const cursor = currentView.state.selection.main.head;
    const coordinates = currentView.coordsAtPos(cursor);
    if (!coordinates) return;
    const scrollBounds = currentView.scrollDOM.getBoundingClientRect();
    const visualViewport = window.visualViewport;
    const viewportTop = visualViewport?.offsetTop ?? 0;
    const viewportBottom = viewportTop + (visualViewport?.height ?? window.innerHeight);
    const visibleTop = Math.max(scrollBounds.top, viewportTop);
    const visibleBottom = Math.min(scrollBounds.bottom, viewportBottom);
    const visibleHeight = visibleBottom - visibleTop;
    if (visibleHeight <= 0) return;
    const comfortableTop = visibleTop + visibleHeight * 0.32;
    const comfortableBottom = visibleTop + visibleHeight * 0.62;
    if (coordinates.top >= comfortableTop && coordinates.bottom <= comfortableBottom) return;
    currentView.dispatch({
      effects: EditorView.scrollIntoView(cursor, { y: "center" }),
    });
  });
}

function safeImageAlt(filename: string) {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[\[\]()]/g, "")
    .trim() || "图片";
}

export function VisualMarkdownEditor({
  markdown,
  noteId,
  onChange,
  onImageUploadStatus,
  onOpenAi,
  onSelectionChange,
}: VisualMarkdownEditorProps) {
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const changeRef = useRef(onChange);
  const selectionRef = useRef(onSelectionChange);
  const [view, setView] = useState<EditorView | null>(null);
  // Toolbar commands only need a fresh version after document changes. Cursor
  // and viewport updates stay inside CodeMirror instead of rerendering React.
  const [stateVersion, setStateVersion] = useState(0);
  // 目录浮层：默认不占任何空间（避免"附着在旁边"），点工具栏目录按钮才出现。
  // 只在面板打开时才解析标题，不打开就不付解析成本。
  const [outlineOpen, setOutlineOpen] = useState(false);
  const outlinePanelRef = useRef<HTMLDivElement>(null);
  const outlineListRef = useRef<HTMLUListElement>(null);
  const outlineHeadingsRef = useRef<MarkdownOutlineItem[]>([]);
  const activeOutlineIndexRef = useRef(-1);
  const statusBarRef = useRef<HTMLDivElement>(null);
  const outlineItems = useMemo(
    () => (outlineOpen ? parseMarkdownOutline(markdown) : []),
    [markdown, outlineOpen],
  );

  // 点面板外部或按 Esc 关闭目录；点工具栏本身（含目录按钮）不触发外部关闭，
  // 关闭/打开交给按钮的 toggle 处理，避免开关行为错乱。
  useEffect(() => {
    if (!outlineOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (outlinePanelRef.current?.contains(target)) return;
      if ((target as Element).closest?.(".life-markdown-toolbar")) return;
      setOutlineOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOutlineOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [outlineOpen]);

  // 跳转目录项：用编辑器当前的 doc 重新定位（body state 可能滞后于刚输入的内容），
  // 命中后把光标放到标题行并滚动到视口中央，activeLine 高亮会自然标出目标位置。
  const jumpToOutlineHeading = useCallback((item: MarkdownOutlineItem) => {
    const currentView = editorRef.current?.view;
    if (!currentView) return;
    const fresh = parseMarkdownOutline(currentView.state.doc.toString());
    const target = fresh.find(
      (heading) =>
        heading.level === item.level &&
        heading.text === item.text &&
        heading.index === item.index,
    );
    if (!target) return;
    currentView.dispatch({
      selection: { anchor: target.from },
      effects: EditorView.scrollIntoView(target.from, { y: "center" }),
    });
    currentView.focus();
  }, []);

  // 底部状态栏：字数/行数、光标行列。直接写 DOM，避免光标高频移动触发 React 重渲染。
  const syncStatusCount = useCallback((currentView: EditorView) => {
    const slot = statusBarRef.current?.querySelector<HTMLElement>('[data-status="count"]');
    if (!slot) return;
    const doc = currentView.state.doc;
    const chars = doc.toString().replace(/\s+/g, "").length;
    slot.textContent = `${chars.toLocaleString("zh-CN")} 字 · ${doc.lines} 行`;
  }, []);

  const syncStatusCursor = useCallback((currentView: EditorView) => {
    const slot = statusBarRef.current?.querySelector<HTMLElement>('[data-status="cursor"]');
    if (!slot) return;
    const doc = currentView.state.doc;
    const head = currentView.state.selection.main.head;
    const line = doc.lineAt(head);
    slot.textContent = `第 ${line.number} 行 第 ${head - line.from + 1} 列`;
  }, []);

  // 目录跟随：以视口顶部行为准，高亮当前所在章节，并把目录滚动到该项可见。
  const syncOutlineHighlight = useCallback((currentView: EditorView) => {
    const listEl = outlineListRef.current;
    if (!listEl) return;
    const headings = outlineHeadingsRef.current;
    if (!headings.length) return;
    const doc = currentView.state.doc;
    const topLine = doc.lineAt(currentView.lineBlockAtHeight(0).from).number;
    const activeIndex = activeHeadingIndexAtLine(
      headings.map((heading) => doc.lineAt(heading.from).number),
      topLine,
    );
    if (activeIndex === activeOutlineIndexRef.current) return;
    activeOutlineIndexRef.current = activeIndex;
    for (const button of listEl.querySelectorAll<HTMLButtonElement>("[data-outline-index]")) {
      const isActive = Number(button.dataset.outlineIndex) === activeIndex;
      button.classList.toggle("is-active", isActive);
      if (isActive) button.scrollIntoView({ block: "nearest" });
    }
  }, []);

  // 打开目录时用编辑器当前文档初始化标题索引并高亮当前章节。
  useEffect(() => {
    if (!outlineOpen) return;
    const currentView = editorRef.current?.view;
    if (!currentView) return;
    outlineHeadingsRef.current = parseMarkdownOutline(currentView.state.doc.toString());
    activeOutlineIndexRef.current = -1;
    syncOutlineHighlight(currentView);
  }, [outlineOpen, syncOutlineHighlight]);

  // 编辑器就绪后同步一次状态栏（onCreateEditor 触发时状态栏 DOM 可能尚未挂载）。
  useEffect(() => {
    if (!view) return;
    syncStatusCount(view);
    syncStatusCursor(view);
  }, [syncStatusCount, syncStatusCursor, view]);

  useEffect(() => { changeRef.current = onChange; }, [onChange]);
  useEffect(() => { selectionRef.current = onSelectionChange; }, [onSelectionChange]);
  useEffect(() => {
    if (!view) return;
    const visualViewport = window.visualViewport;
    const handleViewportResize = () => {
      view.requestMeasure();
      centerMobileCursor(view);
    };
    visualViewport?.addEventListener("resize", handleViewportResize);
    return () => visualViewport?.removeEventListener("resize", handleViewportResize);
  }, [view]);

  const reportSelection = (currentView: EditorView) => {
    if (currentView.composing) return;
    const range = currentView.state.selection.main;
    if (range.empty) {
      selectionRef.current?.(null);
      return;
    }
    const selectedText = currentView.state.sliceDoc(range.from, range.to);
    if (!selectedText.trim()) {
      selectionRef.current?.(null);
      return;
    }
    // 选区上下文窗口：把选区前后紧邻的原文一并上报，避免选区成为"上下文孤岛"。
    const contextWindow = 400;
    const doc = currentView.state.doc;
    const contextBefore = doc.sliceString(Math.max(0, range.from - contextWindow), range.from);
    const contextAfter = doc.sliceString(range.to, Math.min(doc.length, range.to + contextWindow));
    const coordinates = currentView.coordsAtPos(range.from);
    selectionRef.current?.({
      text: selectedText,
      contextBefore,
      contextAfter,
      rect: { left: coordinates?.left ?? 0, top: coordinates?.top ?? 0 },
      replace: (text) => {
        if (currentView.state.sliceDoc(range.from, range.to) !== selectedText) return false;
        currentView.dispatch({
          changes: { from: range.from, to: range.to, insert: text },
          selection: { anchor: range.from + text.length },
          scrollIntoView: true,
          userEvent: "input",
        });
        currentView.focus();
        return true;
      },
      insertBelow: (text) => {
        if (currentView.state.sliceDoc(range.from, range.to) !== selectedText) return false;
        const insert = `\n\n${text}`;
        currentView.dispatch({
          changes: { from: range.to, insert },
          selection: { anchor: range.to + insert.length },
          scrollIntoView: true,
          userEvent: "input",
        });
        currentView.focus();
        return true;
      },
    });
  };

  const uploadImageThroughApp = useCallback(async (file: File, filename: string) => {
    const form = new FormData();
    form.set("image", file, filename);
    const response = await fetch(`/api/notes/${noteId}/images`, {
      method: "POST",
      body: form,
    });
    const payload = (await response.json()) as { src?: string; error?: string };
    if (!response.ok || !payload.src)
      throw new Error(payload.error || "图片上传失败，请重试。");
    return payload.src;
  }, [noteId]);

  const uploadImage = useCallback(async (file: File) => {
    onImageUploadStatus?.("正在上传图片…");
    try {
      const filename =
        file.name ||
        `screenshot-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
      let src: string;
      if (file.size <= 4 * 1024 * 1024) {
        src = await uploadImageThroughApp(file, filename);
      } else {
        const created = await fetch("/api/files/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename,
            contentType: file.type,
            size: file.size,
            noteId,
          }),
        });
        const payload = (await created.json()) as {
          documentId?: string;
          uploadUrl?: string;
          error?: string;
        };
        if (!created.ok || !payload.documentId || !payload.uploadUrl)
          throw new Error(payload.error || "图片上传准备失败。");
        const sent = await fetch(payload.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!sent.ok) throw new Error("图片未能传入云端存储。");
        const completed = await fetch("/api/files/upload-url", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId: payload.documentId, noteId }),
        });
        const result = (await completed.json()) as { error?: string };
        if (!completed.ok)
          throw new Error(result.error || "图片上传后未能确认。");
        src = `/api/files/${payload.documentId}/download?inline=1`;
      }
      onImageUploadStatus?.("图片上传完成，正在插入…");
      return { filename, src };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "图片上传失败，请重试。";
      onImageUploadStatus?.(message);
      return null;
    }
  }, [noteId, onImageUploadStatus, uploadImageThroughApp]);

  const searchNoteLinks = useCallback(async (query: string): Promise<NoteLinkSuggestion[]> => {
    const response = await fetch(`/api/notes/link-suggestions?q=${encodeURIComponent(query)}&limit=20`, {
      credentials: "same-origin",
    });
    if (!response.ok) throw new Error("无法搜索笔记。");
    const data = (await response.json()) as { notes?: NoteLinkSuggestion[] };
    return (data.notes ?? []).filter((item) => item.id !== noteId);
  }, [noteId]);

  const searchEntities = useCallback(async (query: string): Promise<EntityLinkSuggestion[]> => {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=20`, {
      credentials: "same-origin",
    });
    if (!response.ok) throw new Error("无法搜索。");
    const data = (await response.json()) as { results?: Array<{ entityType: string; entityId: string; title: string; href: string }> };
    return (data.results ?? [])
      .filter((item) => ["note", "todo_task", "calendar_event", "document"].includes(item.entityType))
      .filter((item) => item.entityId !== noteId)
      .map((item) => ({
        id: item.entityId,
        title: item.title,
        href: item.href,
        label: entityLabels[item.entityType] ?? "引用",
      }));
  }, [noteId]);

  const noteLinkCompletion = useMemo(
    () => createNoteLinkCompletion({ searchNotes: searchNoteLinks, searchEntities }),
    [searchEntities, searchNoteLinks],
  );

  const insertUploadedImage = useCallback(async (file: File, currentView: EditorView) => {
    const initialRange = currentView.state.selection.main;
    const selected = currentView.state.sliceDoc(initialRange.from, initialRange.to).trim();
    const uploadId = nextImageUploadId();
    currentView.dispatch({
      effects: addMarkdownUploadPlaceholder.of({
        id: uploadId,
        from: initialRange.from,
        to: initialRange.to,
      }),
    });
    const result = await uploadImage(file);
    if (!currentView.dom.isConnected) return;
    if (!result) {
      currentView.dispatch({ effects: removeMarkdownUploadPlaceholder.of(uploadId) });
      return;
    }
    const range = findMarkdownUploadRange(currentView.state, uploadId);
    if (!range) {
      currentView.dispatch({ effects: removeMarkdownUploadPlaceholder.of(uploadId) });
      onImageUploadStatus?.("图片已上传，但原插入位置已经失效，请重新插入。");
      return;
    }
    const markdownImage = `![${selected || safeImageAlt(result.filename)}](${result.src})`;
    currentView.dispatch({
      changes: { from: range.from, to: range.to, insert: markdownImage },
      selection: { anchor: range.from + markdownImage.length },
      effects: removeMarkdownUploadPlaceholder.of(uploadId),
      scrollIntoView: true,
      userEvent: "input",
    });
    onImageUploadStatus?.("图片已插入笔记。");
    currentView.focus();
  }, [onImageUploadStatus, uploadImage]);

  // 粘贴纯 URL 时自动抓取标题：先插入占位，再异步替换为 [标题](url)。
  // 占位带唯一 token，替换时若用户已删改则放弃，避免破坏用户输入。
  const insertTitledLink = useCallback(async (rawUrl: string, currentView: EditorView) => {
    const range = currentView.state.selection.main;
    const token = `lt-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
    const placeholder = `[解析链接标题… ${token}](${rawUrl})`;
    currentView.dispatch({
      changes: { from: range.from, to: range.to, insert: placeholder },
      selection: { anchor: range.from + placeholder.length },
      scrollIntoView: true,
      userEvent: "input",
    });
    let title: string | null = null;
    try {
      const response = await fetch(`/api/link-title?url=${encodeURIComponent(rawUrl)}`);
      if (response.ok) {
        const payload = (await response.json()) as { title?: string | null };
        title = payload.title?.trim() ? payload.title.trim() : null;
      }
    } catch {
      title = null;
    }
    if (!currentView.dom.isConnected) return;
    const marker = `[解析链接标题… ${token}`;
    const text = currentView.state.doc.toString();
    const from = text.lastIndexOf(marker);
    if (from === -1) return;
    const tail = `](${rawUrl})`;
    const tailIndex = text.indexOf(tail, from);
    if (tailIndex === -1) return;
    const safeTitle = title
      ? title.replace(/[\n\r]/g, " ").replace(/[\[\]]/g, "")
      : rawUrl;
    const replacement = `[${safeTitle}](${rawUrl})`;
    currentView.dispatch({
      changes: { from, to: tailIndex + tail.length, insert: replacement },
      selection: { anchor: from + replacement.length },
      scrollIntoView: true,
      userEvent: "input",
    });
    currentView.focus();
  }, []);

  const extensions = useMemo(
    () => [
      markdownExtension({
        base: markdownLanguage,
        codeLanguages: languages,
        extensions: [GFM],
        addKeymap: false,
        pasteURLAsLink: true,
        completeHTMLTags: false,
      }),
      indentUnit.of("   "),
      EditorState.tabSize.of(3),
      markdownEditorKeymap,
      markdownEditorTheme,
      markdownImagePreview,
      noteLinkDecoration,
      noteLinkCompletion,
      markdownUploadPlaceholder,
      EditorView.cursorScrollMargin.of({ x: 8, y: 32 }),
      EditorView.contentAttributes.of({
        "aria-label": "Markdown 正文编辑器",
        "aria-multiline": "true",
        autocapitalize: "sentences",
        autocorrect: "on",
        "data-note-editor": "markdown",
      }),
      EditorView.domEventHandlers({
        paste(event, currentView) {
          const image = [...(event.clipboardData?.files ?? [])].find((file) =>
            file.type.startsWith("image/"),
          );
          if (image) {
            event.preventDefault();
            void insertUploadedImage(image, currentView);
            return true;
          }
          const pastedUrl = extractPastedUrl(
            event.clipboardData?.getData("text/plain") ?? "",
          );
          if (pastedUrl) {
            event.preventDefault();
            void insertTitledLink(pastedUrl, currentView);
            return true;
          }
          return false;
        },
        drop(event, currentView) {
          const image = [...(event.dataTransfer?.files ?? [])].find((file) =>
            file.type.startsWith("image/"),
          );
          if (!image) return false;
          event.preventDefault();
          const position = currentView.posAtCoords({
            x: event.clientX,
            y: event.clientY,
          });
          if (position !== null) {
            currentView.dispatch({ selection: { anchor: position } });
          }
          void insertUploadedImage(image, currentView);
          return true;
        },
        compositionend(_event, currentView) {
          queueMicrotask(() => {
            if (!currentView.dom.isConnected) return;
            onChange(currentView.state.doc.toString());
            if (extractNoteLinkQuery(currentView.state.doc.toString(), currentView.state.selection.main.head))
              startCompletion(currentView);
            centerMobileCursor(currentView);
          });
          return false;
        },
      }),
    ],
    [insertTitledLink, insertUploadedImage, noteLinkCompletion, onChange],
  );

  const insertTable = () => {
    const currentView = editorRef.current?.view;
    if (!currentView) return;
    const range = currentView.state.selection.main;
    const table = "| 列 1 | 列 2 |\n| --- | --- |\n|  |  |";
    currentView.dispatch({
      changes: { from: range.from, to: range.to, insert: table },
      selection: { anchor: range.from + table.indexOf("|  |") + 2 },
      scrollIntoView: true,
      userEvent: "input",
    });
  };

  return (
    <div className="life-markdown-editor relative">
      <MarkdownToolbar
        view={view}
        stateVersion={stateVersion}
        onPickImage={(file) => {
          const currentView = editorRef.current?.view;
          if (currentView) void insertUploadedImage(file, currentView);
        }}
        onInsertTable={insertTable}
        onOpenAi={onOpenAi}
        outlineOpen={outlineOpen}
        onToggleOutline={() => setOutlineOpen((open) => !open)}
      />
      <CodeMirror
        ref={editorRef}
        value={markdown}
        theme="none"
        placeholder="开始写作…"
        spellCheck
        className="life-codemirror"
        basicSetup={{
          lineNumbers: false,
          highlightActiveLineGutter: false,
          foldGutter: false,
          dropCursor: true,
          allowMultipleSelections: true,
          indentOnInput: false,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: false,
          rectangularSelection: false,
          crosshairCursor: false,
          highlightActiveLine: true,
          highlightSelectionMatches: false,
          searchKeymap: true,
          foldKeymap: false,
          completionKeymap: false,
          lintKeymap: false,
          tabSize: 3,
        }}
        indentWithTab={false}
        extensions={extensions}
        onCreateEditor={(createdView) => {
          setView(createdView);
          setStateVersion((version) => version + 1);
        }}
        onUpdate={(update) => {
          if (update.selectionSet || update.viewportChanged || update.geometryChanged)
            reportSelection(update.view);
          if (update.docChanged) {
            setStateVersion((version) => version + 1);
            syncStatusCount(update.view);
            if (outlineOpen)
              outlineHeadingsRef.current = parseMarkdownOutline(update.view.state.doc.toString());
          }
          if (update.selectionSet) syncStatusCursor(update.view);
          if (
            outlineOpen &&
            (update.viewportChanged || update.geometryChanged || update.docChanged || update.selectionSet)
          )
            syncOutlineHighlight(update.view);
          if (update.selectionSet || update.docChanged) {
            centerMobileCursor(update.view);
          }
        }}
        onChange={(value, update) => {
          if (update.view.composing) {
            return;
          }
          changeRef.current(value);
        }}
      />
      <div ref={statusBarRef} className="life-markdown-statusbar">
        <span data-status="count">0 字 · 0 行</span>
        <span data-status="cursor">第 1 行 第 1 列</span>
      </div>
      {outlineOpen ? (
        <div
          ref={outlinePanelRef}
          role="navigation"
          aria-label="笔记目录"
          className="absolute right-2 top-[52px] z-30 flex max-h-[min(360px,60vh)] w-60 max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] shadow-[0_8px_24px_rgba(24,24,27,0.12)]"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-subtle)] py-1.5 pl-3 pr-1.5">
            <span className="text-xs font-medium text-[var(--text-secondary)]">目录</span>
            <button
              type="button"
              onClick={() => setOutlineOpen(false)}
              aria-label="关闭目录"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]"
            >
              <X aria-hidden="true" className="size-3.5" />
            </button>
          </div>
          <div className="overflow-y-auto overscroll-contain p-1.5">
            {outlineItems.length === 0 ? (
              <p className="px-2 py-3 text-xs leading-5 text-[var(--text-tertiary)]">
                笔记里还没有标题。用 <span className="font-mono"># 章节名</span>{" "}
                开头就会出现在目录里。
              </p>
            ) : (
              <ul ref={outlineListRef} className="space-y-0.5">
                {outlineItems.map((item) => (
                  <li key={`${item.index}-${item.text}`}>
                    <button
                      type="button"
                      data-outline-index={item.index}
                      onClick={() => jumpToOutlineHeading(item)}
                      title={item.text}
                      style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
                      className="note-outline-item block w-full truncate rounded-[var(--radius-sm)] py-1.5 pr-2 text-left text-[13px] leading-5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]"
                    >
                      {item.text}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
