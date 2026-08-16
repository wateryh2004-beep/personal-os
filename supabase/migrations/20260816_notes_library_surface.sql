-- notes-library 独立笔记库子 AI surface：扩展 agent_runs.surface CHECK 约束。
alter table public.agent_runs drop constraint if exists agent_runs_surface_check;
alter table public.agent_runs add constraint agent_runs_surface_check
  check (surface in ('global', 'calendar', 'tasks', 'inbox', 'career', 'notes', 'reviews', 'notes-library'));
