"use client";

import { useState } from "react";
import { VisualMarkdownEditor } from "@/components/notes/visual-markdown-editor";

const initial = [
  "# 第一章",
  "",
  "这是一段可以选中并格式化的正文。",
  "",
  "## 子章节",
  "这里是需要折叠的段落内容。",
  "子章节还包含下一行。",
  "",
  "# 第二章",
  "第二章仍应始终可见。",
  "",
  '![演示截图](/favicon.ico "原始图片说明")',
].join("\n");

/** Synthetic editor only; no note Server Actions or production writes. */
export function MarkdownWritingFixture() {
  const [body, setBody] = useState(initial);
  const [aiCount, setAiCount] = useState(0);
  return (
    <main data-testid="markdown-writing-fixture" className="flex h-[min(850px,100dvh)] min-h-0 flex-col overflow-hidden bg-[var(--surface-canvas)]">
      <header className="shrink-0 border-b border-[var(--separator)] p-2 text-[13px]">Markdown 写作交互 · 合成测试</header>
      <div className="min-h-0 flex-1">
        <VisualMarkdownEditor
          noteId="synthetic-writing"
          markdown={initial}
          contentRevision={0}
          onChange={setBody}
          onOpenAi={() => setAiCount(count => count + 1)}
        />
      </div>
      <output data-testid="markdown-writing-ai-count" className="sr-only">{aiCount}</output>
      <output data-testid="markdown-writing-source" className="block max-h-[110px] shrink-0 overflow-auto whitespace-pre-wrap border-t border-[var(--separator)] p-2 font-mono text-[12px]">{body}</output>
    </main>
  );
}
