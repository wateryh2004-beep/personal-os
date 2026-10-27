#!/usr/bin/env python3
"""Recover a verified snapshot into a NEW network-disabled PostgreSQL container.

Accepts no connection URL, credentials, existing container, or database target.
Production can never be selected. Docker and the official postgres:17 image are
required. The disposable container is destroyed on success or failure.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("system_backup_verifier", ROOT / "scripts/verify-system-backup.py")
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)
SCHEMA, TABLES = verifier.SCHEMA, verifier.TABLES


def literal(value):
    return "'" + value.replace("'", "''") + "'"


class IsolatedPostgres:
    def __init__(self, fixture=False):
        self.name = "personal-os-rehearsal-" + uuid.uuid4().hex
        self.started = False
        self.fixture = fixture
        self.phase = "container-start"

    def fixture_error_details(self, stderr):
        # Only --fixture calls this. Never include SQL, DETAIL, row values or
        # arbitrary server text; identifiers must belong to our static schema.
        code = re.search(r"(?:ERROR|FATAL):\s+([0-9A-Z]{5})(?::|\s|$)", stderr)
        sqlstate = code.group(1) if code else "unknown"
        category = {"23502": "not_null", "23503": "foreign_key", "23505": "unique",
                    "23514": "check", "42501": "privilege", "22023": "invalid_parameter",
                    "P0001": "domain_exception", "42P01": "missing_relation",
                    "42703": "missing_column", "42883": "missing_function"}.get(sqlstate, "postgres_error")
        details = {"phase": self.phase, "sqlstate": sqlstate, "category": category}
        tables = set(TABLES) | set(SCHEMA["excludedTables"]) | {"users"}
        columns = {column for definition in TABLES.values()
                   for column in list(definition["columns"]) + definition["excludedColumns"]}
        for label, key, allowed in (("TABLE NAME", "table", tables), ("COLUMN NAME", "column", columns)):
            match = re.search(r"(?m)^\s*" + label + r":\s+([a-z_][a-z0-9_]*)\s*$", stderr)
            if match and match.group(1) in allowed:
                details[key] = match.group(1)
        return " [synthetic fixture " + json.dumps(details, sort_keys=True) + "]"

    def command(self, args, input=None):
        completed = subprocess.run(["docker", *args], input=input, text=True, capture_output=True, timeout=300)
        if completed.returncode:
            # SQL stderr may contain actual private row values; never print it.
            details = self.fixture_error_details(completed.stderr) if self.fixture else ""
            raise RuntimeError("Isolated PostgreSQL command failed; inspect locally without publishing private row data" + details)
        return completed.stdout

    def __enter__(self):
        try:
            self.command(["run", "--rm", "--detach", "--network", "none", "--name", self.name,
                          "--env", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17"])
            self.started = True
            for _ in range(60):
                ready = subprocess.run(["docker", "exec", self.name, "pg_isready", "-U", "postgres"], capture_output=True, timeout=5)
                if ready.returncode == 0:
                    self.phase = "postgres-bootstrap"
                    self.sql("postgres", "create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;")
                    return self
                time.sleep(1)
            raise RuntimeError("Disposable PostgreSQL did not become ready")
        except BaseException:
            self.__exit__(None, None, None)
            raise

    def __exit__(self, *_):
        if self.started:
            self.command(["stop", "--time", "2", self.name])
            self.started = False

    def sql(self, database, sql):
        # All database identifiers are fixed literals in this program.
        assert database in ("postgres", "source_fixture", "restored_fixture")
        verbosity = ["-v", "VERBOSITY=verbose"] if self.fixture else []
        return self.command(["exec", "-i", self.name, "psql", "--no-psqlrc", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", *verbosity, "-U", "postgres", "-d", database], sql)

    def initialize(self, database):
        self.phase = "database-create"
        self.sql("postgres", "create database " + verifier.quoted(database) + ";")
        self.phase = "schema-bootstrap"
        self.sql(database, (ROOT / "tests/fixtures/system-backup-sql/bootstrap.sql").read_text())
        for migration in sorted((ROOT / "supabase/migrations").glob("*.sql")):
            try:
                self.phase = "migration"
                self.sql(database, migration.read_text())
            except RuntimeError as error:
                details = "; " + str(error) if self.fixture else ""
                raise RuntimeError("Migration failed in isolated PostgreSQL: " + migration.name + details) from error
        # Check actual schema coverage, including later improvements in this release.
        self.phase = "schema-inventory"
        raw = self.sql(database, "select json_agg(json_build_object('table',table_name,'column',column_name)) from information_schema.columns where table_schema='public';")
        columns = json.loads(raw)
        actual = {}
        for entry in columns:
            actual.setdefault(entry["table"], set()).add(entry["column"])
        for table, definition in TABLES.items():
            if actual.get(table, set()) - set(definition["excludedColumns"]) != set(definition["columns"]):
                raise RuntimeError("Backup schema inventory drift: " + table)
        unknown = set(actual) - set(TABLES) - set(SCHEMA["excludedTables"])
        if unknown:
            raise RuntimeError("Unclassified tables in backup inventory: " + ", ".join(sorted(unknown)))

    def rows(self, database, owner):
        self.phase = "snapshot-read"
        output = {}
        for table, definition in TABLES.items():
            columns = ",".join(map(verifier.quoted, definition["columns"]))
            order = ",".join(map(verifier.quoted, definition["primaryKey"]))
            raw = self.sql(database, "begin; set local timezone='UTC'; set local role authenticated; set local request.jwt.claim.sub=" + literal(owner) + "; select row_to_json(t) from (select " + columns + " from public." + verifier.quoted(table) + " where user_id=" + literal(owner) + " order by " + order + ") t; rollback;")
            output[table] = [json.loads(line) for line in raw.splitlines() if line]
        return output


def write_snapshot(data, owner, target, artwork_source=None):
    started = "2026-10-07T00:00:00.000Z"
    sha = hashlib.sha256(verifier.canonical(SCHEMA)).hexdigest()
    artwork = {"status": "complete", "entries": [{"id": entry["id"], "status": "not_imported", "manifest": None, "manifestBytes": None, "manifestSha256": None} for entry in verifier.ARTWORK_REGISTRY]}
    if artwork_source:
        with open(artwork_source, "rb") as source:
            artwork = verifier.read_json(source.readline(verifier.MAX_LINE + 1))["artwork"]
    header = {"type": "header", "format": SCHEMA["format"], "exportId": str(uuid.uuid4()), "owner": owner,
              "startedAt": started, "schema": SCHEMA, "schemaSha256": sha, "consistency": "two-pass-stable-read-not-transactional",
              "originalBytes": "separate-files-portable-packages", "encrypted": False, "artwork": artwork}
    index, summaries, count = hashlib.sha256(), {}, 0
    with open(target, "xb") as stream:
        raw = verifier.canonical(header); stream.write(raw); index.update(raw)
        for table in TABLES:
            digest = hashlib.sha256()
            for row in data[table]:
                raw = verifier.canonical({"type": "row", "table": table, "row": row})
                stream.write(raw); digest.update(raw); index.update(raw); count += 1
            summaries[table] = {"rows": len(data[table]), "sha256": digest.hexdigest()}
        artwork_count = artwork_bytes = 0
        if artwork_source:
            with open(artwork_source, "rb") as source:
                for raw in source:
                    value = verifier.read_json(raw)
                    if value["type"] == "artwork_object":
                        stream.write(raw); index.update(raw)
                        artwork_count += 1; artwork_bytes += value["bytes"]
        stream.write(verifier.canonical({"type": "manifest", "format": SCHEMA["format"], "status": "complete", "startedAt": started,
            "finishedAt": started, "rows": count, "tables": summaries, "artworkObjects": artwork_count, "artworkBytes": artwork_bytes, "schemaSha256": sha, "entriesSha256": index.hexdigest(),
            "metadataStable": True, "issues": [], "assurance": "Synthetic isolated fixture; no production access"}))


def read_snapshot_rows(snapshot):
    result = {table: [] for table in TABLES}
    owner = None
    with open(snapshot, "rb") as stream:
        for line in stream:
            value = verifier.read_json(line)
            if value["type"] == "header":
                owner = value["owner"]
            elif value["type"] == "row":
                result[value["table"]].append(value["row"])
    return owner, result


def restore(pg, owner, data):
    # Only this newly-created, network-disabled container can reach this code.
    # replica suppresses side-effect/append-only triggers AND FK triggers. CHECK,
    # type, NOT NULL, uniqueness still run. Every actual FK is checked below.
    statements = ["begin;", "set local timezone='UTC';", "set local standard_conforming_strings=on;", "set local session_replication_role=replica;",
                  "insert into auth.users(id) values (" + literal(owner) + ");"]
    for table, definition in TABLES.items():
        columns = ",".join(map(verifier.quoted, definition["columns"]))
        for row in data[table]:
            payload = json.dumps(row, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
            statements.append("insert into public." + verifier.quoted(table) + " (" + columns + ") select " + columns
                              + " from jsonb_populate_record(null::public." + verifier.quoted(table) + ", " + literal(payload) + "::jsonb);")
    statements.append("set local session_replication_role=origin; commit;")
    pg.phase = "restore-insert"
    pg.sql("restored_fixture", "\n".join(statements))
    # Dynamic inspection checks the real migrated database FK graph, including
    # cycles and auth ownership, rather than only our portable-schema copy.
    pg.phase = "restore-foreign-keys"
    pg.sql("restored_fixture", """
do $$ declare r record; match text; nonnull text; bad bigint; begin
 for r in select c.oid,c.conrelid,c.confrelid,c.conkey,c.confkey from pg_constraint c join pg_namespace n on n.oid=c.connamespace where c.contype='f' and n.nspname in ('public','auth') loop
  select string_agg(format('s.%I=t.%I',s.attname,t.attname),' and '),string_agg(format('s.%I is not null',s.attname),' and ')
  into match,nonnull from unnest(r.conkey,r.confkey) cols(skey,tkey)
  join pg_attribute s on s.attrelid=r.conrelid and s.attnum=cols.skey
  join pg_attribute t on t.attrelid=r.confrelid and t.attnum=cols.tkey;
  execute format('select count(*) from %s s where %s and not exists (select 1 from %s t where %s)',r.conrelid::regclass,nonnull,r.confrelid::regclass,match) into bad;
  if bad<>0 then raise exception 'restored foreign key mismatch'; end if;
 end loop;
end $$;
""")
    # Nothing external can be replayed: no network, no app workers, no secrets.
    return pg.rows("restored_fixture", owner)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--fixture", action="store_true", help="Synthetic full-migration round trip for CI")
    mode.add_argument("--snapshot", help="Previously downloaded logical snapshot; never connects to production")
    parser.add_argument("--files", nargs="+", default=[])
    args = parser.parse_args()
    try:
        with tempfile.TemporaryDirectory(prefix="personal-os-postgres-rehearsal-") as temporary:
            snapshot = Path(args.snapshot) if args.snapshot else Path(temporary) / "fixture.ndjson"
            if args.snapshot:
                local = verifier.verify(snapshot, files=args.files)
                if local["status"] != "verified":
                    raise RuntimeError("Snapshot has unresolved original/relationship gaps; resolve them before PostgreSQL rehearsal")
            with IsolatedPostgres(fixture=args.fixture) as pg:
                if args.fixture:
                    pg.initialize("source_fixture")
                    pg.phase = "fixture-seed"
                    pg.sql("source_fixture", (ROOT / "tests/fixtures/system-backup-sql/seed.sql").read_text())
                    owner = "00000000-0000-4000-8000-000000000001"
                    before = pg.rows("source_fixture", owner)
                    assert len(before["notes"]) == 1 and len(before["note_versions"]) == 2
                    write_snapshot(before, owner, snapshot)
                    local = verifier.verify(snapshot)
                    assert local["status"] == "verified"
                owner, before = read_snapshot_rows(snapshot)
                pg.initialize("restored_fixture")
                after = restore(pg, owner, before)
                if before != after:
                    changed = [table for table in TABLES if before[table] != after[table]]
                    raise RuntimeError("Re-export values differ after PostgreSQL restore: " + ", ".join(changed))
                if args.fixture:
                    assert len(after["briefing_judgment_versions"]) == 1
                    assert after["inbox_items"][0]["capture_content_hash"] is not None
                    assert after["interview_practice_attempts"][0]["submission_fingerprint"] is not None
                    pg.phase = "restored-technical-exclusions"
                    technical = pg.sql("restored_fixture", "select count(*) from public.inbox_items where ai_classification_token is not null or ai_classification_started_at is not null or ai_classification_content_hash is not null;").strip()
                    assert technical == "0", "classification lease was replayed during restore"
                    technical = pg.sql("restored_fixture", "select count(*) from public.agent_runs where generation_token is not null or generation_expires_at is not null;").strip()
                    assert technical == "0", "agent execution lease was replayed during restore"
                reexport = Path(temporary) / "reexport.ndjson"
                write_snapshot(after, owner, reexport, artwork_source=snapshot)
                verifier.verify(reexport, files=args.files)
                result = {"status": "verified", "engine": "PostgreSQL 17", "actualMigrationsApplied": True,
                    "tables": len(TABLES), "rows": sum(map(len, after.values())), "countsContentAndRelationshipsEqual": True,
                    "isolated": True, "productionRestoreExecuted": False, "containerRetained": False}
            print(json.dumps(result))
        return 0
    except (RuntimeError, verifier.InvalidBackup, OSError, subprocess.SubprocessError, AssertionError) as error:
        message = str(error) if isinstance(error, (RuntimeError, verifier.InvalidBackup)) else "Docker/fixture execution failed; no production connection was used"
        print(json.dumps({"status": "failed", "error": message}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
