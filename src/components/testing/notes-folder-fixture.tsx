"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { NotesWorkspaceShell } from "@/components/notes/notes-workspace-shell";
import { NotesWorkspace } from "@/components/notes/notes-workspace";

// Gated synthetic fixture only: parent is empty, its children contain notes.
const folders = [
  { id: "fixture-parent", name: "示例知识与学习资料", parent_id: null },
  { id: "fixture-child", name: "用于验证完整换行的很长子文件夹名称 LongUnbrokenFolderNameForResponsiveChecks", parent_id: "fixture-parent" },
  { id: "fixture-empty", name: "空的子文件夹", parent_id: "fixture-parent" },
];
const notes = [{ id: "fixture-note", title: "子文件夹里的示例笔记", excerpt: null, folder_id: "fixture-child", updated_at: "2026-10-06T00:00:00Z", pinned_at: null, content_origin: "manual" }];
export function NotesFolderFixture() {
  const params = useSearchParams();
  const router = useRouter();
  const selected = folders.find((folder) => folder.id === (params.get("folder") ?? "fixture-parent")) ?? null;
  return <AppShell presentationPathname="/notes"><div className="h-full" data-testid="notes-folder-fixture" onClickCapture={(event) => {
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
    if (!link || link.pathname !== "/notes") return;
    event.preventDefault();
    const query = new URLSearchParams({ scene: "notes-folders" });
    query.set("folder", new URL(link.href).searchParams.get("folder") ?? "all");
    router.push(`/mobile-native-e2e?${query}`);
  }}>
    <NotesWorkspaceShell folders={folders} notes={notes}><NotesWorkspace folders={folders} notes={notes} selectedFolder={selected} state="ready" timezone="UTC" initialView="all" dailyError={false} initialHasMore={false} /></NotesWorkspaceShell>
  </div></AppShell>;
}
