"use client";

import { useState } from "react";
import { VisualMarkdownEditor } from "@/components/notes/visual-markdown-editor";

// Gated synthetic data only: this fixture does not mount NoteEditor or call
// Server Actions. Browser tests can edit cells without persisting anything.
const sample = [
  "# 表格即时编辑（合成测试）",
  "",
  "| 姓名 | 分数 | 说明 |",
  "| :--- | ---: | :---: |",
  "| 甲 | 90 | a\\|b |",
  "| 乙 | 85 | \x60a|b\x60 |",
  "",
  "下面是没有分隔行、列数也不整齐的导入表格：",
  "",
  "| 项目 | 指标 |",
  "| 一 |",
  "| 二 | 3 | 附加列 |",
  "",
  "~~~md",
  "| 代码 | 不应 |",
  "| --- | --- |",
  "~~~",
].join("\n");

export function MarkdownTableFixture() {
  const [value, setValue] = useState(sample);
  return <main data-testid="markdown-table-fixture" className="flex h-[min(900px,100dvh)] flex-col overflow-hidden bg-[var(--surface-canvas)]">
    <div className="shrink-0 border-b border-[var(--separator)] p-3 text-[14px]">合成 Markdown 表格编辑测试：不触发任何外部写入</div>
    <div className="min-h-0 flex-1">
      <VisualMarkdownEditor
        noteId="synthetic-table-editor"
        markdown={sample}
        contentRevision={0}
        onChange={setValue}
      />
    </div>
    <output data-testid="markdown-source" className="block max-h-[130px] shrink-0 overflow-auto whitespace-pre-wrap border-t border-[var(--separator)] p-2 font-mono text-[12px]">{value}</output>
  </main>;
}
