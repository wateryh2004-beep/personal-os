insert into public.interview_competencies(user_id,key,label,description,position)
select distinct q.user_id,'teamwork','团队协作','在共同目标下协调角色、信息与责任并形成集体结果',220
from public.interview_questions q
on conflict(user_id,key) do nothing;

update public.interview_questions set competency_tags=array['leadership','ownership','influence_without_authority']
where id='e89fc031-eaa1-4a93-8e05-d717f62d23ab';

update public.interview_questions set competency_tags=array['problem_solving','structured_thinking','ownership']
where id='6d285b8f-e4c5-4097-9bb3-3221a6189722';

update public.interview_questions set competency_tags=array['prioritization','judgment','execution']
where id='1cdf28c2-3ecb-4d33-9ee1-8f595c83bba2';

update public.interview_questions set competency_tags=array['learning_agility','execution','curiosity']
where id='97a2fb5e-b19f-48da-9d68-c00504451370';

update public.interview_questions set competency_tags=array['structured_thinking','judgment','problem_solving']
where id='eed237d5-07e6-4558-824e-c8b8325f0378';

update public.interview_questions set competency_tags=array['influence_without_authority','communication','stakeholder_management']
where id='81538a5c-9832-4571-aeea-f9b8b93f5f96';

update public.interview_questions set competency_tags=array['teamwork','communication','stakeholder_management']
where id='4111dabd-a4de-4600-8394-1e54fa0dfea0';

update public.interview_questions set competency_tags=array['ownership','execution','resilience']
where id='1750646f-d50c-437f-849c-c5ce9fd015ab';
