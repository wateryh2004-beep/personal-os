"""Disposable CI Postgres only; prove lock overlap and stale-revision rejection."""
import os
import subprocess
import time
import uuid

ACCOUNT = "99999999-9999-4999-8999-999999999999"


def scalar(sql):
    result = subprocess.run(["psql", "-XAt", "-v", "ON_ERROR_STOP=1", "-c", sql], check=True, capture_output=True, text=True, timeout=10)
    return result.stdout.strip()


def wait_for(sql, label, timeout=5):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if scalar(sql) == "t":
            return
        time.sleep(0.05)
    raise AssertionError(f"Did not observe {label}; overlap was not verified")


def start_writer(name, hold_lock=False):
    key = str(uuid.uuid4())
    # Writer A acquires the account row first, then pauses while still in its transaction.
    hold = f"SELECT id FROM investment_accounts WHERE id='{ACCOUNT}' FOR UPDATE; SELECT pg_sleep(8);" if hold_lock else ""
    sql = f"""BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
{hold}
SELECT append_investment_entry('{ACCOUNT}',0,
'{{"kind":"buy","symbol":"TEST:RACE","occurred_on":"2026-01-01","quantity":"1","price":"1","fees":"0","source":"CI race fixture","import_key":"{key}"}}',repeat('a',64));
COMMIT;"""
    return subprocess.Popen(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-c", sql], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env={**os.environ, "PGAPPNAME": name})


first = second = None
try:
    first = start_writer("investment-race-first", hold_lock=True)
    wait_for("select exists(select 1 from pg_stat_activity where application_name='investment-race-first' and wait_event='PgSleep')", "writer A holding the row lock")
    second = start_writer("investment-race-second")
    wait_for("select exists(select 1 from pg_stat_activity where application_name='investment-race-second' and wait_event_type='Lock')", "writer B blocked on writer A's lock")
    first_output = first.communicate(timeout=20)
    second_output = second.communicate(timeout=20)
    assert first.returncode == 0, first_output
    assert second.returncode != 0 and "revision changed" in second_output[1], second_output
    assert scalar(f"select count(*) from investment_ledger where account_id='{ACCOUNT}'") == "1"
    print("PASS: observed overlapping lock contention; one writer committed and stale writer was rejected")
finally:
    for process in (first, second):
        if process is not None and process.poll() is None:
            process.kill()
            process.communicate()
