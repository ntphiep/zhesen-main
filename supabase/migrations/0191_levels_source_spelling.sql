-- 0191_levels_source_spelling.sql
-- A level belongs to the spelling its source measured. Case variants share
-- `headword_normalized`, and the frequency estimate is computed on that lowercased form, so
-- every variant inherited it: en:RuSSian (a derogatory spelling) sat at A1 beside Russian,
-- MRS (marginal rate of substitution) at A1 beside Mrs, cM and LISA at B1. The Spanish A1 list
-- carried Óscar, Pablo and PC, which the model-estimated levels gave to personal names and
-- initialisms.
--
-- Fixed in `lex.entries.level` rather than in the list query, because the column is what every
-- reader takes: the level lists and their counts (lib/dictionary/levels.ts,
-- lex.count_entries_by_level), the levelled common-words strip (lib/dictionary/search.ts), the
-- word page's level badge, the sitemap's rare-gloss rule and the enrich job's queue. A filter in
-- one query would leave the others disagreeing.
--
-- Two rules, over English and Spanish; a level from a word list (CEFR-J, Octanove, HSK) is
-- never cleared, so DVD and DJ keep CEFR-J's level:
-- 1. Among entries sharing `headword_normalized`, the level stays on the spelling its source
--    names: a word list or the model estimate (`zhesen-ai`) names one entry, so es:Berlín keeps
--    A1 and es:berlín (a doughnut) loses its frequency level. Without one, the lowercase
--    spelling keeps it (wordfreq counts lowercase), else the sentence-case one, else the
--    all-caps one; every other variant loses it, so cM loses it beside CM.
-- 2. Outside a word list, an all-caps initialism of two letters or more loses its level, and so
--    does a personal name: every sense a name, one a given name or surname, none a place.
--    Countries, continents and cities keep theirs (España, Europa, Osaka); Pablo does not.
--
-- Run in a rolled-back transaction on production on 2026-10-06: 2,037 levels cleared (en 41
-- case variants, 1,516 initialisms, 24 personal names; es 75, 207 and 174), English A1 1,058 to
-- 1,054, Spanish A1 1,053 to 961. A replay clears nothing, and a level restored by hand stays.
--
-- lex.entries_level_cleared_0191 keeps each cleared level, so the change reverses with
--   update lex.entries e set level = c.level, level_is_estimated = c.level_is_estimated
--   from lex.entries_level_cleared_0191 c where c.entry_id = e.id and e.level is null;
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
         case when coalesce(e.provenance->>'level', '') in ('cefrj-vocabulary', 'cefrj-octanove-c1c2', 'hsk30', 'zhesen-ai') then 0
              when e.headword = lower(e.headword) then 1
              when e.headword = upper(left(e.headword, 1)) || lower(substr(e.headword, 2)) then 2
              when e.headword = upper(e.headword) then 3
              else 4 end as spelling,
         e.headword = upper(e.headword) and length(regexp_replace(e.headword, '[^[:alpha:]]', '', 'g')) >= 2 as caps,
         (select bool_and(coalesce(s.pos, '') in ('name', 'proper_noun'))
                 and bool_or(coalesce(s.gloss_en, '') ~* '\m(given name|surname|forename|nickname|diminutive)')
                 and not bool_or(coalesce(s.gloss_en, '') ~* '\m(city|town|country|capital|province|state|region|island|continent|river)\M')
          from lex.senses s where s.entry_id = e.id) as named,
         e.lang, e.headword_normalized
  from lex.entries e
  where e.lang in ('en', 'es') and e.level is not null
), own as (
  select lv.*,
         case when not lv.listed and lv.caps then 'initialism'
              when not lv.listed and lv.named then 'name' end as reason
  from lv
), cleared as (
  -- A personal name does not take the level from another variant, so it does not cost a
  -- lowercase word its level; an initialism does (cM loses beside CM).
  select own.id, own.level, own.level_is_estimated,
         coalesce(own.reason,
           case when own.spelling > min(own.spelling) filter (where own.reason is distinct from 'name')
                                      over (partition by own.lang, own.headword_normalized)
                then 'case variant' end) as reason
  from own
), ledger as (
  -- Only a row this run records is cleared, so a replay leaves a restored level alone.
  insert into lex.entries_level_cleared_0191 (entry_id, level, level_is_estimated, reason)
  select id, level, level_is_estimated, reason
  from cleared
  where reason is not null
  on conflict (entry_id) do nothing
  returning entry_id, level
)
update lex.entries e
set level = null
from ledger c
where c.entry_id = e.id
  and e.level = c.level;

insert into supabase_migrations.schema_migrations (version, name)
values ('20261005000191', 'levels_source_spelling')
on conflict (version) do nothing;
