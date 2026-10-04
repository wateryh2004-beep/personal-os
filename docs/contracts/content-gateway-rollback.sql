-- DESTRUCTIVE ROLLBACK PROPOSAL ONLY. DO NOT RUN automatically.
-- Requires explicit approval: this removes gateway grant/revocation history.
-- First disable HTTP gateway endpoints and the separately provisioned LOGIN;
-- drain existing connections, revoke the server credential, and export any
-- required authorization history through a separately approved secure process.
-- Recheck object ownership/dependencies. No CASCADE or DROP OWNED shortcut.
-- Leaves canonical content, content history, audit receipts, and write_content
-- intact. No source content is deleted by this rollback.

begin;
drop function public.approve_content_authorization(uuid,text,text,text[]);
drop function public.deny_content_authorization(uuid,text);
drop function public.list_content_authorizations();
drop function public.revoke_content_authorization(uuid);
drop function content_gateway.get_token(text,text);
drop function content_gateway.read_content(text,text,jsonb);
drop function content_gateway.write_content(text,text,jsonb);
drop function content_gateway._token_context(text,text);
drop function content_gateway._redirect_allowed(text[],text);
drop function content_gateway.get_client(text);
drop function content_gateway.create_request(jsonb);
drop function content_gateway.get_request(uuid);
drop function content_gateway._approve(uuid,text,text,text[]);
drop function content_gateway._deny(uuid,text);
drop function content_gateway.get_code(text);
drop function content_gateway.consume_code(text,text);
drop function content_gateway.save_token(text,text,text,timestamptz);
drop function content_gateway.revoke_token(text,text);
drop function content_gateway._list_authorizations();
drop function content_gateway._revoke_authorization(uuid);
drop policy gateway_notes_owner on public.notes;
drop policy gateway_notes_select on public.notes;
drop policy gateway_note_versions_owner on public.note_versions;
drop policy gateway_note_versions_select on public.note_versions;
drop policy gateway_audit_logs_owner on public.audit_logs;
drop policy gateway_audit_logs_select on public.audit_logs;
drop policy gateway_note_folders_owner on public.note_folders;
drop policy gateway_note_folders_select on public.note_folders;
drop policy gateway_interview_questions_owner on public.interview_questions;
drop policy gateway_interview_questions_select on public.interview_questions;
drop policy gateway_interview_contexts_owner on public.interview_contexts;
drop policy gateway_interview_contexts_select on public.interview_contexts;
drop policy gateway_interview_question_preparations_owner on public.interview_question_preparations;
drop policy gateway_interview_question_preparations_select on public.interview_question_preparations;
drop policy gateway_interview_answer_versions_owner on public.interview_answer_versions;
drop policy gateway_interview_answer_versions_select on public.interview_answer_versions;
drop policy gateway_search_documents_owner on public.search_documents;
drop policy gateway_search_documents_select on public.search_documents;
drop policy gateway_notes_insert on public.notes;
drop policy gateway_note_versions_insert on public.note_versions;
drop policy gateway_audit_logs_insert on public.audit_logs;
drop policy gateway_interview_answer_versions_insert on public.interview_answer_versions;
drop policy gateway_search_documents_insert on public.search_documents;
drop policy gateway_notes_update on public.notes;
drop policy gateway_interview_question_preparations_update on public.interview_question_preparations;
drop policy gateway_interview_answer_versions_update on public.interview_answer_versions;
drop policy gateway_search_documents_update on public.search_documents;
revoke all on public.notes,public.note_versions,public.audit_logs,public.note_folders,
  public.interview_questions,public.interview_contexts,public.interview_question_preparations,
  public.interview_answer_versions,public.search_documents from content_gateway_executor;
revoke update(id) on public.interview_question_preparations,public.interview_answer_versions from content_gateway_executor;
revoke update(status) on public.interview_question_preparations from content_gateway_executor;
revoke execute on function public.write_content(jsonb) from content_gateway_executor;
revoke execute on function auth.uid() from content_gateway_executor,content_gateway_auth_owner;
revoke all on schema public,auth from content_gateway_executor,content_gateway_auth_owner;
drop table content_auth.tokens;
drop table content_auth.codes;
drop table content_auth.grants;
drop table content_auth.requests;
drop table content_auth.clients;
alter default privileges for role content_gateway_auth_owner in schema content_gateway grant execute on functions to public;
alter default privileges for role content_gateway_executor in schema content_gateway grant execute on functions to public;
drop schema content_gateway;
drop schema content_auth;
drop role content_gateway_runtime;
drop role content_gateway_executor;
drop role content_gateway_auth_owner;
commit;
