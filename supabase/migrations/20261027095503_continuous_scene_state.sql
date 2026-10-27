-- Finite UI metadata only. Existing scene content is never rewritten or removed.
-- UTF-16 length matches the browser/Zod budgets, including supplementary glyphs.
create function public.workbench_utf16_length(p_text text) returns integer
language sql immutable strict set search_path='' as $$
 select char_length(p_text)+coalesce((select count(*)::integer from regexp_split_to_table(p_text,'') c where ascii(c)>65535),0);
$$;
create function public.decode_workbench_query(p_text text) returns text
language plpgsql immutable strict set search_path='' as $$
declare result bytea:=''::bytea; i integer:=1; c text;
begin
 if octet_length(p_text)>8192 then return null;end if;
 while i<=char_length(p_text) loop
  c:=substr(p_text,i,1);
  if c='%' then
   if substr(p_text,i+1,2)!~'^[0-9a-fA-F]{2}$' then return null;end if;
   result:=result||decode(substr(p_text,i+1,2),'hex');i:=i+3;
  else result:=result||convert_to(case when c='+' then ' ' else c end,'UTF8');i:=i+1;end if;
 end loop;
 return convert_from(result,'UTF8');
exception when others then return null;
end $$;
create function public.workbench_uuid_text(p_value text) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(p_value ~* '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$',false);
$$;
create function public.valid_continuous_scene_shape(p_value jsonb,p_schema jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare member jsonb; k text; v jsonb; n numeric; count_matches integer:=0; t text;
begin
 if p_value is null then return false;end if;
 if p_schema?'oneOf' or p_schema?'anyOf' then
  for member in select value from jsonb_array_elements(coalesce(p_schema->'oneOf',p_schema->'anyOf')) loop
   if public.valid_continuous_scene_shape(p_value,member) then count_matches:=count_matches+1;end if;
  end loop;
  return case when p_schema?'oneOf' then count_matches=1 else count_matches>0 end;
 end if;
 if p_schema?'const' and p_value is distinct from p_schema->'const' then return false;end if;
 if p_schema?'enum' and not exists(select 1 from jsonb_array_elements(p_schema->'enum') e where e=p_value) then return false;end if;
 t:=p_schema->>'type';
 if t='object' then
  if jsonb_typeof(p_value)<>'object' then return false;end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(p_schema->'required','[]')) r where not(p_value?r)) then return false;end if;
  for k,v in select * from jsonb_each(p_value) loop
   if not (p_schema->'properties')?k then return false;end if;
   if not public.valid_continuous_scene_shape(v,p_schema#>array['properties',k]) then return false;end if;
   if k='cursor' and (to_char((v#>>'{}')::date,'YYYY-MM-DD')<>v#>>'{}') then return false;end if;
  end loop;
 elsif t='array' then
  if jsonb_typeof(p_value)<>'array' or (p_schema?'maxItems' and jsonb_array_length(p_value)>(p_schema->>'maxItems')::integer) then return false;end if;
  if (select count(*)<>count(distinct value) from jsonb_array_elements(p_value)) then return false;end if;
  for member in select value from jsonb_array_elements(p_value) loop if not public.valid_continuous_scene_shape(member,p_schema->'items') then return false;end if;end loop;
 elsif t='string' then
  if jsonb_typeof(p_value)<>'string' then return false;end if;
  k:=p_value#>>'{}';
  if k ~ U&'[\0001-\001F\007F]' or (p_schema?'maxLength' and public.workbench_utf16_length(k)>(p_schema->>'maxLength')::integer) or (p_schema?'minLength' and public.workbench_utf16_length(k)<(p_schema->>'minLength')::integer) or (p_schema?'pattern' and case when p_schema->>'x-pattern-case-insensitive'='true' then k!~*(p_schema->>'pattern') else k!~(p_schema->>'pattern') end) then return false;end if;
 elsif t in('number','integer') then
  if jsonb_typeof(p_value)<>'number' then return false;end if;n:=(p_value::text)::numeric;
  if (t='integer' and n<>trunc(n)) or (p_schema?'minimum' and n<(p_schema->>'minimum')::numeric) or (p_schema?'maximum' and n>(p_schema->>'maximum')::numeric) then return false;end if;
 elsif t='boolean' then return jsonb_typeof(p_value)='boolean';
 elsif t='null' then return p_value='null'::jsonb;
 else return false;
 end if;
 return true;
exception when others then return false;
end $$;

create function public.valid_workbench_route_argument(p_path text,p_key text,p_value text) returns boolean
language plpgsql immutable set search_path='' as $$
declare allowed text[]; module text:=split_part(p_path,'/',2); n numeric; part text; k text; v text; filters jsonb:='{}'; canonical text:='';
begin
 if p_value is null or p_value~U&'[\0001-\001F\007F]' then return false;end if;
 allowed:=case
 when p_path='/notes' then array['q','scope','folder','view'] when p_path='/files' then array['q','folder','view','sort','type','page','file']
 when p_path='/tasks' then array['q','task','status','view'] when p_path='/calendar' then array['event','view','date'] when p_path='/projects' then array['status']
 when p_path='/inbox' then array['entry','draft'] when p_path in('/investments','/investing') then array['tab','mode','item']
 when p_path='/career/resumes' then array['q','resume','direction','status'] when p_path='/career/applications' then array['opportunity']
 when p_path='/career/roadmap' then array['milestone']
 when p_path='/career/opportunities' then array['q','status'] when p_path='/career/interview' then array['q','context','question','answer','category','domain','style']
 when p_path~*'^/career/interview/questions/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then array['context']
 when p_path~*'^/career/interview/practice/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then array['parent']
 when p_path in('/career/interview/practice','/career/interview/insights','/career/interview/questions') then array['context','q']
 when p_path='/shopping' then array['q','status','mode'] when p_path='/travel' then array['q','status','mode']
 when p_path~*'^/travel/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then array['mode','day','stop']
 when p_path='/leisure' then array['q','mode','kind','minutes','setting','company','budget']
 when p_path~*'^/leisure/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then array['from'] else array[]::text[] end;
 if not p_key=any(allowed) then return false;end if;
 if p_key='q' then return public.workbench_utf16_length(p_value)<=200;end if;
 if p_key='domain' then return public.workbench_utf16_length(p_value)<=120;end if;
 if p_key='context' then return (p_path in('/career/interview','/career/interview/practice','/career/interview/insights','/career/interview/questions') and p_value='general') or public.workbench_uuid_text(p_value);end if;
 if p_key='direction' then return p_value in('all','general') or public.workbench_uuid_text(p_value);end if;
 if p_key in('folder','file','task','event','item','resume','question','answer','opportunity','parent','stop','entry','milestone') then return public.workbench_uuid_text(p_value);end if;
 if p_key='date' then return p_value~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and to_char(p_value::date,'YYYY-MM-DD')=p_value;end if;
 if p_key in('page','minutes','day') then
  if p_key='day' and p_value in('all','unknown') then return true;end if;
  if p_value!~'^[1-9][0-9]*$' or length(p_value)>8 then return false;end if;n:=p_value::numeric;
  return n<=case p_key when 'page' then 200 when 'minutes' then 1440 else 366 end;
 end if;
 if p_key='scope' then return p_value in('context','all');end if;
 if p_key='view' then return case p_path when '/files' then p_value in('list','grid') when '/notes' then p_value in('all','favorites','recent') when '/tasks' then p_value in('today','upcoming','all','completed') else p_value in('dayGridMonth','timeGridWeek','timeGridDay','listWeek','month','week','day','agenda') end;end if;
 if p_key='sort' then return p_value in('uploaded-desc','uploaded-asc','name','size-desc','size-asc');end if;
 if p_key='type' then return p_value in('all','photo','document','spreadsheet','presentation','audio','video','archive','other');end if;
 if p_key='tab' then return p_value in('holdings','strategies','research');end if;
 if p_key='mode' then return case when module in('shopping','travel','leisure') then p_value='field' else p_value in('real','paper') end;end if;
 if p_key='kind' then return p_value in('film','series','game','book','music','outing','other');end if;
 if p_key='setting' then return p_value in('home','out','either');end if;
 if p_key='company' then return p_value in('solo','together','either');end if;
 if p_key='budget' then return p_value in('free','paid','unknown');end if;
 if p_key='draft' then return p_value in('task','calendar','note','daily','project','link');end if;
 if p_key='category' then return p_value in('all','resume','behavioral','motivation_fit','knowledge','business_case','situational','candidate_question');end if;
 if p_key='style' then return p_value in('all','standard','stress');end if;
 if p_key='status' then return case p_path when '/projects' then p_value in('all','active','completed','paused','other') when '/tasks' then p_value in('all','active','completed') when '/career/resumes' then p_value in('all','draft','approved') when '/career/opportunities' then p_value in('all','watching','researching','preparing','closed') when '/shopping' then p_value in('all','active','inbox','cooling','ready','purchased','abandoned') when '/travel' then p_value in('all','planning','booked','completed','dream','shortlist') else false end;end if;
 if p_key='from' then
  if public.workbench_utf16_length(p_value)>1024 then return false;end if;
  foreach part in array string_to_array(p_value,'&') loop
   k:=public.decode_workbench_query(split_part(part,'=',1));v:=public.decode_workbench_query(substr(part,position('=' in part)+1));
   if k is null or v is null or filters?k or k not in('kind','minutes','setting','company','budget') or not public.valid_workbench_route_argument('/leisure',k,v) or (k='setting' and v not in('home','out')) or (k='company' and v not in('solo','together')) or (k='budget' and v not in('free','paid')) then return false;end if;
   filters:=filters||jsonb_build_object(k,v);
  end loop;
  foreach k in array array['kind','minutes','setting','company','budget'] loop if filters?k then canonical:=canonical||case when canonical='' then '' else '&' end||k||'='||(filters->>k);end if;end loop;
  return canonical=p_value;
 end if;
 return false;
exception when others then return false;
end $$;

create or replace function public.valid_workbench_href(p_href text) returns boolean
language plpgsql immutable set search_path='' as $$
declare path text; fragment text; query text; part text; k text; v text; params jsonb:='{}'; keys text[]; n numeric;
begin
 if p_href is null or public.workbench_utf16_length(p_href)>2048 or p_href~'[\\[:cntrl:]]' or octet_length(p_href)<>char_length(p_href) or position(' ' in p_href)>0 then return false;end if;
 path:=split_part(split_part(p_href,'?',1),'#',1);
 if path!~*'^/(today|notes(/(trash|ask|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))?|files|tasks|calendar|projects|career(/(profile|skills|resumes|applications|certifications|experiences(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?|search|interview(/(questions(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?|practice(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?|targets(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?|stories(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?|sessions(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?|insights|consistency))?|capital|directions|materials|opportunities(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/materials)?|roadmap))?|shopping(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?|travel(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?|leisure(/(artwork-storage|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))?|investments|investing|inbox|reviews(/(daily|weekly|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))?|briefing(/(events|interests|sources|history(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?))?|settings|photos|memory)$' then return false;end if;
 if position('#' in p_href)>0 then
  fragment:=split_part(p_href,'#',2);
  if length(p_href)-length(replace(p_href,'#',''))<>1 then return false;end if;
  if not ((path='/leisure' and fragment='leisure-collection') or (path='/projects' and fragment~*'^project-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') or (path='/career/opportunities' and fragment~*'^opportunity-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') or (path='/career/resumes' and fragment~*'^resume-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') or (path='/career/applications' and fragment~*'^application-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') or (path='/investments' and fragment~*'^investment-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') or (path='/memory' and fragment~*'^decision-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') or (path~*'^/briefing/history/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and fragment~*'^entry-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) then return false;end if;
 end if;
 if position('?' in split_part(p_href,'#',1))=0 then return true;end if;
 query:=substr(split_part(p_href,'#',1),position('?' in split_part(p_href,'#',1))+1);
 if query~'["''<>]' then return false;end if;
 foreach part in array string_to_array(query,'&') loop
  k:=public.decode_workbench_query(split_part(part,'=',1));v:=public.decode_workbench_query(case when position('=' in part)>0 then substr(part,position('=' in part)+1) else '' end);
  if k is null or v is null or params?k then return false;end if;params:=params||jsonb_build_object(k,v);
 end loop;
 select array_agg(key order by key) into keys from jsonb_object_keys(params) key;
 if params ?| array['nv','nr','sf','st','sh'] then
  if not public.workbench_uuid_text(split_part(path,'/',3)) or fragment is not null or path!~*'^/notes/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or keys<>array['nr','nv','sf','sh','st'] or not public.workbench_uuid_text(params->>'nv') or params->>'nr'!~'^(0|[1-9][0-9]{0,9})$' or (params->>'nr')::numeric>2147483647 or params->>'sf'!~'^(0|[1-9][0-9]{0,5})$' or params->>'st'!~'^[1-9][0-9]{0,5}$' or (params->>'st')::integer>200000 or (params->>'sf')::integer>=(params->>'st')::integer or params->>'sh'!~'^[0-9a-f]{64}$' then return false;end if;return true;
 elsif params ?| array['pdfPage','sourceVersion'] then
  return fragment is null and path='/files' and keys=array['file','pdfPage','sourceVersion'] and public.workbench_uuid_text(params->>'file') and public.workbench_uuid_text(params->>'sourceVersion') and params->>'pdfPage'~'^[1-9][0-9]{0,2}$' and (params->>'pdfPage')::integer<=500;
 end if;
 for k,v in select key,value#>>'{}' from jsonb_each(params) loop if not public.valid_workbench_route_argument(path,k,v) then return false;end if;end loop;
 return coalesce(array_length(keys,1),0)>0;
exception when others then return false;
end $$;

create or replace function public.valid_workbench_view_state(p_value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
begin
 if p_value is null then return true;end if;
 if octet_length(p_value::text)>32768 then return false;end if;
 return public.valid_continuous_scene_shape(p_value,'{"$schema":"https://json-schema.org/draft/2020-12/schema","oneOf":[{"type":"object","properties":{"kind":{"type":"string","const":"tasks"},"view":{"type":"string","enum":["today","upcoming","all","completed"]},"listId":{"anyOf":[{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},{"type":"null"}]},"scroll":{"type":"object","properties":{"list":{"type":"number","minimum":0,"maximum":10000000},"detail":{"type":"number","minimum":0,"maximum":10000000}},"additionalProperties":false}},"required":["kind","view","listId"],"additionalProperties":false},{"type":"object","properties":{"kind":{"type":"string","const":"calendar"},"view":{"type":"string","enum":["day","week","month"]},"cursor":{"type":"string","pattern":"^\\d{4}-\\d{2}-\\d{2}$"},"selectedCategories":{"maxItems":20,"type":"array","items":{"type":"string","minLength":1,"maxLength":120}},"hideInternship":{"type":"boolean"},"selectedEventId":{"anyOf":[{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},{"type":"null"}]},"inspectorOpen":{"type":"boolean"}},"required":["kind","view","cursor","selectedCategories","hideInternship"],"additionalProperties":false},{"type":"object","properties":{"kind":{"type":"string","const":"today"},"section":{"anyOf":[{"type":"string","enum":["focus","schedule","tasks","continue","review"]},{"type":"null"}]},"disclosures":{"maxItems":3,"type":"array","items":{"type":"string","enum":["future","past","background"]}}},"required":["kind","section"],"additionalProperties":false},{"type":"object","properties":{"kind":{"type":"string","const":"notes"},"pathname":{"type":"string","pattern":"^\\/notes(?:\\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$","x-pattern-case-insensitive":true},"previewId":{"anyOf":[{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},{"type":"null"}]},"scroll":{"type":"object","properties":{"list":{"type":"number","minimum":0,"maximum":10000000},"detail":{"type":"number","minimum":0,"maximum":10000000}},"additionalProperties":false}},"required":["kind","pathname","previewId","scroll"],"additionalProperties":false},{"type":"object","properties":{"kind":{"type":"string","const":"files"},"previewDocumentId":{"anyOf":[{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},{"type":"null"}]},"previewOpen":{"type":"boolean"},"listScrollTop":{"type":"number","minimum":0,"maximum":10000000},"previewScrollTop":{"type":"number","minimum":0,"maximum":10000000}},"required":["kind","previewDocumentId","previewOpen","listScrollTop","previewScrollTop"],"additionalProperties":false},{"type":"object","properties":{"kind":{"type":"string","const":"projects"},"expandedProjectIds":{"maxItems":20,"type":"array","items":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}}},"required":["kind","expandedProjectIds"],"additionalProperties":false},{"type":"object","properties":{"kind":{"type":"string","const":"career"},"pathname":{"type":"string","maxLength":200,"pattern":"^\\/career(?:\\/[a-z-]+)*(?:\\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?(?:\\/materials)?$","x-pattern-case-insensitive":true},"contextId":{"anyOf":[{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},{"type":"null"}]},"expandedIds":{"maxItems":20,"type":"array","items":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"insightTags":{"maxItems":20,"type":"array","items":{"type":"string","minLength":1,"maxLength":120}},"selectedId":{"anyOf":[{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},{"type":"null"}]},"scroll":{"type":"object","properties":{"list":{"type":"number","minimum":0,"maximum":10000000},"detail":{"type":"number","minimum":0,"maximum":10000000}},"additionalProperties":false}},"required":["kind","pathname","expandedIds","selectedId","scroll"],"additionalProperties":false},{"type":"object","properties":{"kind":{"type":"string","const":"reviews"},"pathname":{"type":"string","pattern":"^\\/reviews\\/(?:daily|weekly|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$","x-pattern-case-insensitive":true},"periodKey":{"type":"string","maxLength":160,"pattern":"^(daily|weekly):\\d{4}-\\d{2}-\\d{2}:\\d{4}-\\d{2}-\\d{2}:[A-Za-z0-9_+\\-/]{1,80}$"},"filter":{"type":"string","enum":["all","calendar","tasksCompleted","tasksOpen","notes","inbox","career","projects","decisions"]},"selectedRefs":{"maxItems":100,"type":"array","items":{"type":"object","properties":{"group":{"type":"string","enum":["calendar","tasksCompleted","tasksOpen","notes","inbox","career","projects","decisions"]},"type":{"type":"string","enum":["calendar_event","todo_task","note","inbox_item","career_milestone","career_opportunity","career_application","project","decision"]},"id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"required":["group","type","id"],"additionalProperties":false}},"evidenceScrollTop":{"type":"number","minimum":0,"maximum":10000000}},"required":["kind","pathname","periodKey","filter","selectedRefs","evidenceScrollTop"],"additionalProperties":false},{"type":"object","properties":{"kind":{"type":"string","const":"briefing"},"pathname":{"type":"string","enum":["/briefing","/briefing/events","/briefing/sources","/briefing/interests"]},"eventId":{"anyOf":[{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},{"type":"null"}]},"expandedIds":{"maxItems":20,"type":"array","items":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}}},"required":["kind","pathname","eventId","expandedIds"],"additionalProperties":false},{"type":"object","properties":{"kind":{"type":"string","const":"investment"},"explainingAccountId":{"anyOf":[{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},{"type":"null"}]},"expandedAccountIds":{"maxItems":20,"type":"array","items":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"selectedSection":{"anyOf":[{"type":"string","enum":["ledger","cash","quotes","strategies","research"]},{"type":"null"}]}},"required":["kind","explainingAccountId","expandedAccountIds","selectedSection"],"additionalProperties":false},{"type":"object","properties":{"kind":{"type":"string","const":"shopping"},"itemId":{"anyOf":[{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},{"type":"null"}]},"section":{"type":"string","enum":["details","aftercare"]}},"required":["kind","itemId","section"],"additionalProperties":false},{"type":"object","properties":{"kind":{"type":"string","const":"travel"},"tripId":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"day":{"anyOf":[{"type":"string","const":"all"},{"type":"string","const":"unknown"},{"type":"integer","minimum":1,"maximum":366}]},"stopId":{"anyOf":[{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},{"type":"null"}]},"map":{"anyOf":[{"type":"object","properties":{"latitude":{"type":"number","minimum":-90,"maximum":90},"longitude":{"type":"number","minimum":-180,"maximum":180},"zoom":{"type":"number","minimum":0,"maximum":22}},"required":["latitude","longitude","zoom"],"additionalProperties":false},{"type":"null"}]}},"required":["kind","tripId","day","stopId","map"],"additionalProperties":false},{"type":"object","properties":{"kind":{"type":"string","const":"leisure"},"pathname":{"type":"string","pattern":"^\\/leisure(?:\\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$","x-pattern-case-insensitive":true},"featuredId":{"anyOf":[{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},{"type":"null"}]},"fieldSelectedId":{"anyOf":[{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},{"type":"null"}]}},"required":["kind","pathname","featuredId","fieldSelectedId"],"additionalProperties":false},{"type":"object","properties":{"kind":{"type":"string","const":"inbox"},"currentId":{"anyOf":[{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},{"type":"null"}]},"reviewId":{"anyOf":[{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},{"type":"null"}]},"laterIds":{"maxItems":100,"type":"array","items":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"manualKind":{"anyOf":[{"type":"string","enum":["task","calendar","note","daily","project","link"]},{"type":"null"}]}},"required":["kind","currentId","reviewId","laterIds","manualKind"],"additionalProperties":false}]}'::jsonb);
end $$;

create or replace function public.valid_workspace_scene_snapshot(p_value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare main jsonb; reference jsonb; layout jsonb; href text; path text; state jsonb; expected text; context_arg text;
begin
 if jsonb_typeof(p_value) is distinct from 'object' or octet_length(p_value::text)>32768 or (select count(*) from jsonb_object_keys(p_value))<>4 or not p_value?&array['version','main','reference','layout'] or p_value->'version'<>'1'::jsonb then return false;end if;
 main:=p_value->'main';reference:=p_value->'reference';layout:=p_value->'layout';
 if jsonb_typeof(main) is distinct from 'object' or exists(select 1 from jsonb_object_keys(main) k where k not in('href','position','viewState')) or jsonb_typeof(main->'href') is distinct from 'string' then return false;end if;
 href:=main->>'href';path:=split_part(split_part(href,'?',1),'#',1);
 if not public.valid_workbench_href(href) or not public.valid_workbench_position(main->'position') or not public.valid_workbench_view_state(main->'viewState') then return false;end if;
 if main?'viewState' then
  state:=main->'viewState';
  expected:=case when state?'pathname' then state->>'pathname' when state->>'kind'='travel' then '/travel/'||(state->>'tripId') when state->>'kind'='shopping' then case when state->'itemId'='null'::jsonb then '/shopping' else '/shopping/'||(state->>'itemId') end when state->>'kind'='investment' then '/investments' else '/'||(state->>'kind') end;
  if path is distinct from expected then return false;end if;
  if state->>'kind'='career' and state?'contextId' then
   context_arg:=public.decode_workbench_query((regexp_match(href,'[?&]context=([^&#]*)'))[1]);
   if coalesce(nullif(lower(context_arg),'general'),'') is distinct from coalesce(state->>'contextId','') then return false;end if;
  end if;
 end if;
 if reference<>'null'::jsonb and (jsonb_typeof(reference) is distinct from 'object' or exists(select 1 from jsonb_object_keys(reference) k where k not in('ref','position','editing')) or not reference?'ref' or not public.valid_workbench_ref(reference->'ref') or not public.valid_workbench_position(reference->'position') or (reference?'editing' and jsonb_typeof(reference->'editing')<>'boolean')) then return false;end if;
 if jsonb_typeof(layout) is distinct from 'object' or (select count(*) from jsonb_object_keys(layout))<>3 or not layout?&array['referenceFirst','referenceWidth','mobilePane'] then return false;end if;
 return coalesce(jsonb_typeof(layout->'referenceFirst')='boolean' and jsonb_typeof(layout->'referenceWidth')='number' and (layout->>'referenceWidth')::numeric between 30 and 65 and (layout->>'referenceWidth')::numeric=trunc((layout->>'referenceWidth')::numeric) and layout->>'mobilePane' in('main','reference'),false);
exception when others then return false;
end $$;
revoke all on function public.workbench_utf16_length(text),public.decode_workbench_query(text),public.workbench_uuid_text(text),public.valid_continuous_scene_shape(jsonb,jsonb),public.valid_workbench_route_argument(text,text,text) from public,anon;
grant execute on function public.workbench_utf16_length(text),public.decode_workbench_query(text),public.workbench_uuid_text(text),public.valid_continuous_scene_shape(jsonb,jsonb),public.valid_workbench_route_argument(text,text,text) to authenticated,service_role;
-- CREATE OR REPLACE preserves the existing validator and save RPC ACLs/RLS/CAS.
