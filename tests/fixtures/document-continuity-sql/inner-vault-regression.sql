-- Run only on an isolated database after replaying the migrations.
begin;
insert into auth.users(id) values('00000000-0000-4000-8000-000000000061'),('00000000-0000-4000-8000-000000000062');
insert into public.vault_sessions(user_id,token_hash,login_session,tab_hash,expires_at)
  values('00000000-0000-4000-8000-000000000061',repeat('a',64),repeat('b',64),repeat('c',64),now()+interval '1 hour');
insert into public.inner_vault_sessions(user_id,outer_token_hash,token_hash,expires_at)
  values('00000000-0000-4000-8000-000000000061',repeat('a',64),repeat('d',64),now()+interval '1 hour');
set local role service_role;
do $$
declare owner_id uuid:='00000000-0000-4000-8000-000000000061'; outer_proof text:=repeat('a',64);
  login_proof text:=repeat('b',64); inner_proof text:=repeat('d',64);
  first_file public.inner_vault_files; duplicate_file public.inner_vault_files; lease uuid:=gen_random_uuid();
begin
  begin
    perform public.inner_vault_prepare_file(owner_id,outer_proof,login_proof,repeat('e',64),'test.zip',2147483648,repeat('1',64),'fixture');
    raise exception 'wrong inner proof accepted';
  exception when raise_exception then if sqlerrm<>'inner_vault_locked' then raise; end if; end;
  begin
    perform public.inner_vault_prepare_file('00000000-0000-4000-8000-000000000062',outer_proof,login_proof,inner_proof,'test.zip',2147483648,repeat('1',64),'fixture');
    raise exception 'foreign owner accepted';
  exception when raise_exception then if sqlerrm<>'vault_locked' then raise; end if; end;
  begin
    perform public.inner_vault_prepare_file(owner_id,outer_proof,login_proof,inner_proof,'over.zip',2147483649,repeat('1',64),'fixture');
    raise exception 'oversized file accepted';
  exception when check_violation then null; end;
  select * into first_file from public.inner_vault_prepare_file(owner_id,outer_proof,login_proof,inner_proof,'test.zip',2147483648,repeat('1',64),'fixture');
  select * into duplicate_file from public.inner_vault_prepare_file(owner_id,outer_proof,login_proof,inner_proof,'test.zip',2147483648,repeat('1',64),'fixture');
  if duplicate_file.id<>first_file.id or first_file.storage_path<>owner_id||'/inner-vault/'||first_file.id||'/archive.zip' then
    raise exception 'bad idempotency/key'; end if;
  begin
    insert into public.documents(user_id,title,original_filename,mime_type,file_size,storage_bucket,storage_path,storage_provider,storage_state)
      values(owner_id,'forged','forged.zip','application/zip',10,'fixture',first_file.storage_path,'cloudflare_r2','available');
    raise exception 'document pointer aliased inner storage';
  exception when check_violation then null; end;
  update public.inner_vault_files set status='completing',lease_token=lease,lease_expires_at=now()+interval '5 minutes' where id=first_file.id;
  if public.inner_vault_publish_file(owner_id,outer_proof,login_proof,inner_proof,first_file.id,gen_random_uuid()) then
    raise exception 'stale operation published'; end if;
  if not public.inner_vault_publish_file(owner_id,outer_proof,login_proof,inner_proof,first_file.id,lease) then
    raise exception 'publication failed'; end if;
  for n in 1..5 loop
    if not public.inner_vault_consume_attempt(owner_id) then raise exception 'limit too low'; end if;
  end loop;
  if public.inner_vault_consume_attempt(owner_id) then raise exception 'throttle accepted sixth attempt'; end if;
end $$;
reset role;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000061';
set local role authenticated;
do $$
declare t text;
begin
  foreach t in array array['inner_vault_files','inner_vault_credentials','inner_vault_sessions','inner_vault_attempts'] loop
    begin
      execute format('select * from public.%I',t);
      raise exception 'ordinary authenticated access to %',t;
    exception when insufficient_privilege then null; end;
  end loop;
  begin
    perform public.inner_vault_consume_attempt(auth.uid());
    raise exception 'ordinary RPC accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.documents(user_id,title,original_filename,mime_type,file_size,storage_bucket,storage_path,storage_provider,storage_state)
      values(auth.uid(),'forged','forged.zip','application/zip',10,'fixture',auth.uid()||'/inner-vault/secret/archive.zip','cloudflare_r2','available');
    raise exception 'ordinary file aliased inner storage';
  exception when check_violation or insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
delete from public.vault_sessions where user_id='00000000-0000-4000-8000-000000000061';
do $$ begin
  if exists(select from public.inner_vault_sessions where user_id='00000000-0000-4000-8000-000000000061') then
    raise exception 'outer lock did not revoke inner session'; end if;
  if not exists(select from public.inner_vault_files where user_id='00000000-0000-4000-8000-000000000061' and status='completed') then
    raise exception 'locking lost original metadata'; end if;
end $$;
rollback;
