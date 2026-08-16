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
import type { NoteSelection } from "@/components/notes/note-ai-assistant";
import { markdownEditorKeymap } from "@/features/notes/editor/markdown-keymap";
import { markdownEditorTheme } from "@/features/notes/editor/markdown-theme";
import { MarkdownToolbar } from "@/features/notes/editor/markdown-toolbar";
import { markdownImagePreview } from "@/features/notes/editor/markdown-image-preview";
import { createNoteLinkCompletion, extractNoteLinkQuery } from "@/features/notes/editor/note-link-completion";
import { noteLinkDecoration } from "@/features/notes/editor/note-link-decoration";
import type { NoteLinkSuggestion } from "@/features/notes/links/types";
import {
  addMarkdownUploadPlaceholder,
  findMarkdownUploadRange,
  markdownUploadPlaceholder,
  removeMarkdownUploadPlaceholder,
} from "@/features/notes/editor/markdown-upload-placeholder";

type VisualMarkdownEditorProps = {
  markdown: string;
  noteId: string;
  onChange: (value: string) => void;
  onImageUploadStatus?: (message: string) => void;
  onOpenAi?: () => void;
  onSelectionChange?: (selection: NoteSelection | null) => void;
  recentNoteLinks?: readonly NoteLinkSuggestion[];
};

let imageUploadSequence = 0;

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
  recentNoteLinks = [],
}: VisualMarkdownEditorProps) {
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const changeRef = useRef(onChange);
  const selectionRef = useRef(onSelectionChange);
  const [view, setView] = useState<EditorView | null>(null);
  // Toolbar commands only need a fresh version after document changes. Cursor
  // and viewport updates stay inside CodeMirror instead of rerendering React.
  const [stateVersion, setStateVersion] = useState(0);

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

  const searchNoteLinks = useCallback(async (query: string) => {
    const response = await fetch(`/api/notes/link-suggestions?q=${encodeURIComponent(query)}&limit=20`, {
      credentials: "same-origin",
    });
    if (!response.ok) throw new Error("无法搜索笔记。");
    const data = (await response.json()) as { notes?: NoteLinkSuggestion[] };
    return data.notes ?? [];
  }, []);

  const noteLinkCompletion = useMemo(
    () => createNoteLinkCompletion({
      recentNotes: recentNoteLinks.filter((item) => item.id !== noteId),
      searchNotes: searchNoteLinks,
    }),
    [noteId, recentNoteLinks, searchNoteLinks],
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
          if (!image) return false;
          event.preventDefault();
          void insertUploadedImage(image, currentView);
          return true;
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
    [insertUploadedImage, noteLinkCompletion, onChange],
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
    <div className="life-markdown-editor">
      <MarkdownToolbar
        view={view}
        stateVersion={stateVersion}
        onPickImage={(file) => {
          const currentView = editorRef.current?.view;
          if (currentView) void insertUploadedImage(file, currentView);
        }}
        onInsertTable={insertTable}
        onOpenAi={onOpenAi}
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
          }
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
    </div>
  );
}
