-- Read-only live projections preserve parent archival and RLS without stale duplicate indexes.
-- No new grants or privileged functions: all source reads remain security invoker.
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
  , supplemental as (
    select 'leisure'::text domain, 'leisure_experience'::text entity_type, l.id entity_id,
      l.title, concat_ws(' · ', l.kind, l.platform) subtitle,
      concat_ws(' ',l.why,l.body_markdown,l.how_to_start,l.location) content_text,
      '{}'::jsonb metadata,l.updated_at source_updated_at
    from public.leisure_experiences l
    where l.user_id=(select auth.uid()) and l.archived_at is null
      and (p_domains is null or 'leisure'=any(p_domains))
    union all
    select 'briefing','briefing_entry',e.id,f.title,b.briefing_date::text,
      concat_ws(' ',e.summary,e.relevance_reason,e.ranking_metadata #>> '{ai,why_it_matters}',e.ranking_metadata #>> '{ai,key_question}',f.excerpt,f.content_text),
      jsonb_build_object('briefing_id',b.id),greatest(b.updated_at,f.updated_at)
    from public.briefing_entries e
    join public.briefings b on b.id=e.briefing_id and b.user_id=e.user_id
    join public.feed_items f on f.id=e.representative_item_id and f.user_id=e.user_id
    join public.feeds source on source.id=f.feed_id and source.user_id=e.user_id
    where e.user_id=(select auth.uid()) and b.status='completed'
      and f.archived_at is null and source.archived_at is null and source.status<>'archived'
      and (p_domains is null or 'briefing'=any(p_domains))
    union all
    select 'investment','investment_account',a.id,a.name,concat_ws(' · ',a.mode,a.currency),
      coalesce((select string_agg(distinct l.symbol,' ') from public.investment_ledger l where l.account_id=a.id and l.user_id=a.user_id),'') content_text,
      jsonb_build_object('mode',a.mode),a.updated_at
    from public.investment_accounts a
    where a.user_id=(select auth.uid()) and a.archived_at is null
      and (p_domains is null or 'investment'=any(p_domains))
    union all
    select 'investment','investment_strategy_version',s.id,s.title,'策略 v' || s.version::text,s.body_markdown,
      '{}'::jsonb,s.updated_at from public.investment_strategy_versions s
    where s.user_id=(select auth.uid()) and s.archived_at is null
      and (p_domains is null or 'investment'=any(p_domains))
    union all
    select 'investment','investment_research_run',r.id,r.title,concat_ws(' · ',r.kind,r.as_of),r.body_markdown,
      '{}'::jsonb,r.updated_at from public.investment_research_runs r
    where r.user_id=(select auth.uid()) and r.archived_at is null
      and (p_domains is null or 'investment'=any(p_domains))
  ), searchable as (
    select d.domain,d.entity_type,d.entity_id,d.title,d.subtitle,d.content_text,d.metadata,d.source_updated_at,d.search_vector
    from public.search_documents d where d.user_id=(select auth.uid())
    union all
    select x.*, setweight(to_tsvector('simple',x.title),'A') || setweight(to_tsvector('simple',x.subtitle),'B') || setweight(to_tsvector('simple',x.content_text),'C')
    from supplemental x
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
  from searchable s
  cross join query_input q
  where length(q.query_text) between 1 and 200
    and (p_domains is null or s.domain = any(p_domains))
    and (
      s.search_vector @@ plainto_tsquery('simple', q.query_text)
      or s.title ilike '%' || q.escaped_query || '%' escape E'\\'
      or s.content_text ilike '%' || q.escaped_query || '%' escape E'\\'
    )
  order by score desc, s.source_updated_at desc nulls last, s.domain, s.entity_type, s.entity_id
  limit greatest(1, least(p_limit, 50));
$$;

revoke all on function public.search_personal_os(text, integer, text[]) from public;
grant execute on function public.search_personal_os(text, integer, text[]) to authenticated;
