import { createHash, randomUUID } from "node:crypto";
import { backupLimits, backupSchema, backupTables, rowKey, uuidPattern, validateBackupRow } from "./contract";
import type { BackupSource } from "./source";
import type { ArtworkBackup } from "./artwork";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, cell]) => [key, canonical(cell)]));
  return value;
}
export function backupJson(value: unknown) { return `${JSON.stringify(canonical(value))}\n`; }
const hash = () => createHash("sha256");
export type BackupTableSummary = { rows: number; sha256: string };

/** A streamed logical snapshot, checked by a second full owner-scoped read.
 * This detects drift, but cannot promise an atomic PostgreSQL transaction.
 * No complete footer is emitted if any source/size/shape/cancellation check fails.
 */
export async function* systemBackup(source: BackupSource, owner: string, signal: AbortSignal, startedAt = new Date().toISOString(), artwork?: ArtworkBackup) {
  if (!uuidPattern.test(owner)) throw new Error("backup_invalid_owner");
  let bytes = 0;
  let count = 0;
  const entries = hash();
  const summaries: Record<string, BackupTableSummary> = {};
  const schemaSha256 = hash().update(backupJson(backupSchema)).digest("hex");
  function encode(value: unknown, indexed = true) {
    const buffer = Buffer.from(backupJson(value));
    bytes += buffer.length;
    if (buffer.length > backupLimits.lineBytes || bytes > backupLimits.bytes) throw new Error("backup_size_limit");
    if (indexed) entries.update(buffer);
    return buffer;
  }
  signal.throwIfAborted();
  yield encode({ type: "header", format: backupSchema.format, exportId: randomUUID(), owner, startedAt, schema: backupSchema, schemaSha256,
    consistency: "two-pass-stable-read-not-transactional", originalBytes: "separate-files-portable-packages", encrypted: false, artwork: artwork?.inventory ?? { status: "unavailable", entries: [] } });
  for (const table of Object.keys(backupTables)) {
    const digest = hash();
    let rows = 0;
    let previous = "";
    for await (const row of source(table, signal)) {
      signal.throwIfAborted();
      validateBackupRow(table, row, owner);
      const key = rowKey(table, row);
      if (key <= previous) throw new Error("backup_pagination_failed");
      previous = key;
      if (++count > backupLimits.rows) throw new Error("backup_row_limit");
      const record = encode({ type: "row", table, row });
      if (bytes > backupLimits.dataBytes) throw new Error("backup_size_limit");
      digest.update(record); rows++;
      yield record;
    }
    summaries[table] = { rows, sha256: digest.digest("hex") };
  }
  let artworkCount = 0;
  let artworkBytes = 0;
  if (artwork) for await (const object of artwork.objects(signal)) {
    signal.throwIfAborted();
    if (++artworkCount > 64 || object.data.length > 5 * 1024 * 1024) throw new Error("backup_artwork_limit");
    artworkBytes += object.data.length;
    yield encode({ type: "artwork_object", path: object.path, bytes: object.bytes, sha256: object.sha256, data: object.data.toString("base64") });
  }
  let stable = artwork ? await artwork.stable(signal) : true;
  let verifiedRows = 0;
  let verifiedBytes = 0;
  for (const table of Object.keys(backupTables)) {
    const digest = hash();
    let rows = 0;
    let previous = "";
    for await (const row of source(table, signal)) {
      signal.throwIfAborted(); validateBackupRow(table, row, owner);
      const key = rowKey(table, row);
      if (key <= previous) throw new Error("backup_pagination_failed");
      previous = key;
      const record = Buffer.from(backupJson({ type: "row", table, row }));
      verifiedBytes += record.length;
      if (++verifiedRows > backupLimits.rows || record.length > backupLimits.lineBytes || verifiedBytes > backupLimits.dataBytes) throw new Error("backup_size_limit");
      digest.update(record); rows++;
    }
    stable = (rows === summaries[table].rows && digest.digest("hex") === summaries[table].sha256) && stable;
  }
  signal.throwIfAborted();
  yield encode({ type: "manifest", format: backupSchema.format, status: stable ? "complete" : "incomplete", startedAt, finishedAt: new Date().toISOString(),
    rows: count, tables: summaries, artworkObjects: artworkCount, artworkBytes, schemaSha256, entriesSha256: entries.digest("hex"), metadataStable: stable,
    issues: stable ? [] : ["data_changed_during_export"], assurance: "Logical data only; verify relationships and original packages offline. Checksums are not signatures. Not a production restore." }, false);
}

export function systemBackupStream(source: BackupSource, owner: string, requestSignal: AbortSignal, artwork?: ArtworkBackup) {
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, requestSignal]);
  const iterator = systemBackup(source, owner, signal, undefined, artwork);
  return new ReadableStream<Uint8Array>({
    async pull(stream) {
      try { const next = await iterator.next(); if (next.done) stream.close(); else stream.enqueue(next.value); }
      catch { controller.abort(); await iterator.return(undefined).catch(() => {}); stream.error(new Error("system_backup_interrupted")); }
    },
    async cancel() { controller.abort(); await iterator.return(undefined).catch(() => {}); },
  });
}
