-- 简历版本与 Files 板块联动：允许一份简历关联一个 R2 文档（正式定稿 PDF 等）。
-- RLS policy（resume_versions_own 按 user_id）已覆盖新增列，无需新增 policy。

alter table public.resume_versions
  add column document_id uuid references public.documents(id) on delete set null;

create index resume_versions_document_idx
  on public.resume_versions (user_id, document_id)
  where archived_at is null;
