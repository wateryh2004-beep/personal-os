"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { WorkspaceIdentityBoundary } from "@/components/layout/workspace-identity-boundary";
import { NotesWorkspaceShell } from "@/components/notes/notes-workspace-shell";
import { NoteRouteDocument } from "@/components/notes/note-route-document";
import { noteDocumentCache } from "@/features/notes/document-resource";
import type { NoteDocumentData } from "@/features/notes/queries";
import type { WorkspaceBootstrap } from "@/lib/workspace-resource-cache";

const ownerId = "synthetic-continuity-owner";
export const continuityDocuments = [1, 2].map((index): NoteDocumentData => ({
  note: { id: `10000000-0000-4000-8000-00000000000${index}`, user_id: ownerId, title: `长文练习 ${index} · Synthetic fixture`, body_markdown: Array.from({ length: 180 }, (_, i) => `## 第 ${i + 1} 节\n\n段落 ${i + 1}：这是验证阅读位置、输入和缓存的合成材料。${"保持正文连续，随时回来继续思考。".repeat(12)}\n\n`).join(""), revision: 1, last_saved_at: "2026-10-25T00:00:00Z", created_at: "2026-10-25T00:00:00Z", updated_at: "2026-10-25T00:00:00Z", folder_id: null, pinned_at: null, archived_at: null, deleted_at: null, status: "active", content_origin: "human", ai_visibility: "normal", source_url: null },
  attachments: [],
}));
function seed(data: NoteDocumentData, delay = 0): Promise<WorkspaceBootstrap<NoteDocumentData | null>> {
  const generatedAt = Date.now();
  return new Promise((resolve) => setTimeout(() => resolve({ ownerId, generatedAt, data }), delay));
}
/** Existing gated synthetic route only. Test runners block all writes; failed-save recovery is intentional. */
export function NoteContinuityFixture() {
  const [current, setCurrent] = useState(() => ({ index: 0, bootstrap: seed(continuityDocuments[0]) }));
  const open = (index: number) => {
    performance.mark("continuity-open");
    setCurrent({ index, bootstrap: seed(continuityDocuments[index], 1500) });
  };
  const data = continuityDocuments[current.index];
  return <WorkspaceIdentityBoundary ownerId={ownerId} revision="continuity-1"><AppShell presentationPathname="/notes/10000000-0000-4000-8000-000000000001">
    <NotesWorkspaceShell documentView folders={[]} notes={continuityDocuments.map(({ note }) => ({ ...note, updated_at: note.updated_at }))}><div className="flex h-full min-h-0 flex-col" data-testid="note-continuity">
      <nav aria-label="合成验证控制" className="flex shrink-0 flex-wrap gap-2 border-b px-3 text-xs">
        {[0, 1].map((index) => <button className="pressable min-h-11 px-2" key={index} onClick={() => open(index)}>打开练习 {index + 1}</button>)}
        <button className="pressable min-h-11 px-2" onClick={() => noteDocumentCache.get(data.note.id).set({ ...data, note: { ...data.note, revision: 9, body_markdown: `${data.note.body_markdown}\n\n远端新版本` } })}>模拟远端更新</button>
      </nav>
      <div className="min-h-0 flex-1"><NoteRouteDocument key={data.note.id} noteId={data.note.id} bootstrap={current.bootstrap} /></div>
    </div></NotesWorkspaceShell>
  </AppShell></WorkspaceIdentityBoundary>;
}
