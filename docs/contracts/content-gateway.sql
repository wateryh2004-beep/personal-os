-- PREPARED PROPOSAL ONLY. Not applied locally or remotely.
-- Reviewed deployment must first generate a Supabase migration and run isolated
-- acceptance tests. All three roles deliberately remain NOLOGIN. Enabling LOGIN,
-- assigning a password, configuring server credential custody, and inserting a
-- concrete client/owner/redirect/resource configuration need separate approval.
-- Requires the existing reviewed public.write_content(jsonb), unchanged.
-- No owner JWT custody, service-role client, refresh tokens, dynamic client
-- registration, or external-client database access is part of this proposal.
-- Execute as an approved migration operator able to assign these object owners.

begin;

create role content_gateway_runtime nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
create role content_gateway_auth_owner nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
create role content_gateway_executor nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;

-- A role-specific REVOKE does not negate privileges inherited from PUBLIC.
-- Fail closed; do not silently rewrite unrelated production ACLs. This includes
-- trigger functions: TEMP-table triggers could otherwise invoke public definers.
do $preflight$
declare v_object text;
begin
  -- TEMP is commonly inherited from PUBLIC. An empty search_path still searches
  -- pg_temp for data types, including in the unchanged canonical writer. A SQL
  -- runtime must not be able to introduce shadow types or trigger-bearing tables.
  if pg_catalog.has_database_privilege('content_gateway_runtime',current_database(),'CREATE,TEMP') then
    raise exception 'Gateway activation blocked by inherited database CREATE/TEMP privileges';
  end if;
  select n.nspname into v_object from pg_catalog.pg_namespace n
    where n.nspname not like 'pg_%' and n.nspname<>'information_schema'
      and pg_catalog.has_schema_privilege('content_gateway_runtime',n.oid,'CREATE') limit 1;
  if v_object is not null then
    raise exception 'Gateway activation blocked by inherited schema CREATE privilege: %',v_object;
  end if;
  select n.nspname || '.' || p.proname into v_object
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where p.prosecdef and n.nspname not in ('pg_catalog','information_schema')
    and pg_catalog.has_schema_privilege('content_gateway_runtime',n.oid,'USAGE')
    and pg_catalog.has_function_privilege('content_gateway_runtime',p.oid,'EXECUTE')
  limit 1;
  if v_object is not null then
    raise exception 'Gateway activation blocked by inherited PUBLIC definer access: %',v_object;
  end if;
  select n.nspname || '.' || c.relname into v_object
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private') and c.relkind in ('r','p','v','m','f')
    and (pg_catalog.has_table_privilege('content_gateway_runtime',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or pg_catalog.has_any_column_privilege('content_gateway_runtime',c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))
  limit 1;
  if v_object is not null then
    raise exception 'Gateway activation blocked by inherited PUBLIC table access: %',v_object;
  end if;
  if pg_catalog.to_regprocedure('public.write_content(jsonb)') is null then
    raise exception 'Reviewed canonical write_content must be installed first';
  end if;
end;
$preflight$;

create schema content_auth authorization content_gateway_auth_owner;
create schema content_gateway authorization content_gateway_auth_owner;
revoke all on schema content_auth,content_gateway from public,anon,authenticated,service_role;
grant usage on schema content_gateway to content_gateway_runtime,authenticated,content_gateway_executor;
grant usage on schema content_auth to content_gateway_executor;
grant usage on schema public,auth to content_gateway_executor,content_gateway_auth_owner;
-- Needed only for assigning function ownership during this transaction.
grant create on schema content_gateway to content_gateway_executor;
alter default privileges for role content_gateway_auth_owner in schema content_auth revoke all on tables from public;
alter default privileges for role content_gateway_auth_owner in schema content_gateway revoke execute on functions from public;
alter default privileges for role content_gateway_executor in schema content_gateway revoke execute on functions from public;

create table content_auth.clients (
  id text primary key check (id='personalos-codex'),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 10),
  resource text not null check (resource ~ '^https://[^[:space:]?#]+$' and char_length(resource)<=2048),
  allowed_scopes text[] not null check (cardinality(allowed_scopes) between 1 and 4 and allowed_scopes <@ array['notes:read','notes:write','interview:read','interview:append']::text[]),
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);
create table content_auth.requests (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references content_auth.clients(id),
  redirect_uri text not null,
  scope text[] not null,
  resource text not null,
  state text not null check (char_length(state) between 1 and 512),
  code_challenge text not null check (code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
  csrf_hash text not null check (csrf_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending','approved','denied')),
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '10 minutes')
);
create table content_auth.grants (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references content_auth.requests(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null references content_auth.clients(id),
  scope text[] not null,
  resource text not null,
  created_at timestamptz not null default now(),
  -- The grant lasts at most one hour from explicit owner approval.
  expires_at timestamptz not null default (now()+interval '1 hour'),
  revoked_at timestamptz
);
create table content_auth.codes (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  grant_id uuid not null unique references content_auth.grants(id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null check (code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '5 minutes'),
  consumed_at timestamptz,
  exchange_nonce_hash text check (exchange_nonce_hash ~ '^[0-9a-f]{64}$'),
  issued_at timestamptz,
  check ((consumed_at is null)=(exchange_nonce_hash is null))
);
create table content_auth.tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  grant_id uuid not null unique references content_auth.grants(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (expires_at>created_at and expires_at<=created_at+interval '1 hour')
);
create index content_gateway_requests_expiry_idx on content_auth.requests(expires_at);
create index content_gateway_grants_owner_idx on content_auth.grants(user_id,created_at desc);

alter table content_auth.clients owner to content_gateway_auth_owner;
alter table content_auth.requests owner to content_gateway_auth_owner;
alter table content_auth.grants owner to content_gateway_auth_owner;
alter table content_auth.codes owner to content_gateway_auth_owner;
alter table content_auth.tokens owner to content_gateway_auth_owner;
alter table content_auth.clients enable row level security;
alter table content_auth.requests enable row level security;
alter table content_auth.grants enable row level security;
alter table content_auth.codes enable row level security;
alter table content_auth.tokens enable row level security;
revoke all on all tables in schema content_auth from public,anon,authenticated,service_role,content_gateway_runtime;
grant select on content_auth.clients,content_auth.grants,content_auth.tokens to content_gateway_executor;
create policy gateway_executor_clients on content_auth.clients for select to content_gateway_executor using (true);
create policy gateway_executor_grants on content_auth.grants for select to content_gateway_executor using (true);
create policy gateway_executor_tokens on content_auth.tokens for select to content_gateway_executor using (true);

-- No INSERT client configuration is supplied. The feature remains fail-closed.
-- Registered loopback base URIs omit the port; SQL permits only that port to
-- vary, and otherwise requires exact matching. Never use localhost/wildcards.
create function content_gateway._redirect_allowed(p_registered text[],p_uri text)
returns boolean language sql immutable security invoker set search_path = pg_catalog, pg_temp as $$
  select coalesce('http://127.0.0.1/callback'=any(p_registered)
    and p_uri ~ '^http://127\.0\.0\.1:[1-9][0-9]{0,4}/callback$'
    and (substring(p_uri from '^http://127\.0\.0\.1:([0-9]+)/callback$'))::integer<=65535,false);
$$;

create function content_gateway.get_client(p_client_id text)
returns jsonb language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select jsonb_build_object('id',c.id,'name',c.display_name,'ownerId',c.user_id,'enabled',c.enabled,'accessTokenLifetime',3600,'redirectUris',c.redirect_uris,
    'grants',jsonb_build_array('authorization_code'),'allowedScopes',c.allowed_scopes,'resource',c.resource)
  from content_auth.clients c where c.id=p_client_id and c.enabled;
$$;

create function content_gateway.create_request(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare c content_auth.clients%rowtype; r content_auth.requests%rowtype; scopes text[];
begin
  if p_payload is null or jsonb_typeof(p_payload)<>'object'
    or not (p_payload ?& array['clientId','redirectUri','scope','resource','state','codeChallenge','codeChallengeMethod','csrfHash'])
    or exists(select 1 from jsonb_object_keys(p_payload) k where k<>all(array['clientId','redirectUri','scope','resource','state','codeChallenge','codeChallengeMethod','csrfHash']))
    or jsonb_typeof(p_payload->'scope')<>'array'
    or exists(select 1 from jsonb_array_elements(p_payload->'scope') s where jsonb_typeof(s)<>'string')
    or exists(select 1 from unnest(array['clientId','redirectUri','resource','state','codeChallenge','codeChallengeMethod','csrfHash']) k where jsonb_typeof(p_payload->k)<>'string')
  then raise exception using errcode='22023',message='invalid authorization request'; end if;
  select * into c from content_auth.clients where id=p_payload->>'clientId' and enabled;
  scopes:=array(select jsonb_array_elements_text(p_payload->'scope'));
  if not found or cardinality(scopes) not between 1 and 4
    or cardinality(scopes)<>(select count(distinct x) from unnest(scopes) x)
    or not scopes<@c.allowed_scopes or p_payload->>'resource'<>c.resource
    or p_payload->>'codeChallengeMethod'<>'S256'
    or not content_gateway._redirect_allowed(c.redirect_uris,p_payload->>'redirectUri')
  then raise exception using errcode='22023',message='unregistered authorization request'; end if;
  -- Bound anonymous authorization-request storage across server instances.
  perform pg_advisory_xact_lock(hashtextextended('content-request:'||c.id,0));
  -- Expired unapproved requests contain no grant, code, token, or content. Never
  -- remove approved requests, grant history, audit receipts, or source content.
  delete from content_auth.requests old_request
    where old_request.client_id=c.id and old_request.expires_at<=clock_timestamp()
      and old_request.status in ('pending','denied')
      and not exists(select 1 from content_auth.grants g where g.request_id=old_request.id);
  if (select count(*) from content_auth.requests pending_request where pending_request.client_id=c.id
    and pending_request.status='pending' and pending_request.expires_at>clock_timestamp())>=100
  then raise exception using errcode='P0203',message='too many pending authorization requests'; end if;
  insert into content_auth.requests(client_id,redirect_uri,scope,resource,state,code_challenge,csrf_hash)
    values(c.id,p_payload->>'redirectUri',scopes,c.resource,p_payload->>'state',p_payload->>'codeChallenge',p_payload->>'csrfHash') returning * into r;
  return jsonb_build_object('id',r.id,'clientId',r.client_id,'redirectUri',r.redirect_uri,'scope',r.scope,
    'resource',r.resource,'state',r.state,'codeChallenge',r.code_challenge,'codeChallengeMethod','S256',
    'consumedAt',r.consumed_at,'expiresAt',r.expires_at);
end;
$$;

create function content_gateway.get_request(p_request_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select jsonb_build_object('id',r.id,'clientId',r.client_id,'redirectUri',r.redirect_uri,
    'scope',r.scope,'resource',r.resource,'state',r.state,'codeChallenge',r.code_challenge,
    'codeChallengeMethod','S256','consumedAt',r.consumed_at,'expiresAt',r.expires_at)
  from content_auth.requests r join content_auth.clients c on c.id=r.client_id
  where r.id=p_request_id and r.expires_at>now() and c.enabled;
$$;

create function content_gateway._approve(p_request_id uuid,p_csrf_hash text,p_code_hash text,p_approved_scopes text[])
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare r content_auth.requests%rowtype; c content_auth.clients%rowtype; g content_auth.grants%rowtype; owner_id uuid:=auth.uid(); code_expires timestamptz;
begin
  if owner_id is null or p_csrf_hash is null or p_code_hash is null or p_code_hash!~'^[0-9a-f]{64}$'
    or p_approved_scopes is null or cardinality(p_approved_scopes) not between 1 and 4
    or array_position(p_approved_scopes,null) is not null
    or cardinality(p_approved_scopes)<>(select count(distinct x) from unnest(p_approved_scopes) x)
  then raise exception using errcode='42501',message='owner authorization required'; end if;
  select * into r from content_auth.requests where id=p_request_id for update;
  if not found or r.status<>'pending' or r.expires_at<=clock_timestamp() or r.csrf_hash<>p_csrf_hash
  then raise exception using errcode='22023',message='authorization request unavailable'; end if;
  select * into c from content_auth.clients where id=r.client_id and enabled;
  if not found or c.user_id<>owner_id or not p_approved_scopes<@r.scope or not p_approved_scopes<@c.allowed_scopes
    or r.resource<>c.resource or not content_gateway._redirect_allowed(c.redirect_uris,r.redirect_uri)
  then raise exception using errcode='42501',message='owner authorization required'; end if;
  insert into content_auth.grants(request_id,user_id,client_id,scope,resource)
    values(r.id,owner_id,c.id,p_approved_scopes,c.resource) returning * into g;
  insert into content_auth.codes(code_hash,grant_id,redirect_uri,code_challenge)
    values(p_code_hash,g.id,r.redirect_uri,r.code_challenge) returning expires_at into code_expires;
  update content_auth.requests set status='approved',consumed_at=clock_timestamp() where id=r.id;
  return jsonb_build_object('grantId',g.id,'clientId',c.id,'ownerId',owner_id,'redirectUri',r.redirect_uri,
    'scope',g.scope,'resource',g.resource,'codeChallenge',r.code_challenge,'codeChallengeMethod','S256',
    'expiresAt',code_expires,'consumedAt',null);
end;
$$;

create function content_gateway._deny(p_request_id uuid,p_csrf_hash text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare r content_auth.requests%rowtype;
begin
  select r0.* into r from content_auth.requests r0 join content_auth.clients c on c.id=r0.client_id
    where r0.id=p_request_id and c.enabled and c.user_id=auth.uid() for update of r0;
  if not found or r.status<>'pending' or r.expires_at<=clock_timestamp() or p_csrf_hash is null or r.csrf_hash<>p_csrf_hash
  then raise exception using errcode='42501',message='owner authorization required'; end if;
  update content_auth.requests set status='denied',consumed_at=clock_timestamp() where id=r.id;
  return jsonb_build_object('redirectUri',r.redirect_uri,'state',r.state);
end;
$$;

create function content_gateway.get_code(p_code_hash text)
returns jsonb language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select jsonb_build_object('clientId',g.client_id,'grantId',g.id,'ownerId',g.user_id,
    'redirectUri',a.redirect_uri,'scope',g.scope,'resource',g.resource,'codeChallenge',a.code_challenge,
    'codeChallengeMethod','S256','expiresAt',a.expires_at,'consumedAt',a.consumed_at)
  from content_auth.codes a join content_auth.grants g on g.id=a.grant_id
    join content_auth.clients c on c.id=g.client_id
  where a.code_hash=p_code_hash and a.consumed_at is null and a.expires_at>now()
    and g.revoked_at is null and g.expires_at>now() and c.enabled and c.user_id=g.user_id and c.resource=g.resource;
$$;

-- The OAuth engine deliberately consumes a code before final PKCE verification.
-- Consumption is committed separately; invalid PKCE cannot retry the same code.
create function content_gateway.consume_code(p_code_hash text,p_exchange_nonce_hash text)
returns boolean language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare gid uuid; touched integer;
begin
  if p_exchange_nonce_hash is null or p_exchange_nonce_hash!~'^[0-9a-f]{64}$' then return false; end if;
  select grant_id into gid from content_auth.codes where code_hash=p_code_hash;
  if not found then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('content-grant:'||gid::text,0));
  update content_auth.codes a set consumed_at=clock_timestamp(),exchange_nonce_hash=p_exchange_nonce_hash
    from content_auth.grants g,content_auth.clients c
    where a.code_hash=p_code_hash and a.grant_id=g.id and c.id=g.client_id and c.enabled
      and c.user_id=g.user_id and c.resource=g.resource and g.revoked_at is null
      and g.expires_at>clock_timestamp() and a.expires_at>clock_timestamp() and a.consumed_at is null;
  get diagnostics touched=row_count;
  return touched=1;
end;
$$;

create function content_gateway.save_token(p_code_hash text,p_exchange_nonce_hash text,p_token_hash text,p_expires_at timestamptz)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare a content_auth.codes%rowtype; g content_auth.grants%rowtype; c content_auth.clients%rowtype; ts timestamptz:=clock_timestamp(); token_expires timestamptz;
begin
  if p_token_hash is null or p_token_hash!~'^[0-9a-f]{64}$' or p_exchange_nonce_hash is null
    or p_expires_at is null or not isfinite(p_expires_at) or p_expires_at<=ts or p_expires_at>ts+interval '1 hour'
  then raise exception using errcode='22023',message='invalid token issuance'; end if;
  select * into a from content_auth.codes where code_hash=p_code_hash;
  if not found then raise exception using errcode='42501',message='authorization code unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended('content-grant:'||a.grant_id::text,0));
  select * into a from content_auth.codes where code_hash=p_code_hash for update;
  select * into g from content_auth.grants where id=a.grant_id;
  select * into c from content_auth.clients where id=g.client_id;
  if a.consumed_at is null or a.exchange_nonce_hash<>p_exchange_nonce_hash or a.issued_at is not null
    or a.expires_at<=clock_timestamp() or g.revoked_at is not null or g.expires_at<=clock_timestamp()
    or not c.enabled or c.user_id<>g.user_id or c.resource<>g.resource or not g.scope<@c.allowed_scopes
  then raise exception using errcode='42501',message='authorization code unavailable'; end if;
  token_expires:=least(p_expires_at,g.expires_at);
  insert into content_auth.tokens(token_hash,grant_id,created_at,expires_at) values(p_token_hash,g.id,ts,token_expires);
  update content_auth.codes set issued_at=ts where code_hash=p_code_hash;
  return jsonb_build_object('clientId',g.client_id,'grantId',g.id,'ownerId',g.user_id,'scope',g.scope,
    'resource',g.resource,'expiresAt',token_expires);
end;
$$;

-- The shared grant lock is held until the caller's transaction finishes. An
-- owner revocation obtains the same exclusive lock before it changes the row.
create function content_gateway._token_context(p_token_hash text,p_audience text)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, pg_temp as $$
declare gid uuid; result jsonb;
begin
  if p_token_hash is null or p_token_hash!~'^[0-9a-f]{64}$' or p_audience is null then return null; end if;
  select grant_id into gid from content_auth.tokens where token_hash=p_token_hash;
  if not found then return null; end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('content-grant:'||gid::text,0));
  select jsonb_build_object('clientId',g.client_id,'grantId',g.id,'ownerId',g.user_id,
    'scope',g.scope,'resource',g.resource,'expiresAt',t.expires_at) into result
  from content_auth.tokens t join content_auth.grants g on g.id=t.grant_id
    join content_auth.clients c on c.id=g.client_id
  where t.token_hash=p_token_hash and t.revoked_at is null and t.expires_at>clock_timestamp()
    and g.revoked_at is null and g.expires_at>clock_timestamp() and c.enabled
    and c.user_id=g.user_id and c.resource=g.resource and g.resource=p_audience and g.scope<@c.allowed_scopes;
  return result;
end;
$$;

create function content_gateway.get_token(p_token_hash text,p_audience text)
returns jsonb language sql security definer set search_path = pg_catalog, pg_temp as $$
  select content_gateway._token_context(p_token_hash,p_audience);
$$;

create function content_gateway.revoke_token(p_token_hash text,p_client_id text)
returns boolean language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare gid uuid;
begin
  select g.id into gid from content_auth.tokens t join content_auth.grants g on g.id=t.grant_id
    where t.token_hash=p_token_hash and g.client_id=p_client_id;
  if not found then return true; end if;
  perform pg_advisory_xact_lock(hashtextextended('content-grant:'||gid::text,0));
  update content_auth.grants set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=gid;
  return true;
end;
$$;

create function content_gateway._list_authorizations()
returns jsonb language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'clientId',g.client_id,'clientName',c.display_name,
    'scope',g.scope,'resource',g.resource,'createdAt',g.created_at,'expiresAt',g.expires_at,'revokedAt',g.revoked_at)
    order by g.created_at desc),'[]'::jsonb)
  from content_auth.grants g join content_auth.clients c on c.id=g.client_id
  where g.user_id=auth.uid() and c.user_id=auth.uid();
$$;

create function content_gateway._revoke_authorization(p_grant_id uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if not exists(select 1 from content_auth.grants g join content_auth.clients c on c.id=g.client_id
    where g.id=p_grant_id and g.user_id=auth.uid() and c.user_id=auth.uid())
  then raise exception using errcode='42501',message='owner authorization required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('content-grant:'||p_grant_id::text,0));
  update content_auth.grants set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=p_grant_id and user_id=auth.uid();
  return true;
end;
$$;

create function public.approve_content_authorization(p_request_id uuid,p_csrf_hash text,p_code_hash text,p_approved_scopes text[])
returns jsonb language sql security invoker set search_path = pg_catalog, pg_temp as $$
  select content_gateway._approve(p_request_id,p_csrf_hash,p_code_hash,p_approved_scopes);
$$;
create function public.deny_content_authorization(p_request_id uuid,p_csrf_hash text)
returns jsonb language sql security invoker set search_path = pg_catalog, pg_temp as $$
  select content_gateway._deny(p_request_id,p_csrf_hash);
$$;
create function public.list_content_authorizations()
returns jsonb language sql security invoker set search_path = pg_catalog, pg_temp as $$
  select content_gateway._list_authorizations();
$$;
create function public.revoke_content_authorization(p_grant_id uuid)
returns boolean language sql security invoker set search_path = pg_catalog, pg_temp as $$
  select content_gateway._revoke_authorization(p_grant_id);
$$;

-- Business-table ownership stays with its existing owner. The executor role is
-- explicitly NOBYPASSRLS, has no authenticated membership, and owns no tables.
grant select,insert,update on public.notes to content_gateway_executor;
grant select,insert on public.note_versions,public.audit_logs to content_gateway_executor;
grant select on public.note_folders,public.interview_questions,public.interview_contexts,
  public.interview_question_preparations,public.interview_answer_versions to content_gateway_executor;
grant insert on public.interview_answer_versions to content_gateway_executor;
grant update(id) on public.interview_question_preparations,public.interview_answer_versions to content_gateway_executor;
-- Existing AFTER INSERT readiness trigger may demote a preparation lacking an
-- adopted answer. It never auto-promotes. This column privilege is needed even
-- when its UPDATE matches zero rows; no broad preparation UPDATE is granted.
grant update(status) on public.interview_question_preparations to content_gateway_executor;
grant select,insert,update on public.search_documents to content_gateway_executor;
grant execute on function auth.uid() to content_gateway_executor,content_gateway_auth_owner;
grant execute on function public.write_content(jsonb) to content_gateway_executor;

create policy gateway_notes_owner on public.notes as restrictive for all to content_gateway_executor
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy gateway_notes_select on public.notes for select to content_gateway_executor using (user_id=(select auth.uid()));
create policy gateway_note_versions_owner on public.note_versions as restrictive for all to content_gateway_executor
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy gateway_note_versions_select on public.note_versions for select to content_gateway_executor using (user_id=(select auth.uid()));
create policy gateway_audit_logs_owner on public.audit_logs as restrictive for all to content_gateway_executor
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy gateway_audit_logs_select on public.audit_logs for select to content_gateway_executor using (user_id=(select auth.uid()));
create policy gateway_note_folders_owner on public.note_folders as restrictive for all to content_gateway_executor
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy gateway_note_folders_select on public.note_folders for select to content_gateway_executor using (user_id=(select auth.uid()));
create policy gateway_interview_questions_owner on public.interview_questions as restrictive for all to content_gateway_executor
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy gateway_interview_questions_select on public.interview_questions for select to content_gateway_executor using (user_id=(select auth.uid()));
create policy gateway_interview_contexts_owner on public.interview_contexts as restrictive for all to content_gateway_executor
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy gateway_interview_contexts_select on public.interview_contexts for select to content_gateway_executor using (user_id=(select auth.uid()));
create policy gateway_interview_question_preparations_owner on public.interview_question_preparations as restrictive for all to content_gateway_executor
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy gateway_interview_question_preparations_select on public.interview_question_preparations for select to content_gateway_executor using (user_id=(select auth.uid()));
create policy gateway_interview_answer_versions_owner on public.interview_answer_versions as restrictive for all to content_gateway_executor
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy gateway_interview_answer_versions_select on public.interview_answer_versions for select to content_gateway_executor using (user_id=(select auth.uid()));
create policy gateway_search_documents_owner on public.search_documents as restrictive for all to content_gateway_executor
  using (user_id=(select auth.uid()) and entity_type='note') with check (user_id=(select auth.uid()) and entity_type='note');
create policy gateway_search_documents_select on public.search_documents for select to content_gateway_executor using (user_id=(select auth.uid()) and entity_type='note');
create policy gateway_notes_insert on public.notes for insert to content_gateway_executor with check (user_id=(select auth.uid()));
create policy gateway_note_versions_insert on public.note_versions for insert to content_gateway_executor with check (user_id=(select auth.uid()) and created_by=(select auth.uid()));
create policy gateway_audit_logs_insert on public.audit_logs for insert to content_gateway_executor with check (user_id=(select auth.uid()));
create policy gateway_interview_answer_versions_insert on public.interview_answer_versions for insert to content_gateway_executor with check (user_id=(select auth.uid()));
create policy gateway_search_documents_insert on public.search_documents for insert to content_gateway_executor with check (user_id=(select auth.uid()) and entity_type='note');
create policy gateway_notes_update on public.notes for update to content_gateway_executor
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy gateway_interview_question_preparations_update on public.interview_question_preparations for update to content_gateway_executor
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy gateway_interview_answer_versions_update on public.interview_answer_versions for update to content_gateway_executor
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy gateway_search_documents_update on public.search_documents for update to content_gateway_executor
  using (user_id=(select auth.uid()) and entity_type='note') with check (user_id=(select auth.uid()) and entity_type='note');

create function content_gateway.write_content(p_token_hash text,p_audience text,p_command jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare ctx jsonb; required_scope text; result jsonb;
  old_sub text:=current_setting('request.jwt.claim.sub',true);
  old_claims text:=current_setting('request.jwt.claims',true);
begin
  ctx:=content_gateway._token_context(p_token_hash,p_audience);
  required_scope:=case p_command->>'operation'
    when 'note.create' then 'notes:write' when 'note.update' then 'notes:write'
    when 'interview.answer.append' then 'interview:append' else null end;
  if ctx is null then raise exception using errcode='P0201',message='invalid content token'; end if;
  if required_scope is null or p_command->>'source' is distinct from 'codex'
  then raise exception using errcode='22023',message='invalid content operation or source'; end if;
  if not (ctx->'scope' ? required_scope)
  then raise exception using errcode='P0202',message='insufficient content scope'; end if;
  perform set_config('request.jwt.claim.sub',ctx->>'ownerId',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',ctx->>'ownerId','role','content_gateway_executor')::text,true);
  result:=public.write_content(p_command);
  perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
  perform set_config('request.jwt.claims',coalesce(old_claims,'{}'),true);
  return result;
exception when others then
  perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
  perform set_config('request.jwt.claims',coalesce(old_claims,'{}'),true);
  raise;
end;
$$;

create function content_gateway.read_content(p_token_hash text,p_audience text,p_command jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare ctx jsonb; kind text; action text; required_scope text; result jsonb; uid uuid;
  pattern text; maximum integer; entity_id uuid; answer_id uuid; preparation jsonb; versions jsonb; selected jsonb;
  old_sub text:=current_setting('request.jwt.claim.sub',true);
  old_claims text:=current_setting('request.jwt.claims',true);
begin
  ctx:=content_gateway._token_context(p_token_hash,p_audience);
  kind:=p_command->>'kind'; action:=p_command->>'action';
  required_scope:=case kind when 'note' then 'notes:read' when 'interview' then 'interview:read' else null end;
  if ctx is null then raise exception using errcode='P0201',message='invalid content token'; end if;
  if required_scope is null then raise exception using errcode='22023',message='invalid content kind'; end if;
  if not (ctx->'scope' ? required_scope)
  then raise exception using errcode='P0202',message='insufficient content scope'; end if;
  if p_command is null or jsonb_typeof(p_command)<>'object' or action is null or action not in ('find','read')
    or jsonb_typeof(p_command->'action')<>'string' or jsonb_typeof(p_command->'kind')<>'string'
  then raise exception using errcode='22023',message='invalid content query'; end if;
  if action='find' then
    if jsonb_typeof(p_command->'q') is distinct from 'string' or char_length(btrim(p_command->>'q')) not between 1 and 200
      or exists(select 1 from jsonb_object_keys(p_command) k where k<>all(array['action','kind','q','limit']))
      or (p_command ? 'limit' and (jsonb_typeof(p_command->'limit')<>'number' or p_command->>'limit'!~'^[0-9]+$'))
    then raise exception using errcode='22023',message='invalid content query'; end if;
    maximum:=coalesce((p_command->>'limit')::integer,20);
    if maximum not between 1 and 30 then raise exception using errcode='22023',message='invalid content limit'; end if;
    pattern:='%'||replace(replace(replace(btrim(p_command->>'q'),chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_')||'%';
  else
    if jsonb_typeof(p_command->'id') is distinct from 'string'
      or exists(select 1 from jsonb_object_keys(p_command) k where k<>all(array['action','kind','id','answerId']))
      or (p_command ? 'answerId' and jsonb_typeof(p_command->'answerId')<>'string')
    then raise exception using errcode='22023',message='invalid content query'; end if;
    entity_id:=(p_command->>'id')::uuid; answer_id:=(p_command->>'answerId')::uuid;
  end if;
  uid:=(ctx->>'ownerId')::uuid;
  perform set_config('request.jwt.claim.sub',uid::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','content_gateway_executor')::text,true);
  if kind='note' and action='find' then
    select jsonb_build_object('results',coalesce(jsonb_agg(to_jsonb(n)),'[]'::jsonb)) into result from (
      select id,title,revision,updated_at,content_origin,'/notes/'||id::text||'/read' as href from public.notes
      where user_id=uid and status='active' and ai_visibility='normal' and deleted_at is null and archived_at is null
        and title ilike pattern order by updated_at desc limit maximum
    ) n;
  elsif kind='note' then
    select jsonb_build_object('id',n.id,'title',n.title,'body_markdown',n.body_markdown,'revision',n.revision,
      'updated_at',n.updated_at,'folder_id',n.folder_id,'content_origin',n.content_origin,'href','/notes/'||n.id::text||'/read',
      'sources',(select coalesce(jsonb_agg(jsonb_build_object('source',s.after_data->'source','sourceUrl',s.after_data->'sourceUrl',
        'captureMode',s.after_data->'captureMode','contentOrigin',s.after_data->'contentOrigin','savedAt',s.created_at)),'[]'::jsonb)
        from (select a.after_data,a.created_at from public.audit_logs a where a.user_id=uid and a.entity_id=n.id
          and a.action='content.write' order by a.created_at desc limit 10) s)) into result
    from public.notes n where n.id=entity_id and n.user_id=uid and n.status='active' and n.ai_visibility='normal'
      and n.deleted_at is null and n.archived_at is null;
  elsif action='find' then
    select jsonb_build_object('results',coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb)) into result from (
      select p0.id,p0.question_id,p0.context_id,p0.updated_at,
        jsonb_build_object('id',q.id,'canonical_prompt',q.canonical_prompt,'short_title',q.short_title) as interview_questions,
        '/career/interview?question='||p0.question_id::text||case when p0.context_id is null then '' else '&context='||p0.context_id::text end as href
      from public.interview_question_preparations p0 join public.interview_questions q on q.id=p0.question_id and q.user_id=uid
      where p0.user_id=uid and p0.archived_at is null and q.archived_at is null and q.canonical_prompt ilike pattern
        and (p0.context_id is null or exists(select 1 from public.interview_contexts c where c.id=p0.context_id and c.user_id=uid and c.archived_at is null))
      order by p0.updated_at desc limit maximum
    ) p;
  else
    select jsonb_build_object('id',p.id,'question_id',p.question_id,'context_id',p.context_id,
      'target_language',p.target_language,'working_thoughts_markdown',p.working_thoughts_markdown,'updated_at',p.updated_at,
      'interview_questions',jsonb_build_object('id',q.id,'canonical_prompt',q.canonical_prompt,'short_title',q.short_title),
      'href','/career/interview?question='||p.question_id::text||case when p.context_id is null then '' else '&context='||p.context_id::text end
        ||case when answer_id is null then '' else '&answer='||answer_id::text end) into preparation
    from public.interview_question_preparations p join public.interview_questions q on q.id=p.question_id and q.user_id=uid
    where p.id=entity_id and p.user_id=uid and p.archived_at is null and q.archived_at is null
      and (p.context_id is null or exists(select 1 from public.interview_contexts c where c.id=p.context_id and c.user_id=uid and c.archived_at is null));
    if preparation is not null then
      select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) into versions from (
        select id,preparation_id,answer_mode,language,target_seconds,version_number,status,source,confirmed_at,updated_at,archived_at
        from public.interview_answer_versions where preparation_id=entity_id and user_id=uid order by version_number desc limit 201
      ) a;
      if jsonb_array_length(versions)>200 then raise exception using errcode='P0104',message='content version scope too large'; end if;
      if answer_id is null then
        select (a->>'id')::uuid into answer_id from jsonb_array_elements(versions) a
        where a->>'archived_at' is null and a->>'status' in ('current','draft')
        order by (a->>'status'='current') desc,(a->>'language'=preparation->>'target_language') desc,(a->>'updated_at') desc limit 1;
      end if;
      if answer_id is not null then
        select to_jsonb(a) into selected from (
          select id,preparation_id,answer_mode,language,target_seconds,version_number,body_markdown,status,source,confirmed_at,updated_at,archived_at
          from public.interview_answer_versions where id=answer_id and preparation_id=entity_id and user_id=uid and archived_at is null
        ) a;
      end if;
      if answer_id is null or selected is not null then
        result:=preparation||jsonb_build_object('versions',versions,'selectedAnswer',selected);
      end if;
    end if;
  end if;
  perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
  perform set_config('request.jwt.claims',coalesce(old_claims,'{}'),true);
  return result;
exception when others then
  perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
  perform set_config('request.jwt.claims',coalesce(old_claims,'{}'),true);
  raise;
end;
$$;

alter function content_gateway._redirect_allowed(text[],text) owner to content_gateway_auth_owner;
revoke all on function content_gateway._redirect_allowed(text[],text) from public,anon,authenticated,service_role,content_gateway_runtime;
alter function content_gateway.get_client(text) owner to content_gateway_auth_owner;
revoke all on function content_gateway.get_client(text) from public,anon,authenticated,service_role,content_gateway_runtime;
grant execute on function content_gateway.get_client(text) to content_gateway_runtime;
alter function content_gateway.create_request(jsonb) owner to content_gateway_auth_owner;
revoke all on function content_gateway.create_request(jsonb) from public,anon,authenticated,service_role,content_gateway_runtime;
grant execute on function content_gateway.create_request(jsonb) to content_gateway_runtime;
alter function content_gateway.get_request(uuid) owner to content_gateway_auth_owner;
revoke all on function content_gateway.get_request(uuid) from public,anon,authenticated,service_role,content_gateway_runtime;
grant execute on function content_gateway.get_request(uuid) to content_gateway_runtime;
alter function content_gateway._approve(uuid,text,text,text[]) owner to content_gateway_auth_owner;
revoke all on function content_gateway._approve(uuid,text,text,text[]) from public,anon,authenticated,service_role,content_gateway_runtime;
grant execute on function content_gateway._approve(uuid,text,text,text[]) to authenticated;
alter function content_gateway._deny(uuid,text) owner to content_gateway_auth_owner;
revoke all on function content_gateway._deny(uuid,text) from public,anon,authenticated,service_role,content_gateway_runtime;
grant execute on function content_gateway._deny(uuid,text) to authenticated;
alter function content_gateway.get_code(text) owner to content_gateway_auth_owner;
revoke all on function content_gateway.get_code(text) from public,anon,authenticated,service_role,content_gateway_runtime;
grant execute on function content_gateway.get_code(text) to content_gateway_runtime;
alter function content_gateway.consume_code(text,text) owner to content_gateway_auth_owner;
revoke all on function content_gateway.consume_code(text,text) from public,anon,authenticated,service_role,content_gateway_runtime;
grant execute on function content_gateway.consume_code(text,text) to content_gateway_runtime;
alter function content_gateway.save_token(text,text,text,timestamptz) owner to content_gateway_auth_owner;
revoke all on function content_gateway.save_token(text,text,text,timestamptz) from public,anon,authenticated,service_role,content_gateway_runtime;
grant execute on function content_gateway.save_token(text,text,text,timestamptz) to content_gateway_runtime;
alter function content_gateway.revoke_token(text,text) owner to content_gateway_auth_owner;
revoke all on function content_gateway.revoke_token(text,text) from public,anon,authenticated,service_role,content_gateway_runtime;
grant execute on function content_gateway.revoke_token(text,text) to content_gateway_runtime;
alter function content_gateway._list_authorizations() owner to content_gateway_auth_owner;
revoke all on function content_gateway._list_authorizations() from public,anon,authenticated,service_role,content_gateway_runtime;
grant execute on function content_gateway._list_authorizations() to authenticated;
alter function content_gateway._revoke_authorization(uuid) owner to content_gateway_auth_owner;
revoke all on function content_gateway._revoke_authorization(uuid) from public,anon,authenticated,service_role,content_gateway_runtime;
grant execute on function content_gateway._revoke_authorization(uuid) to authenticated;
alter function content_gateway._token_context(text,text) owner to content_gateway_executor;
revoke all on function content_gateway._token_context(text,text) from public,anon,authenticated,service_role,content_gateway_runtime;
alter function content_gateway.get_token(text,text) owner to content_gateway_executor;
revoke all on function content_gateway.get_token(text,text) from public,anon,authenticated,service_role,content_gateway_runtime;
grant execute on function content_gateway.get_token(text,text) to content_gateway_runtime;
alter function content_gateway.read_content(text,text,jsonb) owner to content_gateway_executor;
revoke all on function content_gateway.read_content(text,text,jsonb) from public,anon,authenticated,service_role,content_gateway_runtime;
grant execute on function content_gateway.read_content(text,text,jsonb) to content_gateway_runtime;
alter function content_gateway.write_content(text,text,jsonb) owner to content_gateway_executor;
revoke all on function content_gateway.write_content(text,text,jsonb) from public,anon,authenticated,service_role,content_gateway_runtime;
grant execute on function content_gateway.write_content(text,text,jsonb) to content_gateway_runtime;
revoke all on function public.approve_content_authorization(uuid,text,text,text[]) from public,anon,authenticated,service_role,content_gateway_runtime;
grant execute on function public.approve_content_authorization(uuid,text,text,text[]) to authenticated;
revoke all on function public.deny_content_authorization(uuid,text) from public,anon,authenticated,service_role,content_gateway_runtime;
grant execute on function public.deny_content_authorization(uuid,text) to authenticated;
revoke all on function public.list_content_authorizations() from public,anon,authenticated,service_role,content_gateway_runtime;
grant execute on function public.list_content_authorizations() to authenticated;
revoke all on function public.revoke_content_authorization(uuid) from public,anon,authenticated,service_role,content_gateway_runtime;
grant execute on function public.revoke_content_authorization(uuid) to authenticated;

revoke create on schema content_gateway from content_gateway_executor;

-- The migration operator must not leave temporary memberships in these roles.
-- No activation side effects: all roles must still be non-login, non-bypass,
-- and not members of any application/admin role. An approved activation must
-- rerun the effective-privilege audit after later schema/ACL changes as well.
do $final_checks$
begin
  if exists(select 1 from pg_catalog.pg_roles where rolname in ('content_gateway_runtime','content_gateway_auth_owner','content_gateway_executor')
    and (rolcanlogin or rolbypassrls or rolsuper or rolcreaterole or rolcreatedb)) then
    raise exception 'Gateway role attributes are unsafe';
  end if;
  if exists(select 1 from pg_catalog.pg_roles r where r.rolname<>'content_gateway_runtime'
    and pg_catalog.pg_has_role('content_gateway_runtime',r.oid,'MEMBER')) then
    raise exception 'Gateway runtime must have no role memberships';
  end if;
  if exists(select 1 from content_auth.clients) then raise exception 'Proposal must not activate a client'; end if;
end;
$final_checks$;

comment on schema content_gateway is 'Scoped content OAuth gateway; NOLOGIN proposal until separately approved provisioning.';
commit;
