"""Exact Phase2 intent/generation races in the caller-created synthetic PG17."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OWNER="81000000-0000-4000-8000-000000000001"

def exercise(db, workbench):
    results=[]
    item="b3100000-0000-4000-8000-000000000001"
    capture="select public.capture_inbox_intent('"+item+"','Concurrent synthetic capture');"
    first,second=workbench.overlap(db,OWNER,capture,capture)
    assert first[0]["created"] is True and second[0]["created"] is False
    db.sql("source_fixture","do $$begin assert(select count(*)=1 from public.audit_logs where entity_id='"+item+"' and action='capture');end $$;")
    results.append({"case":"same capture intent replay","secondWriterObservedWaiting":True,"oneInsertAndAudit":True})
    token="b3100000-0000-4000-8000-000000000002"
    workbench.overlap(db,OWNER,"do $$begin assert public.claim_inbox_classification('"+item+"','"+token+"','Concurrent synthetic capture',false);end $$;","update public.inbox_items set processed_at=now() where id='"+item+"';")
    db.sql("source_fixture","begin;"+workbench.auth(OWNER)+"do $$begin assert not public.commit_inbox_classification('"+item+"','"+token+"','Concurrent synthetic capture','{\"target\":\"daily\"}',null);end $$;commit;")
    results.append({"case":"classification lease versus manual processing","secondWriterObservedWaiting":True,"lateModelCommitRejected":True})
    # Formal checked-in seeds, not an ignored handoff, are the CI authority.
    source=(ROOT/"tests/continuous-practice-intents-postgres.sql").read_text()
    setup=source.split("set local role authenticated;",1)[0].removeprefix("begin;\n")
    db.sql("source_fixture",setup)
    payload={"mode":"solo","preparation_id":"b1100000-0000-4000-8000-000000000003","session_id":None,"parent_attempt_id":None,"answer_version_id":None,"story_id":None,"input_mode":"text","language":"zh","prompt_snapshot":"Synthetic original prompt","response_transcript_markdown":"Concurrent exact original","duration_seconds":None,"self_review_markdown":"","strength_tags":[],"issue_tags":[],"next_focus":"","confidence_before":None,"confidence_after":None}
    def practice(identifier,value): return "select public.record_interview_practice_intent('"+identifier+"',"+workbench.json_literal(value)+");"
    same="b3200000-0000-4000-8000-000000000001"
    first,second=workbench.overlap(db,OWNER,practice(same,payload),practice(same,payload))
    assert first[0]["created"] is True and second[0]["created"] is False
    results.append({"case":"same practice intent replay","secondWriterObservedWaiting":True,"oneOriginalAndSchedule":True})
    session={**payload,"mode":"session","session_id":"b1100000-0000-4000-8000-000000000004"}
    first,second=workbench.overlap(db,OWNER,practice("b3200000-0000-4000-8000-000000000002",session),practice("b3200000-0000-4000-8000-000000000003",session))
    assert first[0]["sequence_no"]==1 and second[0]["sequence_no"]==2
    results.append({"case":"distinct practice intents same session","secondWriterObservedWaiting":True,"sequences":[1,2]})
    source=(ROOT/"tests/continuous-briefing-judgment-postgres.sql").read_text()
    setup=source.split("set local role authenticated;",1)[0].removeprefix("begin;\n")
    db.sql("source_fixture",setup)
    judgment="select public.save_briefing_judgment_intent('30000000-0000-4000-8000-000000000006','30000000-0000-4000-8000-000000000005',null,null,'Concurrent explicit judgment',60,null,'1_month');"
    first,second=workbench.overlap(db,OWNER,judgment,judgment)
    assert first[0]==second[0]
    decision=first[0]["decision_id"]; native_timestamp=first[0]["updated_at"]
    def update_judgment(intent): return "select public.save_briefing_judgment_intent('"+intent+"','30000000-0000-4000-8000-000000000005','"+decision+"',"+workbench.literal(native_timestamp)+",'Updated explicit judgment',70,null,'3_months');"
    workbench.overlap(db,OWNER,update_judgment("30000000-0000-4000-8000-000000000007"),update_judgment("30000000-0000-4000-8000-000000000008"),"judgment_revision_conflict")
    results.append({"case":"same judgment replay and competing source CAS","secondWriterObservedWaiting":True,"microsecondBaselinePreserved":True,"staleWriterRejected":True})
    for number,second_kind in [(1,"terminal"),(2,"action"),(3,"completion")]:
        run="b3300000-0000-4000-8000-"+str(number).zfill(12)
        old="b3300000-0000-4000-8000-000000000011"; new="b3300000-0000-4000-8000-000000000012"
        db.sql("source_fixture","insert into public.agent_runs(id,user_id,surface,status,user_request,generation_token,generation_expires_at) values('"+run+"','"+OWNER+"','tasks','"+("awaiting_approval" if second_kind=="completion" else "running")+"','Synthetic concurrent run','"+old+"',clock_timestamp()-interval '1 second');")
        first_sql="select json_build_object('claimed',public.claim_agent_generation('"+run+"','"+new+"',false));"
        if second_kind=="terminal": second_sql="select json_build_object('updated',public.update_agent_generation('"+run+"','"+old+"','{\"status\":\"completed\"}'));"; error=None
        elif second_kind=="completion": second_sql="select json_build_object('updated',public.complete_agent_run_if_resolved('"+run+"'));"; error=None
        else: second_sql="insert into public.agent_actions(user_id,run_id,generation_token,domain,action_type,payload_json,preview_json,risk_level) values('"+OWNER+"','"+run+"','"+old+"','tasks','tasks.create','{}','{}','low');"; error="agent_generation_conflict"
        first,second=workbench.overlap(db,OWNER,first_sql,second_sql,error)
        assert first[0]["claimed"] is True
        if not error: assert second[0]["updated"] is False
        results.append({"case":"new generation versus old "+second_kind,"secondWriterObservedWaiting":True,"staleMutationRejected":True})
    return results
