-- 0192_phrasal_verb_levels.sql
-- The phrasal verbs of 40 common verbs (take up, get on, look after) carried no level, and the
-- enrich job only takes levelled entries, so none had its senses glossed, its examples
-- translated or its level checked. Each now takes an estimated level one band above its base
-- verb, capped at C1: get is A1, so get on is A2. `provenance.level` names the rule, so the row tells this estimate from
-- a frequency one, and the update touches only a phrasal verb with no level, so a replay or a
-- level set later by hand is left alone.
--
-- Run in a rolled-back transaction on production on 2026-10-05: all 383 took a level (A2 234,
-- B1 59, B2 72, C1 18; every base verb has one) and a replay updated 0 rows. A level is only as
-- good as its base verb's: en:take is B1 and en:make B2 in `lex.entries`, so take up is B2.
--
-- TO ROLL BACK:
--   update lex.entries set level = null, level_is_estimated = false, provenance = provenance - 'level'
--   where provenance->>'level' = 'phrasal-base-verb';
-- Revalidate the `lex` tag once applied.

set lock_timeout = '5s';

update lex.entries e
set level = case b.level when 'A1' then 'A2' when 'A2' then 'B1' when 'B1' then 'B2' else 'C1' end,
    level_is_estimated = true,
    provenance = e.provenance || jsonb_build_object('level', 'phrasal-base-verb')
from lex.entries b
where e.lang = 'en'
  and e.entry_type in ('phrase', 'idiom', 'word')
  and e.level is null
  and e.headword ~ '^(take|get|go|put|come|look|give|make|turn|set|run|bring|break|keep|pick|cut|fall|hold|carry|work|find|call|check|fill|figure|show|sit|stand|throw|wake|grow|hang|let|pass|pay|pull|shut|sort|switch|try) (up|down|in|out|on|off|over|away|back|through|around|about|along|after|for|into|by)$'
  and b.id = 'en:' || split_part(e.headword, ' ', 1)
  and b.level is not null;

insert into supabase_migrations.schema_migrations (version, name)
values ('20261005000192', 'phrasal_verb_levels')
on conflict (version) do nothing;
