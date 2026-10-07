#!/usr/bin/env python3
"""Offline logical snapshot verification and isolated SQLite recovery rehearsal.

Standard library only. No network, shell execution, production credentials or
provider writes. Reads the trusted schema shipped with this repository version.
"""
import argparse
import base64
import binascii
from datetime import datetime
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import shutil
import sqlite3
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = json.loads((ROOT / "src/features/system-backup/schema.json").read_text())
TABLES = SCHEMA["tables"]
ARTWORK_REGISTRY = json.loads((ROOT / "src/features/system-backup/artwork-registry.json").read_text())
MAX_BYTES, MAX_LINE, MAX_ROWS = 512 * 1024 * 1024, 8 * 1024 * 1024, 250_000
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\Z")
ENTITY_TABLES = {
    "area": "areas", "project": "projects", "task": "tasks", "note": "notes",
    "document": "documents", "todo_task": "microsoft_todo_tasks", "calendar_event": "calendar_events",
    "career_direction": "career_directions", "career_track": "career_tracks", "career_milestone": "career_milestones",
    "experience": "experiences", "experience_fact": "experience_facts", "experience_output": "experience_outputs",
    "experience_bullet": "experience_bullets", "career_opportunity": "career_opportunities",
    "career_application": "career_applications", "resume_version": "resume_versions", "review": "reviews",
    "skill": "skills", "certification": "certifications", "personal_memory": "personal_memories",
    "memory": "personal_memories", "decision": "decisions", "trip": "trips", "trip_stop": "trip_stops",
    "purchase_item": "purchase_items", "interview_question": "interview_questions",
    "interview_context": "interview_contexts", "interview_preparation": "interview_question_preparations",
    "interview_session": "interview_sessions", "interview_attempt": "interview_practice_attempts",
    "interview_answer_version": "interview_answer_versions", "interview_story": "interview_stories",
    "interview_archetype": "interview_question_archetypes", "inbox_item": "inbox_items",
    "feed_item": "feed_items", "briefing": "briefings", "leisure_experience": "leisure_experiences",
}


class InvalidBackup(Exception):
    def __init__(self, status, message):
        self.status = status
        super().__init__(message)


def require(condition, message, status="corrupt"):
    if not condition:
        raise InvalidBackup(status, message)


def normalized_numbers(value):
    # JSON has one number type: PostgreSQL may emit 10.000000 and SQLite may
    # return 10 for the same exact value. Match JSON.stringify's integral form
    # without ever converting financial decimal strings or losing fractions.
    if type(value) is float and math.isfinite(value) and value.is_integer():
        return int(value)
    if isinstance(value, dict):
        return {key: normalized_numbers(cell) for key, cell in value.items()}
    if isinstance(value, list):
        return [normalized_numbers(cell) for cell in value]
    return value


def canonical(value):
    return (json.dumps(normalized_numbers(value), sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False) + "\n").encode()


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "Duplicate JSON key")
        result[key] = value
    return result


def read_json(raw):
    try:
        return json.loads(raw, object_pairs_hook=unique_object, parse_constant=lambda _: (_ for _ in ()).throw(ValueError("Nonfinite number")))
    except (ValueError, UnicodeDecodeError, RecursionError) as error:
        raise InvalidBackup("corrupt", "Invalid JSON record") from error


def timestamp(value):
    require(isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z", value), "Invalid manifest timestamp")
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise InvalidBackup("corrupt", "Invalid manifest timestamp") from error


def keys(value, expected):
    require(isinstance(value, dict) and set(value) == set(expected), "Unexpected record schema")


def validate_row(table, row, owner):
    definition = TABLES[table]
    keys(row, definition["columns"])
    require(row["user_id"] == owner, "Mixed-owner data")
    for name, field in definition["columns"].items():
        cell = row[name]
        if cell is None and field["nullable"]:
            continue
        kind = field["type"]
        valid = ((kind == "uuid" and isinstance(cell, str) and UUID.fullmatch(cell))
                 or (kind == "string" and isinstance(cell, str))
                 or (kind == "boolean" and type(cell) is bool)
                 or (kind == "number" and type(cell) in (int, float) and math.isfinite(cell) and abs(cell) <= 9007199254740991)
                 or (kind == "array" and isinstance(cell, list) and all(isinstance(item, str) for item in cell))
                 or kind == "json")
        require(valid, f"Invalid column type: {table}.{name}")
    return tuple(row[key] for key in definition["primaryKey"])


def quoted(name):
    # Only trusted registry identifiers can reach this helper, never archive SQL.
    require(re.fullmatch(r"[a-z][a-z0-9_]*", name), "Invalid registry identifier")
    return '"' + name + '"'


def create_database(path):
    db = sqlite3.connect(path)
    db.execute("PRAGMA trusted_schema=OFF")
    db.execute("PRAGMA journal_mode=DELETE")
    for name, spec in TABLES.items():
        columns = [quoted(column) + (" NUMERIC" if field["type"] in ("number", "boolean") else " TEXT")
                   + (" NOT NULL" if not field["nullable"] else "") for column, field in spec["columns"].items()]
        columns.append("PRIMARY KEY (" + ",".join(map(quoted, spec["primaryKey"])) + ")")
        db.execute("CREATE TABLE " + quoted(name) + " (" + ",".join(columns) + ")")
    return db


def sql_value(value, kind):
    if value is None and kind != "json":
        return None
    if kind in ("json", "array"):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    return value


def insert_row(db, table, row):
    fields = TABLES[table]["columns"]
    try:
        db.execute("INSERT INTO " + quoted(table) + " (" + ",".join(map(quoted, fields)) + ") VALUES (" + ",".join("?" for _ in fields) + ")",
                   [sql_value(row[key], definition["type"]) for key, definition in fields.items()])
    except sqlite3.IntegrityError as error:
        raise InvalidBackup("corrupt", "Duplicate identity or invalid row") from error


def restored_rows(db, table):
    fields = TABLES[table]["columns"]
    for cells in db.execute("SELECT " + ",".join(map(quoted, fields)) + " FROM " + quoted(table) + " ORDER BY " + ",".join(map(quoted, TABLES[table]["primaryKey"]))):
        row = dict(zip(fields, cells))
        for key, definition in fields.items():
            if row[key] is not None and definition["type"] in ("array", "json"):
                row[key] = read_json(row[key])
            elif row[key] is not None and definition["type"] == "boolean":
                row[key] = bool(row[key])
        yield row


def verify_references(db):
    checked = 0
    for table, definition in TABLES.items():
        for relation in definition["foreignKeys"]:
            parent = relation["table"]
            require(parent in TABLES, "Unknown reference table in trusted schema")
            nonnull = " AND ".join("child." + quoted(key) + " IS NOT NULL" for key in relation["columns"])
            matching = " AND ".join("child." + quoted(key) + "=parent." + quoted(target) for key, target in zip(relation["columns"], relation["targetColumns"]))
            query = "SELECT COUNT(*) FROM " + quoted(table) + " child WHERE " + nonnull + " AND NOT EXISTS (SELECT 1 FROM " + quoted(parent) + " parent WHERE " + matching + ")"
            require(db.execute(query).fetchone()[0] == 0, f"Missing referenced row: {table} -> {parent}", "inconsistent")
            checked += 1
    unresolved, sample = 0, []
    # Polymorphic historical evidence can outlive an endpoint; report the exact
    # gap rather than claim a complete graph or silently discard the link.
    for table, pairs in {
        "entity_links": [("source_type", "source_id"), ("target_type", "target_id")],
        "entity_link_dismissals": [("source_type", "source_id"), ("target_type", "target_id")],
        "memory_sources": [("source_type", "source_id")],
        "decision_sources": [("source_type", "source_id")],
        "review_sources": [("source_type", "source_id")],
        "gap_analysis_evidence": [("entity_type", "entity_id")],
    }.items():
        for row in restored_rows(db, table):
            for type_key, id_key in pairs:
                kind, identifier = row[type_key], row[id_key]
                target = ENTITY_TABLES.get(kind)
                found = target and db.execute("SELECT 1 FROM " + quoted(target) + " WHERE id=?", (identifier,)).fetchone()
                if not found:
                    unresolved += 1
                    if len(sample) < 20:
                        sample.append({"table": table, "rowId": row["id"], "type": kind, "id": identifier})
    for account in restored_rows(db, "investment_accounts"):
        sequences = [row[0] for table in ("investment_ledger", "investment_cash_ledger", "investment_quotes")
                     for row in db.execute("SELECT sequence FROM " + quoted(table) + " WHERE account_id=?", (account["id"],))]
        require(account["revision"] == len(sequences) and all(value == index + 1 for index, value in enumerate(sorted(sequences))), "Investment sequence/revision coverage mismatch", "inconsistent")
    return {"foreignKeyChecks": checked, "unresolvedEndpoints": unresolved, "samples": sample}


def inspect_artwork_inventory(value):
    keys(value, ["status", "entries"])
    require(value["status"] in ("complete", "unavailable") and isinstance(value["entries"], list), "Invalid artwork inventory")
    registry = {entry["id"]: entry for entry in ARTWORK_REGISTRY}
    expected, seen = {}, set()
    present = unavailable = not_imported = 0
    manifests = {}
    for entry in value["entries"]:
        keys(entry, ["id", "status", "manifest", "manifestSha256", "manifestBytes"])
        identifier = entry["id"]
        require(isinstance(identifier, str) and identifier in registry and identifier not in seen, "Unknown/duplicate artwork identity")
        seen.add(identifier)
        if entry["status"] in ("not_imported", "unavailable"):
            require(entry["manifest"] is None and entry["manifestSha256"] is None and entry["manifestBytes"] is None, "Invalid missing artwork metadata")
            unavailable += entry["status"] == "unavailable"
            not_imported += entry["status"] == "not_imported"
            continue
        require(entry["status"] == "present", "Unknown artwork state")
        present += 1
        manifest = entry["manifest"]
        keys(manifest, ["version", "id", "source", "sourceUrl", "credit", "verifiedAt", "original", "variants"])
        source = registry[identifier]
        require(type(manifest["version"]) is int and manifest["version"] == 1 and manifest["id"] == identifier and manifest["source"] == source["src"] and manifest["sourceUrl"] == source["sourceUrl"] and manifest["credit"] == source["credit"], "Artwork source identity mismatch")
        timestamp(manifest["verifiedAt"])
        require(isinstance(entry["manifestSha256"], str) and re.fullmatch(r"[a-f0-9]{64}", entry["manifestSha256"]), "Invalid artwork manifest digest")
        require(type(entry["manifestBytes"]) is int and 0 < entry["manifestBytes"] <= 16384, "Invalid artwork manifest size")
        manifest_path = identifier + "/" + hashlib.sha256(source["src"].encode()).hexdigest() + ".json"
        expected[manifest_path] = {"bytes": entry["manifestBytes"], "sha256": entry["manifestSha256"]}
        manifests[manifest_path] = manifest
        keys(manifest["variants"], ["640", "1280"])
        for role, file in [("original", manifest["original"]), *manifest["variants"].items()]:
            keys(file, ["bytes", "sha256", "mime", "width", "height"])
            require(type(file["bytes"]) is int and 0 < file["bytes"] <= 5 * 1024 * 1024, "Invalid artwork object size")
            require(isinstance(file["sha256"], str) and re.fullmatch(r"[a-f0-9]{64}", file["sha256"]), "Invalid artwork object digest")
            require(file["mime"] in ("image/jpeg", "image/png", "image/webp"), "Invalid artwork MIME")
            require(all(type(file[key]) is int and 0 < file[key] <= 4096 for key in ("width", "height")), "Invalid artwork dimensions")
            if role == "original":
                require(file["width"] == source["width"] and file["height"] == source["height"], "Artwork original dimension mismatch")
            else:
                width = min(int(role), source["width"])
                require(file["mime"] == "image/webp" and file["width"] == width and abs(file["height"] - source["height"] * width / source["width"]) <= 1, "Artwork variant dimension mismatch")
            extension = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[file["mime"]]
            path = identifier + "/" + file["sha256"] + "." + extension
            descriptor = {"bytes": file["bytes"], "sha256": file["sha256"]}
            require(path not in expected or expected[path] == descriptor, "Conflicting artwork object references")
            expected[path] = descriptor
    if value["status"] == "complete":
        require(seen == set(registry) and unavailable == 0, "Incomplete artwork inventory")
    else:
        unavailable += len(registry) - len(seen)
        require(unavailable > 0, "Unexpected unavailable artwork status")
    return expected, manifests, {"verified": unavailable == 0, "presentAssets": present, "notImportedAssets": not_imported, "unavailableAssets": unavailable, "requiredObjects": len(expected)}


def inspect_snapshot(path, db, copy_to):
    digests = {name: hashlib.sha256() for name in TABLES}
    restored_digests = {name: hashlib.sha256() for name in TABLES}
    counts = {name: 0 for name in TABLES}
    previous = {name: None for name in TABLES}
    index = hashlib.sha256()
    manifest, header = None, None
    current_table = ""
    artwork_started = False
    artwork_expected, artwork_manifests, artwork_summary = {}, {}, {}
    artwork_seen, artwork_bytes = set(), 0
    total, count = 0, 0
    with open(path, "rb") as source, open(copy_to, "xb") as copy:
        for raw in iter(lambda: source.readline(MAX_LINE + 1), b""):
            total += len(raw)
            require(len(raw) <= MAX_LINE and total <= MAX_BYTES, "Snapshot exceeds safety limit")
            require(raw.endswith(b"\n"), "Truncated record", "interrupted")
            require(manifest is None, "Unexpected data after manifest")
            value = read_json(raw)
            require(isinstance(value, dict), "Expected object record")
            if header is None:
                keys(value, ["type", "format", "exportId", "owner", "startedAt", "schema", "schemaSha256", "consistency", "originalBytes", "encrypted", "artwork"])
                require(value["type"] == "header" and value["format"] == SCHEMA["format"], "Unsupported snapshot format")
                require(value["schema"] == SCHEMA, "Schema version mismatch; use the matching repository verifier")
                require(isinstance(value["owner"], str) and UUID.fullmatch(value["owner"]), "Invalid owner")
                require(isinstance(value["exportId"], str) and UUID.fullmatch(value["exportId"]), "Invalid export identity")
                require(value["schemaSha256"] == hashlib.sha256(canonical(SCHEMA)).hexdigest(), "Schema checksum mismatch")
                require(value["consistency"] == "two-pass-stable-read-not-transactional" and value["originalBytes"] == "separate-files-portable-packages" and value["encrypted"] is False, "Invalid scope")
                timestamp(value["startedAt"])
                artwork_expected, artwork_manifests, artwork_summary = inspect_artwork_inventory(value["artwork"])
                header = value
            elif value.get("type") == "row":
                require(not artwork_started, "Data rows cannot follow artwork objects")
                keys(value, ["type", "table", "row"])
                table = value["table"]
                require(isinstance(table, str) and table in TABLES and table >= current_table, "Unknown or unordered table")
                current_table = table
                key = validate_row(table, value["row"], header["owner"])
                require(previous[table] is None or key > previous[table], "Duplicate or unordered identity")
                previous[table] = key
                insert_row(db, table, value["row"])
                digests[table].update(raw)
                restored_digests[table].update(canonical(value["row"]))
                counts[table] += 1
                count += 1
                require(count <= MAX_ROWS, "Too many records")
            elif value.get("type") == "artwork_object":
                artwork_started = True
                keys(value, ["type", "path", "bytes", "sha256", "data"])
                object_path = value["path"]
                require(isinstance(object_path, str) and object_path in artwork_expected and object_path not in artwork_seen, "Unknown/duplicate artwork object path")
                require(type(value["bytes"]) is int and {"bytes": value["bytes"], "sha256": value["sha256"]} == artwork_expected[object_path], "Artwork descriptor mismatch")
                require(isinstance(value["data"], str), "Invalid artwork binary encoding")
                try:
                    data = base64.b64decode(value["data"], validate=True)
                except (ValueError, binascii.Error) as error:
                    raise InvalidBackup("corrupt", "Invalid artwork base64") from error
                require(len(data) == value["bytes"] and hashlib.sha256(data).hexdigest() == value["sha256"], "Artwork checksum mismatch")
                if object_path in artwork_manifests:
                    require(read_json(data) == artwork_manifests[object_path], "Artwork activation manifest mismatch")
                artwork_seen.add(object_path); artwork_bytes += len(data)
                destination = Path(copy_to).parent / "artwork" / object_path
                destination.parent.mkdir(parents=True, exist_ok=True)
                with open(destination, "xb") as binary:
                    binary.write(data)
            elif value.get("type") == "manifest":
                keys(value, ["type", "format", "status", "startedAt", "finishedAt", "rows", "tables", "artworkObjects", "artworkBytes", "schemaSha256", "entriesSha256", "metadataStable", "issues", "assurance"])
                require(value["format"] == SCHEMA["format"] and value["schemaSha256"] == header["schemaSha256"], "Manifest schema mismatch")
                require(value["startedAt"] == header["startedAt"], "Manifest identity mismatch")
                require(timestamp(value["finishedAt"]) >= timestamp(value["startedAt"]), "Invalid snapshot time range")
                require(isinstance(value["assurance"], str), "Invalid assurance field")
                require(value["status"] == "complete" and value["metadataStable"] is True and value["issues"] == [], "Source changed during export; export again after pausing edits", "incomplete")
                require(value["entriesSha256"] == index.hexdigest(), "Snapshot checksum mismatch")
                require(type(value["rows"]) is int and value["rows"] == count, "Row count mismatch")
                keys(value["tables"], TABLES)
                for name in TABLES:
                    summary = value["tables"][name]
                    keys(summary, ["rows", "sha256"])
                    require(type(summary["rows"]) is int and summary["rows"] == counts[name] and summary["sha256"] == digests[name].hexdigest(), "Table checksum/count mismatch")
                require(artwork_seen == set(artwork_expected), "Missing private artwork original or variant", "incomplete")
                require(type(value["artworkObjects"]) is int and value["artworkObjects"] == len(artwork_seen) and type(value["artworkBytes"]) is int and value["artworkBytes"] == artwork_bytes, "Artwork count mismatch")
                manifest = value
            else:
                raise InvalidBackup("corrupt", "Unknown record type")
            if manifest is None:
                index.update(raw)
            copy.write(raw)
    require(manifest is not None, "Missing completion manifest", "interrupted")
    db.commit()
    # A second read from SQLite validates reconstructed values, not just saved bytes.
    roundtrip_rows = 0
    for table in TABLES:
        digest = hashlib.sha256()
        for row in restored_rows(db, table):
            validate_row(table, row, header["owner"])
            digest.update(canonical(row))
            roundtrip_rows += 1
        require(digest.digest() == restored_digests[table].digest(), "SQLite value round-trip mismatch")
    require(roundtrip_rows == count and db.execute("PRAGMA integrity_check").fetchone()[0] == "ok", "SQLite reconstruction failed")
    return header, {"rows": count, "tables": counts, "schemaSha256": header["schemaSha256"], "artwork": {**artwork_summary, "verifiedObjects": len(artwork_seen), "verifiedBytes": artwork_bytes}}


def verify_originals(db, packages, staging):
    docs = list(restored_rows(db, "documents"))
    r2 = {row["id"]: row for row in docs if row["storage_provider"] == "cloudflare_r2"}
    pending = sum(row["storage_state"] == "pending" for row in docs)
    cancelled = sum(row["storage_state"] == "cancelled" for row in docs)
    unsupported = sum(row["storage_provider"] != "cloudflare_r2" and row["storage_state"] not in ("pending", "cancelled") for row in docs)
    expected = {key for key, row in r2.items() if row["storage_state"] not in ("pending", "cancelled")}
    source_counts = {}
    missing = []
    for row in docs:
        provider = row["storage_provider"]
        source_counts[provider] = source_counts.get(provider, 0) + 1
        reason = None if row["storage_state"] == "cancelled" else "pending_upload_not_committed" if row["storage_state"] == "pending" else "unsupported_provider_original" if provider != "cloudflare_r2" else "files_package_not_provided" if not packages else None
        if reason:
            missing.append({"id": row["id"], "provider": provider, "originalFilename": row["original_filename"], "reason": reason})
    inventory = {"recordsByProvider": source_counts, "missingDocuments": missing}
    if not packages:
        return {"verified": not expected and not unsupported and not pending, "verifiedOriginals": 0, "missingR2Originals": len(expected), "unsupportedProviderOriginals": unsupported, "pendingUploads": pending, "cancelledUploadsMetadataOnly": cancelled, **inventory}
    spec = importlib.util.spec_from_file_location("files_export_verifier", ROOT / "scripts/verify-files-export.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    try:
        result = module.verify(packages, staging / "files")
    except module.InvalidExport as error:
        raise InvalidBackup(error.status, "Files package: " + str(error)) from error
    require(result["collectionComplete"], "Missing Files collection parts", "incomplete")
    actual = set()
    for path in (staging / "files/documents").glob("*.json"):
        metadata = read_json(path.read_bytes())
        identifier = metadata["id"]
        require(identifier in r2, "Files package contains a document absent from the snapshot", "inconsistent")
        document = r2[identifier]
        for key in ("title", "folder_id", "original_filename", "file_size", "checksum", "storage_state", "archived_at", "updated_at"):
            require(metadata.get(key) == document.get(key), "Files metadata does not match the system snapshot", "inconsistent")
        if document["storage_state"] not in ("pending", "cancelled"):
            require(metadata["object"]["status"] == "verified", "Unverified original", "incomplete")
            actual.add(identifier)
    require(actual == expected, "Original packages do not cover the full snapshot", "incomplete")
    # Shared folder and relationship metadata must match, too.
    for kind, table, wanted in [("folders", "file_folders", None), ("relationships", "entity_links", "document")]:
        original_rows = {row["id"]: row for row in restored_rows(db, table)
                         if wanted is None or row["source_type"] == wanted or row["target_type"] == wanted}
        found = set()
        for path in (staging / "files" / kind).glob("*.json"):
            row = read_json(path.read_bytes()); identifier = row.get("id")
            require(identifier in original_rows and all(original_rows[identifier].get(key) == value for key, value in row.items()), "Files relationship/folder metadata mismatch", "inconsistent")
            found.add(identifier)
        require(found == set(original_rows), "Files relationship/folder coverage mismatch", "inconsistent")
    return {"verified": not unsupported and not pending, "verifiedOriginals": len(actual), "missingR2Originals": 0, "unsupportedProviderOriginals": unsupported, "pendingUploads": pending, "cancelledUploadsMetadataOnly": cancelled, **inventory}


def safe_target(value):
    target = Path(os.path.abspath(value))
    require(not target.exists() and not target.is_symlink(), "Choose a new directory; existing paths are never overwritten", "restore_refused")
    require(target.parent.is_dir(), "Restore parent directory must already exist", "restore_refused")
    require(not any(parent.is_symlink() for parent in [target.parent, *target.parents]), "Symlink restore parents are refused", "restore_refused")
    return target


def verify(path, restore_to=None, files=None):
    target = safe_target(restore_to) if restore_to else None
    staging = Path(tempfile.mkdtemp(prefix=".system-restore-", dir=target.parent if target else None))
    db = None
    try:
        db = create_database(staging / "system.sqlite3")
        header, summary = inspect_snapshot(path, db, staging / "snapshot.ndjson")
        relations = verify_references(db)
        originals = verify_originals(db, files or [], staging)
        result = {"status": "verified" if originals["verified"] and summary["artwork"]["verified"] and not relations["unresolvedEndpoints"] else "verified_with_gaps",
                  "format": SCHEMA["format"], "businessDataVerified": True, "productionRestoreVerified": False,
                  **summary, "relationships": relations, "originals": originals, "exclusions": SCHEMA["exclusions"]}
        if target:
            for table, directory in [("notes", "notes"), ("note_versions", "note-versions")]:
                dest = staging / directory
                dest.mkdir()
                for row in restored_rows(db, table):
                    # Raw Markdown is written as text, never rendered or executed.
                    (dest / (row["id"] + ".md")).write_text(row["body_markdown"], encoding="utf-8")
            result["restoredTo"] = str(target)
            (staging / "restore-summary.json").write_bytes(canonical(result))
            (staging / "RESTORE-README.txt").write_text(
                "Personal OS isolated recovery rehearsal\n\n"
                "artwork/ preserves owner-prefixed R2 artwork key suffixes, exact activation manifests, originals and variants. No remote write is performed.\n"
                "system.sqlite3 contains separate typed tables with original IDs, ownership, archive status, Markdown and version history. JSON/array columns contain JSON text.\n"
                "snapshot.ndjson is the exact verified input. notes/ and note-versions/ contain original Markdown. files/ contains independently verified original packages when provided.\n"
                "This is NOT a PostgreSQL/Supabase production restore. No live providers or application queues were run.\n"
                "Review restore-summary.json gaps and exclusions. Never automatically replay pending calendar/agent operations. Reconnect providers only after a separately approved production recovery.\n"
                "Keep this sensitive, unencrypted directory private. Do not publish it.\n", encoding="utf-8")
        db.close(); db = None
        if target:
            # Atomic exclusive mkdir refuses even an empty existing directory.
            # The parent must be trusted; publish only after every check succeeds.
            try:
                target.mkdir(mode=0o700)
            except FileExistsError as error:
                raise InvalidBackup("restore_refused", "Restore target appeared during verification") from error
            for item in staging.iterdir():
                os.rename(item, target / item.name)
        return result
    finally:
        if db is not None:
            db.close()
        shutil.rmtree(staging)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot")
    parser.add_argument("--files", nargs="+", default=[], help="All portable Files tar parts from the same collection")
    parser.add_argument("--restore-to", help="New directory under a trusted existing local parent")
    args = parser.parse_args()
    try:
        result = verify(args.snapshot, args.restore_to, args.files)
        print(json.dumps(result, ensure_ascii=False))
        return 0 if result["status"] == "verified" else 3
    except InvalidBackup as error:
        print(json.dumps({"status": error.status, "error": str(error)}, ensure_ascii=False))
        return 2 if error.status == "interrupted" else 1
    except (OSError, sqlite3.Error, ValueError, RecursionError):
        print(json.dumps({"status": "failed", "error": "Local file or database operation failed; no production action was taken."}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
