-- 0194_learner_links_resolve_targets.sql
-- A learner layer's equivalents and synonyms name a word in a language, and lex.learner_load
-- links each to the entry spelled that way when it loads. An entry added after the load stays
-- unlinked: 27% of equivalents and 46% of Chinese synonyms had no target, so the word page
-- printed them as plain text and the target's page never listed the layer that mentions it.
--
-- A link without a target now takes the entry of its language whose `headword_normalized` is
-- its lowercased text, when exactly one entry matches (learner_load picks among several; this
-- leaves them). As 0131 rules, a form-only entry gives way to its lemma, and a link is left
-- where it is when the target would be its own entry or one another link of the same sense and
-- kind already names; of two links in one sense and kind that resolve alike, the first moves.
--
-- Run in a rolled-back transaction on production on 2026-10-05: 3,412 links resolved
-- (equivalents en 33, es 2,502, zh 152; synonyms en 33, es 613, zh 79), none to a lemma, none
-- repeating a link. Equivalents without a target go from 13,665 to 10,978 and Chinese synonyms
-- from 2,496 to 2,417: the rest name a word no entry spells. A replay resolved 0.
--
-- lex.learner_links_resolved_0194 keeps every link it resolved, so the change reverses with
--   update lex.learner_links ll set target_entry_id = null
--   from lex.learner_links_resolved_0194 r where r.link_id = ll.id and ll.target_entry_id = r.target_entry_id;
-- The update only touches a link still without a target, so a replay resolves nothing twice.
-- Revalidate the `lex` tag once applied.

set lock_timeout = '5s';

create table if not exists lex.learner_links_resolved_0194 (
  link_id         bigint primary key,
  target_entry_id text not null
);
alter table lex.learner_links_resolved_0194 enable row level security;
revoke all on lex.learner_links_resolved_0194 from anon, authenticated;

insert into lex.learner_links_resolved_0194 (link_id, target_entry_id)
select distinct on (r.entry_id, r.kind, r.sense_order, r.dest) r.id, r.dest
from (
  select m.*, coalesce(lex.form_only_lemma(m.target), m.target) as dest
  from (
    select ll.id, ll.entry_id, ll.kind, ll.sense_order, min(t.id) as target
    from lex.learner_links ll
    join lex.entries t on t.lang = ll.lang and t.headword_normalized = lower(btrim(ll.text))
    where ll.kind in ('equivalent', 'synonym') and ll.target_entry_id is null
    group by ll.id, ll.entry_id, ll.kind, ll.sense_order
    having count(*) = 1
  ) m
) r
where r.dest <> r.entry_id
  and not exists (
    select 1 from lex.learner_links o
    where o.entry_id = r.entry_id and o.kind = r.kind
      and o.sense_order is not distinct from r.sense_order
      and o.target_entry_id = r.dest)
order by r.entry_id, r.kind, r.sense_order, r.dest, r.id
on conflict (link_id) do nothing;

update lex.learner_links ll
set target_entry_id = r.target_entry_id
from lex.learner_links_resolved_0194 r
where r.link_id = ll.id
  and ll.target_entry_id is null
  and exists (select 1 from lex.entries e where e.id = r.target_entry_id);

insert into supabase_migrations.schema_migrations (version, name)
values ('20261005000194', 'learner_links_resolve_targets')
on conflict (version) do nothing;
