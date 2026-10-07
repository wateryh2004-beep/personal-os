import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { systemBackup, backupJson, systemBackupStream } from "@/features/system-backup/export";
import { backupSchema, backupTables, validateBackupRow, type BackupRow } from "@/features/system-backup/contract";
import { exportArchive, type ExportDocument } from "@/features/files/export/portable";
import { backupOwner, backupId, backupRow, backupSource, backupFixture, noArtwork } from "./helpers/system-backup-fixtures";

const dirs: string[] = [];
function temp() { const dir = mkdtempSync(path.join(tmpdir(), "system-backup-test-")); dirs.push(dir); return dir; }
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
async function bytes(data: Record<string, BackupRow[]> = backupFixture()) {
  const chunks: Uint8Array[] = [];
  for await (const value of systemBackup(backupSource(data), backupOwner, new AbortController().signal, undefined, noArtwork())) chunks.push(value);
  return Buffer.concat(chunks);
}
function verify(file: string, args: string[] = []) {
  const result = spawnSync("python3", ["scripts/verify-system-backup.py", file, ...args], { encoding: "utf8" });
  if (!result.stdout) throw new Error(result.stderr);
  return { code: result.status, result: JSON.parse(result.stdout) };
}
function save(dir: string, data: Buffer) { const file = path.join(dir, "snapshot.ndjson"); writeFileSync(file, data); return file; }

async function filePackage(data: Record<string, BackupRow[]>, content: Buffer) {
  async function* rows(table: string) {
    for (const item of data[table] ?? []) { const { user_id: _owner, ...row } = item; void _owner; yield row as { id: string; [key: string]: unknown }; }
  }
  const source = { folders: () => rows("file_folders"), documents: () => rows("documents") as AsyncIterable<ExportDocument>, relationships: () => rows("entity_links"),
    openObject: async () => ({ body: new ReadableStream<Uint8Array>({ start(c) { c.enqueue(content); c.close(); } }), size: content.length }) };
  const chunks: Uint8Array[] = [];
  for await (const chunk of exportArchive(source, new AbortController().signal)) chunks.push(chunk);
  return Buffer.concat(chunks);
}

describe("Owner-scoped portable system snapshot and isolated recovery", () => {
  it("inventory explicitly includes or excludes every migrated table, no credential columns are selected", () => {
    const inventory = new Set([...Object.keys(backupTables), ...Object.keys(backupSchema.excludedTables)]);
    for (const name of readdirSync("supabase/migrations")) {
      const sql = readFileSync(path.join("supabase/migrations", name), "utf8");
      for (const match of sql.matchAll(/create table (?:if not exists )?public\.([a-z_]+)/gi)) expect(inventory.has(match[1]), match[1]).toBe(true);
    }
    expect(backupTables.notes.columns.body_markdown.type).toBe("string");
    for (const spec of Object.values(backupTables)) for (const column of Object.keys(spec.columns)) expect(column).not.toMatch(/ciphertext|refresh_token|api_key|password|delta_link/);
  });
  it("round-trips archived notes, nested folders, version history, relationships and exact decimal financial strings to SQLite", async () => {
    const dir = temp(); const destination = path.join(dir, "rehearsal");
    const { code, result } = verify(save(dir, await bytes()), ["--restore-to", destination]);
    expect(code, JSON.stringify(result)).toBe(0);
    expect(result.businessDataVerified).toBe(true); expect(result.productionRestoreVerified).toBe(false);
    expect(result.relationships.foreignKeyChecks).toBeGreaterThan(100);
    expect(readFileSync(path.join(destination, "notes", `${backupId(40)}.md`), "utf8")).toBe(backupFixture().notes[0].body_markdown);
    expect(readFileSync(path.join(destination, "note-versions", `${backupId(50)}.md`), "utf8")).toBe("第一版\n");
    const queried = spawnSync("python3", ["-c", "import sqlite3,sys,json; db=sqlite3.connect(sys.argv[1]); print(json.dumps([db.execute('SELECT quantity,price FROM investment_ledger').fetchone(), db.execute('SELECT status,deleted_at FROM notes').fetchone(),db.execute('SELECT COUNT(*) FROM note_versions').fetchone()]))", path.join(destination, "system.sqlite3")], { encoding: "utf8" });
    expect(JSON.parse(queried.stdout)).toEqual([["1234.00000001", "1.00000009"], ["trashed", "2026-10-06T00:00:00Z"], [2]]);
  });
  it("round-trips native PostgreSQL integral numeric JSON spellings without mistaking them for data changes", async () => {
    const input = (await bytes()).toString().trimEnd().split("\n");
    const footer = JSON.parse(input.pop()!);
    const lines = input.map(line => line.replace('"storage_budget_gib":12.5', '"storage_budget_gib":10.0').replaceAll('"position":1,', '"position":1.0,'));
    const hash = createHash("sha256");
    const tableHashes = new Map<string, ReturnType<typeof createHash>>();
    for (const line of lines) {
      hash.update(line + "\n");
      const row = JSON.parse(line);
      if (row.type === "row") { const digest = tableHashes.get(row.table) ?? createHash("sha256"); digest.update(line + "\n"); tableHashes.set(row.table, digest); }
    }
    for (const [table, digest] of tableHashes) footer.tables[table].sha256 = digest.digest("hex");
    footer.entriesSha256 = hash.digest("hex");
    const output = Buffer.from(lines.join("\n") + "\n" + backupJson(footer));
    const checked = verify(save(temp(), output));
    expect(checked.code, JSON.stringify(checked.result)).toBe(0);
  });
  it("pairs the full document, folder, relationship inventory with independently verified original bytes", async () => {
    const content = Buffer.from("synthetic-original-原件\n");
    const data = backupFixture(); data.file_folders = [backupRow("file_folders", 80)];
    data.documents = [backupRow("documents", 81, { folder_id: backupId(80), file_size: content.length, checksum: createHash("sha256").update(content).digest("hex"), storage_provider: "cloudflare_r2", storage_path: `${backupOwner}/fixture`, storage_state: "available", original_filename: "../unsafe-name.pdf", archived_at: "2026-10-07T00:00:00Z" })];
    data.document_reading_progress = [backupRow("document_reading_progress", 83, { document_id: backupId(81), source_version: data.documents[0].reading_source_version, page: 12, total_pages: 50 })];
    data.entity_links = [backupRow("entity_links", 82, { source_type: "note", source_id: backupId(40), target_type: "document", target_id: backupId(81) })];
    const dir = temp(); const file = save(dir, await bytes(data)); const tar = path.join(dir, "files.tar");
    writeFileSync(tar, await filePackage(data, content));
    expect(verify(file).code).toBe(3);
    const restored = path.join(dir, "with-originals");
    const { code, result } = verify(file, ["--files", tar, "--restore-to", restored]);
    expect(code, JSON.stringify(result)).toBe(0);
    expect(result.originals.verifiedOriginals).toBe(1);
    expect(readFileSync(path.join(restored, "files/objects", backupId(81)))).toEqual(content);
    data.documents[0].title = "changed-after-snapshot"; writeFileSync(tar, await filePackage(data, content));
    expect(verify(file, ["--files", tar]).result.status).toBe("inconsistent");
  });
  it("does not publish a recovery directory for truncation, corrupt bytes, unknown schema, extra records or missing foreign keys", async () => {
    const dir = temp(); const original = await bytes();
    for (const bad of [original.subarray(0, original.length - 15), Buffer.from(original.toString().replace("笔记 α", "损坏")), Buffer.concat([original, Buffer.from("{}\n")]), Buffer.from(original.toString().replace('"format":"personal-os-system/v1"', '"format":"unknown/v1"'))]) {
      const destination = path.join(dir, "must-not-exist"); const result = verify(save(dir, bad), ["--restore-to", destination]);
      expect(result.code).not.toBe(0); expect(readdirSync(dir)).not.toContain("must-not-exist");
    }
    const broken = backupFixture(); broken.projects = [];
    expect(verify(save(dir, await bytes(broken))).result.status).toBe("inconsistent");
  });
  it("refuses existing and symlink restore paths without modifying them", async () => {
    const dir = temp(); const file = save(dir, await bytes()); mkdirSync(path.join(dir, "existing"));
    writeFileSync(path.join(dir, "existing/keep.txt"), "keep"); symlinkSync(path.join(dir, "existing"), path.join(dir, "link"));
    for (const target of [path.join(dir, "existing"), path.join(dir, "link"), path.join(dir, "link/new")]) expect(verify(file, ["--restore-to", target]).result.status).toBe("restore_refused");
    expect(readFileSync(path.join(dir, "existing/keep.txt"), "utf8")).toBe("keep");
  });
  it("reports unresolved historical graph endpoints and legacy/pending original gaps without claiming complete recovery", async () => {
    const data = backupFixture(); data.entity_links[0].target_id = backupId(999);
    data.documents = [backupRow("documents", 84, { storage_provider: "supabase_storage", storage_state: "available" }), backupRow("documents", 85, { storage_provider: "cloudflare_r2", storage_state: "pending" })];
    const result = verify(save(temp(), await bytes(data)));
    expect(result.code).toBe(3); expect(result.result.relationships.unresolvedEndpoints).toBe(1);
    expect(result.result.originals.unsupportedProviderOriginals).toBe(1); expect(result.result.originals.pendingUploads).toBe(1);
  });
  it("keeps intentional upload cancellation recoverable as metadata without inventing original bytes", async () => {
    const data = backupFixture();
    data.documents = [backupRow("documents", 86, { storage_provider: "cloudflare_r2", storage_state: "cancelled", upload_mode: "multipart" })];
    const result = verify(save(temp(), await bytes(data)));
    expect(result.code, JSON.stringify(result.result)).toBe(0);
    expect(result.result.originals).toMatchObject({ verified: true, cancelledUploadsMetadataOnly: 1, pendingUploads: 0, verifiedOriginals: 0, missingDocuments: [] });
    data.documents[0].storage_state = "pending";
    const pending = verify(save(temp(), await bytes(data)));
    expect(pending.code).toBe(3); expect(pending.result.originals.missingDocuments[0]).toMatchObject({ id: backupId(86), provider: "cloudflare_r2", reason: "pending_upload_not_committed" });
  });
  it("detects mutation during the second read and omits success on source failures and aborts", async () => {
    let reads = 0; const data = backupFixture();
    const changed = async function* (table: string) { if (table === "notes") reads++; for (const row of data[table] ?? []) yield table === "notes" && reads > 1 ? { ...row, body_markdown: "changed" } : row; };
    const chunks: Buffer[] = []; for await (const chunk of systemBackup(changed, backupOwner, new AbortController().signal, undefined, noArtwork())) chunks.push(chunk);
    expect(verify(save(temp(), Buffer.concat(chunks))).result.status).toBe("incomplete");
    const failure = async function* () { throw new Error("private-provider-error"); yield {}; };
    await expect(new Response(systemBackupStream(failure, backupOwner, new AbortController().signal)).text()).rejects.toThrow("system_backup_interrupted");
    const abort = new AbortController(); abort.abort();
    await expect(new Response(systemBackupStream(backupSource(data), backupOwner, abort.signal)).text()).rejects.toThrow("system_backup_interrupted");
  });
  it("rejects cross-owner, extra columns, malformed key values, duplicate rows and oversized records", async () => {
    const valid = backupRow("notes", 1);
    for (const row of [{ ...valid, user_id: backupId(999) }, { ...valid, api_key: "fixture" }, { ...valid, id: "../../bad" }]) expect(() => validateBackupRow("notes", row, backupOwner)).toThrow();
    await expect(bytes({ notes: [valid, valid] })).rejects.toThrow("backup_pagination_failed");
    await expect(bytes({ notes: [{ ...valid, body_markdown: "x".repeat(8 * 1024 * 1024) }] })).rejects.toThrow("backup_size_limit");
    expect(backupJson({ b: 1, a: { b: true, a: "中文" } })).toBe('{"a":{"a":"中文","b":true},"b":1}\n');
  });
});
