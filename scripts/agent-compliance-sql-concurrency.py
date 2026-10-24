"""Real multi-session tests. Refuses every target except the disposable CI DB."""
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import threading

if os.environ.get("AGENT_COMPLIANCE_EPHEMERAL") != "1" or os.environ.get("PGHOST") != "127.0.0.1" or os.environ.get("PGDATABASE") != "agent_compliance_test":
    raise SystemExit("Refusing a database that is not the explicit loopback CI fixture")
root = Path(__file__).resolve().parents[1]


def sql(statement, role=None):
    prefix = f"set role {role}; " if role else ""
    result = subprocess.run(["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"], input=prefix + statement, text=True, capture_output=True, check=False)
    if result.returncode:
        return False, result.stderr
    return True, result.stdout.strip()


def checked(statement):
    ok, value = sql(statement)
    if not ok:
        raise RuntimeError(value)
    return value


assert checked("select count(*) from information_schema.tables where table_schema in ('public','auth','storage') and table_type='BASE TABLE'") == "0", "Fixture database must start empty"
checked("create role anon; create role authenticated; create role service_role bypassrls;")
checked((root / "tests/fixtures/system-backup-sql/bootstrap.sql").read_text())
for migration in sorted((root / "supabase/migrations").glob("*.sql")):
    checked(migration.read_text())
owner = "00000000-0000-4000-8000-000000000001"
note = "10000000-0000-4000-8000-000000000001"
run = "20000000-0000-4000-8000-000000000001"
action = "30000000-0000-4000-8000-000000000001"
checked(f"insert into auth.users(id) values('{owner}'); insert into public.ai_governance_settings(user_id,daily_call_limit) values('{owner}',1);")


def race(statements, role):
    barrier = threading.Barrier(len(statements))

    def worker(statement):
        barrier.wait(timeout=15)
        return sql(statement, role)

    with concurrent.futures.ThreadPoolExecutor(max_workers=len(statements)) as pool:
        return list(pool.map(worker, statements))


metadata = json.dumps({"surface": "synthetic", "purpose": "parallel", "model": "synthetic", "retrieval_mode": "none", "source_summary": {}, "context_chars": 10, "output_token_limit": 100, "reserved_cost_usd": 0.1})
results = race([f"select public.reserve_ai_request('{owner}','{metadata}'::jsonb)"] * 12, "service_role")
assert all(ok for ok, _ in results)
assert sum(json.loads(value)["allowed"] for _, value in results) == 1

auth = f"set request.jwt.claim.sub='{owner}'; "
assert sql(auth + f"select public.mutate_note_atomic('create','{note}',null,'Synthetic','initial')", "authenticated")[0]
results = race([auth + f"select public.mutate_note_atomic('update','{note}',1,'Synthetic','writer-{i}')" for i in range(8)], "authenticated")
assert sum(ok for ok, _ in results) == 1
assert all(ok or "note_revision_conflict" in value for ok, value in results)
assert checked(f"select revision from public.notes where id='{note}'") == "2"
assert checked(f"select count(*) from public.note_versions where note_id='{note}'") == "3"
version = checked(f"select id from public.note_versions where note_id='{note}' and version_number=1")
results = race([auth + f"select public.mutate_note_atomic('restore','{note}',2,null,null,null,'{version}')", auth + f"select public.mutate_note_atomic('update','{note}',2,'Synthetic','newer-save')"], "authenticated")
assert sum(ok for ok, _ in results) == 1
assert checked(f"select revision from public.notes where id='{note}'") == "3"
assert checked(f"select count(*) from public.note_versions where note_id='{note}'") == "5"

checked(f"insert into public.agent_runs(id,user_id,surface) values('{run}','{owner}','global'); insert into public.agent_actions(id,user_id,run_id,domain,action_type,payload_json,preview_json,risk_level,status,expires_at) values('{action}','{owner}','{run}','notes','notes.create','{{}}','{{}}','low','proposed',now()+interval '1 day');")
payload_hash = checked(f"select payload_hash from public.agent_actions where id='{action}'")
results = race([f"select public.transition_agent_action('{owner}','{action}','{payload_hash}','executing')"] * 8, "service_role")
assert sum(ok for ok, _ in results) == 1
print("PASS PostgreSQL multi-session quota reservation, note CAS/restore race, and single proposal claim")
