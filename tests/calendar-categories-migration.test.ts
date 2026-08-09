import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260809075432_calendar_categories_v2.sql", "utf8");
const grantsMigration = readFileSync("supabase/migrations/20260809083838_restrict_calendar_category_cache_grants.sql", "utf8");

describe("Calendar categories migration", () => {
  it("adds the Graph category fields without storing credentials in event rows", () => {
    expect(migration).toContain("add column categories text[]");
    expect(migration).toContain("add column body_text text");
    expect(migration).toContain("add column importance text");
    expect(migration).toContain("add column show_as text");
    expect(migration).not.toMatch(/calendar_events[\s\S]{0,300}secret_access_key/i);
  });

  it("enforces owner-only read RLS and server-only category writes", () => {
    expect(migration).toContain("alter table public.calendar_categories enable row level security");
    expect(migration).toContain("alter table public.calendar_categories force row level security");
    expect(migration).toContain("using (user_id = (select auth.uid()))");
    expect(migration).toContain("revoke insert, update, delete on public.calendar_categories from anon, authenticated");
    expect(migration).not.toContain("to anon");
  });

  it("stores scope migration state without exposing OAuth tokens", () => {
    expect(migration).toContain("oauth_scope_version integer not null default 1");
    expect(migration).toContain("granted_scopes text[] not null");
    expect(migration).not.toContain("access_token");
  });

  it("leaves the browser role read-only and gives anon no category-table grants", () => {
    expect(grantsMigration).toContain("revoke all privileges on table public.calendar_categories from anon");
    expect(grantsMigration).toContain("revoke all privileges on table public.calendar_categories from authenticated");
    expect(grantsMigration).toContain("grant select on table public.calendar_categories to authenticated");
    expect(grantsMigration).not.toContain("grant select on table public.calendar_categories to anon");
  });
});
