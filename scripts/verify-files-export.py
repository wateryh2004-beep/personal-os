#!/usr/bin/env python3
"""Offline Files v1 verifier and isolated restore rehearsal. Standard library only.

Never connects to a provider/database, overwrites a directory, or executes originals.
The restored tree is a portable staging tree, NOT a production database restore.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
import unicodedata
from types import SimpleNamespace

FORMAT = "personal-os-files/v1"
PART_FORMAT = "personal-os-files-part/v1"
UUID = r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
PATH = re.compile(rf"(?:export\.json|manifest\.json|(?:folders|documents|relationships)/{UUID}\.json|objects/{UUID})\Z")
MAX_JSON = 2 * 1024 * 1024
MAX_BYTES = 512 * 1024 * 1024
MAX_ROWS = 25_000
MAX_PARTS = 256
HEX_SHA = re.compile(r"[0-9a-f]{64}\Z")


class InvalidExport(Exception):
    def __init__(self, status, message):
        self.status = status
        super().__init__(message)


def require(condition, message, status="corrupt"):
    if not condition:
        raise InvalidExport(status, message)


def read_json(raw, label):
    try:
        value = json.loads(raw)
    except (ValueError, UnicodeDecodeError) as error:
        raise InvalidExport("corrupt", f"Invalid JSON: {label}") from error
    require(isinstance(value, dict), f"Expected JSON object: {label}")
    return value


def verify(archive_paths, restore_to=None, readable_tree=False):
    archives = [archive_paths] if isinstance(archive_paths, (str, os.PathLike)) else list(archive_paths)
    require(1 <= len(archives) <= MAX_PARTS, "Provide between 1 and 256 archives")
    target = Path(restore_to).absolute() if restore_to else None
    staging = None
    if target:
        require(not target.exists() and not target.is_symlink(), "Restore target already exists; choose a new isolated directory", "restore_refused")
        require(target.parent.is_dir(), "Restore parent directory must exist", "restore_refused")
        staging = Path(tempfile.mkdtemp(prefix=".files-restore-", dir=target.parent))
    try:
        results = []
        document_ids = set()
        shared_digest = None
        relationship_endpoints = set()
        for slot, archive in enumerate(archives, 1):
            part_staging = staging / f".part-{slot:03d}" if staging else None
            if part_staging:
                part_staging.mkdir()
            try:
                result = inspect_archive(archive, part_staging)
            except InvalidExport as error:
                if len(archives) > 1:
                    raise InvalidExport(error.status, f"Input {slot} ({Path(archive).name}): {error}") from error
                raise
            require(len(archives) == 1 or result["format"] == PART_FORMAT, "Multiple inputs must be parts of one collection")
            require(not document_ids.intersection(result["_documentIds"]), "Duplicate document across collection parts")
            document_ids.update(result.pop("_documentIds"))
            require(len(document_ids) <= MAX_ROWS, "Collection exceeds verifier row limit")
            current_digest = result.pop("_sharedDigest")
            if shared_digest is None:
                shared_digest = current_digest
                relationship_endpoints = result.pop("_relationshipEndpoints")
            else:
                require(current_digest == shared_digest, "Shared folder or relationship metadata differs between parts")
                result.pop("_relationshipEndpoints")
            require(len(document_ids) + result["counts"]["folders"] + result["counts"]["relationships"] <= MAX_ROWS, "Collection exceeds verifier row limit")
            if part_staging:
                merge_verified_part(part_staging, staging, result)
            results.append(result)
        result = collection_result(results, document_ids, relationship_endpoints)
        if target:
            if not result["collectionComplete"]:
                missing = ", ".join(map(str, result["collection"]["missingParts"]))
                raise InvalidExport("incomplete_collection", f"Collection is incomplete. Missing parts: {missing}. Provide every part before restore; no target directory was published.")
            if readable_tree:
                result["readableTree"] = make_readable_tree(staging)
            result["restoredTo"] = str(target)
            write_restore_summary(staging, result)
            # Never merge into an existing directory; use a trusted local parent.
            require(not target.exists() and not target.is_symlink(), "Restore target appeared during verification", "restore_refused")
            os.rename(staging, target)
            staging = None
        return result
    finally:
        if staging:
            shutil.rmtree(staging)


def merge_verified_part(source, staging, result):
    """Move unique originals once; repeated shared metadata is already hash-checked."""
    headers = staging
    if result["format"] == PART_FORMAT:
        headers = staging / "parts" / f"{result['collection']['partIndex']:03d}"
        require(not headers.exists(), "Duplicate collection part index")
        headers.mkdir(parents=True)
    for name in ("export.json", "manifest.json"):
        os.rename(source / name, headers / name)
    for kind in ("objects", "documents", "folders", "relationships"):
        directory = source / kind
        if not directory.exists():
            continue
        destination = staging / kind
        destination.mkdir(exist_ok=True)
        for path in directory.iterdir():
            final_path = destination / path.name
            if final_path.exists():
                require(kind in ("folders", "relationships"), "Duplicate original or document across parts")
            else:
                os.rename(path, final_path)
    shutil.rmtree(source)


def collection_result(results, document_ids, relationship_endpoints):
    if results[0]["format"] == FORMAT:
        require(len(results) == 1, "A legacy archive cannot be combined with collection parts")
        result = results[0]
        result["collectionComplete"] = True
        return result
    require(all(result["format"] == PART_FORMAT for result in results), "Cannot mix legacy and partitioned archives")
    ordered = sorted(results, key=lambda result: result["collection"]["partIndex"])
    first = ordered[0]["collection"]
    global_fields = ("planId", "metadataSha256", "partCount", "totalDocuments", "totalOriginalBytes", "totalPendingUploadOriginals", "sharedFolders", "sharedRelationships")
    indexes = set()
    previous = None
    for result in ordered:
        part = result["collection"]
        require(all(part[field] == first[field] for field in global_fields), "Inputs belong to different collection plans or totals")
        require(part["partIndex"] not in indexes, "Duplicate collection part index")
        indexes.add(part["partIndex"])
        if previous:
            require(part["documentOffset"] >= previous["documentOffset"] + previous["documentCount"], "Collection document offsets overlap")
            require(previous["lastDocumentId"].lower() < part["firstDocumentId"].lower(), "Collection document ranges overlap or are out of order")
            if part["partIndex"] == previous["partIndex"] + 1:
                require(part["documentOffset"] == previous["documentOffset"] + previous["documentCount"], "Adjacent collection part offsets are not contiguous")
        previous = part
    counts = {key: sum(result["counts"][key] for result in ordered) for key in ("documents", "objects", "objectBytes", "pending", "failed")}
    counts.update(folders=first["sharedFolders"], relationships=first["sharedRelationships"])
    missing = [index for index in range(1, first["partCount"] + 1) if index not in indexes]
    complete = not missing
    require(counts["documents"] <= first["totalDocuments"] and counts["objectBytes"] <= first["totalOriginalBytes"] and counts["pending"] <= first["totalPendingUploadOriginals"], "Verified parts exceed collection totals")
    if complete:
        require(counts["documents"] == first["totalDocuments"] and counts["objectBytes"] == first["totalOriginalBytes"] and counts["pending"] == first["totalPendingUploadOriginals"], "Complete collection counts or original bytes do not match totals")
    external = sum(kind != "document" or identifier not in document_ids for kind, identifier in relationship_endpoints)
    return {"status": "verified", "format": PART_FORMAT, "scope": "complete_collection" if complete else "verified_parts_only", "collectionComplete": complete, "counts": counts, "integrity": {key: sum(result["integrity"][key] for result in ordered) for key in ("comparedWithRecordedSha256", "observedSha256Only")}, "archivedDocuments": sum(result["archivedDocuments"] for result in ordered), "cancelledDocuments": sum(result.get("cancelledDocuments", 0) for result in ordered), "externalRelationshipEndpoints": external, "collection": {**{key: first[key] for key in global_fields}, "verifiedParts": sorted(indexes), "missingParts": missing, "verifiedDocuments": counts["documents"], "unprovidedDocuments": first["totalDocuments"] - counts["documents"]}, "assurance": "Each supplied part passed local integrity checks. Collection completeness requires every part; hashes are not signatures or a full database backup."}


def validate_collection(export, manifest, counts, documents):
    part = export.get("collection")
    require(isinstance(part, dict) and part == manifest.get("collection"), "Header and manifest collection descriptors differ")
    required = {"planId", "metadataSha256", "partIndex", "partCount", "documentOffset", "documentCount", "totalDocuments", "originalBytes", "totalOriginalBytes", "pendingUploadOriginals", "totalPendingUploadOriginals", "firstDocumentId", "lastDocumentId", "remainingDocuments", "sharedFolders", "sharedRelationships"}
    require(set(part) == required, "Unsupported collection descriptor fields")
    for field in ("planId", "metadataSha256"):
        require(isinstance(part[field], str) and HEX_SHA.fullmatch(part[field]), "Invalid collection identity digest")
    for field in required - {"planId", "metadataSha256", "firstDocumentId", "lastDocumentId"}:
        require(type(part[field]) is int and 0 <= part[field] <= 2 ** 53 - 1, "Invalid collection count")
    require(1 <= part["partIndex"] <= part["partCount"] <= MAX_PARTS, "Invalid collection part index or count")
    require(part["sharedFolders"] + part["sharedRelationships"] + part["totalDocuments"] <= MAX_ROWS, "Collection exceeds verifier row limit")
    require(part["documentCount"] == counts["documents"] and part["originalBytes"] == counts["objectBytes"] and part["pendingUploadOriginals"] == counts["pending"], "Part descriptor counts do not match verified contents")
    require(part["sharedFolders"] == counts["folders"] and part["sharedRelationships"] == counts["relationships"], "Shared metadata counts do not match part descriptor")
    require(part["originalBytes"] <= part["totalOriginalBytes"] and part["pendingUploadOriginals"] <= part["totalPendingUploadOriginals"] <= part["totalDocuments"], "Part exceeds declared collection totals")
    require(part["documentOffset"] + part["documentCount"] + part["remainingDocuments"] == part["totalDocuments"], "Collection document offset or remaining count mismatch")
    ids = list(documents)
    require(all(left.lower() < right.lower() for left, right in zip(ids, ids[1:])), "Documents within a part must be in ascending ID order")
    require(part["firstDocumentId"] == (ids[0] if ids else None) and part["lastDocumentId"] == (ids[-1] if ids else None), "Part document range differs from contents")
    if part["totalDocuments"] == 0:
        require(part["partCount"] == 1 and part["documentOffset"] == 0, "Empty collection must contain one empty part")
    else:
        require(part["documentCount"] >= 1 and part["documentOffset"] >= part["partIndex"] - 1 and part["remainingDocuments"] >= part["partCount"] - part["partIndex"], "Nonempty collection parts require disjoint nonempty document ranges")
    if part["partIndex"] == 1:
        require(part["documentOffset"] == 0, "First part must start at document offset zero")
    if part["partIndex"] == part["partCount"]:
        require(part["remainingDocuments"] == 0, "Last part must reach the end of the collection")
    require(manifest.get("collectionComplete") is (part["partCount"] == 1 and manifest.get("status") == "complete"), "Part completion claim is inconsistent with collection size")
    return part


def strict_members(raw):
    """Read only the regular-file ustar subset written by this exporter.

    Reject special headers before they can request allocations or path rewriting.
    The consumer reads each member body before advancing this iterator.
    """
    while True:
        header = raw.read(512)
        require(len(header) == 512, "Tar header or completion blocks are missing", "interrupted")
        if not any(header):
            require(raw.read(512) == bytes(512), "Tar completion blocks are missing", "interrupted")
            while True:
                trailer = raw.read(64 * 1024)
                if not trailer:
                    return
                require(len(trailer) % 512 == 0 and not any(trailer), "Invalid archive trailer", "interrupted")
        require(header[156:157] in (b"0", b"\0"), "Special tar entries are not allowed")
        require(header[257:265] == b"ustar\0" + b"00", "Unsupported tar format")
        require(not any(header[157:257]) and not any(header[345:500]), "Tar links and path prefixes are not allowed")
        def number(start, end):
            field = header[start:end].strip(b" \0")
            require(bool(field) and all(byte in b"01234567" for byte in field), "Invalid tar numeric field")
            return int(field, 8)
        require(number(148, 156) == sum(header[:148]) + 8 * 32 + sum(header[156:]), "Tar header checksum mismatch")
        name_field = header[:100].split(b"\0", 1)
        require(len(name_field) == 1 or not any(name_field[1]), "Invalid tar path field")
        name = name_field[0].decode("ascii")
        size = number(124, 136)
        position = raw.tell()
        yield SimpleNamespace(name=name, size=size, offset_data=position)
        require(raw.tell() == position + size, "Archive member was not fully read", "interrupted")
        pad = (-size) % 512
        padding = raw.read(pad)
        require(len(padding) == pad, "Tar padding is truncated", "interrupted")
        require(not any(padding), "Tar padding is nonzero")


def inspect_archive(archive_path, staging):
    seen = set()
    folders, documents, relationships, objects = {}, {}, {}, {}
    index = hashlib.sha256()
    shared = hashlib.sha256()
    manifest = None
    export = None
    total = 0
    try:
        with open(archive_path, "rb") as raw:
            source_size = os.fstat(raw.fileno()).st_size
            require(source_size <= MAX_BYTES, "Archive exceeds verifier safety limit")
            require(source_size % 512 == 0, "Archive is not block-aligned", "interrupted")
            for member in strict_members(raw):
                require(manifest is None, "Entries occur after completion manifest")
                require(PATH.fullmatch(member.name), "Unsupported or unsafe archive entry")
                require(member.name not in seen, "Duplicate archive entry")
                seen.add(member.name)
                require(len(seen) <= MAX_ROWS * 2 + 2, "Too many entries")
                total += member.size + 512 + ((-member.size) % 512)
                require(0 <= member.size <= MAX_BYTES and total <= MAX_BYTES, "Archive exceeds verifier safety limit")
                stream = raw
                require(stream is not None, "Unreadable archive entry")
                digest = hashlib.sha256()
                is_json = member.name.endswith(".json")
                require(not is_json or member.size <= MAX_JSON, "Metadata record too large")
                chunks = []
                output = None
                if staging:
                    destination = staging / member.name
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    output = open(destination, "xb")
                try:
                    remaining = member.size
                    while remaining:
                        chunk = stream.read(min(64 * 1024, remaining))
                        require(bool(chunk), "Truncated archive entry", "interrupted")
                        remaining -= len(chunk)
                        digest.update(chunk)
                        if is_json:
                            chunks.append(chunk)
                        if output:
                            output.write(chunk)
                finally:
                    if output:
                        output.close()
                sha = digest.hexdigest()
                if member.name != "manifest.json":
                    index.update(f"{member.name}\0{member.size}\0{sha}\n".encode())
                if member.name == "manifest.json":
                    manifest = read_json(b"".join(chunks), member.name)
                elif member.name == "export.json":
                    require(len(seen) == 1, "Export header must be first")
                    export = read_json(b"".join(chunks), member.name)
                elif is_json:
                    value = read_json(b"".join(chunks), member.name)
                    kind, name = member.name.split("/")
                    identifier = name[:-5]
                    require(value.get("id") == identifier, "Metadata identity mismatch")
                    fields = {"folders": ("parent_id",), "documents": ("folder_id", "storage_state", "object", "file_size", "checksum", "archived_at"), "relationships": ("source_type", "source_id", "target_type", "target_id")}[kind]
                    if kind in ("folders", "relationships"):
                        shared.update(f"{member.name}\0{member.size}\0{sha}\n".encode())
                    # Retain only the relation/integrity index; extracted text stays on disk.
                    {"folders": folders, "documents": documents, "relationships": relationships}[kind][identifier] = {key: value.get(key) for key in fields}
                else:
                    objects[member.name] = {"bytes": member.size, "sha256": sha}
            require(manifest is not None, "Completion manifest is absent; download did not finish", "interrupted")
    except EOFError as error:
        raise InvalidExport("interrupted", "Archive stream is truncated or invalid") from error
    require(export and export.get("format") in (FORMAT, PART_FORMAT) and manifest.get("format") == export.get("format"), "Unsupported export format")
    require(index.hexdigest() == manifest.get("entriesSha256"), "Archive entries SHA256 mismatch")
    require(manifest.get("status") in ("complete", "incomplete"), "Invalid completion status")
    counts = {"folders": len(folders), "documents": len(documents), "relationships": len(relationships), "objects": len(objects), "objectBytes": sum(obj["bytes"] for obj in objects.values()), "pending": 0, "failed": 0}
    referenced_objects = set()
    integrity = {"comparedWithRecordedSha256": 0, "observedSha256Only": 0}
    archived_documents = 0
    cancelled_documents = 0
    for identifier, document in documents.items():
        if document.get("archived_at") is not None or document.get("storage_state") == "archived":
            archived_documents += 1
        folder = document.get("folder_id")
        require(folder is None or folder in folders, "Document references missing folder")
        obj = document.get("object")
        require(isinstance(obj, dict), "Missing object integrity record")
        pending = document.get("storage_state") == "pending"
        cancelled = document.get("storage_state") == "cancelled"
        if pending:
            counts["pending"] += 1
            require(obj.get("status") == "pending_upload" and obj.get("path") is None, "Pending upload must be metadata-only")
        elif cancelled:
            cancelled_documents += 1
            require(obj.get("status") == "cancelled_upload" and obj.get("path") is None, "Cancelled upload must retain metadata without a recovered original")
        elif obj.get("status") != "verified":
            counts["failed"] += 1
        path = obj.get("path")
        if path:
            require(path == f"objects/{identifier}" and path in objects, "Missing or mismatched original")
            require(objects[path] == {"bytes": obj.get("bytes"), "sha256": obj.get("sha256")}, "Original SHA256 or byte count mismatch")
            require(obj.get("bytes") == document.get("file_size"), "Original differs from metadata size")
            if obj.get("status") == "verified" and document.get("checksum"):
                require(obj["sha256"] == str(document["checksum"]).lower(), "Original differs from recorded upload checksum")
            integrity["comparedWithRecordedSha256" if document.get("checksum") else "observedSha256Only"] += 1
            referenced_objects.add(path)
        else:
            require(obj.get("sha256") is None and obj.get("bytes") is None, "Absent original has an integrity claim")
            require(pending or obj.get("status") != "verified", "Verified original is absent")
    require(referenced_objects == set(objects), "Unreferenced original in archive")
    checked_folders = set()
    for identifier in folders:
        ancestors = set()
        parent = identifier
        while parent is not None and parent not in checked_folders:
            require(parent in folders, "Folder references missing parent")
            require(parent not in ancestors, "Folder hierarchy contains a cycle")
            ancestors.add(parent)
            parent = folders[parent].get("parent_id")
        checked_folders.update(ancestors)
    external_refs = set()
    relationship_endpoints = set()
    for link in relationships.values():
        require(link.get("source_type") == "document" or link.get("target_type") == "document", "Relationship is outside Files scope")
        for side in ("source", "target"):
            kind, identifier = link.get(f"{side}_type"), link.get(f"{side}_id")
            require(isinstance(kind, str) and isinstance(identifier, str) and re.fullmatch(UUID, identifier), "Invalid relationship endpoint")
            relationship_endpoints.add((kind, identifier))
            if kind != "document" or identifier not in documents:
                external_refs.add((kind, identifier))
    require(counts == manifest.get("counts"), "Manifest counts mismatch")
    expected_exclusions = {"pendingUploadOriginals": counts["pending"]}
    if cancelled_documents:
        expected_exclusions["cancelledUploadOriginals"] = cancelled_documents
    require(manifest.get("cancelledDocuments", 0) == cancelled_documents, "Cancelled metadata count mismatch")
    require(manifest.get("exclusions") == expected_exclusions, "Upload exclusion counts mismatch")
    require(manifest.get("status") == "complete" and manifest.get("metadataStable") is True and counts["failed"] == 0, "Export reports incomplete originals or changed metadata; retry after resolving issues", "incomplete")
    collection = validate_collection(export, manifest, counts, documents) if export["format"] == PART_FORMAT else None
    return {"status": "verified", "format": export["format"], "counts": counts, "integrity": integrity, "archivedDocuments": archived_documents, "cancelledDocuments": cancelled_documents, "externalRelationshipEndpoints": len(external_refs), **({"collection": collection} if collection else {}), "_documentIds": set(documents), "_sharedDigest": shared.hexdigest(), "_relationshipEndpoints": relationship_endpoints, "assurance": "Local byte integrity and relationships checked; not proof of authenticity or a full database backup"}


def readable_component(name, identifier, file_name=False):
    """Readable cross-platform basename; identity suffix prevents name collisions."""
    name = name if isinstance(name, str) and name else "untitled"
    name = unicodedata.normalize("NFC", name)
    name = "".join("_" if char in '/\\<>:"|?*' or unicodedata.category(char).startswith("C") else char for char in name)
    name = name.strip(" .") or "untitled"
    extension = ""
    if file_name and "." in name:
        stem, dot, suffix = name.rpartition(".")
        if stem and len(suffix.encode("utf-8")) <= 20:
            name, extension = stem, dot + suffix
    # Bound bytes, not characters, so Unicode names fit filesystem component limits.
    name = name.encode("utf-8")[:80].decode("utf-8", errors="ignore").rstrip(" .") or "untitled"
    return f"{name}__{identifier.lower()}{extension}"


def make_readable_tree(staging):
    """Create a named view with no second copy of original bytes or metadata edits."""
    folders = {}
    directory = staging / "folders"
    for metadata in sorted(directory.glob("*.json")):
        value = read_json(metadata.read_bytes(), str(metadata))
        folders[value["id"]] = (value.get("parent_id"), readable_component(value.get("name"), value["id"]))
    root = staging / "readable"
    root.mkdir()
    flattened = set()

    def folder_path(identifier):
        components = []
        current = identifier
        while current is not None:
            parent, component = folders[current]
            components.append(component)
            current = parent
            if len(components) > 16 or sum(len(part.encode("utf-8")) + 1 for part in components) > 2000:
                flattened.add(identifier)
                return root / "_deep_folders" / folders[identifier][1]
        return root.joinpath(*reversed(components))

    for identifier in folders:
        folder_path(identifier).mkdir(parents=True, exist_ok=True)
    linked = 0
    with open(staging / "restore-map.jsonl", "x", encoding="utf-8") as mapping:
        for metadata in sorted((staging / "documents").glob("*.json")):
            value = read_json(metadata.read_bytes(), str(metadata))
            obj = value["object"]
            original_path = obj.get("path")
            readable_path = None
            if original_path:
                destination = folder_path(value.get("folder_id")) / readable_component(value.get("original_filename") or value.get("title"), value["id"], True)
                # Both paths are in this newly created private staging directory.
                # Hard links save disk, never overwrite, and never resolve archive symlinks.
                try:
                    os.link(staging / original_path, destination)
                except OSError as error:
                    raise InvalidExport("restore_refused", "Readable tree needs local hard-link support; retry without --readable-tree") from error
                readable_path = destination.relative_to(staging).as_posix()
                linked += 1
            mapping.write(json.dumps({"documentId": value["id"], "originalFilename": value.get("original_filename"), "folderId": value.get("folder_id"), "objectPath": original_path, "readablePath": readable_path}, ensure_ascii=False) + "\n")
    return {"path": "readable", "files": linked, "storage": "hard_links_no_duplicate_original_bytes", "flattenedDeepFolders": len(flattened), "mapping": "restore-map.jsonl", "warning": "Named files and objects share bytes; editing either changes both. Copy outside this tree before editing."}


def human_bytes(value):
    for unit in ("B", "KiB", "MiB", "GiB", "TiB"):
        if value < 1024 or unit == "TiB":
            return f"{value:,.0f} {unit}" if unit == "B" else f"{value:,.1f} {unit}"
        value /= 1024


def human_summary(result):
    counts = result["counts"]
    lines = ["Files export: verified" if result.get("collectionComplete", True) else "Files export: supplied parts verified; COLLECTION INCOMPLETE", f"Originals: {counts['objects']:,} files, {human_bytes(counts['objectBytes'])}", f"Metadata: {counts['documents']:,} documents, {counts['folders']:,} folders, {counts['relationships']:,} relationships", f"Pending uploads: {counts['pending']:,} metadata records only; their original bytes are excluded", f"External relationship endpoints: {result['externalRelationshipEndpoints']:,}; these entities are not restored"]
    lines.append(f"Cancelled uploads: {result.get('cancelledDocuments', 0):,} terminal metadata records; no original bytes claimed or recovered")
    integrity = result.get("integrity", {})
    lines.append(f"Recorded SHA-256 compared: {integrity.get('comparedWithRecordedSha256', 0):,}; observed-only SHA-256: {integrity.get('observedSha256Only', 0):,} (no historical integrity baseline)")
    lines.append(f"Archived documents retained: {result.get('archivedDocuments', 0):,}")
    if result.get("collection"):
        collection = result["collection"]
        lines.insert(1, f"Collection: {len(collection['verifiedParts'])}/{collection['partCount']} parts, {counts['documents']:,}/{collection['totalDocuments']:,} documents")
        if collection["missingParts"]:
            lines.insert(2, "Missing parts: " + ", ".join(map(str, collection["missingParts"])) + "; no complete collection restore is available")
    if result.get("restoredTo"):
        lines.append(f"Restored to: {result['restoredTo']}")
    if result.get("readableTree"):
        tree = result["readableTree"]
        lines.extend([f"Readable files: {tree['files']:,}; exact names and IDs in restore-map.jsonl", tree["warning"]])
        if tree["flattenedDeepFolders"]:
            lines.append(f"Deep folder paths shortened: {tree['flattenedDeepFolders']:,}; original hierarchy remains in folder metadata")
    lines.append("Checks establish local byte integrity, not authenticity or a full database backup. Originals are never opened or executed.")
    return "\n".join(lines)


def write_restore_summary(staging, result):
    with open(staging / "restore-summary.json", "x", encoding="utf-8") as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    with open(staging / "RESTORE-README.txt", "x", encoding="utf-8") as stream:
        stream.write(human_summary(result) + "\n\n")
        stream.write("This is an isolated portable staging tree. Nothing was imported into Personal OS or any database.\nMetadata in documents/, folders/, and relationships/ preserves original IDs, names, archive states, and links. objects/ contains the verified original bytes.\nKeep the archive and this tree private. No source files were removed.\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", nargs="+", help="One legacy archive, or one or more parts of the same collection (any order)")
    parser.add_argument("--restore-to", help="New isolated local directory; never an application/database destination")
    parser.add_argument("--readable-tree", action="store_true", help="Also create an original-name/folder view using local hard links; requires --restore-to")
    parser.add_argument("--summary", action="store_true", help="Print a readable summary instead of JSON")
    args = parser.parse_args()
    try:
        require(not args.readable_tree or args.restore_to, "--readable-tree requires --restore-to", "restore_refused")
        result = verify(args.archive, args.restore_to, args.readable_tree)
    except InvalidExport as error:
        print(f"Files export: {error.status}\n{error}" if args.summary else json.dumps({"status": error.status, "error": str(error)}))
        return 2 if error.status == "interrupted" else 1
    except (OSError, KeyError, TypeError, ValueError) as error:
        print(f"Files export: invalid\n{error}" if args.summary else json.dumps({"status": "invalid", "error": str(error)}))
        return 1
    print(human_summary(result) if args.summary else json.dumps(result))
    return 0 if result["collectionComplete"] else 3


if __name__ == "__main__":
    sys.exit(main())
