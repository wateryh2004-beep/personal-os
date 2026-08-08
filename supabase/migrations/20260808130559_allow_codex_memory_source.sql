alter table public.personal_memories
  drop constraint if exists personal_memories_created_via_check;

alter table public.personal_memories
  add constraint personal_memories_created_via_check
  check (created_via in ('manual', 'assistant_proposal', 'codex_import'));
