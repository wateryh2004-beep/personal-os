import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260821090327_unified_system_status.sql"), "utf8");

describe("system status migration", () => {
  it("keeps domain state owner-scoped, RLS-protected, and browser read-only", () => {
    expect(sql).toContain("create table public.system_domain_statuses");
    expect(sql).toContain("create table public.system_status_events");
    expect(sql).toContain("alter table public.system_domain_statuses enable row level security");
    expect(sql).toContain("system_domain_statuses_select_own");
    expect(sql).toContain("system_status_events_select_own");
    expect(sql).toContain("revoke insert, update, delete on public.system_domain_statuses");
  });
  it("limits operational states and forbids sensitive payload retention by contract", () => {
    expect(sql).toContain("'fresh','stale','syncing','failed','conflict','unavailable'");
    expect(sql).toContain("system_status_events_idempotency_idx");
    expect(sql).toContain("retry_attempt integer not null default 0");
    expect(sql).toContain("payload-free status event timeline");
  });
});
