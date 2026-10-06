import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readLogicalStorage } from "@/features/files/storage-inspection/service";
const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), abortSignal: vi.fn(), gt: vi.fn(), then: vi.fn() };
const supabase = { from: vi.fn(() => query) } as unknown as SupabaseClient;
const rows = [
  { id: "a", file_size: 10, storage_state: "available", archived_at: null },
  { id: "b", file_size: 20, storage_state: "archived", archived_at: "fixture-time" },
  { id: "c", file_size: 30, storage_state: "pending", archived_at: null },
];
beforeEach(() => {
  vi.clearAllMocks();
  for (const [name, mock] of Object.entries(query)) if (name !== "then") mock.mockReturnValue(query);
  let page = 0;
  query.then.mockImplementation(resolve => Promise.resolve(resolve({ data: page++ ? [] : rows, error: null })));
});
describe("owner-scoped logical storage records", () => {
  it("keeps active, archived and pending records separate and scoped", async () => {
    expect(await readLogicalStorage(supabase, "fixture-owner", "fixture-private", AbortSignal.timeout(5_000))).toEqual({ status: "complete", records: 3, activeBytes: 10, archivedBytes: 20, pendingBytes: 30 });
    expect(query.eq.mock.calls).toContainEqual(["user_id", "fixture-owner"]);
    expect(query.eq.mock.calls).toContainEqual(["storage_bucket", "fixture-private"]);
    expect(query.eq.mock.calls).toContainEqual(["storage_provider", "cloudflare_r2"]);
    expect(query.gt).toHaveBeenCalledWith("id", "c");
  });
  it("reports unavailable on database failure rather than complete zero", async () => {
    query.then.mockImplementation(resolve => Promise.resolve(resolve({ data: null, error: { message: "private-detail" } })));
    expect(await readLogicalStorage(supabase, "fixture-owner", "fixture-private", AbortSignal.timeout(5_000))).toMatchObject({ status: "unavailable" });
  });
  it.each([-1, null, ""])("refuses invalid byte counts (%s)", async (size) => {
    let page = 0;
    query.then.mockImplementation(resolve => Promise.resolve(resolve({ data: page++ ? [] : [{ ...rows[0], file_size: size }], error: null })));
    expect(await readLogicalStorage(supabase, "fixture-owner", "fixture-private", AbortSignal.timeout(5_000))).toMatchObject({ status: "unavailable" });
  });
});
