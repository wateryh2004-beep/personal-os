-- Inbox「转任务」回填关联修复。
--
-- 背景：inbox_items.converted_task_id 的外键指向核心 tasks 表，而 UI 的
-- 「转任务」实际创建的是 microsoft_todo_tasks 记录。markInboxProcessed 把
-- microsoft_todo_tasks.id 写入 converted_task_id 时必然违反外键约束，
-- 更新静默失败 → inbox 一直停留在「收集盒」无法进入「已整理」。
--
-- 修复：新增 converted_todo_task_id 指向 microsoft_todo_tasks(id)，
-- 让转 Microsoft To Do 任务后的关联可落库。converted_task_id 保留给
-- 未来「转核心任务」的场景。

alter table public.inbox_items
  add column if not exists converted_todo_task_id uuid references public.microsoft_todo_tasks(id) on delete set null;

create index inbox_items_todo_task_idx
  on public.inbox_items (user_id, converted_todo_task_id)
  where archived_at is null;
