#!/usr/bin/env python3
"""Verify workbench migrations in a new, network-disabled PostgreSQL 17 container.

No connection URL, credentials, existing container or database target are accepted.
Only repository-owned synthetic fixtures enter this disposable database. Separate
psql sessions prove that overlapping writers wait on the real database locks.
"""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import select
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "workbench_backup_rehearsal", ROOT / "scripts/rehearse-system-backup-postgres.py"
)
rehearsal = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rehearsal)

REGRESSIONS = (
    "tests/workbench-operation-database.sql",
    "tests/fixtures/workbench/scenes-regression.sql",
    "tests/life-field-postgres.sql",
    "tests/workbench-performance-postgres.sql",
)
WORKBENCH_SUFFIXES = (
    "_workspace_action_receipts.sql",
    "_workbench_core_metadata.sql",
    "_workbench_calendar_request_keys.sql",
    "_life_field_operations.sql",
    "_workspace_scenes.sql",
    "_workbench_undo_dispatch.sql",
    "_workbench_policy_fk_performance.sql",
    "_continuous_material_sources.sql",
    "_continuous_domain_workflows.sql",
    "_continuous_material_receipts.sql",
    "_inbox_dispatch_mutex.sql",
    "_continuous_ai_capture_intents.sql",
    "_continuous_practice_intents.sql",
    "_continuous_scene_state.sql",
    "_continuous_briefing_judgment_intents.sql",
    "_continuous_agent_run_generations.sql",
    "_continuous_life_request_reconcile.sql",
)
OWNER = "a1000000-0000-4000-8000-000000000001"
SCENE_OWNER = "a1000000-0000-4000-8000-000000000002"
SNAPSHOT = {
    "version": 1,
    "main": {"href": "/notes?view=recent"},
    "reference": None,
    "layout": {"referenceFirst": False, "referenceWidth": 42, "mobilePane": "main"},
}


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def json_literal(value):
    return literal(json.dumps(value, separators=(",", ":"))) + "::jsonb"


class SyntheticPostgres(rehearsal.IsolatedPostgres):
    def command(self, args, input=None):
        result = subprocess.run(["docker", *args], input=input, text=True, capture_output=True, timeout=300)
        if result.returncode:
            # This subclass accepts only checked-in synthetic fixtures, never a
            # user snapshot or existing connection. A bounded diagnostic is safe.
            raise RuntimeError("Synthetic PostgreSQL command failed: " + result.stderr[-3000:])
        return result.stdout

    def session(self):
        return subprocess.Popen(
            ["docker", "exec", "-i", self.name, "psql", "--no-psqlrc", "-X", "-q", "-A", "-t",
             "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "source_fixture"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, bufsize=1,
        )


def check_inventory(db, database):
    raw = db.sql(database, "select json_agg(json_build_object('table',table_name,'column',column_name)) from information_schema.columns where table_schema='public';")
    actual = {}
    for item in json.loads(raw):
        actual.setdefault(item["table"], set()).add(item["column"])
    for table, definition in rehearsal.TABLES.items():
        if actual.get(table, set()) - set(definition["excludedColumns"]) != set(definition["columns"]):
            raise RuntimeError("Backup inventory mismatch: " + table)
    unknown = set(actual) - set(rehearsal.TABLES) - set(rehearsal.SCHEMA["excludedTables"])
    if unknown:
        raise RuntimeError("Unclassified database tables: " + ",".join(sorted(unknown)))


def auth(owner):
    return "set local role authenticated; set local request.jwt.claim.sub=" + literal(owner) + ";"


def metadata(request_id, target, title):
    items = [{"id": target, "expectedRevision": 0, "title": title}]
    return "select public.apply_workbench_metadata(" + literal(request_id) + "::uuid,'note_rename'," + json_literal(items) + ");"


def quantity(request_id, target, amount):
    items = [{"id": target, "expected_revision": 1, "quantity": amount, "quantity_unit": "kg"}]
    return "select public.apply_life_field_operation(" + literal(request_id) + "::uuid,'shopping_quantity'," + json_literal(items) + ");"


def scene(scene_id, request_id, expected_revision=0, name="Concurrent synthetic scene"):
    return "select public.save_workspace_scene(" + literal(scene_id) + "::uuid," + literal(request_id) + "::uuid," + str(expected_revision) + "," + literal(name) + "," + json_literal(SNAPSHOT) + ",false);"


def output_json(output):
    return [json.loads(line) for line in output.splitlines() if line.startswith("{")]


def read_ready(process):
    chunks = []
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError("First synthetic writer exited before holding its transaction: " + process.stderr.read()[-1500:])
        ready, _, _ = select.select([process.stdout], [], [], min(0.1, max(0, deadline - time.monotonic())))
        if not ready:
            continue
        chunk = os.read(process.stdout.fileno(), 65536).decode()
        chunks.append(chunk)
        if "WORKBENCH_FIRST_WRITE_HELD\n" in "".join(chunks):
            return "".join(chunks)
    raise RuntimeError("Synthetic writer did not reach its held transaction")


def finish(process):
    process.wait(timeout=20)
    return process.returncode, process.stdout.read(), process.stderr.read()


def overlap(db, owner, first_sql, second_sql, expected_error=None):
    """Hold writer one's commit until writer two is observed waiting on a lock."""
    first, second = db.session(), db.session()
    app_name = "workbench-synthetic-" + uuid.uuid4().hex
    try:
        first.stdin.write("begin;" + auth(owner) + first_sql + "\n\\echo WORKBENCH_FIRST_WRITE_HELD\n")
        first.stdin.flush()
        initial = read_ready(first)
        second.stdin.write("set application_name=" + literal(app_name) + "; begin;" + auth(owner) + second_sql + "commit;")
        second.stdin.close()
        waited = False
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            raw = db.sql("source_fixture", "select coalesce(bool_or(wait_event_type='Lock' and state='active'),false) from pg_stat_activity where application_name=" + literal(app_name) + ";")
            if raw.strip() == "t":
                waited = True
                break
            if second.poll() is not None:
                break
            time.sleep(0.03)
        if not waited:
            raise RuntimeError("Second synthetic writer was not observed waiting on the held transaction")
        first.stdin.write("commit;\n")
        first.stdin.close()
        with ThreadPoolExecutor(max_workers=2) as pool:
            first_result = pool.submit(finish, first)
            second_result = pool.submit(finish, second)
            code_one, output_one, error_one = first_result.result()
            code_two, output_two, error_two = second_result.result()
        if code_one:
            raise RuntimeError("First synthetic writer failed: " + error_one[-1500:])
        if expected_error:
            if code_two == 0 or expected_error not in error_two:
                raise RuntimeError("Second synthetic writer did not reject stale input: " + error_two[-1500:])
        elif code_two:
            raise RuntimeError("Second synthetic writer failed: " + error_two[-1500:])
        return output_json(initial + output_one), output_json(output_two)
    finally:
        for process in (first, second):
            if process.poll() is None:
                process.kill()
                process.wait(timeout=10)
            for stream in (process.stdin, process.stdout, process.stderr):
                if stream and not stream.closed:
                    stream.close()


def concurrency(db):
    note_one = "a2000000-0000-4000-8000-000000000001"
    note_two = "a2000000-0000-4000-8000-000000000002"
    shop_one = "a3000000-0000-4000-8000-000000000001"
    shop_two = "a3000000-0000-4000-8000-000000000002"
    db.sql("source_fixture", "insert into auth.users(id) values(" + literal(OWNER) + "),(" + literal(SCENE_OWNER) + ");"
           + "insert into public.notes(id,user_id,title,body_markdown,status,revision) values(" + literal(note_one) + "," + literal(OWNER) + ",'CAS synthetic','Synthetic body','active',1),(" + literal(note_two) + "," + literal(OWNER) + ",'Retry synthetic','Synthetic body','active',1);"
           + "insert into public.purchase_items(id,user_id,title,status,price_cny) values(" + literal(shop_one) + "," + literal(OWNER) + ",'CAS synthetic quantity','ready',12),(" + literal(shop_two) + "," + literal(OWNER) + ",'Retry synthetic quantity','ready',13);")

    first, _ = overlap(db, OWNER, metadata(str(uuid.uuid4()), note_one, "Winner"), metadata(str(uuid.uuid4()), note_one, "Stale"), "workbench_conflict")
    assert first[0]["receiptId"]
    db.sql("source_fixture", "do $$begin assert (select title='Winner' and mutation_revision=1 and revision=2 from public.notes where id=" + literal(note_one) + "); assert (select count(*)=1 from public.note_versions where note_id=" + literal(note_one) + "); end $$;")

    request_id = str(uuid.uuid4())
    first, second = overlap(db, OWNER, metadata(request_id, note_two, "Only once"), metadata(request_id, note_two, "Only once"))
    assert first[0]["receiptId"] == second[0]["receiptId"] and second[0]["replayed"] is True and second[0]["rows"] == []
    db.sql("source_fixture", "do $$begin assert (select count(*)=1 from public.workspace_action_receipts where request_id=" + literal(request_id) + "); assert (select mutation_revision=1 and revision=2 from public.notes where id=" + literal(note_two) + "); assert (select count(*)=1 from public.note_versions where note_id=" + literal(note_two) + "); end $$;")

    overlap(db, OWNER, quantity(str(uuid.uuid4()), shop_one, "2.125"), quantity(str(uuid.uuid4()), shop_one, "9"), "life_conflict")
    db.sql("source_fixture", "do $$begin assert (select quantity='2.125' and mutation_revision=2 from public.purchase_items where id=" + literal(shop_one) + "); end $$;")
    request_id = str(uuid.uuid4())
    first, second = overlap(db, OWNER, quantity(request_id, shop_two, "3.125"), quantity(request_id, shop_two, "3.125"))
    assert first[0]["receiptId"] == second[0]["receiptId"] and second[0]["duplicate"] is True
    db.sql("source_fixture", "do $$begin assert (select mutation_revision=2 and quantity='3.125' from public.purchase_items where id=" + literal(shop_two) + "); assert (select count(*)=1 from public.workspace_action_receipts where request_id=" + literal(request_id) + "); end $$;")

    scene_ids = [str(uuid.uuid4()) for _ in range(21)]
    setup = "begin;" + auth(SCENE_OWNER)
    setup += "".join(scene(identifier, str(uuid.uuid4())) for identifier in scene_ids[:19]) + "commit;"
    seeded = output_json(db.sql("source_fixture", setup))
    assert len(seeded) == 19 and all(row["status"] == "saved" for row in seeded)
    first, second = overlap(db, SCENE_OWNER, scene(scene_ids[19], str(uuid.uuid4())), scene(scene_ids[20], str(uuid.uuid4())))
    assert first[0]["status"] == "saved" and second[0]["status"] == "limit"
    db.sql("source_fixture", "do $$begin assert (select count(*)=20 from public.workspace_scenes where user_id=" + literal(SCENE_OWNER) + " and archived_at is null); end $$;")
    first, second = overlap(db, SCENE_OWNER, scene(scene_ids[0], str(uuid.uuid4()), 1, "Winner"), scene(scene_ids[0], str(uuid.uuid4()), 1, "Stale"))
    assert first[0]["status"] == "saved" and first[0]["scene"]["revision"] == 2 and second[0]["status"] == "conflict"
    return ["core-CAS-single-winner", "core-request-id-single-mutation", "life-CAS-single-winner", "life-request-id-single-mutation", "scene-concurrent-quota-20", "scene-CAS-single-winner"]


def main():
    if len(sys.argv) != 1:
        raise RuntimeError("This synthetic verifier accepts no connection or target arguments")
    migrations = [(path, path.read_text()) for path in sorted((ROOT / "supabase/migrations").glob("*.sql"))]
    first_workbench = next(i for i, (path, _) in enumerate(migrations) if path.name.endswith(WORKBENCH_SUFFIXES[0]))
    actual_suffixes = [next((suffix for suffix in WORKBENCH_SUFFIXES if path.name.endswith(suffix)), None) for path, _ in migrations[first_workbench:]]
    if actual_suffixes != list(WORKBENCH_SUFFIXES):
        raise RuntimeError("Workbench migration boundary or order changed; review the upgrade fixture explicitly")
    output = ROOT / "test-results/workbench-postgres/result.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    with SyntheticPostgres() as db:
        bootstrap = (ROOT / "tests/fixtures/system-backup-sql/bootstrap.sql").read_text()
        db.sql("postgres", "create database source_fixture; create database restored_fixture;")
        for database in ("source_fixture", "restored_fixture"):
            db.sql(database, bootstrap)
            for index, (path, sql) in enumerate(migrations):
                if database == "restored_fixture" and index == first_workbench:
                    db.sql(database, (ROOT / "tests/pre-workbench-legacy-fixture.sql").read_text())
                try:
                    db.sql(database, sql)
                except RuntimeError as error:
                    raise RuntimeError("Actual migration failed: " + path.name + ": " + str(error)) from error
            check_inventory(db, database)
        db.sql("restored_fixture", (ROOT / "tests/life-field-upgrade-postgres.sql").read_text())
        for filename in REGRESSIONS:
            try:
                db.sql("source_fixture", (ROOT / filename).read_text())
            except RuntimeError as error:
                raise RuntimeError("Actual-schema regression failed: " + filename + ": " + str(error)) from error
        concurrent_checks = concurrency(db)
        result = {
            "status": "verified", "engine": "PostgreSQL 17", "migrations": len(migrations),
            "cleanReplay": True, "legacyDataUpgrade": True, "backupInventoryMatches": True,
            "regressions": list(REGRESSIONS), "overlappingTransactions": concurrent_checks,
            "migrationSha256": {path.name: hashlib.sha256(sql.encode()).hexdigest() for path, sql in migrations[first_workbench:]},
            "isolated": True, "productionAccess": False, "containerRetained": False,
        }
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.SubprocessError, OSError, AssertionError) as error:
        print(json.dumps({"status": "failed", "error": str(error), "productionAccess": False}))
        sys.exit(1)
