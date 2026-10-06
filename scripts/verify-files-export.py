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
from types import SimpleNamespace

FORMAT = "personal-os-files/v1"
UUID = r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
PATH = re.compile(rf"(?:export\.json|manifest\.json|(?:folders|documents|relationships)/{UUID}\.json|objects/{UUID})\Z")
MAX_JSON = 2 * 1024 * 1024
MAX_BYTES = 512 * 1024 * 1024
MAX_ROWS = 25_000


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


def verify(archive_path, restore_to=None):
    target = Path(restore_to).absolute() if restore_to else None
    staging = None
    if target:
        require(not target.exists() and not target.is_symlink(), "Restore target already exists; choose a new isolated directory", "restore_refused")
        require(target.parent.is_dir(), "Restore parent directory must exist", "restore_refused")
        staging = Path(tempfile.mkdtemp(prefix=".files-restore-", dir=target.parent))
    try:
        result = inspect_archive(archive_path, staging)
        if target:
            # Never merge into an existing directory. This tool is intended for a trusted local user.
            require(not target.exists(), "Restore target appeared during verification", "restore_refused")
            os.rename(staging, target)
            staging = None
            result["restoredTo"] = str(target)
        return result
    finally:
        if staging:
            shutil.rmtree(staging)


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
                    fields = {"folders": ("parent_id",), "documents": ("folder_id", "storage_state", "object", "file_size", "checksum"), "relationships": ("source_type", "source_id", "target_type", "target_id")}[kind]
                    # Retain only the relation/integrity index; extracted text stays on disk.
                    {"folders": folders, "documents": documents, "relationships": relationships}[kind][identifier] = {key: value.get(key) for key in fields}
                else:
                    objects[member.name] = {"bytes": member.size, "sha256": sha}
            require(manifest is not None, "Completion manifest is absent; download did not finish", "interrupted")
    except EOFError as error:
        raise InvalidExport("interrupted", "Archive stream is truncated or invalid") from error
    require(export and export.get("format") == FORMAT and manifest.get("format") == FORMAT, "Unsupported export format")
    require(index.hexdigest() == manifest.get("entriesSha256"), "Archive entries SHA256 mismatch")
    require(manifest.get("status") in ("complete", "incomplete"), "Invalid completion status")
    counts = {"folders": len(folders), "documents": len(documents), "relationships": len(relationships), "objects": len(objects), "objectBytes": sum(obj["bytes"] for obj in objects.values()), "pending": 0, "failed": 0}
    referenced_objects = set()
    for identifier, document in documents.items():
        folder = document.get("folder_id")
        require(folder is None or folder in folders, "Document references missing folder")
        obj = document.get("object")
        require(isinstance(obj, dict), "Missing object integrity record")
        pending = document.get("storage_state") == "pending"
        if pending:
            counts["pending"] += 1
            require(obj.get("status") == "pending_upload" and obj.get("path") is None, "Pending upload must be metadata-only")
        elif obj.get("status") != "verified":
            counts["failed"] += 1
        path = obj.get("path")
        if path:
            require(path == f"objects/{identifier}" and path in objects, "Missing or mismatched original")
            require(objects[path] == {"bytes": obj.get("bytes"), "sha256": obj.get("sha256")}, "Original SHA256 or byte count mismatch")
            require(obj.get("bytes") == document.get("file_size"), "Original differs from metadata size")
            if obj.get("status") == "verified" and document.get("checksum"):
                require(obj["sha256"] == str(document["checksum"]).lower(), "Original differs from recorded upload checksum")
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
    for link in relationships.values():
        require(link.get("source_type") == "document" or link.get("target_type") == "document", "Relationship is outside Files scope")
        for side in ("source", "target"):
            kind, identifier = link.get(f"{side}_type"), link.get(f"{side}_id")
            require(isinstance(kind, str) and isinstance(identifier, str) and re.fullmatch(UUID, identifier), "Invalid relationship endpoint")
            if kind != "document" or identifier not in documents:
                external_refs.add((kind, identifier))
    require(counts == manifest.get("counts"), "Manifest counts mismatch")
    require(manifest.get("exclusions") == {"pendingUploadOriginals": counts["pending"]}, "Pending exclusion counts mismatch")
    require(manifest.get("status") == "complete" and manifest.get("metadataStable") is True and counts["failed"] == 0, "Export reports incomplete originals or changed metadata; retry after resolving issues", "incomplete")
    return {"status": "verified", "format": FORMAT, "counts": counts, "externalRelationshipEndpoints": len(external_refs), "assurance": "Local byte integrity and relationships checked; not proof of authenticity or a full database backup"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive")
    parser.add_argument("--restore-to", help="New isolated local directory; never an application/database destination")
    args = parser.parse_args()
    try:
        result = verify(args.archive, args.restore_to)
    except InvalidExport as error:
        print(json.dumps({"status": error.status, "error": str(error)}))
        return 2 if error.status == "interrupted" else 1
    except (OSError, KeyError, TypeError, ValueError) as error:
        print(json.dumps({"status": "invalid", "error": str(error)}))
        return 1
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
