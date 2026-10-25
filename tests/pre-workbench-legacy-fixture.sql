-- Apply only to an isolated database after the pre-workbench migration prefix.
-- These INSERTs use legacy columns and persist across the additive upgrade.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values ('81000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
insert into public.purchase_items(id,user_id,title,status,price_cny) values ('82000000-0000-4000-8000-000000000001',auth.uid(),'Legacy unknown quantity','ready',12);
insert into public.trips(id,user_id,title) values ('83000000-0000-4000-8000-000000000001',auth.uid(),'Legacy trip');
insert into public.trip_stops(id,user_id,trip_id,place_name,day_number,sort_order,planned_time,notes) values ('84000000-0000-4000-8000-000000000001',auth.uid(),'83000000-0000-4000-8000-000000000001','Legacy stop',1,0,'10:30','Legacy travel note');
select public.save_leisure_content('86000000-0000-4000-8000-000000000001',0,'{"title":"Legacy book","kind":"book","why":"Upgrade fixture","body_markdown":"Legacy editorial body","how_to_start":null,"duration_minutes":null,"platform":null,"location":null,"starts_at":null,"cost_text":null,"setting":null,"company":null,"budget":"unknown","sources":[],"ratings":[]}');
select public.save_leisure_feedback('86000000-0000-4000-8000-000000000001',0,'current','liked','Legacy personal note',null);
commit;
