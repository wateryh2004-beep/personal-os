import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  noteAutosaveDebounceMs,
  noteAutosaveMaxWaitMs,
  noteDraftRecoveryTtlMs,
} from "@/features/notes/editor/save-policy";

const editor = readFileSync(
  new URL("../src/components/notes/note-editor.tsx", import.meta.url),
  "utf8",
);
const actions = readFileSync(
  new URL("../src/features/notes/actions.ts", import.meta.url),
  "utf8",
);
const linkService = readFileSync(
  new URL("../src/features/notes/links/service.ts", import.meta.url),
  "utf8",
);
const workspace = readFileSync(
  new URL("../src/components/notes/notes-workspace.tsx", import.meta.url),
  "utf8",
);
const workspaceShell = readFileSync(
  new URL("../src/components/notes/notes-workspace-shell.tsx", import.meta.url),
  "utf8",
);
const notePage = readFileSync(
  new URL("../src/app/(app)/notes/page.tsx", import.meta.url),
  "utf8",
);
const noteLayout = readFileSync(
  new URL("../src/app/(app)/notes/layout.tsx", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260810034854_ai_prompt_overrides.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Notes editor reliability", () => {
  it("autosaves quickly, periodically flushes long typing sessions, and keeps a recovery draft", () => {
    expect(noteAutosaveDebounceMs).toBeLessThanOrEqual(750);
    expect(noteAutosaveMaxWaitMs).toBeLessThanOrEqual(5_000);
    expect(noteDraftRecoveryTtlMs).toBeGreaterThanOrEqual(24 * 60 * 60 * 1_000);
    expect(editor).toContain('window.addEventListener("beforeunload"');
    expect(editor).toContain('window.addEventListener("pagehide"');
    expect(editor).toContain("revisionRef.current = draft.baseRevision");
    expect(editor).toContain("rememberOpenNote();");
  });

  it("keeps /notes as a stable workspace index rather than secretly restoring a note", () => {
    expect(workspace).not.toContain("lastOpenedNoteSessionKey");
    expect(workspace).not.toContain("router.replace(href)");
    expect(notePage).not.toContain("restoreRecentNote");
    expect(noteLayout).toContain("NotesWorkspaceShell");
  });

  it("keeps one persistent file navigator around index, trash, and document routes", () => {
    expect(noteLayout).toContain("getNotesNavigator");
    expect(workspaceShell).toContain("notesByFolder");
    expect(workspaceShell).toContain("FileText");
    expect(workspaceShell).toContain("expandedFolderPath");
    expect(workspaceShell).not.toContain("directCount");
  });

  it("uses inline rename and a single hierarchy-aware folder move control", () => {
    expect(workspace).toContain('aria-label="笔记标题"');
    expect(workspace).not.toContain("重命名笔记<input");
    const picker = readFileSync(new URL("../src/components/notes/folder-picker.tsx", import.meta.url), "utf8");
    expect(picker).toContain("folderPath(folder, byId)");
    expect(picker).not.toContain("levels.map");
  });

  it("keeps save and fullscreen visible while folding PDF export into the overflow menu", () => {
    expect(editor).toContain("立即保存，当前状态");
    expect(editor).toContain("进入全屏编辑");
    expect(editor).toContain("setIsFallbackFullscreen(true)");
    expect(editor).toContain("导出 PDF");
    expect(editor.indexOf("进入全屏编辑")).toBeLessThan(editor.indexOf("<DropdownMenu>"));
  });

  it("does not report the authoritative note body as failed when derived link sync fails", () => {
    expect(actions).toContain('action: "sync_note_links"');
    expect(actions).not.toContain("if (insert.error) fail();");
  });

  it("keeps autosave local to the mounted editor and diffs derived links", () => {
    expect(editor).not.toContain("router.refresh()");
    expect(actions).not.toContain('revalidatePath(`/notes/${value.noteId}`)');
    expect(linkService).toContain("const removedIds");
    expect(linkService).toContain("const added");
  });

  it("protects prompt overrides with owner RLS and authenticated-only grants", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("(select auth.uid()) = user_id");
    expect(migration).toContain("revoke all on table public.ai_prompt_overrides from anon");
    expect(migration).toContain("grant select, insert, update, delete");
  });

  it("implements owner-checked folder rename without changing hierarchy", () => {
    expect(actions).toContain("export async function renameFolder");
    expect(actions).toContain('.update({ name: parsed.data.name })');
    expect(actions).toContain('audit(supabase, userId, "rename", "note_folder"');
    expect(actions).toContain('.select("id,name,parent_id")');
  });
});
