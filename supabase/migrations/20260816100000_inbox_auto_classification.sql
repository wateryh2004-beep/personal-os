-- Inbox 自动识别：无对话式写入即分类。
-- ai_proposal 存结构化去向提案（与 inboxProposalSchema 一致）；ai_status 记录识别结果：
--   ready  = 已识别，前端渲染提案卡，用户点同意即创建；
--   failed = 无法识别 / 识别失败，落入收集盒，等待手动导入。
alter table public.inbox_items
  add column if not exists ai_proposal jsonb,
  add column if not exists ai_status text,
  add column if not exists ai_updated_at timestamptz,
  add column if not exists ai_error text;

alter table public.inbox_items
  drop constraint if exists inbox_items_ai_status_check,
  add constraint inbox_items_ai_status_check
    check (ai_status is null or ai_status in ('ready', 'failed'));

alter table public.inbox_items
  drop constraint if exists inbox_items_ai_proposal_consistency_check,
  add constraint inbox_items_ai_proposal_consistency_check
    check (ai_status is distinct from 'ready' or ai_proposal is not null);
