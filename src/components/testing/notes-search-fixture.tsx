"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { NotesWorkspaceShell } from "@/components/notes/notes-workspace-shell";
import { NotesWorkspace } from "@/components/notes/notes-workspace";
import { NoteDocumentShell } from "@/components/notes/note-document-shell";

// Synthetic-only, behind E2E_MOBILE_HARNESS; never reads a user's documents.
const folders = [
  { id: "20000000-0000-4000-8000-000000000001", name: "示例资料", parent_id: null },
  { id: "20000000-0000-4000-8000-000000000002", name: "阅读与思考", parent_id: "20000000-0000-4000-8000-000000000001" },
];
const notes = Array.from({ length: 30 }, (_, index) => ({
  id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  title: `阅读记录 ${String(index + 1).padStart(2, "0")} · Synthetic fixture`,
  excerpt: null, folder_id: folders[1].id, updated_at: "2026-10-04T00:00:00Z", pinned_at: null, content_origin: "manual",
}));

export function NotesSearchFixture() {
  const params = useSearchParams();
  const router = useRouter();
  const activeId = params.get("document");
  return <AppShell presentationPathname={activeId ? `/notes/${activeId}` : "/notes"}>
    <div className="h-full" data-testid="notes-search-fixture" onClickCapture={(event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[data-note-result]") : null;
      if (!target) return;
      // Keep the navigation inside the gated fixture, using real App Router history.
      event.preventDefault();
      // Let the row's real onClick save its scroll/query snapshot. preventDefault
      // stops only Next Link's production navigation, not that target handler.
      const query = new URLSearchParams(params);
      query.set("document", target.pathname.split("/").at(-1)!);
      router.push(`/mobile-native-e2e?${query}`);
    }}>
      <NotesWorkspaceShell folders={folders} notes={notes} documentView={Boolean(activeId)}>
        {activeId ? <NoteDocumentShell noteId={activeId} location={{ href: "/notes", label: "示例资料 / 阅读与思考" }} editor={<article className="p-6"><h1 className="page-title">示例阅读记录</h1><p className="mt-4">仅用于导航验证，不包含个人笔记。</p></article>} inspector={null} />
          : <NotesWorkspace notes={notes} folders={folders} timezone="UTC" state="ready" selectedFolder={null} initialView="all" dailyError={false} initialHasMore={false} />}
      </NotesWorkspaceShell>
    </div>
  </AppShell>;
}
