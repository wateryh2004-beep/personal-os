"""Synthetic PostgreSQL migration and RLS regression for narrative lineage.

No production data or credentials. Run only against disposable PostgreSQL.
"""
from pathlib import Path
import os
import psycopg

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20261021075728_interview_narrative_lineage.sql"
A = "00000000-0000-4000-8000-000000000001"
B = "00000000-0000-4000-8000-000000000002"
QP = "00000000-0000-4000-8000-000000000011"
PT = "00000000-0000-4000-8000-000000000012"
PB = "00000000-0000-4000-8000-000000000013"
VMASTER = "00000000-0000-4000-8000-000000000021"
VTARGET = "00000000-0000-4000-8000-000000000022"
VB = "00000000-0000-4000-8000-000000000023"
VMNEW = "00000000-0000-4000-8000-000000000024"
FID = "00000000-0000-4000-8000-000000000031"
FV1 = "00000000-0000-4000-8000-000000000032"
FV2 = "00000000-0000-4000-8000-000000000033"

SETUP = """
create extension if not exists pgcrypto;
create schema auth;
create role authenticated nologin;
create role service_role nologin bypassrls;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.interview_question_preparations(
 id uuid primary key, user_id uuid not null, question_id uuid not null, context_id uuid,
 archived_at timestamptz
);
create table public.interview_answer_versions(
 id uuid primary key, user_id uuid not null, preparation_id uuid not null,
 answer_mode text not null, status text not null, confirmed_at timestamptz,
 archived_at timestamptz, change_note text, version_number integer not null
);
create table public.experience_facts(
 id uuid primary key, user_id uuid not null, verification_status text not null
);
create table public.experience_fact_versions(
 id uuid primary key, user_id uuid not null, fact_id uuid not null, version_number integer not null
);
create function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
grant select on public.interview_question_preparations,
  public.interview_answer_versions, public.experience_facts,
  public.experience_fact_versions to authenticated;
"""

def must_fail(conn, sql, params):
    try:
        with conn.transaction():
            conn.execute(sql, params)
    except psycopg.Error:
        return
    raise AssertionError("Unexpectedly permitted cross-user or invalid version reference")

def main():
    with psycopg.connect(os.getenv("TEST_DATABASE_URL",
          "postgresql://postgres:postgres@localhost:5432/postgres")) as conn:
        conn.execute(SETUP)
        conn.execute("insert into auth.users(id) values (%s),(%s)", (A,B))
        qid="00000000-0000-4000-8000-000000000041"
        conn.execute("""insert into public.interview_question_preparations
              (id,user_id,question_id,context_id) values
              (%s,%s,%s,null),(%s,%s,%s,%s),(%s,%s,%s,%s)""",
              (QP,A,qid,PT,A,qid,"00000000-0000-4000-8000-000000000061",
               PB,B,qid,"00000000-0000-4000-8000-000000000062"))
        conn.execute("""insert into public.interview_answer_versions
          (id,user_id,preparation_id,answer_mode,status,change_note,version_number)
          values (%s,%s,%s,'spoken','draft','NARRATIVE_20261021_V1_MASTER',1),
                 (%s,%s,%s,'spoken','draft','NARRATIVE_20261021_V1_TARGET',1),
                 (%s,%s,%s,'spoken','draft',null,1)""",
          (VMASTER,A,QP,VTARGET,A,PT,VB,B,PB))
        conn.execute(MIGRATION.read_text(encoding="utf-8"))
        result = conn.execute("""select n.id,n.selected_version_id,l.id,l.answer_version_id,l.review_state
          from public.interview_narratives n
          join public.interview_answer_narrative_links l on l.narrative_id=n.id
        """).fetchall()
        assert len(result)==1 and str(result[0][1])==VMASTER
        assert str(result[0][3])==VTARGET and result[0][4]=="unreviewed"
        n_id,_,link_id,_,_=result[0]

        must_fail(conn,"""insert into public.interview_answer_narrative_links
          (user_id,narrative_id,answer_version_id,based_on_version_id)
          values (%s,%s,%s,%s)""",(A,n_id,VB,VMASTER))
        must_fail(conn,"""update public.interview_narratives
          set review_status='approved' where id=%s""",(n_id,))
        must_fail(conn,"""insert into public.interview_answer_narrative_links
          (user_id,narrative_id,answer_version_id,based_on_version_id)
          values (%s,%s,%s,%s)""",(B,n_id,VB,VMASTER))

        conn.execute("""insert into public.interview_answer_versions
          (id,user_id,preparation_id,answer_mode,status,version_number)
          values (%s,%s,%s,'spoken','draft',2)""",(VMNEW,A,QP))
        conn.execute("update public.interview_narratives set selected_version_id=%s where id=%s",(VMNEW,n_id))
        pinned = conn.execute("""select l.based_on_version_id,n.selected_version_id
          from public.interview_answer_narrative_links l
          join public.interview_narratives n on n.id=l.narrative_id where l.id=%s""",(link_id,)).fetchone()
        assert pinned and str(pinned[0])==VMASTER and str(pinned[1])==VMNEW
        must_fail(conn,"""update public.interview_answer_narrative_links
           set review_state='reviewed' where id=%s""",(link_id,))

        conn.execute("""insert into public.experience_facts(id,user_id,verification_status)
          values (%s,%s,'self_confirmed')""",(FID,A))
        conn.execute("""insert into public.experience_fact_versions
          (id,user_id,fact_id,version_number) values (%s,%s,%s,1)""",(FV1,A,FID))
        conn.execute("""insert into public.interview_answer_fact_links
          (user_id,answer_version_id,fact_id,fact_version_id)
          values (%s,%s,%s,%s)""",(A,VTARGET,FID,FV1))
        conn.execute("""insert into public.experience_fact_versions
          (id,user_id,fact_id,version_number) values (%s,%s,%s,2)""",(FV2,A,FID))
        stale = conn.execute("""select count(*) from public.interview_answer_fact_links l
          join public.experience_fact_versions snapshot on snapshot.id=l.fact_version_id
          join public.experience_fact_versions new on new.fact_id=l.fact_id
          where snapshot.version_number < new.version_number""").fetchone()[0]
        assert stale==1

        conn.commit()
        conn.execute("set role authenticated")
        conn.execute("select set_config('request.jwt.claim.sub', %s, false)",(A,))
        assert conn.execute("select count(*) from public.interview_narratives").fetchone()[0]==1
        assert conn.execute("select count(*) from public.interview_answer_fact_links").fetchone()[0]==1
        conn.execute("select set_config('request.jwt.claim.sub', %s, false)",(B,))
        assert conn.execute("select count(*) from public.interview_narratives").fetchone()[0]==0
        assert conn.execute("select count(*) from public.interview_answer_narrative_links").fetchone()[0]==0
        assert conn.execute("select count(*) from public.interview_answer_fact_links").fetchone()[0]==0
        print("Interview narrative lineage: migration, owner validation, drift and RLS passed")

if __name__ == "__main__":
    main()
