-- 0199_entry_patterns.sql
-- The sentence patterns of an English entry, as Oxford Learner's Dictionaries prints them
-- ("accuse somebody of something"), shortened to sb and sth, each with its Vietnamese and
-- one example. supabase/scripts/oxford/patterns.py fills it from the crawl in
-- /opt/zhesen/oxford/oxford.jsonl; getEntryDetail reads it with the word page.
--
-- TO ROLL BACK: drop table lex.entry_patterns; delete from lex.sources where id = 'oxford-learners';

set lock_timeout = '5s';

insert into lex.sources (id, name, url, license, tier, notes)
values ('oxford-learners', 'Oxford Learner''s Dictionaries', 'https://www.oxfordlearnersdictionaries.com',
        'proprietary', 'personal', 'verb and adjective patterns; Vietnamese by zhesen batch models')
on conflict (id) do nothing;

create table if not exists lex.entry_patterns (
  entry_id  text primary key references lex.entries(id) on delete cascade,
  patterns  jsonb not null,
  source_id text not null references lex.sources(id)
);

comment on table lex.entry_patterns is
  'zhesen: sentence patterns per entry, [{p, vi, ex, exVi}] in dictionary order: p "accuse sb of sth", vi "buộc tội ai về việc gì", ex one example and exVi its translation, both optional. Filled by supabase/scripts/oxford/patterns.py.';

alter table lex.entry_patterns enable row level security;

drop policy if exists entry_patterns_select on lex.entry_patterns;
create policy entry_patterns_select on lex.entry_patterns for select to anon, authenticated using (true);

grant select on lex.entry_patterns to anon, authenticated;
grant all on lex.entry_patterns to service_role;

-- The word page embeds the table, and PostgREST answers an unknown embed with an error.
notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name)
values ('20261008000199', 'entry_patterns')
on conflict (version) do nothing;
