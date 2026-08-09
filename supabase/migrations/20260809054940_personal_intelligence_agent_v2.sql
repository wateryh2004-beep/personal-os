create table public.assistant_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_retrospective_window_days integer not null default 21
    check (default_retrospective_window_days between 7 and 90),
  preferred_answer_depth text not null default 'balanced'
    check (preferred_answer_depth in ('brief', 'balanced', 'deep')),
  inference_tolerance text not null default 'conservative'
    check (inference_tolerance in ('conservative', 'balanced', 'exploratory')),
  source_citation_preference text not null default 'always'
    check (source_citation_preference in ('always', 'analytical', 'when_needed')),
  analytical_dimensions text[] not null default array[
    '目标', '约束', '证据', '变化', '开放问题', '下一步'
  ]::text[],
  domain_instructions jsonb not null default '{}'::jsonb
    check (jsonb_typeof(domain_instructions) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger assistant_preferences_updated_at
before update on public.assistant_preferences
for each row execute procedure public.set_updated_at();

alter table public.assistant_preferences enable row level security;

create policy assistant_preferences_owner_select
on public.assistant_preferences for select
to authenticated
using ((select auth.uid()) = user_id);

create policy assistant_preferences_owner_insert
on public.assistant_preferences for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy assistant_preferences_owner_update
on public.assistant_preferences for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on table public.assistant_preferences from anon;
grant select, insert, update on table public.assistant_preferences to authenticated;

comment on table public.assistant_preferences is
  'Owner-scoped preferences for Personal Intelligence Agent retrieval and answer discipline.';

create or replace function public.search_personal_os(
  p_query text,
  p_limit integer default 30,
  p_domains text[] default null
)
returns table(
  domain text,
  entity_type text,
  entity_id uuid,
  title text,
  subtitle text,
  snippet text,
  metadata jsonb,
  source_updated_at timestamptz,
  score real
)
language sql
security invoker
set search_path = public, pg_temp
as $$
  with query_input as (
    select
      trim(p_query) as query_text,
      replace(
        replace(
          replace(trim(p_query), E'\\', E'\\\\'),
          '%',
          E'\\%'
        ),
        '_',
        E'\\_'
      ) as escaped_query
  ),
  matching as (
    select
      s.*,
      q.query_text,
      q.escaped_query,
      regexp_replace(s.content_text, '[#*_\[\]]', '', 'g') as clean_content
    from public.search_documents s
    cross join query_input q
    where length(q.query_text) > 0
      and (p_domains is null or s.domain = any(p_domains))
      and (
        s.search_vector @@ plainto_tsquery('simple', q.query_text)
        or s.title ilike '%' || q.escaped_query || '%' escape E'\\'
        or s.content_text ilike '%' || q.escaped_query || '%' escape E'\\'
      )
  )
  select
    m.domain,
    m.entity_type,
    m.entity_id,
    m.title,
    m.subtitle,
    case
      when strpos(lower(m.clean_content), lower(m.query_text)) > 0 then
        (case when strpos(lower(m.clean_content), lower(m.query_text)) > 91 then '…' else '' end)
        || substr(
          m.clean_content,
          greatest(1, strpos(lower(m.clean_content), lower(m.query_text)) - 90),
          240
        )
        || (case
          when greatest(1, strpos(lower(m.clean_content), lower(m.query_text)) - 90) + 240 < length(m.clean_content)
          then '…' else '' end)
      else left(m.clean_content, 240)
    end,
    m.metadata,
    m.source_updated_at,
    (
      case
        when lower(m.title) = lower(m.query_text) then 100
        when m.title ilike m.escaped_query || '%' escape E'\\' then 40
        when m.title ilike '%' || m.escaped_query || '%' escape E'\\' then 20
        else 0
      end
      + ts_rank_cd(m.search_vector, plainto_tsquery('simple', m.query_text)) * 20
      + case
          when m.content_text ilike '%' || m.escaped_query || '%' escape E'\\' then 5
          else 0
        end
    )::real as score
  from matching m
  order by score desc, m.source_updated_at desc nulls last
  limit greatest(1, least(p_limit, 50));
$$;

revoke all on function public.search_personal_os(text, integer, text[]) from public, anon;
grant execute on function public.search_personal_os(text, integer, text[]) to authenticated;
