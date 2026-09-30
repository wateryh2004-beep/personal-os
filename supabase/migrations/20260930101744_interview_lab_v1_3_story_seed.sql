alter table public.interview_stories
  add constraint interview_stories_user_title_key unique(user_id,title);

with owner as (
  select user_id from public.interview_questions limit 1
),
seeded as (
  insert into public.interview_stories(
    user_id,experience_id,title,one_line,situation_markdown,task_markdown,action_markdown,result_markdown,reflection_markdown,status,last_refined_at
  )
  select owner.user_id,v.experience_id,v.title,v.one_line,v.situation,v.task,v.action,v.result,v.reflection,v.status,now()
  from owner
  cross join (values
    ('4ed512f1-0913-4fde-8e6a-0cf822e5c293'::uuid,'Viewer 权限原则重构','把“只读=少看”改造成“可见范围一致、只禁止写入”的权限原则，并推动前端与 RLS 一致修正。','高力系统的 Viewer 账号一度看不到其他人的租赁成交等本应可浏览的信息，导致只读用户无法完成正常业务判断。','在不降低数据安全边界的前提下，让 Viewer 与 Editor 拥有一致的业务可见性，同时保持不可编辑。','把争议拆成“能不能看”和“能不能写”两个问题，提出 Viewer 与 Editor 可见范围一致、仅禁止 INSERT / UPDATE / DELETE；随后排查前端限制与 RLS，并按业务场景逐项验证。','只读模式恢复完整业务浏览，同时仍保持不可编辑。','领导力和影响力很多时候不是职位，而是把模糊争论变成可验证的原则并推动协作。','strong'),
    ('4ed512f1-0913-4fde-8e6a-0cf822e5c293'::uuid,'写字楼系统从 0 到 1','把分散在表格、楼书、成交记录和个人经验里的信息，重组为以楼宇为入口的连续工作系统。','北京写字楼团队的数据长期分散在 Excel、楼书、历史成交和个人经验里，信息入口割裂。','把零散工具推进成真实可用的内部工作系统，并在管理层汇报前形成稳定版本。','将目标拆成数据底座、核心业务流、权限与演示四块；围绕楼宇统一组织季度数据、租赁成交、楼书、历史成交、销控和审计，并持续和使用者校验。','系统形成真实业务使用，沉淀 642 栋楼和 6543 条历史成交等核心数据。','真正有价值的创新不是增加功能，而是重新组织工作方式，并把复杂目标拆成持续可交付的里程碑。','strong'),
    ('4ed512f1-0913-4fde-8e6a-0cf822e5c293'::uuid,'自学全栈并用于真实交付','带着真实业务问题学习 Next.js、Supabase、Vercel、数据库与 RLS，并把每一块知识立即转化为功能。','推进高力系统时，自己并没有完整的软件工程背景，但项目需要同时处理页面、数据库、权限和部署。','在不脱离真实交付的前提下快速补齐必要技术能力。','先识别当前交付的知识缺口，只学习解决问题所需的最小知识；每学一块立即用于真实功能，再根据用户反馈和错误继续迭代。','逐步具备从页面到数据权限的独立处理能力，并支撑系统持续交付。','学习能力的价值不在于学得快本身，而在于把陌生知识稳定转化成可用结果。','usable'),
    ('f6eb6f22-3c03-4daa-a18d-b9d2779e7b92'::uuid,'REITs 研究中的信息判断','先定义投资问题和关键变量，再按来源可靠性取数；面对口径冲突宁可保留空值，也不强行补齐。','消费 REITs 研究中公开信息很多，但版本、口径和时间点经常不一致。','从大量信息中识别真正影响判断的变量，并形成可横向比较的可靠数据。','先明确最终要回答的投资问题，再列关键变量；按照招募说明书、交易所公告、基金管理人披露等来源层级取数；冲突数据保留来源与时间，不为了填满表格而强行选择。','把分散信息压缩成可比较的指标与结论，形成稳定研究方法。','研究的核心不是搜集更多资料，而是判断什么信息重要、什么来源可信。','strong'),
    ('2e276805-079b-45d9-9506-54fd30234ecb'::uuid,'快手跨角色需求协作','把业务需求、用户路径和产品实现组织成同一条链路，减少产品、研发、运营之间的理解偏差。','小程序付费、PC 推荐、App 精选和直播电商等项目需要多个角色共同推进，容易出现各自理解不同。','让不同角色围绕同一用户流程、同一目标和清晰责任推进。','先画清从用户进入到完成行为的完整链路，再把需求拆成必须解决、可以后置、需要技术确认三类，并逐项与产品、研发、运营确认。','把“各自理解”转化成共同流程和可执行方案，降低跨角色信息偏差。','协作的关键不是参与人数，而是让不同专业的人在目标、事实和责任上保持一致。','strong'),
    ('ad706a5e-7948-409b-a422-bd6ef7999d56'::uuid,'浙江海港多任务优先级','用截止时间、错误成本、是否阻塞他人三个维度排序，而不是按任务到达顺序处理。','短期实习中同时处理干部任免表、档案审查、技能比武、宣传活动和会议纪要等差异很大的任务。','在短周期、多任务并行的情况下避免高风险事项被低价值工作挤占。','用截止时间、错误成本、是否阻塞他人三个维度判断优先级：干部和档案类材料优先准确，会议纪要优先时效，活动与宣传任务拆段推进。','多项任务保持并行，同时没有让真正高风险事项被低价值工作挤占。','优先级不是看事情大小，而是看延误和错误的代价。','strong'),
    ('4ed512f1-0913-4fde-8e6a-0cf822e5c293'::uuid,'管理层汇报前高压交付','在重要汇报前把交付拆成必须稳定、可以降级、可以删除三类，优先确保核心流程可演示。','中国区管理层汇报前，系统仍有多个功能、数据和演示细节需要集中收敛。','在极短时间内形成稳定、可信、可以连续演示的版本。','围绕汇报目标重新排序任务，把核心路径稳定性、关键数据准确性和演示流程放在最前，把非关键优化后置；持续检查跨页面状态和真实使用路径。','形成可用于正式汇报的稳定版本。','高压交付不是简单延长工作时间，而是主动降低范围、控制风险和守住交付标准。','draft')
  ) as v(experience_id,title,one_line,situation,task,action,result,reflection,status)
  on conflict(user_id,title) do update set
    experience_id=excluded.experience_id,
    one_line=excluded.one_line,
    situation_markdown=excluded.situation_markdown,
    task_markdown=excluded.task_markdown,
    action_markdown=excluded.action_markdown,
    result_markdown=excluded.result_markdown,
    reflection_markdown=excluded.reflection_markdown,
    status=excluded.status,
    archived_at=null,
    updated_at=now()
  returning id,user_id,title
),
links(title,question_title,role,fit_note) as (
  values
    ('Viewer 权限原则重构','主动领导','primary','证明无正式职权下主动定义问题并推动修正。'),
    ('Viewer 权限原则重构','用事实说服','primary','把权限争议拆成事实和可验证规则。'),
    ('Viewer 权限原则重构','项目贡献被质疑','supporting','可以清楚说明自己真正负责的边界。'),
    ('写字楼系统从 0 到 1','创新与创造力','primary','创新点是重组工作流，而不是地图本身。'),
    ('写字楼系统从 0 到 1','高目标与结果','primary','适合证明目标拆解、持续推进和真实结果。'),
    ('自学全栈并用于真实交付','快速学习','primary','母题已合并“快速学习 / 学习并应用新技能”。'),
    ('REITs 研究中的信息判断','信息搜集与决策','primary','证明信息筛选、来源判断和决策逻辑。'),
    ('REITs 研究中的信息判断','信息不完整下解决问题','supporting','可用于证明不确定信息下的判断。'),
    ('快手跨角色需求协作','团队协作','primary','证明跨角色信息组织和协作。'),
    ('快手跨角色需求协作','适应变化','supporting','可作为需求变化时的辅助素材。'),
    ('浙江海港多任务优先级','抓住关键优先级','primary','直接对应复杂任务下的优先级判断。'),
    ('管理层汇报前高压交付','短时间交付','primary','直接对应高压和极短准备时间。')
),
archetype_links as (
  insert into public.interview_archetype_stories(user_id,archetype_id,story_id,evidence_role,fit_note)
  select s.user_id,q.archetype_id,s.id,l.role,l.fit_note
  from seeded s
  join links l on l.title=s.title
  join public.interview_questions q on q.short_title=l.question_title and q.archived_at is null
  on conflict(archetype_id,story_id) do update
    set evidence_role=excluded.evidence_role,fit_note=excluded.fit_note,archived_at=null,updated_at=now()
  returning story_id,archetype_id
)
insert into public.interview_story_competencies(user_id,story_id,competency_id,relevance,is_primary)
select s.user_id,al.story_id,qc.competency_id,max(qc.relevance),bool_or(qc.is_primary)
from archetype_links al
join public.interview_stories s on s.id=al.story_id
join public.interview_questions q on q.archetype_id=al.archetype_id and q.archived_at is null
join public.interview_question_competencies qc on qc.question_id=q.id
group by s.user_id,al.story_id,qc.competency_id
on conflict(story_id,competency_id) do update set
  relevance=greatest(public.interview_story_competencies.relevance,excluded.relevance),
  is_primary=public.interview_story_competencies.is_primary or excluded.is_primary,
  updated_at=now();

insert into public.entity_links(user_id,source_type,source_id,target_type,target_id,relationship_type,created_via,metadata)
select s.user_id,'interview_story',s.id,'experience_output','cb1fe7d0-c484-4c99-8ce5-65e6f7ce5a87'::uuid,
       'source_material','system','{"seed":"interview_v1_3"}'::jsonb
from public.interview_stories s
where s.title in ('Viewer 权限原则重构','写字楼系统从 0 到 1','自学全栈并用于真实交付')
on conflict(user_id,source_type,source_id,target_type,target_id,relationship_type) do nothing;
