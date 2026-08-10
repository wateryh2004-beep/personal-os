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
const workspace = readFileSync(
  new URL("../src/components/notes/notes-workspace.tsx", import.meta.url),
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

  it("keeps the explicit Notes home reachable while global /notes restores recent work", () => {
    expect(workspace).toContain('href="/notes?view=all"');
    expect(workspace).toContain("router.replace(href)");
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
