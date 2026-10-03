-- 0104_sitemap_entries.sql
-- The entries the dictionary sitemaps list: lemmas with at least one Vietnamese gloss, about
-- 165,000 on 2026-10-04. An entry with only English definitions is left out, as the word page
-- marks it noindex. Deciding that per request means probing lex.senses for each of the
-- 864,299 entries, which no anon request can finish inside its 3 s cap, so the list is a
-- materialized view numbered for paging, refreshed nightly by pg_cron after the 03:30 UTC
-- backup and by hand after a data load:
--   refresh materialized view concurrently lex.sitemap_entries;

set lock_timeout = '5s';

create materialized view if not exists lex.sitemap_entries as
  select e.id, (row_number() over (order by e.id))::integer as n
  from lex.entries e
  where e.form_of is null
    and exists (select 1 from lex.senses s where s.entry_id = e.id and s.gloss_vi is not null);

create unique index if not exists sitemap_entries_id_idx on lex.sitemap_entries (id);
create unique index if not exists sitemap_entries_n_idx on lex.sitemap_entries (n);

grant select on lex.sitemap_entries to anon, authenticated, service_role;

create or replace function lex.sitemap_count()
returns integer
language sql
stable
set search_path = lex, extensions, public
as $$
  select count(*)::integer from lex.sitemap_entries;
$$;

-- One JSON array rather than a set of rows: PostgREST caps a set at 1,000 rows.
create or replace function lex.sitemap_page(p_page integer, p_size integer default 20000)
returns jsonb
language sql
stable
set search_path = lex, extensions, public
as $$
  select coalesce(jsonb_agg(m.id order by m.n), '[]'::jsonb)
  from lex.sitemap_entries m
  where m.n > greatest(p_page, 0) * least(greatest(p_size, 1), 50000)
    and m.n <= (greatest(p_page, 0) + 1) * least(greatest(p_size, 1), 50000);
$$;

grant execute on function lex.sitemap_count() to anon, authenticated, service_role;
grant execute on function lex.sitemap_page(integer, integer) to anon, authenticated, service_role;

create extension if not exists pg_cron;

select cron.schedule(
  'lex-sitemap-refresh', '45 3 * * *',
  'refresh materialized view concurrently lex.sitemap_entries'
);

notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name)
values ('20261004000104', 'sitemap_entries')
on conflict (version) do nothing;
