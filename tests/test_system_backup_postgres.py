import importlib.util
import contextlib
import copy
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
typegen_spec = importlib.util.spec_from_file_location("continuous_typegen", ROOT / "scripts/continuous-schema-typegen.py")
typegen = importlib.util.module_from_spec(typegen_spec)
typegen_spec.loader.exec_module(typegen)


class TypegenDatabaseIsolation(unittest.TestCase):
    def fixture(self):
        class Database:
            name = "personal-os-rehearsal-" + "a" * 32
            started = True

            def __init__(self):
                self.commands = []
                self.volume_name = "b" * 64
                self.source = "/var/lib/docker/volumes/" + self.volume_name + "/_data"
                self.container = {"Name": "/" + self.name, "State": {"Running": True}, "Image": "sha256:" + "c" * 64,
                    "HostConfig": {"NetworkMode": "none", "AutoRemove": True, "PortBindings": {}, "PublishAllPorts": False,
                                   "Binds": None, "Mounts": [], "VolumesFrom": None, "Tmpfs": {}, "VolumeDriver": "",
                                   "Privileged": False, "Devices": [], "DeviceRequests": None},
                    "Config": {"Image": "postgres:17", "Volumes": {typegen.POSTGRES_DATA: {}}},
                    "NetworkSettings": {"Ports": {"5432/tcp": None}, "Networks": {"none": {}}},
                    "Mounts": [{"Type": "volume", "Name": self.volume_name, "Source": self.source,
                                "Destination": typegen.POSTGRES_DATA, "Driver": "local", "RW": True, "Mode": "", "Propagation": ""}]}
                self.image = {"Id": self.container["Image"], "Config": {"Volumes": {typegen.POSTGRES_DATA: {}}},
                              "RepoDigests": ["postgres@sha256:" + "d" * 64]}
                self.volume = {"Name": self.volume_name, "Driver": "local", "Scope": "local", "Options": None,
                               "Labels": None, "Mountpoint": self.source}

            def command(self, arguments):
                self.commands.append(arguments)
                if arguments == ["inspect", self.name]:
                    return json.dumps([self.container])
                if arguments == ["image", "inspect", "postgres:17"]:
                    return json.dumps([self.image])
                if arguments == ["volume", "inspect", self.volume_name]:
                    return json.dumps([self.volume])
                raise AssertionError("unexpected nonfixed inspection command")
        return Database()

    def test_only_official_image_managed_auto_removed_anonymous_volume_passes(self):
        for labels in (None, {}, {"com.docker.volume.anonymous": ""}):
            database = self.fixture()
            database.volume["Labels"] = labels
            with tempfile.TemporaryDirectory() as temporary:
                typegen.verify_synthetic_isolation(database, Path(temporary))
                artifact = (Path(temporary) / "typegen-isolation.json").read_text()
            result = json.loads(artifact)
            self.assertTrue(result["accepted"])
            self.assertTrue(all(result["checks"].values()))
            self.assertEqual(result["mounts"], [{"type": "volume", "destination": typegen.POSTGRES_DATA}])
            self.assertNotIn(database.volume_name, artifact)
            self.assertNotIn(database.source, artifact)
            self.assertEqual(database.commands[-1], ["volume", "inspect", database.volume_name])

    def test_host_network_ports_bind_named_or_custom_volumes_are_rejected(self):
        cases = [
            ("host network", "container", ["HostConfig", "NetworkMode"], "host"),
            ("bridge network", "container", ["HostConfig", "NetworkMode"], "bridge"),
            ("extra connected network", "container", ["NetworkSettings", "Networks"], {"none": {}, "bridge": {}}),
            ("host ports", "container", ["HostConfig", "PortBindings"], {"5432/tcp": [{"HostPort": "15432"}]}),
            ("publish all ports", "container", ["HostConfig", "PublishAllPorts"], True),
            ("network published port", "container", ["NetworkSettings", "Ports"], {"5432/tcp": [{"HostPort": "15432"}]}),
            ("persistent container", "container", ["HostConfig", "AutoRemove"], False),
            ("explicit named hex volume", "container", ["HostConfig", "Binds"], ["b" * 64 + ":" + typegen.POSTGRES_DATA]),
            ("explicit mount", "container", ["HostConfig", "Mounts"], [{"Type": "volume", "Source": "b" * 64, "Target": typegen.POSTGRES_DATA}]),
            ("volumes from", "container", ["HostConfig", "VolumesFrom"], ["other-container"]),
            ("caller tmpfs", "container", ["HostConfig", "Tmpfs"], {typegen.POSTGRES_DATA: "rw"}),
            ("custom volume driver", "container", ["HostConfig", "VolumeDriver"], "local"),
            ("privileged", "container", ["HostConfig", "Privileged"], True),
            ("host device", "container", ["HostConfig", "Devices"], [{"PathOnHost": "/synthetic-private-device"}]),
            ("other container", "container", ["Name"], "/not-this-rehearsal"),
            ("stopped container", "container", ["State", "Running"], False),
            ("other image tag", "container", ["Config", "Image"], "postgres:18"),
            ("extra declared destination", "container", ["Config", "Volumes"], {typegen.POSTGRES_DATA: {}, "/other": {}}),
            ("host bind mount", "container", ["Mounts", 0, "Type"], "bind"),
            ("other data destination", "container", ["Mounts", 0, "Destination"], "/other"),
            ("extra mount", "container", ["Mounts"], [{"Type": "volume"}, {"Type": "bind"}]),
            ("no data mount", "container", ["Mounts"], []),
            ("named volume", "container", ["Mounts", 0, "Name"], "existing-production-data"),
            ("read only changed mount", "container", ["Mounts", 0, "RW"], False),
            ("mismatched image", "image", ["Id"], "sha256:" + "e" * 64),
            ("nonofficial image", "image", ["RepoDigests"], ["private/postgres@sha256:" + "d" * 64]),
            ("image extra destination", "image", ["Config", "Volumes"], {"/other": {}}),
            ("local driver bind options", "volume", ["Options"], {"type": "none", "o": "bind", "device": "/synthetic-private-path"}),
            ("nonlocal driver", "volume", ["Driver"], "custom"),
            ("nonlocal scope", "volume", ["Scope"], "global"),
            ("named volume labels", "volume", ["Labels"], {"owner": "synthetic-private-label"}),
            ("wrong managed mountpoint", "volume", ["Mountpoint"], "/synthetic-private-path"),
        ]
        for label, target, path, value in cases:
            with self.subTest(label=label):
                database = self.fixture()
                node = getattr(database, target)
                for key in path[:-1]:
                    node = node[key]
                node[path[-1]] = copy.deepcopy(value)
                with tempfile.TemporaryDirectory() as temporary:
                    with self.assertRaisesRegex(RuntimeError, "Synthetic database isolation changed"):
                        typegen.verify_synthetic_isolation(database, Path(temporary))
                    artifact = json.loads((Path(temporary) / "typegen-isolation.json").read_text())
                self.assertFalse(artifact["accepted"])

    def test_caller_or_stale_database_identity_is_rejected_before_inspection(self):
        for name, started in (("arbitrary-container", True), ("personal-os-rehearsal-" + "a" * 32, False)):
            database = self.fixture()
            database.name, database.started = name, started
            with tempfile.TemporaryDirectory() as temporary:
                with self.assertRaisesRegex(RuntimeError, "this rehearsal's disposable container"):
                    typegen.verify_synthetic_isolation(database, Path(temporary))
            self.assertEqual(database.commands, [])

    def test_failure_artifact_never_contains_host_path_environment_or_url(self):
        database = self.fixture()
        private = "SENSITIVE_SYNTHETIC_ONLY"
        database.container["HostConfig"]["NetworkMode"] = "host-" + private
        database.container["Config"]["Env"] = ["DATABASE_CONNECTION=https://" + private]
        database.container["Mounts"][0].update(Type="bind", Source="/" + private, Destination="/" + private)
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaises(RuntimeError) as raised:
                typegen.verify_synthetic_isolation(database, Path(temporary))
            artifact = (Path(temporary) / "typegen-isolation.json").read_text()
        self.assertNotIn(private, str(raised.exception))
        self.assertNotIn(private, artifact)
        self.assertNotIn(database.volume_name, artifact)
        self.assertEqual(json.loads(artifact)["network"], "other")


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
