-- 0074_relation_senses.sql
-- `lex.relation_senses` says which meaning of a word each synonym belongs to.
--
-- `lex.lex_relations` stores a synonym against the whole entry, so the word page listed
-- take's 298 synonyms in one run. A synonym belongs to the sense whose Vietnamese gloss
-- shares a term with one of the synonym's own glosses in `lex.gloss_terms`: hold, grip and
-- seize meet take's sense 1 on "cầm", capture and grab its sense 2 on "chiếm". Only senses
-- up to sense_order 12 take part, which bounds the join on an entry with 104. Measured with
-- this body: en:take matched 31 of 298 in 382 ms cold and 12 ms warm, en:happy 18 in
-- 123 ms, en:head (1,569 relations) 5 in 181 ms. Spanish and Chinese entries carry no
-- synonym rows and return nothing.
--
-- TO ROLL BACK: drop function lex.relation_senses(text). Nothing else depends on it; the
-- page treats a failed call as no match.

create or replace function lex.relation_senses(p_entry_id text)
returns table (related_text text, sense_order int, target_id text)
language sql
stable
set search_path = lex, extensions, public
as $$
  with head as (
    select e.lang from lex.entries e where e.id = p_entry_id
  ), rel as (
    select distinct r.related_text
    from lex.lex_relations r
    where r.entry_id = p_entry_id
      and r.relation_type in ('synonym', 'similar')
      and r.related_text is not null
  ), tgt as (
    select rel.related_text, t.id
    from rel, head
    cross join lateral (
      select e.id from lex.entries e
      where e.lang = head.lang and e.headword_normalized = lower(rel.related_text)
      order by e.frequency_rank nulls last
      limit 1
    ) t
  )
  select tgt.related_text, min(g.sense_order)::int, tgt.id
  from tgt
  join lex.gloss_terms t on t.entry_id = tgt.id
  join lex.gloss_terms g on g.entry_id = p_entry_id and g.term = t.term and g.sense_order <= 12
  group by tgt.related_text, tgt.id;
$$;

grant execute on function lex.relation_senses(text) to anon, authenticated, service_role;

insert into supabase_migrations.schema_migrations (version, name)
values ('20260926000009', 'relation_senses')
on conflict (version) do nothing;
