-- Named, portable UI preferences only; bodies, DTOs, signed URLs and DOM never belong here.
create function public.valid_workbench_ref(p_value jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  return coalesce(jsonb_typeof(p_value) = 'object'
    and not exists(select 1 from jsonb_object_keys(p_value) k where k not in ('kind','id','investmentType'))
    and p_value->>'kind' in ('note','document','task','event','project','opportunity','shopping','trip','leisure','investment')
    and p_value->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (not p_value ? 'investmentType' or (p_value->>'kind' = 'investment' and p_value->>'investmentType' in ('account','ledger','strategy','research'))), false);
exception when others then return false;
end; $$;
create function public.valid_workbench_position(p_value jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare k text; v jsonb; n numeric;
begin
  if p_value is null then return true; end if;
  if jsonb_typeof(p_value) <> 'object' then return false; end if;
  for k,v in select * from jsonb_each(p_value) loop
    if k = 'scrollOwner' then
      if jsonb_typeof(v) <> 'string' or v#>>'{}' not in ('document','pane') then return false; end if;
    elsif k = 'noteReaderView' then
      if jsonb_typeof(v)<>'string' or v#>>'{}' not in ('markdown','pdf') then return false; end if;
    elsif k in ('pdfSourceVersion','pdfDocumentId') then
      if jsonb_typeof(v) <> 'string' or v#>>'{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
    elsif k = 'reading' then if jsonb_typeof(v) <> 'boolean' then return false; end if;
    else
      if k not in ('scrollTop','sourceLine','sourceOffset','anchor','head','pdfPage') or jsonb_typeof(v) <> 'number' then return false; end if;
      n := v::text::numeric;
      if k = 'scrollTop' and (n < 0 or n > 10000000) then return false; end if;
      if k = 'sourceOffset' and (n < -100000 or n > 100000) then return false; end if;
      if k in ('sourceLine','anchor','head','pdfPage') and n <> trunc(n) then return false; end if;
      if k = 'sourceLine' and (n < 1 or n > 1000000) then return false; end if;
      if k in ('anchor','head') and (n < 0 or n > 200000) then return false; end if;
      if k = 'pdfPage' and (n < 1 or n > 500) then return false; end if;
    end if;
  end loop;
  return true;
exception when others then return false;
end; $$;
create function public.valid_workbench_href(p_href text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare path text; module text; query text; fragment text; part text; k text; v text; allowed text[];
begin
  if p_href is null or length(p_href) > 2048 or p_href ~ '[\\[:cntrl:]]' or p_href ~* '(%00|%0a|%0d)' then return false; end if;
  path := split_part(split_part(p_href,'?',1),'#',1);
  module := split_part(path,'/',2);
  if path !~* '^/(today|notes(/(trash|ask|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))?|files|tasks|calendar|projects|career(/(profile|skills|resumes|applications|certifications|experiences(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?|search|interview(/(questions(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?|practice(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?|targets(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?|stories(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?|sessions(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?|insights|consistency))?|capital|directions|materials|opportunities|roadmap))?|shopping(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?|travel(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?|leisure(/(artwork-storage|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))?|investments|investing|inbox|reviews(/(daily|weekly|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))?|briefing(/(interests|sources|history(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?))?|settings|photos|memory)$' or path ~* '(%2f|%5c|/\.{1,2}(/|$))' then return false; end if;
  if position('#' in p_href)>0 then fragment := split_part(p_href,'#',2); if fragment !~* '^(opportunity|project|investment|entry)-[0-9a-f-]{36}$' then return false; end if; end if;
  allowed := case module
    when 'notes' then array['q','scope','folder','view'] when 'files' then array['q','folder','view','sort','type','page','file']
    when 'tasks' then array['q','task','status','view'] when 'calendar' then array['event','view','date']
    when 'investments' then array['tab','mode','item'] when 'career' then array['q','resume','context','question','answer','direction','status']
    when 'shopping' then array['q','status','mode'] when 'travel' then array['q','status','mode'] when 'leisure' then array['q','type','mode','kind','minutes','setting','company','budget'] else array[]::text[] end;
  if position('?' in split_part(p_href,'#',1)) = 0 then return true; end if;
  query := split_part(split_part(p_href,'?',2),'#',1);
  foreach part in array string_to_array(query,'&') loop
    k := split_part(part,'=',1); v := split_part(part,'=',2);
    if not k = any(allowed) then return false; end if;
    if k in ('folder','file','task','event','item','resume','context','question','answer','direction') then
      if v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
    elsif k='q' then if length(v)>2400 then return false; end if;
    elsif k='page' then if v !~ '^[1-9][0-9]{0,2}$' or v::integer>200 then return false; end if;
    elsif k='date' then if v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or to_char(v::date,'YYYY-MM-DD')<>v then return false; end if;
    elsif k='scope' then if v not in ('context','all') then return false; end if;
    elsif k='view' then
      if module='files' and v not in ('list','grid') or module='notes' and v not in ('all','favorites','recent') or module='tasks' and v not in ('today','upcoming','all','completed') or module not in ('files','notes','tasks') and v not in ('dayGridMonth','timeGridWeek','timeGridDay','listWeek','month','week','day','agenda') then return false; end if;
    elsif k='sort' then if v not in ('uploaded-desc','uploaded-asc','name','size-desc','size-asc','updated','recent','title') then return false; end if;
    elsif k='type' then if v not in ('all','photo','document','spreadsheet','presentation','audio','video','archive','other') then return false; end if;
    elsif k='tab' then if v not in ('holdings','strategies','research') then return false; end if;
    elsif k='mode' then if module in ('shopping','travel','leisure') and v <> 'field' or module not in ('shopping','travel','leisure') and v not in ('real','paper') then return false; end if;
    elsif k='kind' then if v not in ('film','series','game','book','music','outing','other') then return false; end if;
    elsif k='minutes' then if v !~ '^[1-9][0-9]{0,5}$' or v::integer > 525600 then return false; end if;
    elsif k='setting' then if v not in ('home','out','either') then return false; end if;
    elsif k='company' then if v not in ('solo','together','either') then return false; end if;
    elsif k='budget' then if v not in ('free','paid','unknown') then return false; end if;
    elsif k='status' then if v not in ('all','active','completed','watching','researching','preparing','closed','inbox','cooling','ready','purchased','abandoned','planning','booked','dream','shortlist') then return false; end if;
    else return false; end if;
  end loop;
  return true;
exception when others then return false;
end; $$;
create function public.valid_workbench_view_state(p_value jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare kind text; category jsonb; cursor_value text;
begin
  if p_value is null then return true; end if;
  if jsonb_typeof(p_value) <> 'object' then return false; end if;
  kind := p_value->>'kind';
  if kind = 'tasks' then
    return coalesce((select count(*) from jsonb_object_keys(p_value))=3
      and not exists(select 1 from jsonb_object_keys(p_value) k where k not in ('kind','view','listId'))
      and p_value->>'view' in ('today','upcoming','all','completed')
      and (p_value->'listId' = 'null'::jsonb or (jsonb_typeof(p_value->'listId')='string' and p_value->>'listId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')),false);
  elsif kind = 'calendar' then
    if (select count(*) from jsonb_object_keys(p_value))<>5 or exists(select 1 from jsonb_object_keys(p_value) k where k not in ('kind','view','cursor','selectedCategories','hideInternship')) or jsonb_typeof(p_value->'view')<>'string' or p_value->>'view' not in ('day','week','month') or jsonb_typeof(p_value->'hideInternship')<>'boolean' or jsonb_typeof(p_value->'selectedCategories')<>'array' or jsonb_array_length(p_value->'selectedCategories')>20 then return false; end if;
    cursor_value := p_value->>'cursor';
    if cursor_value is null or cursor_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or to_char(cursor_value::date,'YYYY-MM-DD')<>cursor_value then return false; end if;
    for category in select value from jsonb_array_elements(p_value->'selectedCategories') loop
      if jsonb_typeof(category)<>'string' or length(category#>>'{}') not between 1 and 120 or category#>>'{}' ~ '[[:cntrl:]]' then return false; end if;
    end loop;
    return (select count(*)=count(distinct value) from jsonb_array_elements(p_value->'selectedCategories'));
  end if;
  return false;
exception when others then return false;
end; $$;
create function public.valid_workspace_scene_snapshot(p_value jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare href text; query text; part text; key text; main jsonb; reference jsonb; layout jsonb;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' or octet_length(p_value::text) > 32768 then return false; end if;
  if (select count(*) from jsonb_object_keys(p_value)) <> 4 or exists(select 1 from jsonb_object_keys(p_value) k where k not in ('version','main','reference','layout')) or p_value->'version' <> '1'::jsonb then return false; end if;
  main := p_value->'main'; reference := p_value->'reference'; layout := p_value->'layout';
  if jsonb_typeof(main) <> 'object' or exists(select 1 from jsonb_object_keys(main) k where k not in ('href','position','viewState')) or jsonb_typeof(main->'href') <> 'string' then return false; end if;
  href := main->>'href';
  if not public.valid_workbench_href(href) then return false; end if;
  if not public.valid_workbench_position(main->'position') or not public.valid_workbench_view_state(main->'viewState') then return false; end if;
  if main ? 'viewState' and split_part(split_part(href,'?',1),'#',1)<>(case main#>>'{viewState,kind}' when 'tasks' then '/tasks' when 'calendar' then '/calendar' else '' end) then return false; end if;
  if reference <> 'null'::jsonb then
    if jsonb_typeof(reference) <> 'object' or exists(select 1 from jsonb_object_keys(reference) k where k not in ('ref','position','editing')) or not public.valid_workbench_ref(reference->'ref') or not public.valid_workbench_position(reference->'position') or (reference ? 'editing' and jsonb_typeof(reference->'editing') <> 'boolean') then return false; end if;
  end if;
  if jsonb_typeof(layout) <> 'object' or (select count(*) from jsonb_object_keys(layout)) <> 3 or exists(select 1 from jsonb_object_keys(layout) k where k not in ('referenceFirst','referenceWidth','mobilePane')) then return false; end if;
  return coalesce(jsonb_typeof(layout->'referenceFirst') = 'boolean' and jsonb_typeof(layout->'referenceWidth') = 'number' and (layout->>'referenceWidth')::numeric between 30 and 65 and (layout->>'referenceWidth')::numeric = trunc((layout->>'referenceWidth')::numeric) and layout->>'mobilePane' in ('main','reference'),false);
exception when others then return false;
end; $$;

create table public.workspace_scenes (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  snapshot jsonb not null check (public.valid_workspace_scene_snapshot(snapshot)),
  revision bigint not null default 1 check (revision between 1 and 9007199254740990),
  last_mutation_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index workspace_scenes_owner_updated on public.workspace_scenes(user_id,updated_at desc) where archived_at is null;
alter table public.workspace_scenes enable row level security;
alter table public.workspace_scenes force row level security;
create policy workspace_scenes_read_owner on public.workspace_scenes for select to authenticated using (user_id = auth.uid());
revoke all on public.workspace_scenes from public,anon,authenticated;
grant select on public.workspace_scenes to authenticated;
grant all on public.workspace_scenes to service_role;

-- Fixed UI preference operation. Advisory owner lock also serializes the 20-active-scene limit.
create function public.save_workspace_scene(p_id uuid,p_request_id uuid,p_expected_revision bigint,p_name text,p_snapshot jsonb,p_archive boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); current_scene public.workspace_scenes; result_scene public.workspace_scenes;
begin
  if owner_id is null then raise insufficient_privilege; end if;
  if p_id is null or p_request_id is null or p_expected_revision is null or p_expected_revision < 0 or p_expected_revision > 9007199254740989 or p_name is null or length(btrim(p_name)) not between 1 and 80 or not public.valid_workspace_scene_snapshot(p_snapshot) or p_archive is null then return jsonb_build_object('status','invalid'); end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,210300));
  select * into current_scene from public.workspace_scenes where id = p_id and user_id = owner_id for update;
  if found then
    if current_scene.last_mutation_id = p_request_id then
      if current_scene.name = btrim(p_name) and current_scene.snapshot = p_snapshot and (current_scene.archived_at is not null) = p_archive then
        return jsonb_build_object('status','saved','scene',to_jsonb(current_scene)-'user_id'-'last_mutation_id');
      end if;
      return jsonb_build_object('status','conflict');
    end if;
    if current_scene.revision <> p_expected_revision or current_scene.archived_at is not null then return jsonb_build_object('status','conflict'); end if;
    update public.workspace_scenes set name=btrim(p_name),snapshot=p_snapshot,revision=revision+1,last_mutation_id=p_request_id,updated_at=clock_timestamp(),archived_at=case when p_archive then clock_timestamp() else null end where id=p_id and user_id=owner_id returning * into result_scene;
  else
    if p_expected_revision <> 0 or p_archive then return jsonb_build_object('status','missing'); end if;
    if exists(select 1 from public.workspace_scenes where id=p_id) then return jsonb_build_object('status','missing'); end if;
    if (select count(*) from public.workspace_scenes where user_id=owner_id and archived_at is null) >= 20 then return jsonb_build_object('status','limit'); end if;
    insert into public.workspace_scenes(id,user_id,name,snapshot,last_mutation_id) values(p_id,owner_id,btrim(p_name),p_snapshot,p_request_id) returning * into result_scene;
  end if;
  return jsonb_build_object('status','saved','scene',to_jsonb(result_scene)-'user_id'-'last_mutation_id');
end; $$;
revoke all on function public.save_workspace_scene(uuid,uuid,bigint,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.save_workspace_scene(uuid,uuid,bigint,text,jsonb,boolean) to authenticated;
revoke all on function public.valid_workbench_ref(jsonb),public.valid_workbench_position(jsonb),public.valid_workbench_href(text),public.valid_workbench_view_state(jsonb),public.valid_workspace_scene_snapshot(jsonb) from public,anon;
grant execute on function public.valid_workbench_ref(jsonb),public.valid_workbench_position(jsonb),public.valid_workbench_href(text),public.valid_workbench_view_state(jsonb),public.valid_workspace_scene_snapshot(jsonb) to authenticated,service_role;
