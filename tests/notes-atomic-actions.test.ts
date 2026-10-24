import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/workspace-revalidation", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: async () => {
  const query: Record<string, unknown> = new Proxy({}, { get(_target, name) {
    if (name === "then") { const value = Promise.resolve({ data: { revision: 4 }, error: null }); return value.then.bind(value); }
    return () => query;
  }});
  return { userId: "10000000-0000-4000-8000-000000000001", supabase: { from: () => query, rpc: mocks.rpc } };
} }));
import { restoreNoteVersion } from "@/features/notes/actions";
it("carries the viewed revision to the atomic restore and surfaces a concurrent conflict", async () => {
  const id = "10000000-0000-4000-8000-000000000001";
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "note_revision_conflict" } });
  const form = new FormData(); form.set("note_id", id); form.set("version_id", id); form.set("expected_revision", "3");
  await expect(restoreNoteVersion(form)).rejects.toThrow("note_revision_conflict");
  expect(mocks.rpc).toHaveBeenCalledWith("mutate_note_atomic", expect.objectContaining({ p_expected_revision: 3, p_operation: "restore", p_note_id: id }));
});
