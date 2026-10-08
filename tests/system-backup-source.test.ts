import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSystemBackupSource } from "@/features/system-backup/source";
import { backupId, backupOwner, backupRow } from "./helpers/system-backup-fixtures";

function client(pages: unknown[][], error: unknown = null) {
  const calls: [string, ...unknown[]][] = [];
  const from = vi.fn((table: string) => {
    calls.push(["from", table]); const page = pages.shift() ?? [];
    const query = { then: (resolve: (value: unknown) => void) => resolve({ data: page, error }) } as Record<string, unknown>;
    for (const key of ["select", "eq", "limit", "abortSignal", "order", "or"]) query[key] = (...args: unknown[]) => { calls.push([key, ...args]); return query; };
    return query;
  });
  return { supabase: { from } as unknown as SupabaseClient, calls, from };
}
async function collect(source: AsyncIterable<unknown>) { const rows = []; for await (const row of source) rows.push(row); return rows; }
describe("System backup source boundaries", () => {
  it("uses explicit columns, session owner and keyset pages through even short pages", async () => {
    const a = backupRow("notes", 1); const b = backupRow("notes", 2);
    const db = client([[a], [b], []]); const signal = new AbortController().signal;
    expect(await collect(createSystemBackupSource(db.supabase, backupOwner)("notes", signal))).toEqual([a, b]);
    expect(db.calls.filter(c => c[0] === "eq")).toEqual(Array(3).fill(["eq", "user_id", backupOwner]));
    expect(db.calls).toContainEqual(["or", `id.gt.${backupId(1)}`]);
    expect(db.calls).toContainEqual(["abortSignal", signal]);
    expect(db.calls.find(c => c[0] === "select")?.[1]).toContain("body_markdown");
    expect(db.calls.find(c => c[0] === "select")?.[1]).not.toBe("*");
    expect(db.calls.some(c => c.includes("archived_at"))).toBe(false);
  });
  it("handles composite primary keys without offset skipping or injected cursor values", async () => {
    const row = backupRow("resume_version_bullets", 1, { resume_version_id: backupId(1), bullet_id: backupId(2) });
    const db = client([[row], []]);
    await collect(createSystemBackupSource(db.supabase, backupOwner)("resume_version_bullets", new AbortController().signal));
    expect(db.calls).toContainEqual(["or", `resume_version_id.gt.${backupId(1)},and(resume_version_id.eq.${backupId(1)},bullet_id.gt.${backupId(2)})`]);
  });
  it("rejects invalid owners/tables, mixed ownership, repeated keys and query failure", async () => {
    const db = client([]); expect(() => createSystemBackupSource(db.supabase, "bad")).toThrow();
    await expect(collect(createSystemBackupSource(db.supabase, backupOwner)("auth.users", new AbortController().signal))).rejects.toThrow("backup_unknown_table");
    expect(db.from).not.toHaveBeenCalled();
    for (const pages of [[[backupRow("notes", 1, { user_id: backupId(9) })]], [[backupRow("notes", 1)], [backupRow("notes", 1)]]]) {
      const test = client(pages);
      await expect(collect(createSystemBackupSource(test.supabase, backupOwner)("notes", new AbortController().signal))).rejects.toThrow();
    }
    const failed = client([], { message: "private-provider-detail" });
    await expect(collect(createSystemBackupSource(failed.supabase, backupOwner)("notes", new AbortController().signal))).rejects.toThrow("backup_query_failed");
  });
});
