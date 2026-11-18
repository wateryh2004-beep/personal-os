import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261118095000_notes_atomic_create_fast_path.sql"),
  "utf8",
);
const actions = readFileSync(resolve(process.cwd(), "src/features/notes/actions.ts"), "utf8");

describe("Notes P0.2 atomic creation contract", () => {
  it("runs all three canonical writes under caller RLS in one database transaction", () => {
    expect(migration).toMatch(/create or replace function public\.create_note_fast\(p_folder_id uuid default null\)/i);
    expect(migration).toMatch(/security invoker/i);
    expect(migration).not.toMatch(/^\s*security definer\b/im);
    expect(migration).toMatch(/v_owner uuid := \(select auth\.uid\(\)\)/i);
    expect(migration).toMatch(/folder\.user_id = v_owner/);
    expect(migration).toMatch(/folder\.archived_at is null/);
    expect(migration).toMatch(/insert into public\.notes/i);
    expect(migration).toMatch(/insert into public\.note_versions/i);
    expect(migration).toMatch(/insert into public\.audit_logs/i);
    expect(migration).not.toMatch(/exception when others/i);
  });

  it("prevents anonymous execution and grants access only to authenticated users", () => {
    expect(migration).toMatch(/revoke all on function public\.create_note_fast\(uuid\) from public, anon/i);
    expect(migration).toMatch(/grant execute on function public\.create_note_fast\(uuid\) to authenticated/i);
    expect(migration).not.toMatch(/p_user_id/i);
  });

  it("keeps the compatible legacy path only for a missing RPC, without swallowing RLS failures", () => {
    expect(actions).toContain('supabase.rpc("create_note_fast", { p_folder_id: folderId })');
    expect(actions).toContain('error.code === "PGRST202" || error.code === "42883"');
    expect(actions).toContain("if (atomicId)");
    expect(actions).toContain("await revalidatePath(\"/notes\")");
    expect(actions).toContain("redirect(`/notes/${atomicId}`)");
    expect(actions).not.toMatch(/error\.code === "42501".*return null/);
  });
});
