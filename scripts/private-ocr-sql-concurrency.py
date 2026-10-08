"""Synthetic PostgreSQL-only race. Never use production connection information."""
import concurrent.futures
import os
import threading
import psycopg

assert os.environ.get("PGDATABASE") == "private_ocr_test", "requires isolated private_ocr_test"
owner = "11111111-1111-4111-8111-111111111111"
ids = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "cccccccc-cccc-4ccc-8ccc-cccccccccccc"]
with psycopg.connect("") as connection:
    connection.execute("delete from public.document_ocr_jobs")
    connection.execute("update public.documents set archived_at=null where id=%s", [ids[0]])
    connection.execute("insert into public.documents(id,user_id,storage_path,storage_bucket,file_size,checksum) values(%s,%s,%s,'private-test',100,%s)", [ids[1], owner, f"{owner}/files/{ids[1]}/sealed.pdf", "c" * 64])
barrier = threading.Barrier(2)
def claim(document_id):
    with psycopg.connect("") as connection:
        connection.execute("set role authenticated")
        connection.execute("select set_config('request.jwt.claim.sub',%s,false)", [owner])
        barrier.wait()
        try:
            connection.execute("select * from public.start_document_ocr(%s)", [document_id]).fetchone()
            connection.commit()
            return "claimed"
        except psycopg.errors.RaiseException as error:
            assert "ocr_busy" in str(error), str(error)
            return "busy"
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    assert sorted(pool.map(claim, ids)) == ["busy", "claimed"]
with psycopg.connect("") as connection:
    assert connection.execute("select count(*) from public.document_ocr_jobs where status='processing'").fetchone()[0] == 1
print("PASS: concurrent same-owner starts have exactly one winner")
