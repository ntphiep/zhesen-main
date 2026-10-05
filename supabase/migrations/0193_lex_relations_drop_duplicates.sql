-- 0193_lex_relations_drop_duplicates.sql
-- lex.lex_relations held 1,530 groups of rows with the same entry, target entry and type
-- (3,114 rows). Every group differs only in the case of `related_text`, "Black Forest" beside
-- "black forest", and the word page lists `related_text` as written (classifyRelations,
-- lib/dictionary/relations.ts), so it showed both. One row per group stays: the one spelled as
-- its target's headword, else the lowest id.
--
-- Run in a rolled-back transaction on production on 2026-10-05: 1,584 rows deleted (1,577 from
-- English Wiktionary, 4 OEWN, 3 Spanish Wiktionary), 1,565 of them beside a kept row spelled as
-- its target, no group left, no learner link moved; a replay deleted 0 rows.
--
-- lex.lex_relations_deleted_0193 holds every deleted row with the id kept in its place, and a
-- learner link naming a deleted row moves to the kept one first (none did on 2026-10-05). The
-- apply script fills the ledger, copies it to
-- s3://zhesen-db-backups-014498663963/migrations/lex-relations-duplicates-20261005.csv, then
-- runs this file, so the backup holds exactly the rows deleted. A replay finds no group.
--
-- TO ROLL BACK:
--   insert into lex.lex_relations (id, entry_id, related_entry_id, related_text, relation_type, source_id)
--   select id, entry_id, related_entry_id, related_text, relation_type, source_id
--   from lex.lex_relations_deleted_0193 on conflict (id) do nothing;
-- Revalidate the `lex` tag once applied.
--
-- reviewed-destructive: owner approved deleting duplicate lex_relations rows on 2026-10-05; CSV backup in S3

set lock_timeout = '5s';

create table if not exists lex.lex_relations_deleted_0193 (
  id               bigint primary key,
  entry_id         text not null,
  related_entry_id text not null,
  related_text     text,
  relation_type    text not null,
  source_id        text,
  kept_id          bigint not null
);
alter table lex.lex_relations_deleted_0193 enable row level security;
revoke all on lex.lex_relations_deleted_0193 from anon, authenticated;

insert into lex.lex_relations_deleted_0193 (id, entry_id, related_entry_id, related_text, relation_type, source_id, kept_id)
select d.id, d.entry_id, d.related_entry_id, d.related_text, d.relation_type, d.source_id, d.kept_id
from (
  select x.*, first_value(x.id) over w as kept_id, row_number() over w as k
  from lex.lex_relations x
  join lex.entries t on t.id = x.related_entry_id
  where (x.entry_id, x.related_entry_id, x.relation_type) in (
    select entry_id, related_entry_id, relation_type
    from lex.lex_relations
    where related_entry_id is not null
    group by 1, 2, 3
    having count(*) > 1)
  window w as (partition by x.entry_id, x.related_entry_id, x.relation_type
               order by coalesce(x.related_text = t.headword, false) desc, x.id)
) d
where d.k > 1
on conflict (id) do nothing;

update lex.learner_links ll
set relation_id = d.kept_id
from lex.lex_relations_deleted_0193 d
where ll.relation_id = d.id;

delete from lex.lex_relations r
using lex.lex_relations_deleted_0193 d
where r.id = d.id;

insert into supabase_migrations.schema_migrations (version, name)
values ('20261005000193', 'lex_relations_drop_duplicates')
on conflict (version) do nothing;
