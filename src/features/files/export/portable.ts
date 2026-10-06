import { createHash } from "node:crypto";

/** Portable v1 is an uncompressed ustar archive. No provider SDK or credentials here. */
export const exportFormat = "personal-os-files/v1";
export const exportPageSize = 25;
export const maxExportBytes = 512 * 1024 * 1024;
export const maxExportRows = 25_000;
export type ExportRow = { id: string; [key: string]: unknown };
export type ExportDocument = ExportRow & {
  storage_path: string; file_size: number; storage_state: string; checksum: string | null;
};
export type ExportSource = {
  folders(): AsyncIterable<ExportRow>;
  documents(): AsyncIterable<ExportDocument>;
  relationships(): AsyncIterable<ExportRow>;
  openObject(document: ExportDocument, signal: AbortSignal): Promise<{ body: ReadableStream<Uint8Array>; size: number }>;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const zeroBlock = Buffer.alloc(512);
const maxOriginalBytes = 100 * 1024 * 1024;
const maxMetadataBytes = 2 * 1024 * 1024;

function hash() { return createHash("sha256"); }
function jsonBytes(value: unknown) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  if (bytes.length > maxMetadataBytes) throw new Error("export_metadata_too_large");
  return bytes;
}
function assertId(id: string) { if (!uuid.test(id)) throw new Error("export_invalid_id"); }
function octal(header: Buffer, value: number, offset: number, length: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value.toString(8).length >= length) throw new Error("export_invalid_size");
  header.write(`${value.toString(8).padStart(length - 1, "0")}\0`, offset, length, "ascii");
}
export function tarHeader(name: string, size: number) {
  if (!/^[a-zA-Z0-9/._-]+$/.test(name) || name.length > 100 || name.includes("..")) throw new Error("export_invalid_path");
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "ascii");
  octal(header, 0o600, 100, 8); octal(header, 0, 108, 8); octal(header, 0, 116, 8);
  octal(header, size, 124, 12); octal(header, 0, 136, 12);
  header.fill(32, 148, 156); header.write("0", 156); header.write("ustar\0", 257); header.write("00", 263);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  return header;
}
function padding(size: number) { return zeroBlock.subarray(0, (512 - (size % 512)) % 512); }
function addEntryDigest(index: ReturnType<typeof hash>, path: string, size: number, digest: string) {
  index.update(`${path}\0${size}\0${digest}\n`);
}
function publicDocument(row: ExportDocument) {
  // Identity and provider location are deliberately omitted. No signed URLs are generated.
  const { storage_path: _path, user_id: _owner, storage_bucket: _bucket, ...metadata } = row;
  void _path; void _owner; void _bucket;
  return metadata;
}
function rowDigest(index: ReturnType<typeof hash>, kind: string, row: ExportRow) {
  index.update(`${kind}\0`); index.update(jsonBytes(row));
}
/** Conservative preflight prevents a normal bounded export from timing out on huge collections. */
export async function checkExportBudget(source: ExportSource, signal: AbortSignal) {
  let bytes = 16 * 1024;
  let rows = 0;
  for (const [kind, records] of [["folder", source.folders()], ["document", source.documents()], ["relationship", source.relationships()]] as const) {
    for await (const row of records) {
      signal.throwIfAborted();
      bytes += jsonBytes(row).length + 3072;
      if (kind === "document" && row.storage_state !== "pending") {
        const size = row.file_size;
        if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 0 || size > maxOriginalBytes) throw new Error("export_invalid_size");
        bytes += size;
      }
      rows++;
      if (bytes > maxExportBytes || rows > maxExportRows) throw new Error("files_export_budget_exceeded");
    }
  }
  return { bytes, rows };
}
async function sourceDigest(source: ExportSource, signal: AbortSignal) {
  const index = hash();
  let count = 0;
  for (const [kind, rows] of [["folder", source.folders()], ["document", source.documents()], ["relationship", source.relationships()]] as const) {
    for await (const row of rows) {
      signal.throwIfAborted();
      if (++count > maxExportRows) throw new Error("files_export_budget_exceeded");
      rowDigest(index, kind, row);
    }
  }
  return index.digest("hex");
}

/** One object/page at a time; no archive-sized array, Blob, or buffer. */
export async function* exportArchive(source: ExportSource, signal: AbortSignal, startedAt = new Date().toISOString()): AsyncGenerator<Uint8Array> {
  const entries = hash();
  const initialRows = hash();
  let reservedBytes = 4096;
  let rowCount = 0;
  function reserve(size: number, metadata = false) {
    reservedBytes += 512 + size + ((512 - size % 512) % 512);
    if (metadata) rowCount++;
    if (reservedBytes > maxExportBytes || rowCount > maxExportRows) throw new Error("files_export_budget_exceeded");
  }
  const counts = { folders: 0, documents: 0, relationships: 0, objects: 0, objectBytes: 0, pending: 0, failed: 0 };
  function* metadataEntry(path: string, value: unknown) {
    const bytes = jsonBytes(value);
    reserve(bytes.length, path !== "export.json");
    addEntryDigest(entries, path, bytes.length, hash().update(bytes).digest("hex"));
    yield tarHeader(path, bytes.length); yield bytes; yield padding(bytes.length);
  }
  yield* metadataEntry("export.json", {
    format: exportFormat, startedAt,
    scope: "owner_r2_documents_including_archived_and_note_attachments_pending_metadata_only",
    consistency: "live_read_with_second_metadata_scan_not_database_snapshot",
    relationships: "owner_entity_links_involving_documents_external_entities_not_exported",
    excluded: ["pending_upload_originals", "non_r2_originals", "other_domain_records", "auth", "credentials", "audit_history", "database_schema"],
  });
  for await (const folder of source.folders()) {
    signal.throwIfAborted(); assertId(folder.id); rowDigest(initialRows, "folder", folder);
    yield* metadataEntry(`folders/${folder.id}.json`, folder); counts.folders++;
  }
  for await (const document of source.documents()) {
    signal.throwIfAborted(); assertId(document.id); rowDigest(initialRows, "document", document);
    if (!Number.isSafeInteger(document.file_size) || document.file_size < 0 || document.file_size > maxOriginalBytes) throw new Error("export_invalid_size");
    counts.documents++;
    const pending = document.storage_state === "pending";
    if (pending) counts.pending++;
    let object: Awaited<ReturnType<ExportSource["openObject"]>> | undefined;
    let failure: string | null = null;
    if (!pending) {
      try { object = await source.openObject(document, signal); } catch { signal.throwIfAborted(); failure = "object_unreadable"; }
    }
    let digest: string | null = null;
    let observedSize = 0;
    if (object) {
      if (object.size !== document.file_size) {
        await object.body.cancel().catch(() => {}); failure = "size_mismatch";
      } else {
        const path = `objects/${document.id}`;
        const objectHash = hash();
        const reader = object.body.getReader();
        try {
          reserve(object.size);
          yield tarHeader(path, object.size);
          while (true) {
            signal.throwIfAborted();
            const { done, value } = await reader.read();
            if (done) break;
            observedSize += value.byteLength;
            // A stream failure after its tar header invalidates the entire archive.
            if (observedSize > object.size) throw new Error("export_object_changed");
            objectHash.update(value); yield value;
          }
          if (observedSize !== object.size) throw new Error("export_object_truncated");
          digest = objectHash.digest("hex");
          addEntryDigest(entries, path, observedSize, digest);
          yield padding(observedSize);
          counts.objects++; counts.objectBytes += observedSize;
          if (document.checksum && (!/^[a-f0-9]{64}$/i.test(document.checksum) || digest !== document.checksum.toLowerCase())) failure = "checksum_mismatch";
        } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      }
    }
    if (failure) counts.failed++;
    yield* metadataEntry(`documents/${document.id}.json`, {
      ...publicDocument(document),
      object: { path: digest ? `objects/${document.id}` : null, bytes: digest ? observedSize : null, sha256: digest,
        status: failure ?? (pending ? "pending_upload" : "verified"),
        integrity: digest ? document.checksum ? "compared_with_recorded_sha256" : "observed_sha256_only" : "unavailable" },
    });
  }
  for await (const relationship of source.relationships()) {
    signal.throwIfAborted(); assertId(relationship.id); rowDigest(initialRows, "relationship", relationship);
    yield* metadataEntry(`relationships/${relationship.id}.json`, relationship); counts.relationships++;
  }
  const metadataStable = initialRows.digest("hex") === await sourceDigest(source, signal);
  signal.throwIfAborted();
  const complete = counts.failed === 0 && metadataStable;
  const manifest = jsonBytes({
    format: exportFormat, status: complete ? "complete" : "incomplete", startedAt, finishedAt: new Date().toISOString(),
    counts, exclusions: { pendingUploadOriginals: counts.pending }, metadataStable, entriesSha256: entries.digest("hex"),
    issues: [...(counts.failed ? ["unverified_objects"] : []), ...(!metadataStable ? ["metadata_changed_during_export"] : [])],
    assurance: "Transport integrity only. SHA256 is not a signature, and this is not an atomic database backup.",
  });
  yield tarHeader("manifest.json", manifest.length); yield manifest; yield padding(manifest.length);
  yield zeroBlock; yield zeroBlock;
}

/** Cancellation propagates to the provider rather than finishing a disconnected download. */
export function archiveStream(source: ExportSource | ((signal: AbortSignal) => ExportSource), requestSignal: AbortSignal) {
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, requestSignal]);
  const iterator = exportArchive(typeof source === "function" ? source(signal) : source, signal);
  return new ReadableStream<Uint8Array>({
    async pull(stream) {
      try { const next = await iterator.next(); if (next.done) stream.close(); else stream.enqueue(next.value); }
      catch { controller.abort(); await iterator.return(undefined).catch(() => {}); stream.error(new Error("files_export_interrupted")); }
    },
    async cancel() { controller.abort(); await iterator.return(undefined).catch(() => {}); },
  });
}
