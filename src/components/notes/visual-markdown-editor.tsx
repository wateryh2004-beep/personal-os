"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { EditorState } from "@codemirror/state";
import { indentUnit } from "@codemirror/language";
import { markdown as markdownExtension, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { EditorView } from "@codemirror/view";
import { GFM } from "@lezer/markdown";
import type { NoteSelection } from "@/components/notes/note-ai-assistant";
import { markdownEditorKeymap } from "@/features/notes/editor/markdown-keymap";
import { markdownEditorTheme } from "@/features/notes/editor/markdown-theme";
import { MarkdownToolbar } from "@/features/notes/editor/markdown-toolbar";

type VisualMarkdownEditorProps = {
  markdown: string;
  noteId: string;
  onChange: (value: string) => void;
  onImageUploadStatus?: (message: string) => void;
  onOpenAi?: () => void;
  onSelectionChange?: (selection: NoteSelection | null) => void;
};

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
  const [stateVersion, setStateVersion] = useState(0);

  useEffect(() => { changeRef.current = onChange; }, [onChange]);
  useEffect(() => { selectionRef.current = onSelectionChange; }, [onSelectionChange]);

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
    const coordinates = currentView.coordsAtPos(range.from);
    selectionRef.current?.({
      text: selectedText,
      rect: { left: coordinates?.left ?? 0, top: coordinates?.top ?? 0 },
      replace: (text) => {
        if (currentView.state.sliceDoc(range.from, range.to) !== selectedText) return;
        currentView.dispatch({
          changes: { from: range.from, to: range.to, insert: text },
          selection: { anchor: range.from + text.length },
          scrollIntoView: true,
          userEvent: "input",
        });
        currentView.focus();
      },
      insertBelow: (text) => {
        if (currentView.state.sliceDoc(range.from, range.to) !== selectedText) return;
        const insert = `\n\n${text}`;
        currentView.dispatch({
          changes: { from: range.to, insert },
          selection: { anchor: range.to + insert.length },
          scrollIntoView: true,
          userEvent: "input",
        });
        currentView.focus();
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
      onImageUploadStatus?.("图片已插入笔记。");
      return { filename, src };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "图片上传失败，请重试。";
      onImageUploadStatus?.(message);
      return null;
    }
  }, [noteId, onImageUploadStatus, uploadImageThroughApp]);

  const insertUploadedImage = useCallback(async (file: File, currentView: EditorView) => {
    const result = await uploadImage(file);
    if (!result || !currentView.dom.isConnected) return;
    const range = currentView.state.selection.main;
    const selected = currentView.state.sliceDoc(range.from, range.to).trim();
    const markdownImage = `![${selected || safeImageAlt(result.filename)}](${result.src})`;
    currentView.dispatch({
      changes: { from: range.from, to: range.to, insert: markdownImage },
      selection: { anchor: range.from + markdownImage.length },
      scrollIntoView: true,
      userEvent: "input",
    });
    currentView.focus();
  }, [uploadImage]);

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
      EditorView.contentAttributes.of({
        "aria-label": "Markdown 正文编辑器",
        "aria-multiline": "true",
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
        compositionend(_event, currentView) {
          const value = currentView.state.doc.toString();
          queueMicrotask(() => onChange(value));
          return false;
        },
      }),
    ],
    [insertUploadedImage, onChange],
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
          if (update.selectionSet) reportSelection(update.view);
          if (update.selectionSet || update.docChanged)
            setStateVersion((version) => version + 1);
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
