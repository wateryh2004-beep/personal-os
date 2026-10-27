"""Effective grants under the metadata-observed Supabase creation defaults.

Only the disposable PG17 runner imports this module. No connection URL, host,
credential or business record is accepted here.
"""
import json

TABLE_PRIVILEGES = ("SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN")
MUTABLE_TABLES = ("task_planning", "planning_availability", "career_material_checks", "purchase_item_documents", "briefing_events", "briefing_event_sources")
TABLES = {
    **{name: {"authenticated": ("SELECT", "INSERT", "UPDATE"), "service_role": ("SELECT", "INSERT", "UPDATE")} for name in MUTABLE_TABLES},
    "project_workflow_versions": {"authenticated": ("SELECT",), "service_role": ("SELECT", "INSERT")},
    "feed_item_versions": {"authenticated": ("SELECT",), "service_role": ("SELECT", "INSERT")},
    "todo_creation_receipts": {"authenticated": ("SELECT",), "service_role": ("SELECT", "INSERT", "UPDATE")},
    "briefing_judgment_versions": {"authenticated": ("SELECT",), "service_role": ()},
}
AUTHENTICATED_FUNCTIONS = (
    "public.capture_note_source", "public.convert_inbox_note", "public.save_task_planning",
    "public.save_planning_availability", "public.save_project_workflow", "public.save_purchase_aftercare",
    "public.save_briefing_event_source", "public.save_career_material_check", "public.finish_inbox_target",
    "public.convert_inbox_project", "public.convert_inbox_daily", "public.capture_inbox_intent",
    "public.claim_inbox_classification", "public.commit_inbox_classification", "public.record_interview_practice_intent",
    "public.reconcile_interview_practice_intent", "public.save_briefing_judgment_intent", "public.read_briefing_judgment_intent",
    "public.claim_agent_generation", "public.update_agent_generation", "public.complete_agent_run_if_resolved",
    "public.read_life_request_outcome", "public.review_source_is_owned", "public.complete_review_with_sources",
    "public.accept_review_proposal", "public.dismiss_review_proposal",
)
SERVICE_FUNCTIONS = (
    "public.finish_todo_creation_receipt", "public.prepare_inbox_todo_creation",
    "public.prepare_inbox_calendar_creation", "public.cancel_inbox_undispatched",
)
SHARED_FUNCTIONS = (
    "public.workbench_utf16_length", "public.decode_workbench_query", "public.workbench_uuid_text",
    "public.valid_continuous_scene_shape", "public.valid_workbench_route_argument",
)
INTERNAL_FUNCTIONS = (
    "public.protect_note_source_version", "workflow_private.audit_change", "workflow_private.bump_revision",
    "workflow_private.project_version", "workflow_private.feed_version", "workflow_private.reject_version_rewrite",
    "workflow_private.validate_availability", "private.guard_todo_inbox_intent", "private.guard_calendar_inbox_intent",
    "private.guard_inbox_local_destination", "private.retain_inbox_dispatch_intent", "private.inbox_ai_utf16_length",
    "private.guard_inbox_ai_intent", "private.inbox_ai_dispatch_free", "workflow_private.guard_practice_submission",
    "workflow_private.guard_briefing_judgment_version", "private.guard_agent_generation",
    "private.guard_agent_action_generation", "life_private.valid_request_items", "public.sync_project_search_document",
)
# These existing helper ACLs must survive their legitimate body replacement.
EXISTING_SCENE_FUNCTIONS = ("valid_workbench_href", "valid_workbench_view_state", "valid_workspace_scene_snapshot")

# These are observed creation defaults, not changes to production or old SQL.
# Enable only after all 99 historical migrations have finished in an isolated DB.
PRODUCTION_DEFAULTS_SQL = """
alter default privileges for role postgres in schema public
  grant all privileges on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated, service_role;
"""


def install_production_defaults(db, database):
    privileges = ",".join("'" + privilege + "'" for privilege in TABLE_PRIVILEGES)
    probe = json.loads(db.sql(database, "begin;" + PRODUCTION_DEFAULTS_SQL + f"""
create table public.synthetic_continuous_default_acl_probe(value integer);
create function public.synthetic_continuous_default_acl_probe() returns integer language sql as 'select 1';
select json_build_object(
 'table',(select json_object_agg(role_name,(select json_object_agg(privilege,has_table_privilege(role_name,'public.synthetic_continuous_default_acl_probe',privilege)) from unnest(array[{privileges}]) privilege)) from unnest(array['anon','authenticated','service_role']) role_name),
 'function',(select json_object_agg(role_name,has_function_privilege(role_name,'public.synthetic_continuous_default_acl_probe()','EXECUTE')) from unnest(array['anon','authenticated','service_role']) role_name));
drop function public.synthetic_continuous_default_acl_probe();
drop table public.synthetic_continuous_default_acl_probe;
commit;
"""))
    for role in ("anon", "authenticated", "service_role"):
        if set(probe["table"][role]) != set(TABLE_PRIVILEGES) or not all(value is True for value in probe["table"][role].values()) or probe["function"][role] is not True:
            raise AssertionError("production_default_acl_probe_mismatch")
    return probe


def existing_scene_acl(db, database):
    names = ",".join("'" + name + "'" for name in EXISTING_SCENE_FUNCTIONS)
    return json.loads(db.sql(database, "select coalesce(json_agg(json_build_object('name',p.proname,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text) order by p.proname),'[]'::json) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in(" + names + ");"))


def expected_functions():
    groups = ((AUTHENTICATED_FUNCTIONS, True, False), (SERVICE_FUNCTIONS, False, True), (SHARED_FUNCTIONS, True, True), (INTERNAL_FUNCTIONS, False, False))
    return {name: {"authenticated": authenticated, "service_role": service} for names, authenticated, service in groups for name in names}


def verify_metadata(metadata, previous_scene_acl=None):
    """Fail closed on missing/duplicate objects or any extra effective privilege."""
    tables = metadata["tables"]
    functions = metadata["functions"]
    if len(tables) != len(TABLES) or {row["name"] for row in tables} != set(TABLES):
        raise AssertionError("default_acl_table_inventory_mismatch")
    expected = expected_functions()
    if len(functions) != len(expected) or {row["name"] for row in functions} != set(expected):
        raise AssertionError("default_acl_function_inventory_mismatch")
    if len(metadata["existingSceneAcl"]) != 3 or {row["name"] for row in metadata["existingSceneAcl"]} != set(EXISTING_SCENE_FUNCTIONS):
        raise AssertionError("default_acl_existing_scene_inventory_mismatch")
    for row in tables:
        if not row["rls"] or not row["forceRls"] or row["publicPrivileges"]:
            raise AssertionError("default_acl_table_rls_or_public_grant")
        for role in ("anon", "authenticated", "service_role"):
            allowed = set(TABLES[row["name"]].get(role, ()))
            privileges = row["roles"][role]
            if set(privileges) != set(TABLE_PRIVILEGES) or any(privileges[privilege] is not (privilege in allowed) for privilege in TABLE_PRIVILEGES):
                raise AssertionError("default_acl_table_privileges:" + row["name"] + ":" + role)
    for row in functions:
        if row["publicExecute"] or row["roles"]["anon"] or any(row["roles"][role] is not allowed for role, allowed in expected[row["name"]].items()):
            raise AssertionError("default_acl_function_privileges:" + row["name"])
    if previous_scene_acl is not None and metadata["existingSceneAcl"] != previous_scene_acl:
        raise AssertionError("default_acl_existing_scene_acl_changed")
    return {"tables": len(tables), "functions": len(functions), "roles": 3,
            "tablePrivilegeChecks": len(tables) * 3 * len(TABLE_PRIVILEGES),
            "existingSceneAclPreserved": previous_scene_acl is not None}


def verify(db, database, previous_scene_acl=None):
    table_names = ",".join("'" + name + "'" for name in TABLES)
    function_names = ",".join("'" + name + "'" for name in expected_functions())
    privileges = ",".join("'" + privilege + "'" for privilege in TABLE_PRIVILEGES)
    metadata = json.loads(db.sql(database, f"""
select json_build_object(
 'tables',(select json_agg(json_build_object('name',c.relname,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
   'publicPrivileges',exists(select 1 from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where a.grantee=0),
   'roles',(select json_object_agg(role_name,(select json_object_agg(privilege,has_table_privilege(role_name,c.oid,privilege)) from unnest(array[{privileges}]) privilege)) from unnest(array['anon','authenticated','service_role']) role_name)) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in({table_names})),
 'functions',(select json_agg(json_build_object('name',n.nspname||'.'||p.proname,'publicExecute',exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE'),
   'roles',(select json_object_agg(role_name,has_function_privilege(role_name,p.oid,'EXECUTE')) from unnest(array['anon','authenticated','service_role']) role_name)) order by n.nspname,p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname||'.'||p.proname in({function_names})));
"""))
    metadata["existingSceneAcl"] = existing_scene_acl(db, database)
    result = verify_metadata(metadata, previous_scene_acl)
    result.update(database=database, metadata=metadata, productionAccess=False)
    return result
