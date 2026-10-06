import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile, access, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { archiveStream, checkExportBudget, exportArchive, maxExportBytes, maxExportRows, tarHeader, type ExportDocument, type ExportRow, type ExportSource } from "@/features/files/export/portable";

const id = (number: number) => `00000000-0000-4000-8000-${number.toString().padStart(12, "0")}`;
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const bytes = Buffer.from("synthetic original only\n\u0000\ufffd", "utf8");
const document: ExportDocument = { id: id(3), title: "合成 / 文件", original_filename: "../../sample.txt", storage_path: "owner/files/original", storage_state: "available", file_size: bytes.length, checksum: sha(bytes), folder_id: id(2), archived_at: null };
async function* rows<T>(values: T[]) { yield* values; }
function source(options: { documents?: ExportDocument[]; folders?: ExportRow[]; relationships?: ExportRow[]; openObject?: ExportSource["openObject"] } = {}): ExportSource {
  return {
    documents: () => rows(options.documents ?? [document]),
    folders: () => rows(options.folders ?? [{ id: id(1), name: "root", parent_id: null }, { id: id(2), name: "child", parent_id: id(1) }]),
    relationships: () => rows(options.relationships ?? [{ id: id(4), source_type: "note", source_id: id(5), target_type: "document", target_id: id(3), relationship_type: "attachment", created_via: "system", metadata: { provenance: "synthetic-fixture" }, archived_at: null }]),
    openObject: options.openObject ?? (async () => ({ size: bytes.length, body: new ReadableStream({ start(controller) { controller.enqueue(bytes.subarray(0, 4)); controller.enqueue(bytes.subarray(4)); controller.close(); } }) })),
  };
}
async function archive(value = source()) {
  const chunks = [];
  for await (const chunk of exportArchive(value, new AbortController().signal, "2026-10-06T00:00:00.000Z")) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
function entries(buffer: Buffer) {
  const result: { name: string; start: number; end: number; content: Buffer }[] = [];
  for (let offset = 0; offset + 512 <= buffer.length && buffer[offset] !== 0;) {
    const name = buffer.subarray(offset, offset + 100).toString().split("\0")[0];
    const size = parseInt(buffer.subarray(offset + 124, offset + 136).toString().replace(/\0/g, ""), 8);
    const end = offset + 512 + size + ((512 - size % 512) % 512);
    result.push({ name, start: offset, end, content: buffer.subarray(offset + 512, offset + 512 + size) });
    offset = end;
  }
  return result;
}
async function verify(buffer: Buffer, restore = false) {
  const dir = await mkdtemp(join(tmpdir(), "files-export-test-"));
  const path = join(dir, "fixture.tar");
  await writeFile(path, buffer);
  const target = join(dir, "restored");
  const run = () => spawnSync("python3", ["scripts/verify-files-export.py", path, ...(restore ? ["--restore-to", target] : [])], { encoding: "utf8" });
  return { dir, target, path, run, result: run() };
}

describe("Portable Files archive", () => {
  it("roundtrips exact original bytes, nested/archived folders, metadata, and external relationships in isolation", async () => {
    const buffer = await archive(source({ documents: [{ ...document, archived_at: "2026-01-01", storage_state: "archived" }] }));
    const fixture = await verify(buffer, true);
    try {
      expect(fixture.result.status, fixture.result.stdout + fixture.result.stderr).toBe(0);
      expect(JSON.parse(fixture.result.stdout)).toMatchObject({ status: "verified", counts: { documents: 1, folders: 2, relationships: 1, objects: 1 }, externalRelationshipEndpoints: 1 });
      expect(await readFile(join(fixture.target, "objects", document.id))).toEqual(bytes);
      const metadata = JSON.parse(await readFile(join(fixture.target, "documents", `${document.id}.json`), "utf8"));
      expect(metadata.original_filename).toBe("../../sample.txt");
      expect(metadata.storage_path).toBeUndefined();
      expect(metadata.object.sha256).toBe(sha(bytes));
      const relationship = JSON.parse(await readFile(join(fixture.target, "relationships", `${id(4)}.json`), "utf8"));
      expect(relationship).toMatchObject({ created_via: "system", metadata: { provenance: "synthetic-fixture" } });
      expect(fixture.run().status).toBe(1); // Retry cannot overwrite the first verified restore.
    } finally { await rm(fixture.dir, { recursive: true, force: true }); }
  });

  it("excludes pending originals explicitly while allowing a complete finalized-files export", async () => {
    const value = source({ documents: [{ ...document, storage_state: "pending" }], openObject: async () => { throw new Error("must not read pending object"); } });
    const fixture = await verify(await archive(value), true);
    try {
      expect(fixture.result.status, fixture.result.stdout).toBe(0);
      expect(JSON.parse(fixture.result.stdout).counts).toMatchObject({ pending: 1, failed: 0, objects: 0 });
    } finally { await rm(fixture.dir, { recursive: true, force: true }); }
  });

  it("preserves legacy originals with an observed hash without claiming a recorded baseline", async () => {
    const buffer = await archive(source({ documents: [{ ...document, checksum: null }] }));
    const meta = JSON.parse(entries(buffer).find((entry) => entry.name.startsWith("documents/"))!.content.toString());
    expect(meta.object.integrity).toBe("observed_sha256_only");
  });

  it("marks a missing object incomplete and allows a clean retry into the same new restore path", async () => {
    const failed = await archive(source({ openObject: async () => { throw new Error("provider secret must not be exposed"); } }));
    expect(failed.toString()).not.toContain("provider secret");
    const fixture = await verify(failed, true);
    try {
      expect(fixture.result.status).toBe(1);
      expect(JSON.parse(fixture.result.stdout).status).toBe("incomplete");
      await expect(access(fixture.target)).rejects.toThrow();
      await writeFile(fixture.path, await archive());
      expect(fixture.run().status).toBe(0);
    } finally { await rm(fixture.dir, { recursive: true, force: true }); }
  });

  it("reports a known checksum mismatch as incomplete rather than verified", async () => {
    const fixture = await verify(await archive(source({ documents: [{ ...document, checksum: "0".repeat(64) }] })));
    try { expect(JSON.parse(fixture.result.stdout).status).toBe("incomplete"); } finally { await rm(fixture.dir, { recursive: true, force: true }); }
  });

  it("detects payload corruption, missing originals, bad folder relations, and truncated completion", async () => {
    const good = await archive();
    const original = entries(good).find((entry) => entry.name.startsWith("objects/"))!;
    const corrupted = Buffer.from(good); corrupted[original.start + 512] ^= 1;
    const missing = Buffer.concat([good.subarray(0, original.start), good.subarray(original.end)]);
    const brokenFolder = await archive(source({ folders: [{ id: id(2), name: "orphan", parent_id: id(99) }] }));
    const cyclicFolders = await archive(source({ folders: [{ id: id(2), name: "cycle", parent_id: id(2) }] }));
    for (const [buffer, status] of [[corrupted, "corrupt"], [missing, "corrupt"], [brokenFolder, "corrupt"], [cyclicFolders, "corrupt"], [good.subarray(0, original.end), "interrupted"], [good.subarray(0, -512), "interrupted"]] as const) {
      const fixture = await verify(buffer);
      try { expect(JSON.parse(fixture.result.stdout).status, fixture.result.stdout).toBe(status); } finally { await rm(fixture.dir, { recursive: true, force: true }); }
    }
  });

  it("catches metadata drift during the live scan", async () => {
    const value = source(); let scans = 0;
    value.documents = () => rows([{ ...document, title: ++scans === 1 ? "before" : "after" }]);
    const fixture = await verify(await archive(value));
    try { expect(JSON.parse(fixture.result.stdout).status).toBe("incomplete"); } finally { await rm(fixture.dir, { recursive: true, force: true }); }
  });

  it("aborts a shorter/longer object stream and never writes a completion marker", async () => {
    for (const chunk of [bytes.subarray(1), Buffer.concat([bytes, Buffer.from("x")])]) {
      const value = source({ openObject: async () => ({ size: bytes.length, body: new ReadableStream({ start(controller) { controller.enqueue(chunk); controller.close(); } }) }) });
      await expect(archive(value)).rejects.toThrow(/export_object_/);
      await expect(new Response(archiveStream(value, new AbortController().signal)).arrayBuffer()).rejects.toThrow("files_export_interrupted");
    }
  });

  it("rejects unsafe tar paths, impossible sizes, and oversized preflight without reading originals", async () => {
    expect(() => tarHeader("../unsafe", 2)).toThrow();
    expect(() => tarHeader("objects/test", -1)).toThrow();
    await expect(checkExportBudget(source({ documents: Array.from({ length: 6 }, (_, i) => ({ ...document, id: id(i + 10), file_size: Math.floor(maxExportBytes / 6) })) }), new AbortController().signal)).rejects.toThrow("files_export_budget_exceeded");
  });

  it("verifies a genuinely empty collection", async () => {
    const fixture = await verify(await archive(source({ documents: [], folders: [], relationships: [] })));
    try { expect(fixture.result.status, fixture.result.stdout).toBe(0); } finally { await rm(fixture.dir, { recursive: true, force: true }); }
  });

  it("rejects special tar headers before parsing their payload and oversized zero suffixes before reading", async () => {
    const special = Buffer.from(tarHeader("export.json", 1024 * 1024 * 1024)); special[156] = "x".charCodeAt(0);
    const hostile = await verify(Buffer.concat([special, Buffer.alloc(1024)]));
    try { expect(JSON.parse(hostile.result.stdout)).toMatchObject({ status: "corrupt", error: "Special tar entries are not allowed" }); }
    finally { await rm(hostile.dir, { recursive: true, force: true }); }
    const fixture = await verify(await archive());
    try {
      const handle = await open(fixture.path, "r+");
      try { await handle.truncate(maxExportBytes + 512); } finally { await handle.close(); }
      expect(JSON.parse(fixture.run().stdout)).toMatchObject({ status: "corrupt", error: "Archive exceeds verifier safety limit" });
    } finally { await rm(fixture.dir, { recursive: true, force: true }); }
  });

  it("enforces the row budget during streaming even without a preflight", async () => {
    const value = source({ documents: [], relationships: [] });
    value.folders = async function* () { for (let i = 0; i <= maxExportRows; i++) yield { id: id(i), name: "fixture", parent_id: null }; };
    await expect((async () => { for await (const chunk of exportArchive(value, new AbortController().signal)) void chunk; })()).rejects.toThrow("files_export_budget_exceeded");
  });

  it("stops work on client cancellation", async () => {
    let cancelled = false;
    const value = source({ openObject: async () => ({ size: bytes.length, body: new ReadableStream({ pull(controller) { controller.enqueue(bytes); }, cancel() { cancelled = true; } }) }) });
    const reader = archiveStream(value, new AbortController().signal).getReader();
    for (let index = 0; index < 11; index++) await reader.read();
    await reader.cancel();
    expect(cancelled).toBe(true);
  });
});
