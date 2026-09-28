-- 0083_drop_entry_characters.sql
-- Drop `lex.entry_characters` and the tracking query on Commons audio URLs (#30).
--
-- `lex.entry_characters` held 9,077 rows, one per character of a Chinese headword. Nothing
-- in the app reads it, no view or function depends on it, and every row can be rebuilt
-- from `lex.entries.headword` and `lex.characters`. zhesen-pipeline stopped writing it in
-- its #30 commit, which shipped before this file ran. A COPY of the rows is in
-- s3://zhesen-infra-assets-014498663963/data-loads/entry_characters-20260929.csv.
--
-- Three Spanish `audio_url` values still ended in `?utm_source=en.wiktionary.org&...`;
-- the file is the same without it, and the pipeline now strips it at parse time.
--
-- TO ROLL BACK: recreate the table from 0037 and 0061 and `\copy` the CSV above back in.
--
-- reviewed-destructive: Harry Nguyen. The owner approved removing the unused table in #30;
-- its rows are derived and backed up above.

update lex.pronunciations
set audio_url = split_part(audio_url, '?', 1)
where audio_url like '%?utm\_%';

-- Dropping its foreign keys locks lex.entries and lex.characters; behind a long load that
-- lock would queue every lookup, so give up instead of waiting.
set lock_timeout = '5s';
drop table if exists lex.entry_characters;

insert into supabase_migrations.schema_migrations (version, name)
values ('20260929000004', 'drop_entry_characters')
on conflict (version) do nothing;
