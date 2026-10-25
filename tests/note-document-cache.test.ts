import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNoteDocumentCache } from "@/features/notes/document-resource";
import { clearWorkspaceResources, reconcileWorkspaceScope } from "@/lib/workspace-resource-cache";
import type { NoteDocumentData } from "@/features/notes/queries";

const doc = (id: string, body = "正文", revision = 1) => ({ note: { id, title: id, body_markdown: body, revision }, attachments: [] }) as unknown as NoteDocumentData;
beforeEach(() => clearWorkspaceResources());
describe("private recent documents", () => {
  it("evicts inactive documents by count and byte budget while retaining active editors", async () => {
    const cache = createNoteDocumentCache(vi.fn());
    const active = cache.get("active"); const unsubscribe = active.subscribe(() => {}); active.set(doc("active"));
    for (let i = 0; i < 15; i++) { cache.get(String(i)).set(doc(String(i))); await Promise.resolve(); }
    expect(cache.inspect().count).toBeLessThanOrEqual(6);
    expect(cache.get("active").get().data?.note.id).toBe("active");
    cache.get("large").set(doc("large", "长".repeat(2 * 1024 * 1024)));
    await Promise.resolve();
    expect(cache.inspect().bytes).toBeLessThanOrEqual(3 * 1024 * 1024);
    unsubscribe();
  });
  it("releases a single oversized document when its editor unmounts", async () => {
    const cache = createNoteDocumentCache(vi.fn());
    const resource = cache.get("large"); const stop = resource.subscribe(() => {});
    resource.set(doc("large", "字".repeat(2 * 1024 * 1024))); await Promise.resolve();
    expect(resource.get().data).toBeDefined(); stop(); await Promise.resolve();
    expect(cache.inspect().bytes).toBe(0);
  });
  it("deduplicates background reads and never lets a late read undo a confirmed save", async () => {
    let resolve!: (value: NoteDocumentData) => void;
    const read = vi.fn(() => new Promise<NoteDocumentData>((done) => { resolve = done; }));
    const cache = createNoteDocumentCache(read); const resource = cache.get("one");
    resource.set(doc("one")); const old = resource.revalidate({ force: true });
    const same = resource.revalidate({ force: true }); expect(read).toHaveBeenCalledTimes(1);
    cache.saved("one", { title: "已保存", body: "不能回退" }, 2, "2026-10-25T00:00:00Z");
    resolve(doc("one")); await expect(old).rejects.toThrow("superseded"); await expect(same).rejects.toThrow("superseded");
    expect(resource.get().data?.note.body_markdown).toBe("不能回退");
    cache.saved("one", { title: "旧结果", body: "过时" }, 1, "2026-10-24T00:00:00Z");
    expect(resource.get().data?.note.revision).toBe(2);
  });
  it("clears both private bodies and positions at an owner boundary", () => {
    reconcileWorkspaceScope("owner-a", "1"); const cache = createNoteDocumentCache(vi.fn());
    const resource = cache.get("one"); resource.set(doc("one")); cache.remember("one", { reading: true, reader: { line: 44, offset: 2 } });
    reconcileWorkspaceScope("owner-b", "1");
    expect(resource.get().data).toBeUndefined(); expect(cache.position("one")).toBeUndefined();
  });
});
