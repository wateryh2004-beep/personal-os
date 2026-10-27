-- Synthetic data valid both before and after this additive release.
insert into auth.users(id) values ('81000000-0000-4000-8000-000000000001'),('81000000-0000-4000-8000-000000000002');
insert into public.calendar_connections(id,user_id,label) values ('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','Synthetic');
insert into public.microsoft_todo_lists(id,user_id,connection_id,provider_list_id,display_name) values ('83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','synthetic-list','Synthetic');
insert into public.microsoft_todo_tasks(id,user_id,todo_list_id,provider_task_id,title) values ('84000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','synthetic-task','Synthetic next action');
insert into public.projects(id,user_id,name,description) values ('85000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','Synthetic project','Original goal');
insert into public.feeds(id,user_id,title,feed_url) values ('86000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','Synthetic RSS','https://synthetic.invalid/feed');
insert into public.feed_items(id,user_id,feed_id,identity_key,title,normalized_title,content_text) values ('87000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','86000000-0000-4000-8000-000000000001','synthetic-source','Original title','original title','Original exact source text');
insert into public.purchase_items(id,user_id,title,status) values ('88000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','Synthetic purchased object','purchased');
