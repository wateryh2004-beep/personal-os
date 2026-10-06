import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { verifyFileStream } from "@/features/files/integrity";
import { readAllFilePages } from "@/features/files/read-all-pages";
function stream(parts: string[]) { return new ReadableStream<Uint8Array>({ start(c) { for (const p of parts) c.enqueue(Buffer.from(p)); c.close(); } }); }
describe("Files integrity and complete retrieval", () => {
  it("hashes chunkwise and validates existing checksums", async () => {
    const checksum = createHash("sha256").update("hello").digest("hex");
    await expect(verifyFileStream(stream(["he", "ll", "o"]), 5, checksum)).resolves.toEqual({ size: 5, checksum });
  });
  it("rejects same-size corruption, truncated and excess bytes", async () => {
    await expect(verifyFileStream(stream(["hello"]), 5, "a".repeat(64))).rejects.toThrow("file_checksum_mismatch");
    await expect(verifyFileStream(stream(["he"]), 5)).rejects.toThrow("file_size_mismatch");
    await expect(verifyFileStream(stream(["hello!"]), 5)).rejects.toThrow("file_size_mismatch");
  });
  it("propagates interruption instead of returning a successful hash", async () => {
    await expect(verifyFileStream(new ReadableStream({ start(c) { c.error(new Error("interrupted")); } }), 5)).rejects.toThrow("interrupted");
  });
  it("continues through short capped pages, including archived item 51", async () => {
    const rows = Array.from({ length: 61 }, (_, i) => ({ id: String(i).padStart(3, "0") }));
    const result = await readAllFilePages(async after => ({ data: rows.filter(r => after === null || r.id > after).slice(0, 10), error: null }));
    expect(result).toEqual(rows);
  });
  it("fails closed on later page errors, loops, or safety-bound overflow", async () => {
    await expect(readAllFilePages(async after => after ? { data: null, error: "offline" } : { data: [{ id: "a" }], error: null })).rejects.toThrow("files_page_unavailable");
    await expect(readAllFilePages(async () => ({ data: [{ id: "a" }], error: null }))).rejects.toThrow("files_page_out_of_order");
    await expect(readAllFilePages(async () => ({ data: [{ id: "a" }, { id: "b" }], error: null }), 1)).rejects.toThrow("files_listing_limit");
  });
});
