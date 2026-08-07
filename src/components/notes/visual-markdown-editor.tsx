"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CodeToggle,
  CreateLink,
  InsertTable,
  InsertImage,
  ListsToggle,
  MDXEditor,
  type MDXEditorMethods,
  UndoRedo,
  codeBlockPlugin,
  headingsPlugin,
  imagePlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
} from "@mdxeditor/editor";

export function VisualMarkdownEditor({ markdown, noteId, onChange, onImageUploadStatus }: { markdown: string; noteId: string; onChange: (value: string) => void; onImageUploadStatus?: (message: string) => void }) {
  const editorRef = useRef<MDXEditorMethods>(null);
  const latestMarkdown = useRef(markdown);
  const pendingOrderedPrefix = useRef<string | null>(null);
  const uploadImageThroughApp = useCallback(async (file: File, filename: string) => {
    const form = new FormData();
    form.set("image", file, filename);
    const response = await fetch(`/api/notes/${noteId}/images`, { method: "POST", body: form });
    const payload = await response.json() as { src?: string; error?: string };
    if (!response.ok || !payload.src) throw new Error(payload.error || "图片上传失败，请重试。");
    return payload.src;
  }, [noteId]);
  const uploadImage = useCallback(async (file: File) => {
    onImageUploadStatus?.("正在上传图片…");
    try {
      const filename = file.name || `screenshot-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
      // Screenshots are normally well below 4MB. Sending them through the
      // same origin avoids R2 CORS failures on copied images.
      if (file.size <= 4 * 1024 * 1024) {
        const src = await uploadImageThroughApp(file, filename);
        onImageUploadStatus?.("图片已插入笔记。");
        return src;
      }
      const created = await fetch("/api/files/upload-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename, contentType: file.type, size: file.size, noteId }) });
      const payload = await created.json() as { documentId?: string; uploadUrl?: string; error?: string };
      if (!created.ok || !payload.documentId || !payload.uploadUrl) throw new Error(payload.error || "图片上传准备失败。");
      const sent = await fetch(payload.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!sent.ok) throw new Error("图片未能传入云端存储。");
      const completed = await fetch("/api/files/upload-url", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: payload.documentId, noteId }) });
      const result = await completed.json() as { error?: string };
      if (!completed.ok) throw new Error(result.error || "图片上传后未能确认。");
      onImageUploadStatus?.("图片已插入笔记。");
      return `/api/files/${payload.documentId}/download`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "图片上传失败，请重试。";
      onImageUploadStatus?.(message);
      throw error;
    }
  }, [noteId, onImageUploadStatus, uploadImageThroughApp]);

  useEffect(() => {
    if (markdown === latestMarkdown.current) return;
    editorRef.current?.setMarkdown(markdown);
    latestMarkdown.current = markdown;
  }, [markdown]);

  return <div onKeyDownCapture={(event) => {
    if (event.key === "." && /^\s*\d+\s*$/.test(latestMarkdown.current)) {
      pendingOrderedPrefix.current = `${latestMarkdown.current}.`;
    }
  }}><MDXEditor
    ref={editorRef}
    markdown={markdown}
    placeholder="开始写作…"
    spellCheck
    className="life-markdown-editor"
    contentEditableClassName="life-markdown-editor-content"
    onChange={(value, initialMarkdownNormalize) => {
      // Loading an existing note can normalize whitespace internally. Do not
      // overwrite the authoritative source until the user actually edits it.
      if (initialMarkdownNormalize) return;
      // MDXEditor's ordered-list shortcut temporarily serializes a new empty
      // list as "" after the user types `1.`. Keep that prefix authoritative
      // until the list receives its first item instead of blanking the note.
      if (!value.trim() && pendingOrderedPrefix.current) {
        const prefix = pendingOrderedPrefix.current;
        pendingOrderedPrefix.current = null;
        latestMarkdown.current = prefix;
        onChange(prefix);
        return;
      }
      pendingOrderedPrefix.current = null;
      latestMarkdown.current = value;
      onChange(value);
    }}
    plugins={[
      headingsPlugin({ allowedHeadingLevels: [1, 2, 3, 4] }),
      listsPlugin(),
      quotePlugin(),
      linkPlugin(),
      tablePlugin(),
      imagePlugin({ imageUploadHandler: uploadImage, disableImageResize: true }),
      thematicBreakPlugin(),
      codeBlockPlugin(),
      markdownShortcutPlugin(),
      toolbarPlugin({
        toolbarClassName: "life-markdown-toolbar",
        toolbarContents: () => <><UndoRedo /><BlockTypeSelect /><BoldItalicUnderlineToggles /><CodeToggle /><ListsToggle /><CreateLink /><InsertImage /><InsertTable /></>,
      }),
    ]}
  /></div>;
}
