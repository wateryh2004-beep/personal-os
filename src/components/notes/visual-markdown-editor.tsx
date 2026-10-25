"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror, { ExternalChange, type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { captureEditorPosition, type EditorPosition } from "@/features/notes/editor/continuity";
import { sourceLineAttributes } from "@/features/notes/editor/source-line-attributes";
import { documentCharacterCount } from "@/features/notes/editor/document-statistics";
import { Compartment, EditorState } from "@codemirror/state";
import { indentUnit } from "@codemirror/language";
import { markdown as markdownExtension, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import { startCompletion } from "@codemirror/autocomplete";
import { GFM } from "@lezer/markdown";
import { NoteOutline } from "@/components/notes/note-outline";
import type { NoteSelection } from "@/components/notes/note-ai-assistant";
import {
  activeHeadingIndexAtLine,
  parseEditorOutline,
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
  /** Changes only for draft recovery, remote reconciliation or an explicit replacement. */
  contentRevision: number;
  noteId: string;
  onChange: (value: string) => void;
  onEditorReady?: (view: EditorView) => void;
  onPositionIntent?: (view: EditorView) => void;
  onPositionChange?: (position: EditorPosition) => void;
  onImageUploadStatus?: (message: string) => void;
  onOpenAi?: () => void;
  onSelectionChange?: (selection: NoteSelection | null) => void;
};

const markdownBasicSetup = {
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
} as const;

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
  contentRevision,
  noteId,
  onChange,
  onImageUploadStatus,
  onOpenAi,
  onSelectionChange,
  onEditorReady, onPositionChange, onPositionIntent,
}: VisualMarkdownEditorProps) {
  const [initialMarkdown] = useState(markdown);
  const [eventHandlers] = useState(() => new Compartment());
  const appliedContentRevision = useRef(contentRevision);
  const updateRef = useRef<(update: ViewUpdate) => void>(() => {});
  const handleUpdate = useCallback((update: ViewUpdate) => updateRef.current(update), []);
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const positionMeasureKey = useRef({});
  const changeRef = useRef(onChange);
  const positionIntentRef = useRef(onPositionIntent);
  const selectionRef = useRef(onSelectionChange);
  const [view, setView] = useState<EditorView | null>(null);
  // The editor owns keystrokes. React echoes must not enter UIW's delayed value replay.
  useEffect(() => {
    if (!view || appliedContentRevision.current === contentRevision) return;
    appliedContentRevision.current = contentRevision;
    if (view.state.doc.toString() !== markdown) view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: markdown },
      annotations: ExternalChange.of(true),
    });
  }, [contentRevision, markdown, view]);
  const handleCodeMirrorChange = useCallback((value: string, update: ViewUpdate) => {
    if (!update.view.composing) changeRef.current(value);
  }, []);
  // Toolbar commands only need a fresh version after document changes. Cursor
  // and viewport updates stay inside CodeMirror instead of rerendering React.
  const [stateVersion, setStateVersion] = useState(0);
  // 目录浮层：默认不占任何空间（避免"附着在旁边"），点工具栏目录按钮才出现。
  // 只在面板打开时才解析标题，不打开就不付解析成本。
  const [outlineOpen, setOutlineOpen] = useState(false);
  const outlineListRef = useRef<HTMLUListElement>(null);
  const outlineHeadingsRef = useRef<MarkdownOutlineItem[]>([]);
  const activeOutlineIndexRef = useRef(-1);
  const outlineMeasureKey = useRef({});
  const statusBarRef = useRef<HTMLDivElement>(null);
  const [outlineItems, setOutlineItems] = useState<MarkdownOutlineItem[]>([]);
  const outlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshOutline = useCallback((currentView: EditorView) => {
    const items = parseEditorOutline(currentView.state);
    outlineHeadingsRef.current = items;
    setOutlineItems(items);
  }, []);
  const queueOutline = useCallback((currentView: EditorView) => {
    if (outlineTimerRef.current) clearTimeout(outlineTimerRef.current);
    outlineTimerRef.current = setTimeout(() => { outlineTimerRef.current = null; if (currentView.dom.isConnected) refreshOutline(currentView); }, 160);
  }, [refreshOutline]);
  useEffect(() => () => { if (outlineTimerRef.current) clearTimeout(outlineTimerRef.current); }, []);
  useEffect(() => {
    if (!outlineOpen && outlineTimerRef.current) { clearTimeout(outlineTimerRef.current); outlineTimerRef.current = null; }
  }, [outlineOpen]);

  // 跳转目录项：用编辑器当前的 doc 重新定位（body state 可能滞后于刚输入的内容），
  // 命中后把光标放到标题行并滚动到视口中央，activeLine 高亮会自然标出目标位置。
  const jumpToOutlineHeading = useCallback((item: MarkdownOutlineItem) => {
    const currentView = editorRef.current?.view;
    if (!currentView) return false;
    const fresh = parseEditorOutline(currentView.state);
    const target = fresh.find(
      (heading) =>
        heading.level === item.level &&
        heading.text === item.text &&
        heading.index === item.index,
    );
    if (!target) { refreshOutline(currentView); return false; }
    currentView.dispatch({
      selection: { anchor: target.from },
      effects: EditorView.scrollIntoView(target.from, { y: "center" }),
    });
    currentView.focus();
    return true;
  }, [refreshOutline]);

  // 底部状态栏：字数/行数、光标行列。直接写 DOM，避免光标高频移动触发 React 重渲染。
  const syncStatusCount = useCallback((currentView: EditorView) => {
    const slot = statusBarRef.current?.querySelector<HTMLElement>('[data-status="count"]');
    if (!slot) return;
    const doc = currentView.state.doc;
    const chars = currentView.state.field(documentCharacterCount);
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
    if (!outlineListRef.current) return;
    currentView.requestMeasure({
      key: outlineMeasureKey.current,
      read: (measuredView) => {
        const doc = measuredView.state.doc;
        const top = Math.max(0, measuredView.scrollDOM.getBoundingClientRect().top - measuredView.documentTop);
        const topLine = doc.lineAt(measuredView.lineBlockAtHeight(top).from).number;
        return activeHeadingIndexAtLine(outlineHeadingsRef.current.map((heading) => doc.lineAt(Math.min(heading.from, doc.length)).number), topLine);
      },
      write: (activeIndex) => {
        if (activeIndex === activeOutlineIndexRef.current) return;
        activeOutlineIndexRef.current = activeIndex;
        for (const button of outlineListRef.current?.querySelectorAll<HTMLButtonElement>("[data-outline-index]") ?? []) {
          const isActive = Number(button.dataset.outlineIndex) === activeIndex;
          button.classList.toggle("is-active", isActive);
          if (isActive) button.setAttribute("aria-current", "location"); else button.removeAttribute("aria-current");
          if (isActive) button.scrollIntoView({ block: "nearest" });
        }
      },
    });
  }, []);

  const refreshOutlineHighlight = useCallback(() => {
    activeOutlineIndexRef.current = -1;
    if (editorRef.current?.view) syncOutlineHighlight(editorRef.current.view);
  }, [syncOutlineHighlight]);

  // 打开目录时用编辑器当前文档初始化标题索引并高亮当前章节。
  useEffect(() => {
    if (!outlineOpen) return;
    const currentView = editorRef.current?.view;
    if (!currentView) return;
    refreshOutline(currentView);
    activeOutlineIndexRef.current = -1;
    syncOutlineHighlight(currentView);
  }, [outlineOpen, refreshOutline, syncOutlineHighlight]);

  // 编辑器就绪后同步一次状态栏（onCreateEditor 触发时状态栏 DOM 可能尚未挂载）。
  useEffect(() => {
    if (!view) return;
    syncStatusCount(view);
    syncStatusCursor(view);
  }, [syncStatusCount, syncStatusCursor, view]);

  useEffect(() => { changeRef.current = onChange; }, [onChange]);
  useEffect(() => { positionIntentRef.current = onPositionIntent; }, [onPositionIntent]);
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
      documentCharacterCount,
      sourceLineAttributes,
      EditorView.cursorScrollMargin.of({ x: 8, y: 32 }),
      EditorView.contentAttributes.of({
        "aria-label": "Markdown 正文编辑器",
        "aria-multiline": "true",
        autocapitalize: "sentences",
        autocorrect: "on",
        "data-note-editor": "markdown",
      }),
      eventHandlers.of([]),
    ],
    [eventHandlers, noteLinkCompletion],
  );

  useEffect(() => {
    if (!view) return;
    view.dispatch({ effects: eventHandlers.reconfigure(EditorView.domEventHandlers({
        wheel: (_event, currentView) => { positionIntentRef.current?.(currentView); return false; },
        touchstart: (_event, currentView) => { positionIntentRef.current?.(currentView); return false; },
        pointerdown: (_event, currentView) => { positionIntentRef.current?.(currentView); return false; },
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
            changeRef.current(currentView.state.doc.toString());
            if (extractNoteLinkQuery(currentView.state.doc.toString(), currentView.state.selection.main.head))
              startCompletion(currentView);
            centerMobileCursor(currentView);
          });
          return false;
        },
      })) });
  }, [eventHandlers, extensions, insertTitledLink, insertUploadedImage, view]);

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

  useEffect(() => {
    updateRef.current = (update: ViewUpdate) => {
      if (update.geometryChanged || update.selectionSet) onEditorReady?.(update.view);
      if (onPositionChange && (update.selectionSet || update.viewportChanged)) update.view.requestMeasure({
        key: positionMeasureKey.current,
        read: (current) => current.scrollDOM.clientHeight > 0 ? captureEditorPosition(current) : null,
        write: (position) => { if (position) onPositionChange(position); },
      });
      if (update.selectionSet || update.viewportChanged || update.geometryChanged)
        reportSelection(update.view);
      if (update.docChanged) {
        setStateVersion((version) => version + 1);
        syncStatusCount(update.view);
        if (outlineOpen)
          queueOutline(update.view);
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
    };
  });

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
        outlineControl={<NoteOutline open={outlineOpen} onOpenChange={setOutlineOpen} disabled={!view} items={outlineItems} listRef={outlineListRef} onSelect={jumpToOutlineHeading} onListChange={refreshOutlineHighlight} portalContainer={view?.dom.closest<HTMLElement>(".notes-editor-surface")} />}
      />
      <CodeMirror
        ref={editorRef}
        value={initialMarkdown}
        theme="none"
        placeholder="开始写作…"
        spellCheck
        className="life-codemirror"
        basicSetup={markdownBasicSetup}
        indentWithTab={false}
        extensions={extensions}
        onCreateEditor={(createdView) => {
          onEditorReady?.(createdView);
          setView(createdView);
          setStateVersion((version) => version + 1);
        }}
        onUpdate={handleUpdate}
        onChange={handleCodeMirrorChange}
      />
      <div ref={statusBarRef} className="life-markdown-statusbar">
        <span data-status="count">0 字 · 0 行</span>
        <span data-status="cursor">第 1 行 第 1 列</span>
      </div>

    </div>
  );
}
