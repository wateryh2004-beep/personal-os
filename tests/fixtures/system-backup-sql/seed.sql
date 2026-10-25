-- Synthetic owner and distractor only. No remote sources or personal data.
begin;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
update public.profiles set storage_budget_gib=10 where user_id='00000000-0000-4000-8000-000000000001';
insert into public.areas(id,user_id,name) values ('10000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','Synthetic learning');
insert into public.projects(id,user_id,area_id,name) values ('10000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000010','Recovery rehearsal');
insert into public.note_folders(id,user_id,name) values ('10000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','Root');
insert into public.note_folders(id,user_id,parent_id,name) values ('10000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000030','Child');
insert into public.notes(id,user_id,project_id,folder_id,title,body_markdown,status,deleted_at) values ('10000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000020','10000000-0000-4000-8000-000000000031','Synthetic 中文 α',E'# Original Markdown\n\nPreserve **text** 🌱\n','trashed',now());
insert into public.notes(id,user_id,title,body_markdown) values ('10000000-0000-4000-8000-000000000041','00000000-0000-4000-8000-000000000002','Other synthetic owner','Must never export');
insert into public.note_versions(id,user_id,note_id,title,body_markdown,version_number,created_by) values
('10000000-0000-4000-8000-000000000050','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000040','v1',E'第一版\n',1,'00000000-0000-4000-8000-000000000001'),
('10000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000040','v2',E'第二版\n',2,'00000000-0000-4000-8000-000000000001');
insert into public.entity_links(id,user_id,source_type,source_id,target_type,target_id,metadata) values ('10000000-0000-4000-8000-000000000063','00000000-0000-4000-8000-000000000001','note','10000000-0000-4000-8000-000000000040','project','10000000-0000-4000-8000-000000000020','{"nested":["原文",1,true,null]}');
insert into public.investment_accounts(id,user_id,name,mode,currency) values ('10000000-0000-4000-8000-000000000070','00000000-0000-4000-8000-000000000001','Synthetic paper account','paper','CNY');
insert into public.investment_ledger(id,user_id,account_id,sequence,kind,symbol,occurred_on,quantity,price,fees,source,import_key,payload_hash) values ('10000000-0000-4000-8000-000000000071','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000070',1,'buy','TEST','2026-10-01','1234.00000001','1.00000009','0','Synthetic fixture','10000000-0000-4000-8000-000000000079',repeat('a',64));
-- The correction sorts before its referenced trade by UUID. Recovery must not
-- assume lexicographic row order is foreign-key insertion order.
insert into public.investment_ledger(id,user_id,account_id,sequence,kind,void_entry_id,symbol,occurred_on,quantity,price,fees,source,import_key,payload_hash) values ('10000000-0000-4000-8000-000000000069','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000070',2,'void','10000000-0000-4000-8000-000000000071','TEST','2026-10-01','1234.00000001',null,'0','Synthetic correction','10000000-0000-4000-8000-000000000078',repeat('b',64));
insert into public.investment_cash_ledger(id,user_id,account_id,sequence,kind,occurred_on,amount,source,import_key) values
('10000000-0000-4000-8000-000000000074','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000070',3,'opening','2026-09-30','10000.00000001','Synthetic opening','10000000-0000-4000-8000-000000000076');
insert into public.investment_quotes(id,user_id,account_id,sequence,symbol,currency,price,as_of,source_kind,source,import_key) values
('10000000-0000-4000-8000-000000000075','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000070',4,'TEST','CNY','1.00000009','2026-10-01T00:00:00Z','manual','Synthetic quote','10000000-0000-4000-8000-000000000077');
-- Terminally cancelled upload: retained evidence, no committed object needed.
insert into public.documents(id,user_id,title,original_filename,storage_bucket,storage_path,mime_type,file_size,storage_provider,storage_state,upload_mode)
values ('10000000-0000-4000-8000-000000000080','00000000-0000-4000-8000-000000000001','Synthetic cancelled upload','cancelled.pdf','fixture-bucket','00000000-0000-4000-8000-000000000001/files/cancelled.pdf','application/pdf',123,'cloudflare_r2','cancelled','multipart');
-- Workbench v2 round-trip data: domain values are explicit synthetic records.
insert into public.purchase_items(id,user_id,title,quantity,quantity_unit,price_cny,status)
values ('10000000-0000-4000-8000-000000000090','00000000-0000-4000-8000-000000000001','Synthetic pantry quantity','2.125','kg',12.50,'ready');
insert into public.trips(id,user_id,title,start_date,end_date,budget_cny)
values ('10000000-0000-4000-8000-000000000091','00000000-0000-4000-8000-000000000001','Synthetic journey','2026-11-01','2026-11-02',125.50);
insert into public.trip_stops(id,user_id,trip_id,place_name,day_number,planned_time,duration_minutes,arrived_at)
values ('10000000-0000-4000-8000-000000000092','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000091','Synthetic current stop',1,'09:15',45,'2026-11-01T01:15:00Z'),
('10000000-0000-4000-8000-000000000093','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000091','Synthetic next stop',2,'13:30',60,null);
update public.trips set current_stop_id='10000000-0000-4000-8000-000000000092',next_stop_id='10000000-0000-4000-8000-000000000093' where id='10000000-0000-4000-8000-000000000091';
-- Historical archived relationship to the existing cancelled upload. This tests
-- retained links; it does not invent an available ticket or missing original bytes.
insert into public.trip_documents(id,user_id,trip_id,document_id,archived_at)
values ('10000000-0000-4000-8000-000000000094','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000091','10000000-0000-4000-8000-000000000080','2026-10-24T00:00:00Z');
select public.save_leisure_content('10000000-0000-4000-8000-000000000095',0,'{"title":"Synthetic book progress","kind":"book","why":"Recovery fixture","body_markdown":"Synthetic editorial source","how_to_start":null,"duration_minutes":null,"platform":null,"location":null,"starts_at":null,"cost_text":null,"setting":null,"company":null,"budget":"unknown","sources":[],"ratings":[]}'::jsonb);
select public.save_leisure_feedback('10000000-0000-4000-8000-000000000095',0,'current','liked','Synthetic personal reflection',null);
update public.leisure_feedback set progress_unit='page',progress_value=42,progress_total=200 where experience_id='10000000-0000-4000-8000-000000000095';
insert into public.workspace_scenes(id,user_id,name,snapshot,last_mutation_id)
values ('10000000-0000-4000-8000-000000000096','00000000-0000-4000-8000-000000000001','Synthetic field scene','{"version":1,"main":{"href":"/shopping?mode=field","position":{"scrollTop":128}},"reference":{"ref":{"kind":"trip","id":"10000000-0000-4000-8000-000000000091"}},"layout":{"referenceFirst":false,"referenceWidth":42,"mobilePane":"main"}}'::jsonb,'10000000-0000-4000-8000-000000000097');
commit;
