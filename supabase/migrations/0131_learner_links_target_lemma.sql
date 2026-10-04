-- 0131_learner_links_target_lemma.sql
-- A learner link names the lemma, not an inflected form of it. The learner pipeline resolved
-- `text` to whatever entry spelled it, so take's Spanish equivalent pointed at tenga and the
-- lemma's page never listed take among the layers that mention it. `form_of` is loose (sobre
-- carries form_of sobrar, casa casar), so only a target whose every sense points at its
-- `form_of` ("plural of hora") moves. A link is left where it is when the move would point a
-- layer at its own entry, or at an entry another link of the same sense and kind already names.
-- `text` keeps the spelling the layer wrote.
--
-- Run read-only on production on 2026-10-04: 1,053 links match, 10 would point at their own
-- layer and 53 would repeat a link, so 990 move over 605 targets. lex.learner_links has no
-- unique index besides its primary key.
--
-- lex.learner_links_moved_0131 keeps every old target, so the move reverses with
--   update lex.learner_links ll set target_entry_id = m.old_target_entry_id
--   from lex.learner_links_moved_0131 m where m.link_id = ll.id;
-- A rerun moves nothing twice: the ledger keeps the first old target and the update only
-- touches a link still on it. The pipeline that writes these rows lives outside this repository
-- and must apply the same rule, or its next run brings the forms back. Revalidate the `lex` tag
-- once applied, so the learner caches read the new targets.

set lock_timeout = '5s';

create table if not exists lex.learner_links_moved_0131 (
  link_id             bigint primary key,
  old_target_entry_id text not null,
  new_target_entry_id text not null
);
alter table lex.learner_links_moved_0131 enable row level security;
revoke all on lex.learner_links_moved_0131 from anon, authenticated;

insert into lex.learner_links_moved_0131 (link_id, old_target_entry_id, new_target_entry_id)
select ll.id, ll.target_entry_id, l.id
from lex.learner_links ll
join lex.entries t on t.id = ll.target_entry_id
join lex.entries l on l.id = t.lang::text || ':' || t.form_of
where t.form_of is not null
  and l.id <> ll.entry_id
  and exists (select 1 from lex.senses s where s.entry_id = t.id)
  and not exists (
    select 1 from lex.senses s
    where s.entry_id = t.id
      and lower(coalesce(s.gloss_en, '')) !~ ('\mof\s+'
          || regexp_replace(lower(t.form_of), '([.*+?^${}()|\[\]\\])', '\\\1', 'g')
          || '\s*[.;:)]*\s*$'))
  and not exists (
    select 1 from lex.learner_links o
    where o.entry_id = ll.entry_id and o.kind = ll.kind
      and o.sense_order is not distinct from ll.sense_order
      and o.target_entry_id = l.id and o.id <> ll.id)
on conflict (link_id) do nothing;

update lex.learner_links ll
set target_entry_id = m.new_target_entry_id
from lex.learner_links_moved_0131 m
where m.link_id = ll.id
  and ll.target_entry_id = m.old_target_entry_id;

insert into supabase_migrations.schema_migrations (version, name)
values ('20261004000131', 'learner_links_target_lemma')
on conflict (version) do nothing;
