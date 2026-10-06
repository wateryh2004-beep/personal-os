"""Offline synthetic correctness tests for the standalone recovery command."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest
import tracemalloc
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("verify_files_export", ROOT / "scripts/verify-files-export.py")
VERIFIER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFIER)


def identifier(number):
    return f"00000000-0000-4000-8000-{number:012d}"


def document(number, folder=None, filename="report.txt", pending=False):
    content = f"synthetic original {number}\n".encode()
    return {"id": identifier(number), "title": "Fixture", "original_filename": filename,
            "folder_id": folder, "file_size": len(content), "storage_state": "pending" if pending else "available",
            "checksum": hashlib.sha256(content).hexdigest(), "archived_at": None}, content


def write_archive(path, docs, folders=(), relationships=(), part=None, descriptor_edit=None):
    """Emit the same regular-file ustar subset and entry digest as the exporter."""
    format_name = VERIFIER.PART_FORMAT if part else VERIFIER.FORMAT
    header = {"format": format_name}
    if part:
        header["collection"] = dict(part)
    rows = [("export.json", header)]
    rows.extend((f"folders/{folder['id']}.json", folder) for folder in folders)
    objects = 0
    object_bytes = 0
    pending = 0
    for row, content in docs:
        if row["storage_state"] == "pending":
            pending += 1
            obj = {"path": None, "bytes": None, "sha256": None, "status": "pending_upload"}
        else:
            objects += 1
            object_bytes += len(content)
            rows.append((f"objects/{row['id']}", content))
            obj = {"path": f"objects/{row['id']}", "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest(), "status": "verified"}
        rows.append((f"documents/{row['id']}.json", {**row, "object": obj}))
    rows.extend((f"relationships/{row['id']}.json", row) for row in relationships)
    counts = {"folders": len(folders), "documents": len(docs), "relationships": len(relationships), "objects": objects, "objectBytes": object_bytes, "pending": pending, "failed": 0}
    index = hashlib.sha256()
    with tarfile.open(path, "w", format=tarfile.USTAR_FORMAT) as archive:
        for name, value in rows:
            data = value if isinstance(value, bytes) else (json.dumps(value, ensure_ascii=False) + "\n").encode()
            index.update(f"{name}\0{len(data)}\0{hashlib.sha256(data).hexdigest()}\n".encode())
            entry = tarfile.TarInfo(name)
            entry.size = len(data)
            archive.addfile(entry, io.BytesIO(data))
        manifest = {"format": format_name, "status": "complete", "counts": counts, "entriesSha256": index.hexdigest(), "metadataStable": True, "exclusions": {"pendingUploadOriginals": pending}}
        if part:
            manifest.update(collection=dict(part), collectionComplete=part["partCount"] == 1)
            if descriptor_edit:
                manifest["collection"].update(descriptor_edit)
        data = (json.dumps(manifest) + "\n").encode()
        entry = tarfile.TarInfo("manifest.json")
        entry.size = len(data)
        archive.addfile(entry, io.BytesIO(data))
    return path


class RestoreExperienceTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="files-recovery-fixture-")
        self.root = Path(self.temporary.name)
        self.folders = [{"id": identifier(1), "name": "研究 / 报告", "parent_id": None, "archived_at": "2026-01-01"}, {"id": identifier(2), "name": "Week 1", "parent_id": identifier(1)}]
        self.docs = [document(10, identifier(2)), document(11, identifier(2)), document(12, pending=True)]
        self.relationships = [{"id": identifier(20), "source_type": "document", "source_id": identifier(10), "target_type": "document", "target_id": identifier(11)}, {"id": identifier(21), "source_type": "note", "source_id": identifier(22), "target_type": "document", "target_id": identifier(12)}]

    def tearDown(self):
        self.temporary.cleanup()

    def legacy(self, **options):
        return write_archive(self.root / "legacy.tar", options.pop("docs", self.docs), options.pop("folders", self.folders), options.pop("relationships", self.relationships), **options)

    def parts(self, groups=None, edits=None):
        groups = groups or [self.docs[:1], self.docs[1:]]
        total_bytes = sum(len(content) for row, content in self.docs if row["storage_state"] != "pending")
        total_pending = sum(row["storage_state"] == "pending" for row, _ in self.docs)
        paths = []
        offset = 0
        for part_index, docs in enumerate(groups, 1):
            descriptor = {"planId": "a" * 64, "metadataSha256": "b" * 64, "partIndex": part_index, "partCount": len(groups), "documentOffset": offset, "documentCount": len(docs), "totalDocuments": len(self.docs), "originalBytes": sum(len(content) for row, content in docs if row["storage_state"] != "pending"), "totalOriginalBytes": total_bytes, "pendingUploadOriginals": sum(row["storage_state"] == "pending" for row, _ in docs), "totalPendingUploadOriginals": total_pending, "firstDocumentId": docs[0][0]["id"] if docs else None, "lastDocumentId": docs[-1][0]["id"] if docs else None, "remainingDocuments": len(self.docs) - offset - len(docs), "sharedFolders": len(self.folders), "sharedRelationships": len(self.relationships)}
            descriptor.update((edits or {}).get(part_index, {}))
            path = self.root / f"part-{part_index}.tar"
            write_archive(path, docs, self.folders, self.relationships, part=descriptor)
            paths.append(path)
            offset += len(docs)
        return paths

    def assert_invalid(self, paths, message=None, status="corrupt", **options):
        with self.assertRaises(VERIFIER.InvalidExport) as raised:
            VERIFIER.verify(paths, **options)
        self.assertEqual(raised.exception.status, status)
        if message:
            self.assertIn(message, str(raised.exception))

    def test_named_view_preserves_metadata_bytes_and_saves_original_storage(self):
        self.docs[0][0]["original_filename"] = "财务 / report.txt"
        self.docs[1][0]["original_filename"] = "财务 / report.txt"
        target = self.root / "restored"
        result = VERIFIER.verify(self.legacy(), target, readable_tree=True)
        self.assertTrue(result["collectionComplete"])
        self.assertEqual(result["readableTree"]["files"], 2)
        mapping = [json.loads(line) for line in (target / "restore-map.jsonl").read_text().splitlines()]
        self.assertEqual(len(mapping), 3)
        self.assertNotEqual(mapping[0]["readablePath"], mapping[1]["readablePath"])
        self.assertIn("研究 _ 报告", mapping[0]["readablePath"])
        for (row, content), item in zip(self.docs, mapping):
            metadata = json.loads((target / "documents" / f"{row['id']}.json").read_text())
            self.assertEqual(metadata["original_filename"], row["original_filename"])
            self.assertEqual(item["originalFilename"], row["original_filename"])
            if item["readablePath"]:
                readable = target / item["readablePath"]
                original = target / item["objectPath"]
                self.assertEqual(readable.read_bytes(), content)
                self.assertEqual(readable.stat().st_ino, original.stat().st_ino)
            else:
                self.assertEqual(row["storage_state"], "pending")
        self.assertIn("share bytes", (target / "RESTORE-README.txt").read_text())
        self.assertEqual(json.loads((target / "restore-summary.json").read_text())["restoredTo"], str(target))
        self.assert_invalid(self.legacy(), status="restore_refused", restore_to=target)

    def test_default_restore_keeps_uuid_layout_and_readable_summary(self):
        target = self.root / "restored"
        result = VERIFIER.verify(self.legacy(), target)
        self.assertFalse((target / "readable").exists())
        self.assertTrue((target / "export.json").is_file())
        self.assertEqual(result["counts"]["pending"], 1)
        self.assertIn("Pending uploads: 1", (target / "RESTORE-README.txt").read_text())

    def test_summary_distinguishes_archive_state_and_observed_only_hashes(self):
        self.docs[0][0]["archived_at"] = "2026-01-01"
        self.docs[0][0]["storage_state"] = "archived"
        self.docs[1][0]["checksum"] = None
        result = VERIFIER.verify(self.legacy())
        self.assertEqual(result["archivedDocuments"], 1)
        self.assertEqual(result["integrity"], {"comparedWithRecordedSha256": 1, "observedSha256Only": 1})
        summary = VERIFIER.human_summary(result)
        self.assertIn("observed-only SHA-256: 1", summary)
        self.assertIn("Archived documents retained: 1", summary)

    def test_unsupported_hardlinks_refuse_without_publishing_then_allow_uuid_retry(self):
        archive = self.legacy()
        target = self.root / "restored"
        with patch.object(VERIFIER.os, "link", side_effect=OSError("not supported")):
            self.assert_invalid(archive, "hard-link support", status="restore_refused", restore_to=target, readable_tree=True)
        self.assertFalse(target.exists())
        self.assertEqual(list(self.root.glob(".files-restore-*")), [])
        self.assertTrue(VERIFIER.verify(archive, target)["collectionComplete"])

    def test_any_order_full_collection_restores_once_with_shared_metadata(self):
        paths = self.parts()
        target = self.root / "restored"
        result = VERIFIER.verify(paths[::-1], target, readable_tree=True)
        self.assertEqual(result["scope"], "complete_collection")
        self.assertEqual(result["counts"], {"documents": 3, "objects": 2, "objectBytes": 44, "pending": 1, "failed": 0, "folders": 2, "relationships": 2})
        self.assertEqual(result["externalRelationshipEndpoints"], 1)
        self.assertEqual(result["collection"]["verifiedParts"], [1, 2])
        self.assertEqual(result["collection"]["missingParts"], [])
        self.assertTrue((target / "parts/001/manifest.json").exists())
        self.assertTrue((target / "parts/002/export.json").exists())
        self.assertEqual(len(list((target / "documents").iterdir())), 3)
        self.assertEqual(len(list((target / "folders").iterdir())), 2)

    def test_one_part_is_valid_but_never_claims_collection_complete(self):
        paths = self.parts()
        result = VERIFIER.verify(paths[0])
        self.assertEqual(result["status"], "verified")
        self.assertFalse(result["collectionComplete"])
        self.assertEqual(result["scope"], "verified_parts_only")
        self.assertEqual(result["collection"]["missingParts"], [2])
        self.assertIn("COLLECTION INCOMPLETE", VERIFIER.human_summary(result))
        target = self.root / "restored"
        self.assert_invalid(paths[:1], status="incomplete_collection", restore_to=target)
        self.assertFalse(target.exists())
        self.assertEqual(list(self.root.glob(".files-restore-*")), [])
        self.assertTrue(VERIFIER.verify(paths, target)["collectionComplete"])

    def test_partial_collection_cli_has_distinct_nonzero_status(self):
        paths = self.parts()
        command = [sys.executable, str(ROOT / "scripts/verify-files-export.py"), str(paths[0])]
        run = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(run.returncode, 3)
        result = json.loads(run.stdout)
        self.assertEqual(result["status"], "verified")
        self.assertFalse(result["collectionComplete"])
        self.assertEqual(result["collection"]["verifiedParts"], [1])
        self.assertEqual(result["collection"]["missingParts"], [2])
        run = subprocess.run(command + ["--summary"], capture_output=True, text=True)
        self.assertEqual(run.returncode, 3)
        self.assertIn("COLLECTION INCOMPLETE", run.stdout)
        run = subprocess.run(command + [str(paths[1])], capture_output=True, text=True)
        self.assertEqual(run.returncode, 0)
        run = subprocess.run(command + ["--restore-to", str(self.root / "partial-restore")], capture_output=True, text=True)
        self.assertEqual(run.returncode, 1)

    def test_nonadjacent_parts_report_exact_missing_parts(self):
        paths = self.parts(groups=[[row] for row in self.docs])
        result = VERIFIER.verify([paths[2], paths[0]])
        self.assertEqual(result["collection"]["missingParts"], [2])
        self.assertEqual(result["collection"]["unprovidedDocuments"], 1)

    def test_different_collection_plans_do_not_combine(self):
        paths = self.parts(edits={2: {"planId": "c" * 64}})
        self.assert_invalid(paths, "different collection plans")

    def test_duplicate_part_does_not_inflate_completeness(self):
        paths = self.parts()
        self.assert_invalid([paths[0], paths[0]], "Duplicate document")

    def test_mismatched_shared_metadata_is_rejected(self):
        paths = self.parts()
        first = paths[0].read_bytes()
        self.folders[0]["name"] = "Updated during download"
        self.parts()
        paths[0].write_bytes(first)
        self.assert_invalid(paths, "Shared folder or relationship metadata differs")

    def test_header_manifest_descriptor_must_match(self):
        paths = self.parts()
        with tarfile.open(paths[0]) as archive:
            descriptor = json.load(archive.extractfile("export.json"))["collection"]
        write_archive(paths[0], self.docs[:1], self.folders, self.relationships, part=descriptor, descriptor_edit={"planId": "c" * 64})
        self.assert_invalid(paths, "descriptors differ")

    def test_document_order_and_ranges_are_checked(self):
        paths = self.parts(groups=[self.docs[::-1]])
        self.assert_invalid(paths, "ascending ID order")
        paths = self.parts(edits={2: {"firstDocumentId": identifier(999)}})
        self.assert_invalid(paths, "range differs")

    def test_offsets_and_collection_totals_are_checked(self):
        paths = self.parts(edits={2: {"documentOffset": 0, "remainingDocuments": 1}})
        self.assert_invalid(paths)
        paths = self.parts(edits={1: {"totalOriginalBytes": 100}, 2: {"totalOriginalBytes": 100}})
        self.assert_invalid(paths, "do not match totals")

    def test_one_empty_part_is_a_complete_empty_collection(self):
        self.docs = []
        self.relationships = []
        paths = self.parts(groups=[[]])
        result = VERIFIER.verify(paths, self.root / "restored", readable_tree=True)
        self.assertTrue(result["collectionComplete"])
        self.assertEqual(result["counts"]["documents"], 0)

    def test_legacy_and_partitioned_inputs_cannot_mix(self):
        self.assert_invalid([self.legacy(), self.parts()[0]], "Multiple inputs")

    def test_summary_cli_and_named_tree_requires_destination(self):
        archive = self.legacy()
        command = [sys.executable, str(ROOT / "scripts/verify-files-export.py"), str(archive)]
        run = subprocess.run(command + ["--summary"], capture_output=True, text=True, check=True)
        self.assertIn("Originals: 2 files", run.stdout)
        self.assertIn("metadata records only", run.stdout)
        run = subprocess.run(command + ["--readable-tree"], capture_output=True, text=True)
        self.assertEqual(run.returncode, 1)
        self.assertEqual(json.loads(run.stdout)["status"], "restore_refused")

    def test_original_stream_memory_stays_bounded(self):
        size = 64 * 1024 * 1024
        block = b"x" * (64 * 1024)
        digest = hashlib.sha256()
        for _ in range(size // len(block)):
            digest.update(block)
        row, _ = document(50)
        row.update(file_size=size, checksum=digest.hexdigest())
        obj = {"path": f"objects/{row['id']}", "bytes": size, "sha256": digest.hexdigest(), "status": "verified"}
        path = self.root / "large.tar"
        index = hashlib.sha256()

        class SyntheticStream:
            def read(self, length):
                return b"x" * length

        with tarfile.open(path, "w", format=tarfile.USTAR_FORMAT) as archive:
            records = [("export.json", {"format": VERIFIER.FORMAT}), (obj["path"], None), (f"documents/{row['id']}.json", {**row, "object": obj})]
            for name, value in records:
                data = json.dumps(value).encode() if value else None
                entry_size = len(data) if data else size
                entry_digest = hashlib.sha256(data).hexdigest() if data else digest.hexdigest()
                index.update(f"{name}\0{entry_size}\0{entry_digest}\n".encode())
                entry = tarfile.TarInfo(name)
                entry.size = entry_size
                archive.addfile(entry, io.BytesIO(data) if data else SyntheticStream())
            manifest = {"format": VERIFIER.FORMAT, "status": "complete", "metadataStable": True, "entriesSha256": index.hexdigest(), "counts": {"folders": 0, "documents": 1, "relationships": 0, "objects": 1, "objectBytes": size, "pending": 0, "failed": 0}, "exclusions": {"pendingUploadOriginals": 0}}
            data = json.dumps(manifest).encode()
            entry = tarfile.TarInfo("manifest.json")
            entry.size = len(data)
            archive.addfile(entry, io.BytesIO(data))
        tracemalloc.start()
        try:
            result = VERIFIER.verify(path, self.root / "restored", readable_tree=True)
            _, peak = tracemalloc.get_traced_memory()
        finally:
            tracemalloc.stop()
        self.assertEqual(result["counts"]["objectBytes"], size)
        self.assertLess(peak, 4 * 1024 * 1024, f"Verifier allocated {peak} bytes for a streamed original")

    def test_deep_folder_names_fall_back_without_losing_metadata(self):
        self.folders = [{"id": identifier(n), "name": "Folder", "parent_id": identifier(n - 1) if n > 1 else None} for n in range(1, 20)]
        self.docs = [document(30, identifier(19))]
        self.relationships = []
        target = self.root / "restored"
        result = VERIFIER.verify(self.legacy(), target, readable_tree=True)
        self.assertGreater(result["readableTree"]["flattenedDeepFolders"], 0)
        mapping = json.loads((target / "restore-map.jsonl").read_text())
        self.assertIn("_deep_folders", mapping["readablePath"])
        self.assertEqual(len(list((target / "folders").iterdir())), 19)


if __name__ == "__main__":
    unittest.main()
