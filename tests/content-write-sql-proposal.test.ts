import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql = readFileSync("docs/contracts/content-write-transaction.sql", "utf8");

// These are review guardrails, not a claim that the unapplied SQL was executed.
describe("prepared-only content transaction safety contract", () => {
  it("stays invoker-scoped, rejects absent JWT identity, and restricts execute", () => {
    expect(sql).toContain("security invoker");
    expect(sql).not.toMatch(/security definer/i);
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("v_user uuid := auth.uid()");
    expect(sql).toContain("if v_user is null then");
    expect(sql).toContain("revoke all on function public.write_content(jsonb) from public, anon, authenticated, service_role");
    expect(sql).toContain("grant execute on function public.write_content(jsonb) to authenticated");
    expect(sql).not.toMatch(/create (?:table|policy)/i);
  });

  it("binds replay to the owner and full command before content changes", () => {
    expect(sql).toContain("on public.audit_logs(user_id, request_id)");
    expect(sql).toContain("where action = 'content.write' and request_id is not null");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("sha256(convert_to(p_command::text, 'UTF8'))");
    expect(sql).toContain("a.user_id = v_user and a.request_id = v_operation_id");
    expect(sql).toContain("v_receipt->>'commandHash' is distinct from v_hash");
    expect(sql.indexOf("v_receipt->'result'")).toBeLessThan(sql.indexOf("insert into public.notes"));
    expect(sql).toContain("'source', v_source, 'sourceUrl', v_source_url");
    expect(sql).toContain("'contentOrigin', v_content_origin, 'captureMode', v_capture_mode");
  });

  it("locks selected active notes and preserves old and new snapshots atomically", () => {
    expect(sql).toContain("n.status = 'active' and n.archived_at is null and n.deleted_at is null and n.ai_visibility = 'normal'");
    expect(sql).toContain("v_note.revision <> v_expected_revision or v_note.updated_at <> v_expected_updated_at");
    expect(sql).toContain("'before_external_update'");
    expect(sql).toContain("'external_initial' else 'external_update'");
    expect(sql.indexOf("'before_external_update'")).toBeLessThan(sql.indexOf("update public.notes"));
    expect(sql).toContain("revision = v_note.revision + 1");
    expect(sql).toContain("content_origin = v_content_origin");
    expect(sql).not.toContain("content_origin = 'ai_generated'");
    expect(sql).toContain("array['title', 'contentOrigin']");
    expect(sql).toContain("'/notes/' || v_note.id::text || '/read'");
  });

  it("preserves interview versions and only appends unconfirmed AI drafts", () => {
    expect(sql).toContain("p.id = v_preparation_id and p.user_id = v_user and p.archived_at is null for update");
    expect(sql).toContain("v_latest_version <> v_expected_version");
    expect(sql).toContain("v_answer.updated_at <> v_expected_updated_at");
    expect(sql).toContain("a.target_seconds is not distinct from v_seconds");
    expect(sql).toContain("case when v_base_answer_id is null then 'ai_draft' else 'ai_edited' end, 'draft', v_change_note, null");
    expect(sql).not.toMatch(/update public.interview_answer_versions/i);
    expect(sql).not.toMatch(/insert into public.interview_practice_attempts/i);
    expect(sql).toContain("'entityId', v_preparation_id, 'answerId', v_answer.id");
    expect(sql).toContain("if v_mode <> 'spoken'");
    expect(sql).toContain("'/career/interview?question=' || v_preparation.question_id::text");
    expect(sql).toContain("|| '&answer=' || v_answer.id::text");
  });

  it("keeps content bytes separate from provenance and never transmits user_id", () => {
    expect(sql).toContain("v_body := p_command->>'bodyMarkdown'");
    expect(sql).not.toContain("p_command->>'user_id'");
    expect(sql).not.toContain("p_command->>'userId'");
    expect(sql).toContain("where not (k.key = any(v_allowed))");
    expect(sql).not.toMatch(/v_body\s*:=.*(?:trim|source)/i);
    expect(sql).toContain("PREPARED PROPOSAL ONLY");
  });
});
