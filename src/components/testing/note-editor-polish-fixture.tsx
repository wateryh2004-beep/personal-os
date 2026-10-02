"use client";

import { NoteDocumentShell } from "@/components/notes/note-document-shell";
import { NoteEditor } from "@/components/notes/note-editor";
import { NotesWorkspaceShell } from "@/components/notes/notes-workspace-shell";

const note = {
  id: "e2e-note-editor",
  title: "示例笔记 · 安静地持续编辑",
  body_markdown: "# 阅读与思考\n\n这是用于布局验证的 **Synthetic fixture**，不包含个人笔记或真实业务资料。\n\n## 今天的观察\n\n- 保持正文清晰，操作随时可达。\n- 保存状态固定在工具栏，文字不会随状态跳动。\n\n> 这段内容仅供排版检查。\n\n## 接下来的问题\n\n把相关材料整理在一起，再继续思考。",
  revision: 1,
  last_saved_at: "2026-10-02T08:00:00Z",
  content_origin: "human" as const,
};

// The gated fixture is for geometry, menus, focus and fullscreen only.
// Browser checks must not edit text or submit forms / Server Actions.
export function NoteEditorPolishFixture() {
  return <NotesWorkspaceShell documentView folders={[]} notes={[{ ...note, folder_id: null, updated_at: note.last_saved_at }]}>
    <NoteDocumentShell noteId={note.id} editor={<NoteEditor note={note} noteAiDefaultModel="deepseek-v4-flash" />} inspector={<p className="text-[13px] leading-6">Synthetic fixture · 示例笔记详情，仅用于布局验证。</p>} />
  </NotesWorkspaceShell>;
}
