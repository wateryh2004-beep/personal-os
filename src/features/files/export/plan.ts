import { createHash } from "node:crypto";
import { maxExportRows, maxOriginalBytes, type ExportDocument, type ExportSource } from "./portable";
import { exportPlanFormat, maxExportPartBytes, maxExportParts, maxExportPlanMetadataBytes, type ExportCollectionDescriptor, type ExportPlan, type ExportPlanPart } from "./contract";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maxRowBytes = 2 * 1024 * 1024;
const archiveAllowance = 16 * 1024;
type DocumentBudget = { id: string; bytes: number; originalBytes: number; pending: boolean };

/** Metadata only. Holds bounded ID/size summaries, never originals or extracted-text rows. */
export async function createExportPlan(source: ExportSource, signal: AbortSignal, partBytes = maxExportPartBytes): Promise<ExportPlan> {
  if (!Number.isSafeInteger(partBytes) || partBytes < archiveAllowance || partBytes > maxExportPartBytes) throw new Error("files_export_invalid_part_budget");
  const metadata = createHash("sha256");
  let metadataBytes = 0;
  let rowCount = 0;
  let sharedBytes = archiveAllowance;
  const documents: DocumentBudget[] = [];
  const checksums = new Map<string, { count: number; bytes: number }>();
  const counts = { folders: 0, documents: 0, relationships: 0, objects: 0, objectBytes: 0, pending: 0 };
  const storage: ExportPlan["storage"] = { scope: "document_metadata_only_not_provider_usage", availableBytes: 0, archivedBytes: 0, pendingBytes: 0, totalLogicalBytes: 0, recordedChecksumDuplicateGroups: 0, possibleDuplicateBytes: 0 };
  for (const [kind, records] of [["folder", source.folders()], ["document", source.documents()], ["relationship", source.relationships()]] as const) {
    let previousId = "";
    for await (const row of records) {
      signal.throwIfAborted();
      if (!uuid.test(row.id) || row.id <= previousId) throw new Error("files_export_pagination_failed");
      previousId = row.id;
      const json = `${JSON.stringify(row)}\n`;
      const size = Buffer.byteLength(json);
      if (size > maxRowBytes) throw new Error("export_metadata_too_large");
      metadataBytes += size;
      if (++rowCount > maxExportRows || metadataBytes > maxExportPlanMetadataBytes) throw new Error("files_export_plan_budget_exceeded");
      metadata.update(`${kind}\0`).update(json);
      // Covers ustar header/padding, object header/padding and generated integrity metadata.
      const rowBytes = size + 3072;
      if (kind !== "document") {
        counts[kind === "folder" ? "folders" : "relationships"]++;
        sharedBytes += rowBytes;
        if (sharedBytes > partBytes) throw new Error("files_export_part_budget_exceeded");
        continue;
      }
      const document = row as ExportDocument;
      if (!Number.isSafeInteger(document.file_size) || document.file_size < 0 || document.file_size > maxOriginalBytes) throw new Error("export_invalid_size");
      const pending = document.storage_state === "pending";
      const cancelled = document.storage_state === "cancelled";
      counts.documents++;
      if (!cancelled) storage.totalLogicalBytes += document.file_size;
      if (pending) { counts.pending++; storage.pendingBytes += document.file_size; }
      else if (!cancelled) {
        counts.objects++;
        counts.objectBytes += document.file_size;
        storage[document.archived_at || document.storage_state === "archived" ? "archivedBytes" : "availableBytes"] += document.file_size;
        if (document.checksum && /^[a-f0-9]{64}$/i.test(document.checksum)) {
          const key = `${document.checksum.toLowerCase()}:${document.file_size}`;
          const entry = checksums.get(key) ?? { count: 0, bytes: document.file_size };
          entry.count++;
          checksums.set(key, entry);
        }
      }
      documents.push({ id: document.id, bytes: rowBytes + (pending || cancelled ? 0 : document.file_size), originalBytes: pending || cancelled ? 0 : document.file_size, pending });
    }
  }
  signal.throwIfAborted();
  for (const value of checksums.values()) {
    if (value.count > 1) { storage.recordedChecksumDuplicateGroups++; storage.possibleDuplicateBytes += (value.count - 1) * value.bytes; }
  }
  const parts: ExportPlanPart[] = [];
  function emptyPart(offset: number): ExportPlanPart {
    return { partIndex: parts.length + 1, documentOffset: offset, documentCount: 0, firstDocumentId: null, lastDocumentId: null, originalBytes: 0, pendingUploadOriginals: 0, estimatedBytes: sharedBytes, remainingDocuments: 0 };
  }
  let part = emptyPart(0);
  for (const document of documents) {
    if (sharedBytes + document.bytes > partBytes) throw new Error("files_export_part_budget_exceeded");
    if (part.documentCount && part.estimatedBytes + document.bytes > partBytes) {
      parts.push(part);
      if (parts.length >= maxExportParts) throw new Error("files_export_plan_budget_exceeded");
      part = emptyPart(part.documentOffset + part.documentCount);
    }
    part.documentCount++;
    part.firstDocumentId ??= document.id;
    part.lastDocumentId = document.id;
    part.originalBytes += document.originalBytes;
    part.pendingUploadOriginals += Number(document.pending);
    part.estimatedBytes += document.bytes;
  }
  parts.push(part);
  for (const value of parts) value.remainingDocuments = counts.documents - value.documentOffset - value.documentCount;
  const metadataSha256 = metadata.digest("hex");
  const limits = { maxPartBytes: partBytes, maxOriginalBytes, maxRows: maxExportRows, maxParts: maxExportParts, maxMetadataBytes: maxExportPlanMetadataBytes };
  const planId = createHash("sha256").update(JSON.stringify({ format: exportPlanFormat, metadataSha256, counts, limits, parts })).digest("hex");
  return { format: exportPlanFormat, planId, metadataSha256, counts, limits, parts, storage, consistency: "live_read_with_metadata_recheck_not_database_snapshot", downloadStatus: "not_verified" };
}

export function describeExportPart(plan: ExportPlan, partIndex: number): ExportCollectionDescriptor {
  const part = plan.parts[partIndex - 1];
  if (!Number.isSafeInteger(partIndex) || !part || part.partIndex !== partIndex) throw new Error("files_export_invalid_part");
  return { planId: plan.planId, metadataSha256: plan.metadataSha256, partIndex, partCount: plan.parts.length,
    documentOffset: part.documentOffset, documentCount: part.documentCount, totalDocuments: plan.counts.documents,
    originalBytes: part.originalBytes, totalOriginalBytes: plan.counts.objectBytes,
    pendingUploadOriginals: part.pendingUploadOriginals, totalPendingUploadOriginals: plan.counts.pending,
    firstDocumentId: part.firstDocumentId, lastDocumentId: part.lastDocumentId, remainingDocuments: part.remainingDocuments,
    sharedFolders: plan.counts.folders, sharedRelationships: plan.counts.relationships };
}

/** All shared metadata is repeated. Each document belongs to one deterministic range only. */
export function selectExportPart(source: ExportSource, part: ExportCollectionDescriptor): ExportSource {
  return {
    folders: () => source.folders(), relationships: () => source.relationships(),
    documents: async function* () {
      if (part.firstDocumentId === null || part.lastDocumentId === null) return;
      for await (const row of source.documents()) {
        if (row.id > part.lastDocumentId) return;
        if (row.id >= part.firstDocumentId) yield row;
      }
    },
    openObject: (document, signal) => source.openObject(document, signal),
  };
}

/** Public shape is stable; the full metadata baseline remains checked on every retry. */
export async function exportPlanMatches(source: ExportSource, signal: AbortSignal, plan: ExportPlan) {
  try { return (await createExportPlan(source, signal, plan.limits.maxPartBytes)).planId === plan.planId; }
  catch (error) {
    signal.throwIfAborted();
    if (error instanceof Error && ["files_export_plan_budget_exceeded", "files_export_part_budget_exceeded", "export_invalid_size", "export_metadata_too_large"].includes(error.message)) return false;
    throw error;
  }
}
