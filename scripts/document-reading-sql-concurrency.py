#!/usr/bin/env python3
"""Separate-connection CAS race. Local synthetic database only."""
import os, uuid, threading
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor
import psycopg
url = os.environ.get("DATABASE_URL", "")
p = urlparse(url)
if p.hostname not in ("127.0.0.1", "localhost", "::1") or p.path != "/document_continuity_test":
    raise SystemExit("Refusing non-local/non-fixture database")
owner, doc = uuid.uuid4(), uuid.uuid4()
with psycopg.connect(url, autocommit=True) as db:
    db.execute("insert into auth.users values (%s)", (owner,))
    source = db.execute("insert into documents(id,user_id,storage_path) values(%s,%s,'synthetic') returning reading_source_version", (doc,owner)).fetchone()[0]
barrier=threading.Barrier(12)
def save(page):
    with psycopg.connect(url, autocommit=True) as db:
        db.execute("set role authenticated")
        db.execute("select set_config('request.jwt.claim.sub',%s,false)",(str(owner),))
        barrier.wait(timeout=20)
        return db.execute("select save_document_reading_progress(%s,%s,%s,20,0,%s)",(doc,source,page,uuid.uuid4())).fetchone()[0]
try:
    with ThreadPoolExecutor(max_workers=12) as pool: results=list(pool.map(save,range(1,13)))
    assert sum(r['status']=='saved' for r in results)==1, results
    assert sum(r['status']=='conflict' for r in results)==11, results
    assert len({r['progress']['page'] for r in results})==1, results
    print("12 concurrent readers: one save, 11 truthful conflicts, identical winning position")
finally:
    with psycopg.connect(url,autocommit=True) as db:
        db.execute("delete from documents where id=%s",(doc,)); db.execute("delete from auth.users where id=%s",(owner,))
