"use client";

import { useState } from "react";
import { NoteVersionReview } from "@/components/notes/note-version-review";

export const phase4NoteId = "b77ce6c2-f913-4899-86aa-c93e8739d194";
export const phase4VersionId = "06fe866d-bfd6-4eaf-86a2-b7c9077c0212";

/** Auth-isolated fixture: the browser test intercepts GET and blocks writes. */
export function NotesPhase4Fixture() {
  const [open, setOpen] = useState(true);
  const [dirty, setDirty] = useState(false);
  return <main data-testid="notes-phase4-fixture" className="min-h-[100dvh] bg-[var(--surface-canvas)] p-4">
    <button type="button" onClick={() => setDirty(v => !v)}>切换未保存状态</button>
    <div data-note-editor-id={phase4NoteId} data-note-save-state={dirty ? "有未保存修改" : "已保存"} />
    <output data-testid="phase4-dirty">{dirty ? "dirty" : "saved"}</output>
    {open ? <NoteVersionReview noteId={phase4NoteId} versionId={phase4VersionId} onClose={() => setOpen(false)} /> :
      <button type="button" onClick={() => setOpen(true)}>再次比较版本</button>}
  </main>;
}
