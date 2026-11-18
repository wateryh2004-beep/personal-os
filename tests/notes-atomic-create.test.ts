import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contentHash } from "@/features/notes/utils";

const migration = readFileSync(
  "supabase/migrations/20261118071500_notes_atomic_create.sql", "utf8",
);
const server = readFileSync("src/features/notes/create-empty-note.ts", "utf8");
const actions = readFileSync("src/features/notes/actions.ts", "utf8");
const button = readFileSync("src/components/notes/new-note-submit-button.tsx", "utf8");

describe("Notes 3.0 atomic creation contract", () => {
  it("does not bypass table RLS or expose the function to anonymous users", () => {
    expect(migration).toMatch(/create function public\.create_empty_note_atomic/);
    expect(migration).toMatch(/security invoker/i);
    // Restrict the negative assertion to executable DDL: the migration header
    // explicitly mentions SECURITY DEFINER as a forbidden design.
    const executableDdl = migration.slice(migration.indexOf("create function public.create_empty_note_atomic"));
    expect(executableDdl).not.toMatch(/security definer/i);
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("revoke all on function public.create_empty_note_atomic(uuid, uuid) from public");
    expect(migration).toContain("revoke all on function public.create_empty_note_atomic(uuid, uuid) from anon");
    expect(migration).toContain("to authenticated");
    expect(migration).toContain("f.user_id = v_user_id");
    expect(migration).toContain("f.archived_at is null");
    expect(migration).toContain("f.vault_group_id is null");
  });

  it("atomically creates an initial version, note and audit with the correct empty Markdown hash", () => {
    expect(migration).toContain("insert into public.notes");
    expect(migration).toContain("insert into public.note_versions");
    expect(migration).toContain("insert into public.audit_logs");
    expect(migration).toContain(contentHash(""));
    expect(migration).toContain("on conflict (id) do nothing");
    expect(migration).toContain("a.request_id = p_note_id");
    expect(migration).toContain("a.entity_id = n.id");
    expect(migration).toContain("raise exception 'notes_create_id_conflict'");
  });

  it("uses one authenticated RPC with only a missing-function rollout fallback", () => {
    expect(server).toContain('supabase.rpc("create_empty_note_atomic"');
    expect(server).toContain('const missingRpcCodes = new Set(["PGRST202", "42883"])');
    expect(server).toContain("if (!missingRpcCodes.has(response.error.code ?? \"\")) fail()");
    expect(server).toContain("confirmedLegacyRetry");
    expect(actions).toContain("await createEmptyNotePersisted(");
    expect(actions).toContain("await revalidatePath(\"/notes\")");
    expect(button).toContain('name="client_note_id"');
    expect(button).toContain("crypto.randomUUID()");
    expect(button).toContain("disabled={pending}");
  });
});
