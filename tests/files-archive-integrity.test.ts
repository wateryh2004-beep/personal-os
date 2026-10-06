import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const fake = vi.hoisted(() => ({ stream: vi.fn(), updates: [] as Record<string, unknown>[], auditError: false, row: null as Record<string, unknown> | null }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: async () => ({ userId: "owner", supabase: { from } }) }));
vi.mock("@/lib/adapters/cloudflare-r2", () => ({ readR2ObjectStream: fake.stream }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { restoreFile } from "@/features/files/actions";
function from(table: string) {
  const builder = {
    select() { return builder; }, eq() { return builder; }, is() { return builder; }, not() { return builder; },
    update(value: Record<string, unknown>) { fake.updates.push(value); return builder; },
    maybeSingle: async () => ({ data: fake.row, error: null }),
    insert: async () => ({ error: table === "audit_logs" && fake.auditError ? { message: "offline" } : null }),
  };
  return builder;
}
function form() { const f = new FormData(); f.set("document_id", "22222222-2222-4222-8222-222222222222"); return f; }
beforeEach(() => {
  fake.row = { id: "22222222-2222-4222-8222-222222222222", storage_state: "archived", archived_at: "2026-10-01", storage_path: "owner/files/doc/a.txt", file_size: 5, checksum: createHash("sha256").update("hello").digest("hex") };
  fake.updates = []; fake.auditError = false;
  fake.stream.mockReset().mockImplementation(async () => ({ size: 5, body: new ReadableStream({ start(c) { c.enqueue(Buffer.from("hello")); c.close(); } }) }));
});
describe("archive restoration integrity", () => {
  it("verifies bytes before restoring archived metadata", async () => {
    expect(await restoreFile(form())).toEqual({ saved: true });
    expect(fake.updates).toEqual([{ archived_at: null, storage_state: "available" }]);
  });
  it("does not restore missing or corrupt originals", async () => {
    fake.row!.checksum = "a".repeat(64);
    await expect(restoreFile(form())).rejects.toThrow("校验不一致");
    expect(fake.updates).toEqual([]);
    fake.stream.mockRejectedValue(new Error("not found"));
    await expect(restoreFile(form())).rejects.toThrow("原文件暂不可读");
    expect(fake.updates).toEqual([]);
  });
  it("distinguishes saved metadata from a failed audit insert", async () => {
    fake.auditError = true;
    expect(await restoreFile(form())).toMatchObject({ saved: true, warning: expect.stringContaining("已保存") });
    expect(fake.updates).toHaveLength(1);
  });
  it("accepts lost-response retries without another restore", async () => {
    fake.row!.storage_state = "available"; fake.row!.archived_at = null;
    expect(await restoreFile(form())).toEqual({ saved: true });
    expect(fake.updates).toHaveLength(0); expect(fake.stream).not.toHaveBeenCalled();
  });
});
