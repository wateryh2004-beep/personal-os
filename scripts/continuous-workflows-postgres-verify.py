#!/usr/bin/env python3
"""Real clean-install and old-code-data upgrade tests in disposable PostgreSQL 17.
Never accepts an existing connection, database URL, user data or external server.
"""
import importlib.util
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("workbench_rehearsal",ROOT/"scripts/workbench-postgres-verify.py")
workbench=importlib.util.module_from_spec(spec)
spec.loader.exec_module(workbench)
OUTPUT=ROOT/"test-results/continuous-workflows-postgres"
OUTPUT.mkdir(parents=True,exist_ok=True)
MIGRATIONS=sorted((ROOT/"supabase/migrations").glob("*.sql"))
NEW_SUFFIXES=("_continuous_material_sources.sql","_continuous_domain_workflows.sql","_continuous_material_receipts.sql","_inbox_dispatch_mutex.sql","_continuous_ai_capture_intents.sql","_continuous_practice_intents.sql","_continuous_scene_state.sql","_continuous_briefing_judgment_intents.sql","_continuous_agent_run_generations.sql","_continuous_life_request_reconcile.sql")
def record_stage(stage, **details):
    (OUTPUT/"progress.json").write_text(json.dumps({"status":"running","stage":stage,"productionAccess":False,**details},indent=2)+"\n")
record_stage("starting")
first_continuous=next((index for index,path in enumerate(MIGRATIONS) if path.name.endswith(NEW_SUFFIXES[0])),None)
actual_suffixes=[] if first_continuous is None else [next((suffix for suffix in NEW_SUFFIXES if path.name.endswith(suffix)),None) for path in MIGRATIONS[first_continuous:]]
if actual_suffixes!=list(NEW_SUFFIXES): raise RuntimeError("Continuous migration order changed; review the exact strict allowlist")

def scene_matrix(db,name):
    matrix=json.loads((ROOT/"tests/fixtures/continuous-workflows/scene-validator-matrix.json").read_text())
    statements=[]
    for index,case in enumerate(matrix["hrefs"]):
        statements.append("assert public.valid_workbench_href("+workbench.literal(case["value"])+") is not distinct from "+str(case["valid"]).lower()+",'href matrix case "+str(index)+"';")
    for case in matrix["snapshots"]:
        statements.append("assert public.valid_workspace_scene_snapshot("+workbench.json_literal(case["value"])+") is not distinct from "+str(case["valid"]).lower()+","+workbench.literal("snapshot matrix "+case["name"])+";")
    db.sql(name,"do $$begin\n"+"\n".join(statements)+"\nend $$;")
    return {"hrefCases":len(matrix["hrefs"]),"snapshotCases":len(matrix["snapshots"])}

def initialize(db,name,upgrade):
    record_stage("create-database",database=name,upgrade=upgrade)
    db.sql("postgres",'create database "'+name+'";')
    db.sql(name,(ROOT/"tests/fixtures/system-backup-sql/bootstrap.sql").read_text())
    deferred=[]
    for migration in MIGRATIONS:
        if upgrade and migration.name.endswith(NEW_SUFFIXES):
            deferred.append(migration)
        else:
            record_stage("migration",database=name,migration=migration.name,upgrade=upgrade)
            db.sql(name,migration.read_text())
    db.sql(name,(ROOT/"tests/fixtures/continuous-workflows/upgrade-seed.sql").read_text())
    for migration in deferred:
        record_stage("upgrade-migration",database=name,migration=migration.name,upgrade=upgrade)
        db.sql(name,migration.read_text())
    workbench.check_inventory(db,name)
    record_stage("shared-scene-validator-matrix",database=name,upgrade=upgrade)
    scene_matrix(db,name)
    for filename in ("tests/continuous-domains-postgres.sql","tests/continuous-materials-postgres.sql","tests/continuous-inbox-mutex-postgres.sql","tests/continuous-ai-capture-postgres.sql","tests/continuous-practice-intents-postgres.sql","tests/continuous-briefing-judgment-postgres.sql","tests/continuous-agent-generations-postgres.sql","tests/continuous-life-request-postgres.sql","tests/continuous-project-replay-postgres.sql"):
        record_stage("regression",database=name,fixture=filename,upgrade=upgrade)
        db.sql(name,(ROOT/filename).read_text())
def concurrency(db):
    owner="81000000-0000-4000-8000-000000000001"
    cases=[
      ("task estimate", "select to_jsonb(public.save_task_planning('84000000-0000-4000-8000-000000000001',0,30,'2026-10-27'));", "select to_jsonb(public.save_task_planning('84000000-0000-4000-8000-000000000001',0,99,'2026-10-27'));"),
      ("availability", "select to_jsonb(public.save_planning_availability('2026-10-28','UTC',0,'[{\"start\":\"09:00\",\"end\":\"12:00\"}]'));", "select to_jsonb(public.save_planning_availability('2026-10-28','UTC',0,'[]'));"),
      ("project", "select to_jsonb(public.save_project_workflow('85000000-0000-4000-8000-000000000001',1,'First saved goal','',null));", "select to_jsonb(public.save_project_workflow('85000000-0000-4000-8000-000000000001',1,'Stale second goal','',null));"),
      ("aftercare", "select to_jsonb(public.save_purchase_aftercare('88000000-0000-4000-8000-000000000001',1,'2026-10-27',null,null,'First','',null,'receipt'));", "select to_jsonb(public.save_purchase_aftercare('88000000-0000-4000-8000-000000000001',1,'2026-10-27',null,null,'Stale','',null,'receipt'));"),
    ]
    results=[]
    for name,first,second in cases:
        workbench.overlap(db,owner,first,second,"workflow_conflict")
        results.append({"case":name,"secondWriterObservedWaiting":True,"staleWriteRejected":True})
    db.sql("source_fixture", "insert into public.career_opportunities(id,user_id,organization,role_title,opportunity_type,source_url,recruitment_cycle) values('8a000000-0000-4000-8000-000000000001','"+owner+"','Synthetic','Synthetic','internship','https://synthetic.invalid/job','2027'); insert into public.career_material_checks(id,user_id,opportunity_id,label) values('8b000000-0000-4000-8000-000000000001','"+owner+"','8a000000-0000-4000-8000-000000000001','Synthetic material');")
    workbench.overlap(db,owner,"update public.career_material_checks set note='first' where id='8b000000-0000-4000-8000-000000000001' and revision=1 returning to_jsonb(career_material_checks.*);", "do $$ declare changed integer;begin update public.career_material_checks set note='stale' where id='8b000000-0000-4000-8000-000000000001' and revision=1;get diagnostics changed=row_count;assert changed=0,'stale material update accepted';end $$;")
    results.append({"case":"material check","secondWriterObservedWaiting":True,"staleWriteRejected":True})
    document="8e000000-0000-4000-8000-000000000099"
    material="8f000000-0000-4000-8000-000000000099"
    db.sql("source_fixture", "insert into public.documents(id,user_id,title,original_filename,storage_bucket,storage_path,mime_type,file_size,storage_provider,storage_state) values('"+document+"','"+owner+"','Synthetic concurrent source','source.pdf','synthetic','"+owner+"/concurrent.pdf','application/pdf',123,'cloudflare_r2','available');insert into public.career_material_checks(id,user_id,opportunity_id,label,document_id) values('"+material+"','"+owner+"','8a000000-0000-4000-8000-000000000001','Synthetic concurrent check','"+document+"');")
    revision=db.sql("source_fixture", "select mutation_revision from public.documents where id='"+document+"';").strip()
    workbench.overlap(db,owner,"update public.documents set title='Concurrent updated source' where id='"+document+"' returning to_jsonb(documents.*);", "select to_jsonb(public.save_career_material_check('"+material+"','8a000000-0000-4000-8000-000000000001',1,'Synthetic concurrent check',true,'"+document+"',null,'Must not save stale proof','verify','document:"+document+":"+revision+"',"+revision+",null));", "workflow_material_source_conflict")
    db.sql("source_fixture", "do $$begin assert(select revision=1 and verified_at is null and note='' from public.career_material_checks where id='"+material+"'),'rejected concurrent proof changed material';end $$;")
    results.append({"case":"material exact source update versus verification","secondWriterObservedWaiting":True,"staleSourceRejected":True})
    db.sql("source_fixture", "begin;create function public.synthetic_workflow_audit_failure() returns trigger language plpgsql as $$begin raise exception 'synthetic_audit_failure';end $$;create trigger synthetic_workflow_audit_failure before insert on public.audit_logs for each row when(new.action='workflow_save') execute function public.synthetic_workflow_audit_failure();set local role authenticated;set local request.jwt.claim.sub='"+owner+"';do $$begin begin perform public.save_task_planning('84000000-0000-4000-8000-000000000001',1,99,'2026-10-27');raise exception 'audit failure accepted';exception when others then if sqlerrm<>'synthetic_audit_failure' then raise;end if;end;assert(select estimated_minutes=30 and revision=1 from public.task_planning where task_id='84000000-0000-4000-8000-000000000001');begin perform public.save_career_material_check('"+material+"','8a000000-0000-4000-8000-000000000001',1,'Synthetic concurrent check',true,'"+document+"',null,'Audit must roll back','keep',null,null,null);raise exception 'material audit failure accepted';exception when others then if sqlerrm<>'synthetic_audit_failure' then raise;end if;end;assert(select revision=1 and verified_at is null and note='' from public.career_material_checks where id='"+material+"');end $$;rollback;")
    # Provider and local conversions overlap on the same actual Inbox lock.
    inboxes=["8c000000-0000-4000-8000-"+str(n).zfill(12) for n in range(1,8)]
    daily="8d000000-0000-4000-8000-000000000001"
    db.sql("source_fixture", "insert into public.inbox_items(id,user_id,content_markdown) values "+",".join("('"+item+"','"+owner+"','Synthetic competing source')" for item in inboxes)+";insert into public.notes(id,user_id,title,body_markdown,status,revision) values('"+daily+"','"+owner+"','日记 · 2026-10-27','## 感受与想法','active',1);")
    service="set local role service_role;set local request.jwt.claim.role='service_role';set local request.jwt.claim.sub='';"
    def todo(source,hash_character="a"):
        return service+"select public.prepare_inbox_todo_creation('"+owner+"','"+source+"',repeat('"+hash_character+"',64));"
    def calendar(source):
        return service+"select to_jsonb(public.prepare_inbox_calendar_creation('"+owner+"','"+source+"',repeat('b',64),'82000000-0000-4000-8000-000000000001','{\"sourceInboxId\":\""+source+"\"}'));"
    def note(source):
        return "select to_jsonb(public.convert_inbox_note('"+source+"','Mutex note','Synthetic accepted body'));"
    def daily_append(source):
        return "select public.convert_inbox_daily('"+source+"','"+daily+"',1);"
    for label,first,second in [
        ("task versus note",todo(inboxes[0]),note(inboxes[0])),
        ("note versus task",note(inboxes[1]),todo(inboxes[1])),
        ("calendar versus daily",calendar(inboxes[2]),daily_append(inboxes[2])),
        ("daily versus calendar",daily_append(inboxes[3]),calendar(inboxes[3])),
        ("task versus calendar",todo(inboxes[4]),calendar(inboxes[4])),
        ("same inbox different payload",todo(inboxes[5]),todo(inboxes[5],"c")),
        ("task versus direct owner completion",todo(inboxes[6]),"update public.inbox_items set processed_at=now() where id='"+inboxes[6]+"' returning to_jsonb(inbox_items.*);"),
    ]:
        workbench.overlap(db,owner,first,second,"inbox_")
        results.append({"case":label,"secondWriterObservedWaiting":True,"competingIntentRejectedBeforeDispatch":True})
    db.sql("source_fixture", "do $$begin assert not exists(select 1 from public.calendar_operations where payload->>'sourceInboxId'='"+inboxes[3]+"');assert(select count(*)=1 from public.todo_creation_receipts where inbox_id='"+inboxes[5]+"');assert(select revision=2 from public.notes where id='"+daily+"');assert(select processed_at is null from public.inbox_items where id='"+inboxes[6]+"');end $$;")
    return results
try:
    with workbench.SyntheticPostgres() as db:
        initialize(db,"source_fixture",False)
        initialize(db,"restored_fixture",True)
        record_stage("actual-official-type-generation")
        type_spec=importlib.util.spec_from_file_location("continuous_schema_typegen",ROOT/"scripts/continuous-schema-typegen.py")
        typegen=importlib.util.module_from_spec(type_spec);type_spec.loader.exec_module(typegen)
        typegen.verify_schema_types(db,OUTPUT,MIGRATIONS)
        record_stage("real-overlapping-transactions")
        concurrent=concurrency(db)
        phase2_spec=importlib.util.spec_from_file_location("continuous_phase2_concurrency",ROOT/"scripts/continuous-phase2-concurrency.py")
        phase2=importlib.util.module_from_spec(phase2_spec);phase2_spec.loader.exec_module(phase2)
        concurrent.extend(phase2.exercise(db,workbench))
        columns=json.loads(db.sql("source_fixture","select json_agg(json_build_object('table',table_name,'column',column_name,'type',udt_name,'nullable',is_nullable='YES') order by table_name,ordinal_position) from information_schema.columns where table_schema='public';"))
        (OUTPUT/"actual-schema-columns.json").write_text(json.dumps(columns,indent=2)+"\n")
        result={"status":"verified","engine":"PostgreSQL 17","cleanInstall":True,"upgradeFromPreReleaseSchemaWithExistingRows":True,"actualMigrations":len(MIGRATIONS),"ownerAndAnonymousPolicies":True,"immutableSourcesAndCAS":True,"backupInventory":True,"overlappingTransactions":concurrent,"auditRollback":True,"productionAccess":False}
        (OUTPUT/"verification.json").write_text(json.dumps(result,indent=2)+"\n")
        (OUTPUT/"progress.json").write_text(json.dumps(result,indent=2)+"\n")
        print(json.dumps(result))
except BaseException as error:
    progress=json.loads((OUTPUT/"progress.json").read_text())
    progress.update(status="failed",errorClass=type(error).__name__)
    (OUTPUT/"progress.json").write_text(json.dumps(progress,indent=2)+"\n")
    raise
