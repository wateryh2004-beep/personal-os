import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportRows, createExportSource } from "@/features/files/export/source";
import type { SupabaseClient } from "@supabase/supabase-js";

const state = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/adapters/cloudflare-r2", () => ({ readR2ObjectStream: state.read }));
const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
function client({ error = false, nonAdvancing = false } = {}) {
  const calls: unknown[][] = [];
  let pages = 0;
  const database = { from(table: string) {
    let cursor = "";
    return {
      select(columns: string) { calls.push([table, "select", columns]); return this; },
      eq(key: string, value: unknown) { calls.push([table, "eq", key, value]); return this; },
      gt(key: string, value: string) { calls.push([table, "gt", key, value]); cursor = value; return this; },
      order(key: string, options: unknown) { calls.push([table, "order", key, options]); return this; },
      or(value: string) { calls.push([table, "or", value]); return this; },
      limit(value: number) { calls.push([table, "limit", value]); return this; },
      abortSignal() { return this; },
      then(resolve: (value: unknown) => unknown) {
        pages++;
        const offset = nonAdvancing ? 0 : cursor ? Number(cursor.slice(-12)) : 0;
        // Simulates a server cap lower than requested, and > the usual 1000-row cap.
        const data = Array.from({ length: Math.min(7, 1031 - offset) }, (_, index) => ({ id: id(offset + index + 1) }));
        return Promise.resolve({ data, error: error ? { message: "DB secret" } : null }).then(resolve);
      },
    };
  } };
  return { database: database as unknown as SupabaseClient, calls, pages: () => pages };
}
beforeEach(() => state.read.mockReset());

describe("Complete owner-scoped export pagination", () => {
  it("reads beyond 1000 records and continues after short pages with stable ID keysets", async () => {
    const mock = client(); const result = [];
    for await (const row of exportRows(mock.database, "owner", "documents", new AbortController().signal)) result.push(row);
    expect(result.length).toBe(1031); expect(new Set(result.map((row) => row.id)).size).toBe(1031);
    expect(mock.pages()).toBe(149);
    expect(mock.calls).toContainEqual(["documents", "eq", "user_id", "owner"]);
    expect(mock.calls).toContainEqual(["documents", "eq", "storage_provider", "cloudflare_r2"]);
    expect(mock.calls).toContainEqual(["documents", "gt", "id", id(7)]);
    expect(mock.calls.some((call) => call.includes("storage_state") || call.includes("archived_at"))).toBe(false);
  });
  it("fails closed for query errors or non-advancing pagination", async () => {
    for (const mock of [client({ error: true }), client({ nonAdvancing: true })]) {
      await expect((async () => { for await (const row of exportRows(mock.database, "owner", "file_folders", new AbortController().signal)) void row; })()).rejects.toThrow(/files_export_/);
    }
  });
  it("restricts relationships and prevents cross-owner object fetches", async () => {
    const mock = client(); const signal = new AbortController().signal;
    const generator = exportRows(mock.database, "owner", "entity_links", signal);
    await generator.next(); await generator.return(undefined);
    expect(mock.calls).toContainEqual(["entity_links", "or", "source_type.eq.document,target_type.eq.document"]);
    expect(mock.calls.find((call) => call[1] === "select")?.[2]).toContain("created_via,metadata");
    const value = createExportSource(mock.database, "owner", signal);
    expect(() => value.openObject({ id: id(1), storage_path: "another-owner/file", file_size: 1, storage_state: "available", checksum: null }, signal)).toThrow("files_export_invalid_object_owner");
    expect(state.read).not.toHaveBeenCalled();
  });
});
