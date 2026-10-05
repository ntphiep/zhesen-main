-- 0191_levels_source_spelling.sql
-- A level belongs to the spelling its source measured. Case variants share
-- `headword_normalized`, and the frequency estimate is computed on that lowercased form, so
-- every variant inherited it: en:RuSSian (a derogatory spelling) sat at A1 beside Russian,
-- MRS (marginal rate of substitution) at A1 beside Mrs, cM and LISA at B1. The Spanish A1 list
-- carried Osaka, Óscar, Pablo, Países Bajos and PC, which the model-estimated levels gave to
-- names and initialisms.
--
-- Fixed in `lex.entries.level` rather than in the list query, because the column is what every
-- reader takes: the level lists and their counts (lib/dictionary/levels.ts,
-- lex.count_entries_by_level), the levelled common-words strip (lib/dictionary/search.ts), the
-- word page's level badge, the sitemap's rare-gloss rule and the enrich job's queue. A filter in
-- one query would leave the others disagreeing.
--
-- Two rules, over English and Spanish; a level from a word list (CEFR-J, Octanove, HSK) is
-- never cleared, so DVD and DJ keep CEFR-J's level:
-- 1. Among entries sharing `headword_normalized`, the level stays on the word-list entry, else
--    the lowercase spelling (wordfreq counts lowercase), else the sentence-case one, else the
--    all-caps one; every other variant loses it, so cM loses it beside CM.
-- 2. Outside a word list, an entry whose every sense is a name, or whose headword is an all-caps
--    initialism of two letters or more, loses its level.
--
-- Run in a rolled-back transaction on production on 2026-10-05: 2,429 levels cleared (en 115
-- case variants, 1,442 initialisms, 70 names; es 78, 203 and 521), English A1 1,058 to 1,052,
-- Spanish A1 1,053 to 819. A replay inserted and updated 0 rows.
--
-- lex.entries_level_cleared_0191 keeps each cleared level, so the change reverses with
--   update lex.entries e set level = c.level, level_is_estimated = c.level_is_estimated
--   from lex.entries_level_cleared_0191 c where c.entry_id = e.id and e.level is null;
-- The update only touches a row that still holds a level, so a replay clears nothing twice.
-- Revalidate the `lex` tag once applied.

set lock_timeout = '5s';

create table if not exists lex.entries_level_cleared_0191 (
  entry_id           text primary key,
  level              text not null,
  level_is_estimated boolean,
  reason             text not null
);
alter table lex.entries_level_cleared_0191 enable row level security;
revoke all on lex.entries_level_cleared_0191 from anon, authenticated;

with lv as (
  select e.id, e.level, e.level_is_estimated,
         coalesce(e.provenance->>'level', '') in ('cefrj-vocabulary', 'cefrj-octanove-c1c2', 'hsk30') as listed,
         case when coalesce(e.provenance->>'level', '') in ('cefrj-vocabulary', 'cefrj-octanove-c1c2', 'hsk30') then 0
              when e.headword = lower(e.headword) then 1
              when e.headword = upper(left(e.headword, 1)) || lower(substr(e.headword, 2)) then 2
              when e.headword = upper(e.headword) then 3
              else 4 end as spelling,
         e.headword = upper(e.headword) and length(regexp_replace(e.headword, '[^[:alpha:]]', '', 'g')) >= 2 as caps,
         (select bool_and(coalesce(s.pos, '') in ('name', 'proper_noun')) from lex.senses s where s.entry_id = e.id) as named,
         e.lang, e.headword_normalized
  from lex.entries e
  where e.lang in ('en', 'es') and e.level is not null
), cleared as (
  select lv.id, lv.level, lv.level_is_estimated,
         case when lv.spelling > min(lv.spelling) over (partition by lv.lang, lv.headword_normalized) then 'case variant'
              when not lv.listed and lv.caps then 'initialism'
              when not lv.listed and lv.named then 'name' end as reason
  from lv
)
insert into lex.entries_level_cleared_0191 (entry_id, level, level_is_estimated, reason)
select id, level, level_is_estimated, reason
from cleared
where reason is not null
on conflict (entry_id) do nothing;

update lex.entries e
set level = null
from lex.entries_level_cleared_0191 c
where c.entry_id = e.id
  and e.level = c.level;

insert into supabase_migrations.schema_migrations (version, name)
values ('20261005000191', 'levels_source_spelling')
on conflict (version) do nothing;
