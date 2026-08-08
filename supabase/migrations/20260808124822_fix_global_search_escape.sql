create schema if not exists extensions;
alter extension pg_trgm set schema extensions;

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
  )
  select
    s.domain,
    s.entity_type,
    s.entity_id,
    s.title,
    s.subtitle,
    left(regexp_replace(s.content_text, '[#*_\[\]]', '', 'g'), 240),
    s.metadata,
    s.source_updated_at,
    (
      case
        when lower(s.title) = lower(q.query_text) then 100
        when s.title ilike q.escaped_query || '%' escape E'\\' then 40
        when s.title ilike '%' || q.escaped_query || '%' escape E'\\' then 20
        else 0
      end
      + ts_rank_cd(
        s.search_vector,
        plainto_tsquery('simple', q.query_text)
      ) * 20
      + case
          when s.content_text ilike '%' || q.escaped_query || '%' escape E'\\' then 5
          else 0
        end
    )::real as score
  from public.search_documents s
  cross join query_input q
  where length(q.query_text) > 0
    and (p_domains is null or s.domain = any(p_domains))
    and (
      s.search_vector @@ plainto_tsquery('simple', q.query_text)
      or s.title ilike '%' || q.escaped_query || '%' escape E'\\'
      or s.content_text ilike '%' || q.escaped_query || '%' escape E'\\'
    )
  order by score desc, s.source_updated_at desc nulls last
  limit greatest(1, least(p_limit, 50));
$$;

revoke all on function public.search_personal_os(text, integer, text[]) from public;
grant execute on function public.search_personal_os(text, integer, text[]) to authenticated;
