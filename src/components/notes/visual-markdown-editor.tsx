"use client";

import { useEffect, useRef } from "react";
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CodeToggle,
  CreateLink,
  InsertTable,
  ListsToggle,
  MDXEditor,
  type MDXEditorMethods,
  UndoRedo,
  codeBlockPlugin,
  headingsPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
} from "@mdxeditor/editor";

export function VisualMarkdownEditor({ markdown, onChange }: { markdown: string; onChange: (value: string) => void }) {
  const editorRef = useRef<MDXEditorMethods>(null);
  const latestMarkdown = useRef(markdown);
  const pendingOrderedPrefix = useRef<string | null>(null);

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
      thematicBreakPlugin(),
      codeBlockPlugin(),
      markdownShortcutPlugin(),
      toolbarPlugin({
        toolbarClassName: "life-markdown-toolbar",
        toolbarContents: () => <><UndoRedo /><BlockTypeSelect /><BoldItalicUnderlineToggles /><CodeToggle /><ListsToggle /><CreateLink /><InsertTable /></>,
      }),
    ]}
  /></div>;
}
