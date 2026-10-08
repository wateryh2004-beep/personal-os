import importlib.util
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("recovery", ROOT / "scripts/rehearse-system-backup-postgres.py")
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


class PostgresRecoverySafety(unittest.TestCase):
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
