"""Synthetic CI PostgreSQL only: cash and quote writes share the account lock."""
import os
import subprocess
import time

if os.environ.get("PGDATABASE") != "investment_fixture" or os.environ.get("PGHOST") != "127.0.0.1":
    raise SystemExit("Refusing to run outside the local investment_fixture database")

ACCOUNT = "88888888-9999-4999-8999-999999999999"
OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"


def scalar(sql):
    result = subprocess.run(["psql", "-XAt", "-v", "ON_ERROR_STOP=1", "-c", sql], check=True, capture_output=True, text=True, timeout=10)
    return result.stdout.strip()


def wait_for(sql, label):
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if scalar(sql) == "t":
            return
        time.sleep(0.05)
    raise AssertionError(f"Did not observe {label}")


scalar(f"begin; set local role authenticated; select set_config('request.jwt.claim.sub','{OWNER}',true); insert into investment_accounts(id,user_id,name,mode,currency) values('{ACCOUNT}',auth.uid(),'Daily concurrency fixture','paper','CNY'); commit;")


def writer(name, cash=False):
    hold = f"select id from investment_accounts where id='{ACCOUNT}' for update; select pg_sleep(8);" if cash else ""
    append = f"""select append_investment_cash('{ACCOUNT}','{{"kind":"opening","symbol":null,"void_entry_id":null,"occurred_on":"2026-01-01","amount":"0","tax":"0","fees":"0","source":"Synthetic race cash","import_key":"11111111-7777-4777-8777-777777777777"}}');""" if cash else f"""select append_investment_quotes('{ACCOUNT}','[{{"symbol":"TEST:RACE","currency":"CNY","price":"1","as_of":"2026-01-01T00:00:00Z","source_kind":"manual","source":"Synthetic race quote","import_key":"22222222-7777-4777-8777-777777777777"}}]');"""
    sql = f"begin; set local role authenticated; select set_config('request.jwt.claim.sub','{OWNER}',true); {hold} {append} commit;"
    return subprocess.Popen(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-c", sql], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env={**os.environ, "PGAPPNAME": name})


first = second = None
try:
    first = writer("investment-daily-cash", cash=True)
    wait_for("select exists(select 1 from pg_stat_activity where application_name='investment-daily-cash' and wait_event='PgSleep')", "cash writer owning the account lock")
    second = writer("investment-daily-quote")
    wait_for("select exists(select 1 from pg_stat_activity where application_name='investment-daily-quote' and wait_event_type='Lock')", "quote writer blocked on cash writer")
    first_output, second_output = first.communicate(timeout=20), second.communicate(timeout=20)
    assert first.returncode == 0, first_output
    assert second.returncode == 0, second_output
    assert scalar(f"select revision from investment_accounts where id='{ACCOUNT}'") == "2"
    assert scalar(f"select sequence from investment_cash_ledger where account_id='{ACCOUNT}'") == "1"
    assert scalar(f"select sequence from investment_quotes where account_id='{ACCOUNT}'") == "2"
    assert scalar(f"select count(*) from audit_logs where after_data->>'account_id'='{ACCOUNT}'") == "2"
    print("PASS: observed shared cash/quote lock contention, serialized sequences, and exactly-once audits")
finally:
    for process in (first, second):
        if process is not None and process.poll() is None:
            process.kill()
            process.communicate()
