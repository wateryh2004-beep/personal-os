import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("baseline_compatibility", ROOT / "scripts/continuous-baseline-compatibility.py")
baseline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(baseline)


class BaselineRunnerBoundaries(unittest.TestCase):
    def database(self, invalid=False):
        class Database:
            def __init__(self):
                self.calls = []

            def sql(self, database, sql):
                self.calls.append((database, sql))
                if sql.startswith("\nselect json_build_object("):
                    return json.dumps({"functions": [{"name": name, "invoker": not invalid,
                        "anonDenied": True, "authenticatedAllowed": True, "config": ['search_path=""']}
                        for name in baseline.FUNCTIONS],
                        "projectTrigger": {"function": "sync_project_search_document", "enabled": "O", "eventMask": 29}})
                return ""
        return Database()

    def test_healthy_control_precedes_real_gap_drop_install_and_behavior_on_both_databases(self):
        migration = ROOT / "supabase/migrations/20261027175718_continuous_production_baseline.sql"
        database = self.database()
        with tempfile.TemporaryDirectory() as temporary:
            result = baseline.exercise(database, Path(temporary), migration)
            evidence = json.loads((Path(temporary) / "baseline-compatibility.json").read_text())
        self.assertEqual([call[0] for call in database.calls], ["source_fixture"] * 3 + ["restored_fixture"] * 3)
        for offset in (0, 3):
            healthy, gap = database.calls[offset][1], database.calls[offset + 1][1]
            self.assertIn("compat_existing_definitions", healthy)
            self.assertIn("create or replace function public.complete_review_with_sources", healthy)
            self.assertIn("synthetic_compat_completion_audit_failure", healthy)
            self.assertIn("already atomic completion changed", healthy)
            self.assertEqual(healthy.count("TEST unknown completion fingerprint accepted"), 3)
            self.assertNotIn("drop function public.complete_review_with_sources", healthy)
            drop = gap.index("drop function public.complete_review_with_sources")
            create = gap.index("create function public.complete_review_with_sources")
            behavior = gap.index("Original raw review")
            self.assertLess(drop, create)
            self.assertLess(create, gap.index("commit;\nbegin;"))
            self.assertLess(gap.index("commit;\nbegin;"), behavior)
            self.assertIn("synthetic_compat_audit_failure", gap)
            self.assertIn("stale archived project projection retained", gap)
        self.assertEqual(len(result["scenarios"]), 2)
        self.assertFalse(evidence["productionAccess"])
        self.assertTrue(evidence["metadataGapSimulationNotFullProductionClone"])

    def test_unexpected_catalog_invoker_state_cannot_be_reported_verified(self):
        migration = ROOT / "supabase/migrations/20261027175718_continuous_production_baseline.sql"
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaises(AssertionError):
                baseline.exercise(self.database(invalid=True), Path(temporary), migration)
            self.assertFalse((Path(temporary) / "baseline-compatibility.json").exists())

    def test_arbitrary_migration_is_rejected_before_any_database_action(self):
        database = self.database()
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(RuntimeError, "Unexpected baseline compatibility migration"):
                baseline.exercise(database, Path(temporary), ROOT / "supabase/migrations/unrelated.sql")
        self.assertEqual(database.calls, [])


if __name__ == "__main__":
    unittest.main()
