import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("docs/contracts/content-gateway.sql", "utf8");
const rollback = readFileSync("docs/contracts/content-gateway-rollback.sql", "utf8");
const acceptance = () => readFileSync("tests/database/content-gateway.sql", "utf8");
const body = (name: string) => sql.split(`create function ${name}(`)[1]?.split("$$;")[0] ?? "";

// Static review guardrails. These tests do not execute or validate live grants.
describe("prepared gateway database security boundary", () => {
  it("stays dormant and never provisions a production credential or client", () => {
    expect(sql).toContain("PREPARED PROPOSAL ONLY");
    expect(sql.match(/^create role .+ nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;/gm)).toHaveLength(3);
    expect(sql).not.toMatch(/create role .*\blogin\b/i);
    expect(sql).not.toMatch(/password\s+'|insert into content_auth\.clients|grant authenticated|grant service_role/i);
    expect(sql).toContain("Proposal must not activate a client");
    expect(sql).not.toMatch(/(?:access_token|refresh_token)\s+(?:text|varchar)/i);
    expect(sql).toContain("token_hash text primary key");
    expect(sql).toContain("csrf_hash text not null");
  });

  it("fails closed on PUBLIC privileges and never silently repairs unrelated ACLs", () => {
    expect(sql).toContain("has_function_privilege('content_gateway_runtime',p.oid,'EXECUTE')");
    expect(sql).toContain("has_schema_privilege('content_gateway_runtime',n.oid,'USAGE')");
    expect(sql).toContain("has_any_column_privilege('content_gateway_runtime',c.oid,'SELECT,INSERT,UPDATE,REFERENCES')");
    expect(sql).toContain("Gateway activation blocked by inherited PUBLIC definer access");
    expect(sql).toContain("has_database_privilege('content_gateway_runtime',current_database(),'CREATE,TEMP')");
    expect(sql).toContain("Gateway activation blocked by inherited schema CREATE privilege");
    expect(sql).toContain("Gateway activation blocked by inherited PUBLIC table access");
    expect(sql).toContain("Gateway runtime must have no role memberships");
    expect(sql).not.toContain("revoke all on function public.handle_new_user");
  });

  it("owns a closed private interface with explicit execution grants", () => {
    const functions = [...sql.matchAll(/^create function (\S+)\(([^\n]*)\)/gm)].map((m) => m[1]);
    expect(functions).toHaveLength(20);
    for (const name of functions) {
      expect(body(name)).toContain("set search_path = pg_catalog, pg_temp");
      expect(sql).toContain(`revoke all on function ${name}(`);
    }
    expect(sql).toContain("revoke all on all tables in schema content_auth from public,anon,authenticated,service_role,content_gateway_runtime");
    expect(sql).toContain("grant execute on function public.approve_content_authorization(uuid,text,text,text[]) to authenticated");
    expect(sql).not.toMatch(/grant execute on function content_gateway\._\w+\([^;]+to content_gateway_runtime/);
    expect(sql).not.toMatch(/grant (?:all|select|insert|update|delete)[^;]+to content_gateway_runtime/);
  });

  it("binds owner consent to the pending request and issues one hashed token", () => {
    const approve = body("content_gateway._approve");
    expect(approve).toContain("owner_id uuid:=auth.uid()");
    expect(approve).toContain("c.user_id<>owner_id");
    expect(approve).toContain("r.csrf_hash<>p_csrf_hash");
    expect(approve).toContain("not p_approved_scopes<@r.scope");
    expect(approve).toContain("not p_approved_scopes<@c.allowed_scopes");
    expect(approve).not.toContain("p_owner");
    expect(body("content_gateway.create_request")).toContain("p_payload->>'codeChallengeMethod'<>'S256'");
    const save = body("content_gateway.save_token");
    expect(save).toContain("a.exchange_nonce_hash<>p_exchange_nonce_hash");
    expect(save).toContain("a.issued_at is not null");
    expect(save).toContain("token_expires:=least(p_expires_at,g.expires_at)");
    expect(save).toContain("p_expires_at>ts+interval '1 hour'");
    expect(sql).toContain("grant_id uuid not null unique references content_auth.grants");
    expect(body("content_gateway.consume_code")).toContain("a.consumed_at is null");
    expect(body("content_gateway.create_request")).toContain("'content-request:'||c.id");
    expect(body("content_gateway.create_request")).toContain(")>=100");
    expect(body("content_gateway.create_request")).toContain("old_request.status in ('pending','denied')");
    expect(body("content_gateway.create_request")).not.toMatch(/delete from content_auth\.(grants|codes|tokens)/);
  });

  it("only permits the fixed loopback redirect policy", () => {
    const redirect = body("content_gateway._redirect_allowed");
    expect(redirect).toContain("'http://127.0.0.1/callback'=any(p_registered)");
    expect(redirect).toContain("[1-9][0-9]{0,4}/callback$");
    expect(redirect).toContain("<=65535");
    expect(redirect).not.toContain("https://");
    expect(redirect).not.toContain("localhost");
    expect(redirect).not.toContain("[::1]");
  });

  it("serializes revocation and checks authorization inside the canonical write transaction", () => {
    const context = body("content_gateway._token_context");
    expect(context).toContain("pg_advisory_xact_lock_shared");
    expect(context.indexOf("pg_advisory_xact_lock_shared")).toBeLessThan(context.indexOf("g.revoked_at is null"));
    expect(context).toContain("g.resource=p_audience");
    expect(context).toContain("c.user_id=g.user_id");
    expect(body("content_gateway._revoke_authorization")).toContain("pg_advisory_xact_lock");
    const write = body("content_gateway.write_content");
    expect(write).toContain("ctx:=content_gateway._token_context(p_token_hash,p_audience)");
    expect(write).toContain("ctx->'scope' ? required_scope");
    expect(write).toContain("p_command->>'source' is distinct from 'codex'");
    expect(write).toContain("result:=public.write_content(p_command)");
    expect(write).not.toMatch(/insert into public\.|update public\./);
    expect(write).toContain("errcode='P0201'");
    expect(write).toContain("errcode='P0202'");
    expect(write).toContain("errcode='22023'");
    expect(write).toContain("exception when others then");
    expect(write.match(/set_config\('request.jwt.claim.sub',coalesce\(old_sub,''\),true\)/g)).toHaveLength(2);
    expect(sql).not.toMatch(/set (?:local )?role authenticated/i);
  });

  it("retains RLS and the Notes search-index trigger dependency", () => {
    expect(sql).toContain("grant select,insert,update on public.search_documents to content_gateway_executor");
    expect(sql).toContain("gateway_search_documents_owner");
    expect(sql).toContain("as restrictive for all to content_gateway_executor");
    expect(sql).toContain("entity_type='note'");
    expect(sql).toContain("grant update(id) on public.interview_question_preparations,public.interview_answer_versions");
    expect(sql).toContain("grant update(status) on public.interview_question_preparations");
    const read = body("content_gateway.read_content");
    expect(read).toContain("ai_visibility='normal'");
    expect(read).toContain("deleted_at is null and archived_at is null");
    expect(read).toContain("limit 201");
    expect(read).toContain("jsonb_array_length(versions)>200");
    expect(read).toContain("maximum not between 1 and 30");
  });

  it("provides deliberate, non-cascading rollback and isolated acceptance assertions", () => {
    expect(rollback).toContain("DESTRUCTIVE ROLLBACK PROPOSAL ONLY");
    expect(rollback).not.toMatch(/^.*\b(?:drop schema|drop table|drop function)\b.*\bcascade\b/im);
    expect(rollback).not.toContain("drop function public.write_content");
    expect(rollback).not.toContain("drop table public.");
    expect(acceptance()).toContain("content_gateway.test_database");
    expect(acceptance()).toMatch(/rollback;\s*$/);
    expect(acceptance()).not.toMatch(/^commit;/m);
  });
});
