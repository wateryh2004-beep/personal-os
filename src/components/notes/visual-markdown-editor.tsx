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

  useEffect(() => {
    if (markdown === latestMarkdown.current) return;
    editorRef.current?.setMarkdown(markdown);
    latestMarkdown.current = markdown;
  }, [markdown]);

  return <MDXEditor
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
  />;
}
