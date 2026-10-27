"""Actual metadata-confirmed production gaps, repaired only in disposable PG17."""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OWNER = "81000000-0000-4000-8000-000000000001"
FUNCTIONS = ("review_source_is_owned", "complete_review_with_sources", "accept_review_proposal", "dismiss_review_proposal")


def exercise(db, output, migration):
    if not migration.name.endswith("_continuous_production_baseline.sql"):
        raise RuntimeError("Unexpected baseline compatibility migration")
    fixture_dir = ROOT / "tests/fixtures/continuous-workflows"
    before = (fixture_dir / "baseline-preserve-before.sql").read_text()
    after = (fixture_dir / "baseline-preserve-after.sql").read_text()
    gap = (fixture_dir / "baseline-gap-setup.sql").read_text()
    completion_audit = (fixture_dir / "baseline-completion-audit.sql").read_text()
    assertions = (ROOT / "tests/continuous-baseline-postgres.sql").read_text() + completion_audit
    legacy_source = (ROOT / "supabase/migrations/20260809094617_reviews_intelligence_loop.sql").read_text()
    legacy_completion = re.search(r"create or replace function public\.complete_review_with_sources\([\s\S]*?\$\$;", legacy_source)
    if legacy_completion is None:
        raise RuntimeError("Known legacy completion definition missing")
    legacy_completion = legacy_completion.group(0)
    clear_controls = "drop table compat_existing_definitions,compat_after_definitions,compat_completion_before,compat_existing_projection;\n"
    sql = migration.read_text()
    # Each fixed synthetic mutation must reject the actual candidate SQL with
    # its precise fail-closed error, then roll back to the original definition.
    rejected_guard = "do $compat_rejected_probe$begin begin execute $compat_rejected_candidate$" + sql + "$compat_rejected_candidate$;raise exception 'TEST unknown completion fingerprint accepted';exception when sqlstate '55000' then if sqlerrm<>'baseline_compatibility_completion_definition_unrecognized' then raise;end if;end;end $compat_rejected_probe$;\n"
    identity = "public.complete_review_with_sources(text,text,text,date,date,text,jsonb,boolean,jsonb)"
    mutations = [
        legacy_completion.replace("as $$", "as $$\n-- Synthetic user-modified completion body", 1),
        legacy_completion + "alter function " + identity + " set search_path to public,pg_catalog;",
        legacy_completion + "grant execute on function " + identity + " to anon;",
    ]
    rejected_controls = "".join("savepoint compat_unknown;" + mutation + rejected_guard
                                + "rollback to savepoint compat_unknown;release savepoint compat_unknown;" for mutation in mutations)
    results = []
    for database in ("source_fixture", "restored_fixture"):
        # Control starts with the real legacy completion, then proves the one
        # expected atomic upgrade and byte-exact preservation of every other
        # definition/ACL/owner/projection. Reapply proves already-new idempotence.
        db.sql(database, "begin;\n" + rejected_controls + legacy_completion + before + sql + after
               + clear_controls + before + sql + after + completion_audit + "\nrollback;")
        # One connection retains the temporary preservation fingerprints across
        # COMMIT. The second transaction rolls all behavioral test writes back.
        # Only synthetic gap setup and the real repaired schema remain committed.
        db.sql(database, "begin;\n" + gap + sql + "\ncommit;\nbegin;\n" + assertions + "\nrollback;")
        metadata = json.loads(db.sql(database, """
select json_build_object(
 'functions',(select json_agg(json_build_object('name',p.proname,'invoker',not p.prosecdef,'config',p.proconfig,'anonDenied',not has_function_privilege('anon',p.oid,'EXECUTE'),'authenticatedAllowed',has_function_privilege('authenticated',p.oid,'EXECUTE')) order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('review_source_is_owned','complete_review_with_sources','accept_review_proposal','dismiss_review_proposal')),
 'projectTrigger',(select json_build_object('function',p.proname,'enabled',t.tgenabled,'eventMask',t.tgtype) from pg_trigger t join pg_proc p on p.oid=t.tgfoid where t.tgrelid='public.projects'::regclass and t.tgname='projects_search_sync'));
"""))
        assert sorted(row["name"] for row in metadata["functions"]) == sorted(FUNCTIONS)
        assert all(row["invoker"] and row["anonDenied"] and row["authenticatedAllowed"] and row["config"] == ['search_path=""'] for row in metadata["functions"])
        assert metadata["projectTrigger"] == {"function": "sync_project_search_document", "enabled": "O", "eventMask": 29}
        results.append({"database": database, "unrelatedHealthyDefinitionsPreserved": True, "knownLegacyCompletionUpgradedAtomically": True, "alreadyAtomicCompletionPreserved": True, "unknownCompletionFingerprintsRejected": ["body", "config", "acl"], "actualMissingObjectsCreated": True,
                        "gapBehaviorAssertionsPassed": True, "metadata": metadata})
    report = {"status": "verified", "productionAccess": False, "metadataGapSimulationNotFullProductionClone": True,
              "migration": migration.name, "sha256": hashlib.sha256(migration.read_bytes()).hexdigest(), "scenarios": results}
    (output / "baseline-compatibility.json").write_text(json.dumps(report, indent=2) + "\n")
    return report


def overlap(db, workbench):
    """New repaired bodies, held transaction plus observed second-writer lock."""
    create = "select public.complete_review_with_sources('daily','compat:concurrent-parent','Concurrent synthetic review','2026-10-27','2026-10-27','Synthetic parent','{}',false,'[]');"
    db.sql("source_fixture", "begin;" + workbench.auth(OWNER) + create + """
insert into public.review_proposals(id,user_id,review_id,proposal_type,payload)
 select value::uuid,auth.uid(),r.id,'profile_memory','{"title":"Concurrent explicit proposal","content":"Synthetic original","evidenceSourceIds":[]}'::jsonb
 from public.reviews r cross join unnest(array['e1500000-0000-4000-8000-000000000001','e1500000-0000-4000-8000-000000000002']) value
 where r.user_id=auth.uid() and r.review_key='compat:concurrent-parent';commit;
""")
    workbench.overlap(db, OWNER,
        "select public.accept_review_proposal('e1500000-0000-4000-8000-000000000001');",
        "select public.accept_review_proposal('e1500000-0000-4000-8000-000000000001');", "proposal already resolved")
    workbench.overlap(db, OWNER,
        "select json_build_object('id',public.dismiss_review_proposal('e1500000-0000-4000-8000-000000000002'));",
        "select json_build_object('id',public.dismiss_review_proposal('e1500000-0000-4000-8000-000000000002'));", "pending proposal not found")
    def save(body):
        return "select public.complete_review_with_sources('daily','compat:concurrent-version','Concurrent version','2026-10-27','2026-10-27'," + workbench.literal(body) + ",'{}',false,'[]');"
    first, second = workbench.overlap(db, OWNER, save("First original"), save("Second explicit update"))
    assert first[0]["review_id"] == second[0]["review_id"]
    assert first[0]["version_number"] == 1 and second[0]["version_number"] == 2
    db.sql("source_fixture", """do $$begin
 assert(select count(*)=1 from public.personal_memories where memory_key='profile_memory:review-proposal:e1500000-0000-4000-8000-000000000001');
 assert(select count(*)=1 from public.audit_logs where entity_id='e1500000-0000-4000-8000-000000000001' and action='review_proposal_accept');
 assert(select count(*)=1 from public.audit_logs where entity_id='e1500000-0000-4000-8000-000000000002' and action='review_proposal_dismiss');
 assert(select count(*)=2 from public.review_versions v join public.reviews r on r.id=v.review_id where r.user_id='81000000-0000-4000-8000-000000000001' and r.review_key='compat:concurrent-version');
 assert(select v.reason='completed' from public.review_versions v join public.reviews r on r.id=v.review_id where r.review_key='compat:concurrent-version' and v.version_number=1);
 assert(select v.reason='amended' from public.review_versions v join public.reviews r on r.id=v.review_id where r.review_key='compat:concurrent-version' and v.version_number=2);
 assert(select count(*)=2 and count(*)filter(where a.action='review_complete')=1 and count(*)filter(where a.action='review_amend')=1
  from public.audit_logs a join public.reviews r on r.id=a.entity_id where a.entity_type='review' and r.user_id='81000000-0000-4000-8000-000000000001' and r.review_key='compat:concurrent-version');
end $$;""")
    return [{"case": "review proposal accept versus accept", "secondWriterObservedWaiting": True, "oneResultAndAudit": True},
            {"case": "review proposal dismiss versus dismiss", "secondWriterObservedWaiting": True, "oneResolutionAndAudit": True},
            {"case": "review completion versions same owner/key", "secondWriterObservedWaiting": True, "versions": [1, 2], "exactlyOneCompletionAndOneAmendAudit": True}]
