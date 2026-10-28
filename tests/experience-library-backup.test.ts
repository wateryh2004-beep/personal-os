import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { systemBackup } from "@/features/system-backup/export";
import { exportArchive, type ExportDocument } from "@/features/files/export/portable";
import { backupFixture, backupId, backupOwner, backupRow, backupSource, noArtwork } from "./helpers/system-backup-fixtures";

it("restores exact experience text, selected-image relation and original bytes from the two matching packages", async () => {
  const directory = mkdtempSync(path.join(realpathSync(tmpdir()), "experience-backup-"));
  try {
    const original = Buffer.from([137,80,78,71,13,10,26,10,1,2,3,4]);
    const rows = backupFixture();
    rows.documents = [backupRow("documents", 801, { title: "合成图片", original_filename: "synthetic.png", mime_type: "image/png", file_size: original.length, checksum: createHash("sha256").update(original).digest("hex"), storage_provider: "cloudflare_r2", storage_state: "available", storage_path: `${backupOwner}/files/${backupId(801)}/sealed-test/synthetic.png` })];
    rows.experience_library_entries = [backupRow("experience_library_entries", 802, { title: "合成经验", creation_request_id: backupId(805), tags: ["申请"] })];
    rows.experience_library_captures = [backupRow("experience_library_captures", 803, { entry_id: backupId(802), request_id: backupId(806), raw_content: "😀评论 GPA", capture_type: "comment", content_sha256: createHash("sha256").update("😀评论 GPA").digest("hex"), segments: [{ kind: "comment", text: "😀评论 GPA", start: 0, end: 8, label: "评论" }] })];
    rows.experience_library_media = [backupRow("experience_library_media", 804, { entry_id: backupId(802), capture_id: backupId(803), document_id: backupId(801), selection_start: 5, selection_end: 8, selection_quote: "GPA", source_kind: "clipboard" })];
    rows.experience_library_note_versions = [backupRow("experience_library_note_versions", 807, { entry_id: backupId(802), personal_note: "旧判断", review_status: "to_read" })];
    rows.experience_library_ocr_corrections = [backupRow("experience_library_ocr_corrections", 808, { media_id: backupId(804), document_id: backupId(801), text_content: "修订的截图文字", source_sha256: createHash("sha256").update(original).digest("hex") })];
    const snapshot: Uint8Array[] = [];
    for await (const chunk of systemBackup(backupSource(rows), backupOwner, new AbortController().signal, undefined, noArtwork())) snapshot.push(chunk);
    const snapshotPath = path.join(directory, "system.ndjson");
    writeFileSync(snapshotPath, Buffer.concat(snapshot));
    async function* exported(table: string) { for (const item of rows[table] ?? []) { if (table === "entity_links" && item.source_type !== "document" && item.target_type !== "document") continue; const { user_id: _owner, ...record } = item; void _owner; yield record as { id: string; [key: string]: unknown }; } }
    const archive: Uint8Array[] = [];
    for await (const chunk of exportArchive({ folders: () => exported("file_folders"), documents: () => exported("documents") as AsyncIterable<ExportDocument>, relationships: () => exported("entity_links"), openObject: async () => ({ body: new ReadableStream({ start(controller) { controller.enqueue(original); controller.close(); } }), size: original.length }) }, new AbortController().signal)) archive.push(chunk);
    const archivePath = path.join(directory, "files.tar");
    writeFileSync(archivePath, Buffer.concat(archive));
    const target = path.join(directory, "restore");
    const result = spawnSync("python3", ["scripts/verify-system-backup.py", snapshotPath, "--files", archivePath, "--restore-to", target], { encoding: "utf8" });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(readFileSync(path.join(target, "files/objects", backupId(801)))).toEqual(original);
    const query = spawnSync("python3", ["-c", "import sqlite3,sys,json; d=sqlite3.connect(sys.argv[1]); print(json.dumps(d.execute('select c.raw_content,m.selection_start,m.selection_end,m.selection_quote,m.document_id from experience_library_media m join experience_library_captures c on c.id=m.capture_id').fetchone(),ensure_ascii=False))", path.join(target, "system.sqlite3")], { encoding: "utf8" });
    expect(JSON.parse(query.stdout)).toEqual(["😀评论 GPA", 5, 8, "GPA", backupId(801)]);
    const derived = spawnSync("python3", ["-c", "import sqlite3,sys,json; d=sqlite3.connect(sys.argv[1]); print(json.dumps([d.execute('select personal_note from experience_library_note_versions').fetchone()[0],d.execute('select text_content from experience_library_ocr_corrections').fetchone()[0]],ensure_ascii=False))", path.join(target, "system.sqlite3")], { encoding: "utf8" });
    expect(JSON.parse(derived.stdout)).toEqual(["旧判断", "修订的截图文字"]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
