import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { exportArchive, type ExportDocument, type ExportRow, type ExportSource } from "@/features/files/export/portable";
import { createExportPlan, describeExportPart, exportPlanMatches, selectExportPart } from "@/features/files/export/plan";
import { exportPartFormat, maxExportPartBytes, maxExportParts } from "@/features/files/export/contract";

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
const original = Buffer.from("synthetic part original\n");
const sha = createHash("sha256").update(original).digest("hex");
const signal = () => new AbortController().signal;
const document = (value: number, extra: Partial<ExportDocument> = {}): ExportDocument => ({ id: id(value), storage_path: `owner/private/${value}`, file_size: original.length, storage_state: "available", checksum: sha, folder_id: id(90), title: `Fixture ${value}`, original_filename: `same-name.txt`, ...extra });
async function* rows<T>(values: T[]) { yield* values; }
function source(documents: ExportDocument[], folders: ExportRow[] = [{ id: id(90), name: "synthetic", parent_id: null }], relationships: ExportRow[] = []): ExportSource {
  return { documents: () => rows(documents), folders: () => rows(folders), relationships: () => rows(relationships),
    openObject: async () => ({ size: original.length, body: new ReadableStream({ start(controller) { controller.enqueue(original); controller.close(); } }) }) };
}
async function collect(value: ExportSource, plan: Awaited<ReturnType<typeof createExportPlan>>, partIndex: number) {
  const collection = describeExportPart(plan, partIndex);
  const chunks = [];
  for await (const chunk of exportArchive(selectExportPart(value, collection), signal(), "2026-10-06T00:00:00.000Z", { collection, maxBytes: plan.limits.maxPartBytes, verifyCollection: (sig) => exportPlanMatches(value, sig, plan) })) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
function entries(buffer: Buffer) {
  const result = new Map<string, Buffer>();
  for (let position = 0; position < buffer.length && buffer[position];) {
    const name = buffer.subarray(position, position + 100).toString().split("\0")[0];
    const size = parseInt(buffer.subarray(position + 124, position + 136).toString().replace(/\0/g, ""), 8);
    result.set(name, buffer.subarray(position + 512, position + 512 + size));
    position += 512 + size + ((512 - size % 512) % 512);
  }
  return result;
}

describe("Deterministic bounded Files export plans", () => {
  it("does not budget cancelled terminal metadata as stored or required original bytes", async () => {
    const plan = await createExportPlan(source([document(1, { storage_state: "cancelled" })]), new AbortController().signal);
    expect(plan.counts).toMatchObject({ documents: 1, objects: 0, objectBytes: 0, pending: 0 });
    expect(plan.storage).toMatchObject({ availableBytes: 0, pendingBytes: 0, totalLogicalBytes: 0 });
    expect(plan.parts[0].originalBytes).toBe(0);
  });
  it("plans more than 512 MiB into independently bounded parts without reading originals", async () => {
    const value = source(Array.from({ length: 6 }, (_, i) => document(i + 1, { file_size: 100 * 1024 * 1024 })));
    value.openObject = async () => { throw new Error("planning must not read an original"); };
    const plan = await createExportPlan(value, signal());
    expect(plan.counts.objectBytes).toBe(600 * 1024 * 1024);
    expect(plan.parts).toHaveLength(3);
    expect(plan.parts.map((part) => part.documentCount)).toEqual([2, 2, 2]);
    expect(plan.parts.map((part) => part.documentOffset)).toEqual([0, 2, 4]);
    expect(plan.parts.map((part) => part.remainingDocuments)).toEqual([4, 2, 0]);
    expect(plan.parts.every((part) => part.estimatedBytes <= maxExportPartBytes)).toBe(true);
    expect(plan).toEqual(await createExportPlan(value, signal()));
    expect(JSON.stringify(plan)).not.toContain("owner/private");
    expect(plan.downloadStatus).toBe("not_verified");
  });

  it("accounts logical states and only estimates duplicates from recorded hashes plus size", async () => {
    const plan = await createExportPlan(source([
      document(1), document(2, { archived_at: "2026-01-01" }),
      document(3, { storage_state: "pending" }), document(4, { checksum: null }),
      document(5, { checksum: "bad", file_size: 2 }),
    ]), signal());
    expect(plan.storage).toEqual({ scope: "document_metadata_only_not_provider_usage", availableBytes: original.length * 2 + 2, archivedBytes: original.length, pendingBytes: original.length, totalLogicalBytes: original.length * 4 + 2, recordedChecksumDuplicateGroups: 1, possibleDuplicateBytes: original.length });
    expect(plan.counts).toMatchObject({ documents: 5, objects: 4, pending: 1, objectBytes: original.length * 3 + 2 });
  });

  it("binds retries to all metadata, including an unselected document and shared relationships", async () => {
    const documents = [document(1), document(2)];
    const value = source(documents);
    const plan = await createExportPlan(value, signal(), 24 * 1024);
    expect(plan.parts).toHaveLength(2);
    expect(await exportPlanMatches(value, signal(), plan)).toBe(true);
    documents[1] = { ...documents[1], title: "changed outside first part" };
    expect(await exportPlanMatches(value, signal(), plan)).toBe(false);
    expect((await createExportPlan(value, signal(), 24 * 1024)).planId).not.toBe(plan.planId);
  });

  it("has one explicit empty part and rejects invalid indices, oversize originals, unsorted rows and plan overflow", async () => {
    const plan = await createExportPlan(source([], []), signal());
    expect(plan.parts).toEqual([{ partIndex: 1, documentOffset: 0, documentCount: 0, firstDocumentId: null, lastDocumentId: null, originalBytes: 0, pendingUploadOriginals: 0, estimatedBytes: 16 * 1024, remainingDocuments: 0 }]);
    expect(() => describeExportPart(plan, 0)).toThrow("files_export_invalid_part");
    expect(() => describeExportPart(plan, 1.5)).toThrow("files_export_invalid_part");
    expect(() => describeExportPart(plan, 2)).toThrow("files_export_invalid_part");
    await expect(createExportPlan(source([document(1, { file_size: 101 * 1024 * 1024 })]), signal())).rejects.toThrow("export_invalid_size");
    await expect(createExportPlan(source([document(2), document(1)]), signal())).rejects.toThrow("files_export_pagination_failed");
    await expect(createExportPlan(source(Array.from({ length: maxExportParts * 2 + 1 }, (_, i) => document(i + 1, { file_size: 100 * 1024 * 1024 }))), signal())).rejects.toThrow("files_export_plan_budget_exceeded");
    await expect(createExportPlan(source(Array.from({ length: 25_001 }, (_, i) => document(i + 1))), signal())).rejects.toThrow("files_export_plan_budget_exceeded");
  });

  it("exports independent exact-byte parts without claiming one part completes a collection, and verifies the full set", async () => {
    const value = source([document(1), document(2), document(3, { storage_state: "pending" })]);
    const plan = await createExportPlan(value, signal(), 24 * 1024);
    expect(plan.parts.length).toBe(3);
    const directory = await mkdtemp(join(tmpdir(), "files-part-plan-"));
    try {
      const paths = [];
      for (const part of plan.parts) {
        const buffer = await collect(value, plan, part.partIndex);
        expect(buffer.length).toBeLessThanOrEqual(part.estimatedBytes);
        const records = entries(buffer);
        const header = JSON.parse(records.get("export.json")!.toString());
        const manifest = JSON.parse(records.get("manifest.json")!.toString());
        expect(header.format).toBe(exportPartFormat);
        expect(manifest).toMatchObject({ format: exportPartFormat, status: "complete", metadataStable: true, collectionComplete: false, collection: header.collection, counts: { documents: 1, folders: 1 } });
        expect(records.has(`documents/${part.firstDocumentId}.json`)).toBe(true);
        if (part.partIndex !== 3) expect(records.get(`objects/${part.firstDocumentId}`)).toEqual(original);
        const path = join(directory, `part-${part.partIndex}.tar`);
        await writeFile(path, buffer); paths.push(path);
      }
      const partial = spawnSync("python3", ["scripts/verify-files-export.py", paths[0]], { encoding: "utf8" });
      expect(partial.status, partial.stdout + partial.stderr).toBe(3);
      expect(JSON.parse(partial.stdout)).toMatchObject({ status: "verified", collectionComplete: false });
      const full = spawnSync("python3", ["scripts/verify-files-export.py", ...paths.reverse()], { encoding: "utf8" });
      expect(full.status, full.stdout + full.stderr).toBe(0);
      expect(JSON.parse(full.stdout)).toMatchObject({ status: "verified", collectionComplete: true, counts: { documents: 3, folders: 1, objects: 2, pending: 1 } });
      // Retry only a failed download: unchanged plan produces the same membership and original bytes.
      expect(entries(await collect(value, plan, 1)).get(`objects/${id(1)}`)).toEqual(original);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it("visibly marks a part incomplete when metadata outside that part drifts during streaming", async () => {
    const documents = [document(1), document(2)];
    const value = source(documents);
    const openObject = value.openObject;
    const plan = await createExportPlan(value, signal(), 24 * 1024);
    value.openObject = async (row, sig) => { documents[1] = { ...documents[1], title: "changed while downloading first part" }; return openObject(row, sig); };
    const manifest = JSON.parse(entries(await collect(value, plan, 1)).get("manifest.json")!.toString());
    expect(manifest).toMatchObject({ status: "incomplete", metadataStable: false, collectionComplete: false, issues: ["metadata_changed_during_export"] });
  });
});
