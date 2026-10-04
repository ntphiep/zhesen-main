-- 0131_learner_links_target_lemma.sql
-- A learner link names the lemma, not an inflected form of it. lex.learner_load resolves
-- `text` to whatever entry spells it, so take's Spanish equivalent pointed at tenga and the
-- lemma's page never listed take among the layers that mention it. `form_of` is loose (sobre
-- carries form_of sobrar, casa casar), so lex.form_only_lemma names the lemma only when every
-- sense of the target is a pointer to its `form_of` ("plural of hora") or a line of grammar
-- labels under such a pointer (tenga: "inflection of tener:", then "first/third-person singular
-- present subjunctive"). A link is left where it is when the move would point a layer at its
-- own entry, or at an entry another link of the same sense and kind already names. `text`
-- keeps the spelling the layer wrote.
--
-- The existing links move once, below; a row trigger applies the same rule to every link the
-- batch writes after this. The trigger function is volatile, so it sees the links its statement
-- inserted before the current row (https://www.postgresql.org/docs/17/trigger-datachanges.html).
--
-- Run in a rolled-back transaction on production on 2026-10-04: 1,112 links match, 10 would
-- point at their own layer, 59 would repeat a link and 17 are a second form of a lemma the same
-- sense already moves to, so 1,026 move over 639 targets and no duplicate link is created.
-- lex.learner_links has no unique index besides its primary key.
--
-- lex.learner_links_moved_0131 keeps every old target, so the move reverses with
--   update lex.learner_links ll set target_entry_id = m.old_target_entry_id
--   from lex.learner_links_moved_0131 m where m.link_id = ll.id;
-- after dropping the trigger learner_links_to_lemma. A rerun moves nothing twice: the ledger
-- keeps the first old target and the update only touches a link still on it. Revalidate the
-- `lex` tag once applied, so the learner caches read the new targets.

set lock_timeout = '5s';

create or replace function lex.form_only_lemma(p_entry_id text)
returns text
language sql
stable
set search_path = lex, extensions, public
as $$
  with t as (
    select t.id, l.id as lemma,
           '\mof\s+' || regexp_replace(lower(t.form_of), '([.*+?^${}()|\[\]\\])', '\\\1', 'g')
             || '\s*[.;:)]*\s*$' as pointer
    from lex.entries t
    join lex.entries l on l.id = t.lang::text || ':' || t.form_of
    where t.id = p_entry_id and t.form_of is not null
  )
  select t.lemma
  from t
  where exists (select 1 from lex.senses s where s.entry_id = t.id and lower(coalesce(s.gloss_en, '')) ~ t.pointer)
    and not exists (
      select 1 from lex.senses s
      where s.entry_id = t.id
        and lower(coalesce(s.gloss_en, '')) !~ t.pointer
        and lower(coalesce(s.gloss_en, '')) !~ ('^\s*((first|second|third|person|singular|plural|present|past'
          '|preterite|imperfect|future|conditional|subjunctive|indicative|imperative|affirmative|negative|formal'
          '|informal|participle|gerund|masculine|feminine|neuter|and|or|simple|compound)[\s,/-]*)+[.;:]?\s*$'));
$$;

create table if not exists lex.learner_links_moved_0131 (
  link_id             bigint primary key,
  old_target_entry_id text not null,
  new_target_entry_id text not null
);
alter table lex.learner_links_moved_0131 enable row level security;
revoke all on lex.learner_links_moved_0131 from anon, authenticated;

-- Two forms of one lemma in the same sense and kind (tengo, tenga) move only the first.
insert into lex.learner_links_moved_0131 (link_id, old_target_entry_id, new_target_entry_id)
select distinct on (ll.entry_id, ll.kind, ll.sense_order, m.lemma) ll.id, ll.target_entry_id, m.lemma
from lex.learner_links ll
cross join lateral (select lex.form_only_lemma(ll.target_entry_id) as lemma) m
where exists (select 1 from lex.entries t where t.id = ll.target_entry_id and t.form_of is not null)
  and m.lemma is not null
  and m.lemma <> ll.entry_id
  and not exists (
    select 1 from lex.learner_links o
    where o.entry_id = ll.entry_id and o.kind = ll.kind
      and o.sense_order is not distinct from ll.sense_order
      and o.target_entry_id = m.lemma and o.id <> ll.id)
order by ll.entry_id, ll.kind, ll.sense_order, m.lemma, ll.id
on conflict (link_id) do nothing;

update lex.learner_links ll
set target_entry_id = m.new_target_entry_id
from lex.learner_links_moved_0131 m
where m.link_id = ll.id
  and ll.target_entry_id = m.old_target_entry_id;

create or replace function lex.learner_link_to_lemma()
returns trigger
language plpgsql
set search_path = lex, extensions, public
as $$
declare
  v_lemma text := lex.form_only_lemma(new.target_entry_id);
begin
  if v_lemma is not null and v_lemma <> new.entry_id and not exists (
    select 1 from lex.learner_links o
    where o.entry_id = new.entry_id and o.kind = new.kind
      and o.sense_order is not distinct from new.sense_order
      and o.target_entry_id = v_lemma) then
    new.target_entry_id := v_lemma;
  end if;
  return new;
end;
$$;

create or replace trigger learner_links_to_lemma
before insert on lex.learner_links
for each row when (new.target_entry_id is not null)
execute function lex.learner_link_to_lemma();

insert into supabase_migrations.schema_migrations (version, name)
values ('20261004000131', 'learner_links_target_lemma')
on conflict (version) do nothing;
