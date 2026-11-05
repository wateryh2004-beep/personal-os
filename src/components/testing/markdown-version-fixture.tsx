"use client";

import { useState } from "react";
import { NoteVersionHistory } from "@/components/notes/note-version-history";

const current = "# 第一章\n\n现在甲\n\n中间不变\n\n现在乙\n";

/** Isolated synthetic fixture: history endpoints are intercepted by the test,
 * the apply callback only writes local component state. */
export function MarkdownVersionFixture() {
  const [body, setBody] = useState(current);
  const [open, setOpen] = useState(true);
  return <main data-testid="markdown-version-fixture" className="min-h-screen bg-[var(--surface-canvas)] p-4">
    <button type="button" onClick={() => setOpen(true)}>打开历史版本</button>
    <output data-testid="markdown-version-result" className="block whitespace-pre-wrap">{body}</output>
    {open ? <NoteVersionHistory
      noteId="11111111-1111-4111-8111-111111111111"
      currentTitle="当前标题"
      currentBody={body}
      onClose={() => setOpen(false)}
      onApply={async next => { setBody(next.body); return { ok: true, message: "仅在合成测试中应用" }; }}
    /> : null}
  </main>;
}
