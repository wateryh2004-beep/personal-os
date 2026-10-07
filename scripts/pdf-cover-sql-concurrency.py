#!/usr/bin/env python3
"""Isolated PostgreSQL concurrency check; synthetic data, never a production URL."""
import os
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse

import psycopg

url = os.environ.get("DATABASE_URL", "")
parsed = urlparse(url)
if parsed.hostname not in ("127.0.0.1", "localhost", "::1") or parsed.path != "/pdf_cover_test":
    raise SystemExit("Refusing: DATABASE_URL must name local isolated pdf_cover_test")
owner = uuid.UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee")
documents = [uuid.uuid4() for _ in range(8)]
version = "concurrency-v1"

def connect():
    connection = psycopg.connect(url, autocommit=True, client_encoding="utf8")
    connection.execute("set role service_role")
    return connection

with connect() as connection:
    connection.execute("insert into auth.users(id) values (%s)", (owner,))
    for index, document in enumerate(documents):
        connection.execute(
            "insert into public.documents(id,user_id,storage_path,storage_bucket,file_size,checksum) values (%s,%s,%s,'private-test',100,%s)",
            (document, owner, f"{owner}/files/{document}/sealed-fixture.pdf", "a" * 64),
        )
        connection.execute("select * from public.enqueue_pdf_cover(%s,%s,%s,'private-test',%s)", (owner, document, version, 10 if index == 0 else 0))

try:
    # Separate real connections/transactions emulate distinct serverless instances.
    barrier = threading.Barrier(16)
    def race_claim(_):
        with connect() as connection:
            barrier.wait(timeout=20)
            return connection.execute("select document_id,lease_token from public.claim_pdf_cover(%s,%s)", (owner, version)).fetchall()
    with ThreadPoolExecutor(max_workers=16) as pool:
        claimed = [row for result in pool.map(race_claim, range(16)) for row in result]
    assert len(claimed) == 1, f"Expected exactly one per-owner lease, got {len(claimed)}"
    assert claimed[0][0] == documents[0], "Visible priority must beat backfill"
    original_token = claimed[0][1]
    with connect() as connection:
        assert connection.execute("select count(*) from public.pdf_cover_jobs where user_id=%s and status='processing'", (owner,)).fetchone()[0] == 1
        connection.execute("update public.pdf_cover_jobs set lease_expires_at=now()-interval '1 second' where document_id=%s", (documents[0],))
    barrier = threading.Barrier(16)
    with ThreadPoolExecutor(max_workers=16) as pool:
        recovered = [row for result in pool.map(race_claim, range(16)) for row in result]
    assert len(recovered) == 1 and recovered[0][0] == documents[0], "Lease expiry must yield exactly one recovery"
    assert recovered[0][1] != original_token, "Recovery requires a fresh token"
    with connect() as connection:
        stale = connection.execute("select public.finish_pdf_cover(%s,%s,%s,true,%s,%s,50,20,30)", (owner, documents[0], original_token, "a" * 64, "b" * 64)).fetchone()[0]
        assert stale is False, "Stale render must not publish after lease recovery"
        ready = connection.execute("select public.finish_pdf_cover(%s,%s,%s,true,%s,%s,50,20,30)", (owner, documents[0], recovered[0][1], "a" * 64, "b" * 64)).fetchone()[0]
        assert ready is True
    # Repeated concurrent GET-style enqueue must preserve successful work/attempts.
    barrier = threading.Barrier(16)
    def race_enqueue(_):
        with connect() as connection:
            barrier.wait(timeout=20)
            return connection.execute("select status,attempts from public.enqueue_pdf_cover(%s,%s,%s,'private-test',10)", (owner, documents[0], version)).fetchone()
    with ThreadPoolExecutor(max_workers=16) as pool:
        states = list(pool.map(race_enqueue, range(16)))
    assert all(state == ("ready", 2) for state in states), states
    print("PDF cover concurrent claims, owner admission, priority, recovery, stale publication and idempotency passed")
finally:
    with connect() as connection:
        connection.execute("delete from public.documents where user_id=%s", (owner,))
        connection.execute("delete from auth.users where id=%s", (owner,))
