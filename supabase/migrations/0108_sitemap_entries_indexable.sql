-- 0108_sitemap_entries_indexable.sql
-- List only the entries whose word page lets search engines index it. 0104 listed any entry
-- with a Vietnamese gloss, and the page marks noindex when every gloss is either garbled
-- machine output or Google's translation of a rare word (`entryMetadata`,
-- lib/dictionary/entryMetadata.ts), so Search Console reported "Submitted URL marked noindex".
--
-- A sense counts when its gloss survives `cleanMtGloss` (lib/dictionary/textQuality.ts),
-- restated in SQL: strip the NER label glued after a letter, then reject an empty gloss, a
-- "LongName", a letter-digit-letter run or a lower-to-upper boundary. Over 566 sampled glosses
-- the two agree on every row. It must also not be the rare machine translation that
-- `lex.gloss_terms_reload` (0107) skips. An id holding `%` is left out: its page answers 500
-- while the route cannot decode it.
--
-- The view is built under a second name and swapped in, so the sitemaps never read a missing
-- view while the new one fills. lex.sitemap_count, lex.sitemap_page and the pg_cron job of 0104
-- read the view by name and need no change.
--
-- reviewed-destructive: the owner asked on 2026-10-04 to make the sitemap match the word
-- page's noindex rule; the dropped view holds only rows derived from lex.entries and
-- lex.senses, rebuilt here before the drop.

set lock_timeout = '5s';
set statement_timeout = '900s';

drop materialized view if exists lex.sitemap_entries_next;

create materialized view lex.sitemap_entries_next as
  select e.id, (row_number() over (order by e.id))::integer as n
  from lex.entries e
  where e.form_of is null
    and strpos(e.id, '%') = 0
    and exists (
      select 1
      from lex.senses s
      cross join lateral (
        select regexp_replace(s.gloss_vi, '([[:alpha:]])Name(?=$|[[:space:];,)])', '\1', 'g') as v
      ) t
      where s.entry_id = e.id
        and s.gloss_vi is not null
        and btrim(t.v, E' \t\n\r') <> ''
        and t.v !~ 'LongName|[A-Za-z][0-9][A-Za-z]'
        and t.v !~ '[a-zà-ỹ][A-Z]'
        and not (s.provenance->>'gloss_vi_source' is not distinct from 'mt:google'
                 and e.level is null and coalesce(e.frequency_rank, 2147483647) > 50000)
    );

create unique index sitemap_entries_next_id_idx on lex.sitemap_entries_next (id);
create unique index sitemap_entries_next_n_idx on lex.sitemap_entries_next (n);

begin;
drop materialized view if exists lex.sitemap_entries;
alter materialized view lex.sitemap_entries_next rename to sitemap_entries;
alter index lex.sitemap_entries_next_id_idx rename to sitemap_entries_id_idx;
alter index lex.sitemap_entries_next_n_idx rename to sitemap_entries_n_idx;
grant select on lex.sitemap_entries to anon, authenticated, service_role;
commit;

notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name)
values ('20261004000108', 'sitemap_entries_indexable')
on conflict (version) do nothing;
