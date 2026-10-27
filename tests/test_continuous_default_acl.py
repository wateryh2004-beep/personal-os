import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("continuous_default_acl", ROOT / "scripts/continuous-default-acl.py")
acl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(acl)


def metadata():
    return {
        "tables": [{"name": name, "rls": True, "forceRls": True, "publicPrivileges": False,
                    "roles": {role: {privilege: privilege in allowed.get(role, ()) for privilege in acl.TABLE_PRIVILEGES}
                              for role in ("anon", "authenticated", "service_role")}}
                   for name, allowed in acl.TABLES.items()],
        "functions": [{"name": name, "publicExecute": False, "roles": {"anon": False, **roles}}
                      for name, roles in acl.expected_functions().items()],
        "existingSceneAcl": [{"name": name, "owner": "postgres", "acl": "fixed synthetic existing ACL"}
                             for name in acl.EXISTING_SCENE_FUNCTIONS],
    }


class EffectiveRolePrivilegeBoundaries(unittest.TestCase):
    def test_exact_metadata_accepts_only_named_objects_and_privileges(self):
        data = metadata()
        result = acl.verify_metadata(data, copy.deepcopy(data["existingSceneAcl"]))
        self.assertEqual(result["tables"], 10)
        self.assertEqual(result["functions"], 55)
        self.assertEqual(result["tablePrivilegeChecks"], 240)
        self.assertTrue(result["existingSceneAclPreserved"])

    def test_inherited_destructive_and_maintenance_grants_reject(self):
        for name, privilege in (("todo_creation_receipts", "DELETE"), ("todo_creation_receipts", "TRUNCATE"),
                                ("todo_creation_receipts", "MAINTAIN"), ("briefing_judgment_versions", "INSERT"),
                                ("briefing_judgment_versions", "SELECT")):
            with self.subTest(table=name, privilege=privilege):
                data = metadata()
                next(row for row in data["tables"] if row["name"] == name)["roles"]["service_role"][privilege] = True
                with self.assertRaisesRegex(AssertionError, "default_acl_table_privileges"):
                    acl.verify_metadata(data)

    def test_missing_allowed_write_is_not_treated_as_secure_success(self):
        data = metadata()
        next(row for row in data["tables"] if row["name"] == "todo_creation_receipts")["roles"]["service_role"]["UPDATE"] = False
        with self.assertRaisesRegex(AssertionError, "default_acl_table_privileges"):
            acl.verify_metadata(data)

    def test_public_grants_or_missing_rls_reject(self):
        for key, value in (("publicPrivileges", True), ("rls", False), ("forceRls", False)):
            data = metadata()
            data["tables"][0][key] = value
            with self.assertRaisesRegex(AssertionError, "default_acl_table_rls_or_public_grant"):
                acl.verify_metadata(data)

    def test_role_execute_contract_rejects_extra_or_missing_permissions(self):
        for name, role, value in (("public.claim_agent_generation", "service_role", True),
                                  ("public.finish_todo_creation_receipt", "authenticated", True),
                                  ("public.finish_todo_creation_receipt", "service_role", False),
                                  ("public.workbench_utf16_length", "service_role", False),
                                  ("workflow_private.audit_change", "authenticated", True)):
            data = metadata()
            next(row for row in data["functions"] if row["name"] == name)["roles"][role] = value
            with self.assertRaisesRegex(AssertionError, "default_acl_function_privileges"):
                acl.verify_metadata(data)

    def test_missing_or_duplicate_inventory_rejects(self):
        for kind in ("tables", "functions"):
            for duplicate in (True, False):
                data = metadata()
                if duplicate:
                    data[kind][-1] = copy.deepcopy(data[kind][0])
                else:
                    data[kind].pop()
                with self.assertRaisesRegex(AssertionError, "default_acl_.*_inventory_mismatch"):
                    acl.verify_metadata(data)

    def test_existing_scene_acl_cannot_silently_change(self):
        data = metadata()
        previous = copy.deepcopy(data["existingSceneAcl"])
        data["existingSceneAcl"][0]["acl"] = "synthetic unwanted replacement ACL"
        with self.assertRaisesRegex(AssertionError, "default_acl_existing_scene_acl_changed"):
            acl.verify_metadata(data, previous)

    def test_observed_defaults_require_real_creation_probe_for_each_privilege(self):
        probe = {"table": {role: {privilege: True for privilege in acl.TABLE_PRIVILEGES}
                           for role in ("anon", "authenticated", "service_role")},
                 "function": {role: True for role in ("anon", "authenticated", "service_role")}}

        class Database:
            def sql(self, database, sql):
                self.database = database
                self.statement = sql
                return json.dumps(probe)

        database = Database()
        self.assertEqual(acl.install_production_defaults(database, "restored_fixture"), probe)
        self.assertEqual(database.database, "restored_fixture")
        self.assertLess(database.statement.index("alter default privileges"), database.statement.index("create table public.synthetic_continuous_default_acl_probe"))
        self.assertIn("drop table public.synthetic_continuous_default_acl_probe", database.statement)
        self.assertTrue(database.statement.rstrip().endswith("commit;"))
        probe["table"]["service_role"]["MAINTAIN"] = False
        with self.assertRaisesRegex(AssertionError, "production_default_acl_probe_mismatch"):
            acl.install_production_defaults(database, "restored_fixture")


if __name__ == "__main__":
    unittest.main()
