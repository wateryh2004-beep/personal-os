#!/usr/bin/env python3
"""Concurrent retry/complete/cancel claims in an isolated local database."""
import os,uuid,threading
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse
import psycopg
url=os.environ.get('DATABASE_URL','');p=urlparse(url)
if p.hostname not in ('127.0.0.1','localhost','::1') or p.path!='/document_continuity_test':raise SystemExit('Refusing non-fixture database')
owner=uuid.uuid4()
def connect():
 db=psycopg.connect(url,autocommit=True);db.execute('set role service_role');return db
with connect() as db:db.execute('insert into auth.users values(%s)',(owner,))
barrier=threading.Barrier(12)
def prepare(_):
 with connect() as db:
  barrier.wait(timeout=20)
  return db.execute("select id,document_id from prepare_file_upload_session(%s,%s,'fixture.pdf','application/pdf',16777217,%s,null,'private-test','pending')",(owner,'a'*64,'b'*64)).fetchone()
try:
 with ThreadPoolExecutor(max_workers=12) as pool:rows=list(pool.map(prepare,range(12)))
 assert len(set(rows))==1,rows
 session,document=rows[0]
 barrier=threading.Barrier(12)
 def initialize(_):
  with connect() as db:
   barrier.wait(timeout=20)
   return db.execute("select claim_file_upload_operation(%s,%s,'initialize',%s)",(owner,session,uuid.uuid4())).fetchone()[0]
 with ThreadPoolExecutor(max_workers=12) as pool:claims=list(pool.map(initialize,range(12)))
 assert sum(claims)==1,claims
 with connect() as db:db.execute("update file_upload_sessions set status='uploading',upload_id='synthetic',lease_token=null,lease_expires_at=null where id=%s",(session,))
 barrier=threading.Barrier(2)
 def terminal(operation):
  with connect() as db:
   barrier.wait(timeout=20)
   return operation,db.execute('select claim_file_upload_operation(%s,%s,%s,%s)',(owner,session,operation,uuid.uuid4())).fetchone()[0]
 with ThreadPoolExecutor(max_workers=2) as pool:claims=list(pool.map(terminal,['complete','abort']))
 assert sum(won for _,won in claims)==1,claims
 # Publication and expiry cancellation also share one terminal winner.
 with connect() as db:db.execute("update file_upload_sessions set status='uploaded',expires_at=now()-interval '1 second',lease_token=null,lease_expires_at=null where id=%s",(session,))
 barrier=threading.Barrier(2)
 def publish_or_abort(operation):
  with connect() as db:
   barrier.wait(timeout=20)
   if operation=='abort':return db.execute("select claim_file_upload_operation(%s,%s,'abort',%s)",(owner,session,uuid.uuid4())).fetchone()[0]
   source=f"{owner}/files/{document}/fixture.pdf";final=f"{owner}/files/{document}/sealed-fixture/fixture.pdf"
   return db.execute('select publish_file_upload_session(%s,%s,%s,%s,%s)',(owner,document,source,final,'b'*64)).fetchone()[0]
 with ThreadPoolExecutor(max_workers=2) as pool:claims=list(pool.map(publish_or_abort,['publish','abort']))
 assert sum(claims)==1,claims
 print('PASS one create/init winner; complete/cancel and publish/expired-cancel races are mutually exclusive')
finally:
 with psycopg.connect(url,autocommit=True) as db:
  db.execute('delete from documents where user_id=%s',(owner,));db.execute('delete from audit_logs where user_id=%s',(owner,));db.execute('delete from auth.users where id=%s',(owner,))
