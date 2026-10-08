-- Ordinary owner profile preference. Existing profile RLS stays unchanged.
alter table public.profiles add column storage_budget_gib numeric(13,6)
  check (storage_budget_gib is null or storage_budget_gib between 0.001 and 1000000);
comment on column public.profiles.storage_budget_gib is 'Owner-defined planning budget in binary GiB; never a provider quota, free-tier remainder or billing estimate.';
