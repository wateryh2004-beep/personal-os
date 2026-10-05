import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql = readFileSync("supabase/migrations/20261004193516_leisure_experiences_and_protected_feedback.sql", "utf8");

describe("leisure migration security contract", () => {
  it("owns and protects the dedicated tables without exposing raw writes", () => {
    for (const name of ["leisure_experiences", "leisure_feedback", "leisure_content_versions"]) {
      expect(sql).toContain(`create table public.${name}`);
      expect(sql).toContain(`alter table public.${name} enable row level security`);
      expect(sql).toContain(`on public.${name} for select to authenticated using ((select auth.uid()) = user_id)`);
    }
    expect(sql).toContain("from public, anon, authenticated, service_role");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all).*on\s+public\.leisure_/i);
    expect(sql).toContain("foreign key (linked_note_id, user_id) references public.notes (id, user_id)");
  });

  it("keeps privileged writes private, bounded, authenticated and atomic", () => {
    const privileged = [...sql.matchAll(/create function leisure_private\.(save_feedback|save_content|archive_experience)\([\s\S]*?\n\$\$;/g)].map((match) => match[0]);
    expect(privileged).toHaveLength(3);
    for (const body of privileged) {
      expect(body).toContain("security definer set search_path = ''");
      expect(body).toContain("owner_id uuid := auth.uid()");
      expect(body).toContain("if owner_id is null");
      expect(body).toContain("pg_advisory_xact_lock");
      expect(body).toContain("leisure_conflict");
      expect(body).toContain("insert into public.audit_logs");
      expect(body).not.toContain("p_user_id");
    }
    expect(sql).not.toMatch(/create function public\.[\s\S]*?security definer/);
  });

  it("does not let editorial writes touch feedback or accept arbitrary fields", () => {
    const body = sql.split("create function leisure_private.save_content")[1].split("create function leisure_private.archive_experience")[0];
    expect(body).not.toMatch(/(insert into|update|delete from) public\.leisure_feedback/);
    expect(body).toContain("for key in select jsonb_object_keys(p_content)");
    expect(body).toContain("insert into public.leisure_content_versions");
    expect(body).toContain("content_revision = previous.content_revision + 1");
  });
});
