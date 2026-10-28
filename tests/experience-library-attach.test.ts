import { beforeEach, expect, it, vi } from "vitest";

const userId = "11111111-1111-4111-8111-111111111111";
const entryId = "22222222-2222-4222-8222-222222222222";
const documentId = "33333333-3333-4333-8333-333333333333";
const state = vi.hoisted(() => ({ from: vi.fn(), stream: vi.fn(), writes: [] as unknown[] }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: async () => ({ userId, supabase: { from: state.from } }) }));
vi.mock("@/lib/adapters/cloudflare-r2", () => ({ readR2ObjectStream: state.stream }));
import { attachExperienceMedia } from "@/features/experience-library/actions";

function prepare(bytes: Uint8Array) {
  state.writes = [];
  state.stream.mockReset().mockResolvedValue({ size: bytes.length, body: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }) });
  state.from.mockImplementation((table: string) => {
    let ordered = false;
    const query = {
      select() { return query; }, eq() { return query; }, is() { return query; },
      order() { ordered = true; return query; }, limit() { return query; },
      insert(value: unknown) { state.writes.push({ table, value }); return table === "audit_logs" ? Promise.resolve({ error: null }) : query; },
      maybeSingle: async () => ({ error: null, data: table === "experience_library_entries" ? { id: entryId } : table === "documents" ? { id: documentId, storage_provider: "cloudflare_r2", storage_state: "available", archived_at: null, storage_path: `${userId}/files/${documentId}/sealed-test/test.png`, mime_type: "image/png", original_filename: "test.png", file_size: bytes.length } : ordered ? null : null }),
      single: async () => ({ data: { id: "44444444-4444-4444-8444-444444444444" }, error: null }),
    };
    return query;
  });
}
const input = { entryId, captureId: null, documentId, selectionStart: null, selectionEnd: null, selectionQuote: null, caption: null, sourceKind: "file" };
beforeEach(() => { state.from.mockReset(); });

it("only associates an available, owner-scoped sealed image after checking its actual bytes", async () => {
  prepare(Uint8Array.from([137,80,78,71,13,10,26,10,1,2]));
  await expect(attachExperienceMedia(input)).resolves.toMatchObject({ alreadyAttached: false });
  expect(state.writes.some((write) => (write as { table: string }).table === "experience_library_media")).toBe(true);
});

it("does not associate SVG bytes disguised as a PNG", async () => {
  prepare(new TextEncoder().encode("<svg onload=alert(1)>"));
  await expect(attachExperienceMedia(input)).rejects.toThrow("格式与内容不一致");
  expect(state.writes.some((write) => (write as { table: string }).table === "experience_library_media")).toBe(false);
});
