import importlib.util
import contextlib
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("recovery", ROOT / "scripts/rehearse-system-backup-postgres.py")
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


class PostgresRecoverySafety(unittest.TestCase):
    def briefing_reference_fixture(self):
        owner = "00000000-0000-4000-8000-000000000001"
        tables = ["feeds", "feed_items", "feed_item_clusters", "briefings", "briefing_entries", "decisions", "decision_sources"]
        ids = {table: f"30000000-0000-4000-8000-{index:012d}" for index, table in enumerate(tables, 1)}
        data = {table: [] for table in recovery.TABLES}
        for table in tables:
            row = {}
            for key, field in recovery.TABLES[table]["columns"].items():
                row[key] = (owner if key == "user_id" else ids[table] if key == "id" else None if field["nullable"] else
                            ids[table] if field["type"] == "uuid" else 1 if field["type"] == "number" else
                            False if field["type"] == "boolean" else [] if field["type"] == "array" else
                            {} if field["type"] == "json" else "2026-10-27T00:00:00Z" if key.endswith("_at") else "Synthetic")
            data[table].append(row)
        for table in tables:
            for relation in recovery.TABLES[table]["foreignKeys"]:
                if all(data[table][0][column] is not None for column in relation["columns"]):
                    for column, target in zip(relation["columns"], relation["targetColumns"]):
                        data[table][0][column] = data[relation["table"]][0][target]
        data["decision_sources"][0].update(source_type="briefing_entry", source_id=ids["briefing_entries"], source_role="origin")
        return owner, data

    def test_briefing_entry_judgment_source_survives_real_portable_verification(self):
        owner, data = self.briefing_reference_fixture()
        with tempfile.TemporaryDirectory() as temporary:
            snapshot = Path(temporary) / "synthetic.ndjson"
            recovery.write_snapshot(data, owner, snapshot)
            result = recovery.verifier.verify(snapshot)
        self.assertEqual(result["status"], "verified")
        self.assertEqual(result["relationships"]["unresolvedEndpoints"], 0)
        self.assertGreater(result["relationships"]["foreignKeyChecks"], 0)

    def test_missing_and_unknown_polymorphic_sources_still_report_real_gaps(self):
        for missing in (True, False):
            owner, data = self.briefing_reference_fixture()
            if missing:
                data["briefing_entries"] = []
            else:
                data["decision_sources"][0]["source_type"] = "unknown_synthetic_type"
            with tempfile.TemporaryDirectory() as temporary:
                snapshot = Path(temporary) / "synthetic.ndjson"
                recovery.write_snapshot(data, owner, snapshot)
                result = recovery.verifier.verify(snapshot)
            self.assertEqual(result["status"], "verified_with_gaps")
            self.assertEqual(result["relationships"]["unresolvedEndpoints"], 1)
            self.assertEqual(result["relationships"]["samples"][0]["table"], "decision_sources")

    def test_only_fixture_main_emits_fixed_assertion_labels(self):
        for fixture in (False, True):
            for label in ("source_snapshot_verified", "SENSITIVE_PRIVATE_BODY sentinel=synthetic-secret"):
                output = io.StringIO()
                arguments = ["rehearse", "--fixture"] if fixture else ["rehearse", "--snapshot", "unused-synthetic-path"]
                with patch.object(recovery.sys, "argv", arguments), patch.object(recovery.tempfile, "TemporaryDirectory", side_effect=AssertionError(label)), contextlib.redirect_stdout(output):
                    self.assertEqual(recovery.main(), 1)
                result = json.loads(output.getvalue())
                self.assertEqual(result["status"], "failed")
                self.assertNotIn("SENSITIVE_PRIVATE_BODY", output.getvalue())
                self.assertEqual(result["error"], "Docker/fixture execution failed; no production connection was used")
                if fixture:
                    self.assertEqual(result["fixtureFailure"], "assertion")
                    self.assertEqual(result["fixtureCheck"], label if label == "source_snapshot_verified" else "unlabeled_assertion")
                else:
                    self.assertNotIn("fixtureFailure", result)
                    self.assertNotIn("fixtureCheck", result)

    def test_container_is_fresh_unpublished_network_disabled_and_removed(self):
        calls = []
        def run(args, **kwargs):
            calls.append((args, kwargs))
            return subprocess.CompletedProcess(args, 0, stdout="", stderr="")
        with patch.object(recovery.subprocess, "run", side_effect=run):
            with recovery.IsolatedPostgres() as database:
                database.sql("restored_fixture", "select 1;")
                name = database.name
                with self.assertRaises(AssertionError):
                    database.sql("production", "select 1;")
        start = calls[0][0]
        self.assertEqual(start[:6], ["docker", "run", "--rm", "--detach", "--network", "none"])
        self.assertEqual(start[-1], "postgres:17")
        self.assertNotIn("--publish", start)
        self.assertNotIn("--volume", start)
        self.assertTrue(name.startswith("personal-os-rehearsal-"))
        self.assertEqual(calls[-1][0], ["docker", "stop", "--time", "2", name])

    def test_container_is_cleaned_even_if_bootstrap_fails(self):
        calls = []
        def run(args, **kwargs):
            calls.append(args)
            return subprocess.CompletedProcess(args, 1 if "psql" in args else 0, stdout="", stderr="sensitive fake row")
        with patch.object(recovery.subprocess, "run", side_effect=run):
            with self.assertRaisesRegex(RuntimeError, "Isolated PostgreSQL command failed"):
                with recovery.IsolatedPostgres():
                    pass
        self.assertEqual(calls[-1][1], "stop")

    def test_integral_postgres_numeric_has_the_same_semantics_as_sqlite_integer(self):
        self.assertEqual(recovery.verifier.canonical({"budget": 10.0, "nested": [1.0, True, "10.000000"]}), recovery.verifier.canonical({"budget": 10, "nested": [1, True, "10.000000"]}))

    def test_private_snapshot_errors_keep_the_original_generic_message(self):
        database = recovery.IsolatedPostgres()
        private = "SENSITIVE_PRIVATE_BODY sentinel=synthetic-secret"
        stderr = "ERROR:  23502: " + private + "\nTABLE NAME: inbox_items\nCOLUMN NAME: content_markdown\n"
        with patch.object(recovery.subprocess, "run", return_value=subprocess.CompletedProcess([], 1, "", stderr)):
            with self.assertRaises(RuntimeError) as raised:
                database.command(["exec"])
        self.assertEqual(str(raised.exception), "Isolated PostgreSQL command failed; inspect locally without publishing private row data")

    def test_synthetic_fixture_diagnostics_exclude_private_server_text(self):
        database = recovery.IsolatedPostgres(fixture=True)
        database.phase = "fixture-seed"
        private = "SENSITIVE_PRIVATE_BODY sentinel=synthetic-secret"
        stderr = "ERROR:  23502: " + private + "\nDETAIL: " + private + "\nTABLE NAME: inbox_items\nCOLUMN NAME: content_markdown\n"
        with patch.object(recovery.subprocess, "run", return_value=subprocess.CompletedProcess([], 1, "", stderr)):
            with self.assertRaises(RuntimeError) as raised:
                database.command(["exec"])
        message = str(raised.exception)
        self.assertIn('"phase": "fixture-seed"', message)
        self.assertIn('"sqlstate": "23502"', message)
        self.assertIn('"category": "not_null"', message)
        self.assertIn('"table": "inbox_items"', message)
        self.assertIn('"column": "content_markdown"', message)
        self.assertNotIn(private, message)
        self.assertNotIn("DETAIL", message)

    def test_fixture_diagnostics_allow_only_static_schema_identifiers(self):
        database = recovery.IsolatedPostgres(fixture=True)
        message = database.fixture_error_details("ERROR:  23514: synthetic-private-detail\nTABLE NAME: synthetic_private_table\nCOLUMN NAME: synthetic_private_column\n")
        self.assertIn('"category": "check"', message)
        self.assertNotIn("synthetic_private", message)
        self.assertNotIn("synthetic-private-detail", message)

    def test_verbose_sqlstate_collection_is_enabled_only_for_synthetic_fixture(self):
        for fixture in (False, True):
            database = recovery.IsolatedPostgres(fixture=fixture)
            with patch.object(database, "command", return_value="") as command:
                database.sql("source_fixture", "select 1;")
            self.assertEqual("VERBOSITY=verbose" in command.call_args.args[0], fixture)

    def test_sql_payload_quotes_and_no_existing_target_support(self):
        self.assertEqual(recovery.literal("a'b\\c"), "'a''b\\c'")
        source = (ROOT / "scripts/rehearse-system-backup-postgres.py").read_text()
        self.assertNotIn('os.environ', source)
        self.assertNotIn('DATABASE_URL', source)
        self.assertIn('set local session_replication_role=replica', source)
        self.assertIn('set local session_replication_role=origin', source)
        self.assertIn('pg_constraint', source)

    def test_clean_migration_repairs_keep_security_and_fail_closed_dependencies(self):
        notes = (ROOT / "supabase/migrations/20260818_notes_listing_content_origin.sql").read_text()
        self.assertIn('drop function if exists public.list_notes_workspace(integer, integer);', notes)
        self.assertNotIn('cascade', notes.lower())
        self.assertIn('security invoker', notes)
        self.assertIn("set search_path = ''", notes)
        self.assertIn('from public, anon', notes)
        self.assertIn('to authenticated', notes)
        taxonomy = (ROOT / "supabase/migrations/20260930085159_interview_lab_v1_2_taxonomy.sql").read_text()
        self.assertNotIn(';\\ncreate index', taxonomy)
        index = (ROOT / "supabase/migrations/20260930085240_interview_lab_v1_2_evidence_index.sql").read_text()
        self.assertIn('create index if not exists', index)
        learning = (ROOT / "supabase/migrations/20260930100323_interview_lab_v1_3_learning_loop.sql").read_text()
        self.assertIn('learning_questions=2 and learning_archetypes<>1', learning)


if __name__ == '__main__':
    unittest.main()
