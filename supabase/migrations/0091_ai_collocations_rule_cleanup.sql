-- 0091_ai_collocations_rule_cleanup.sql
-- Bring the model-written collocations in line with the rule the enrichment prompt now
-- states: a collocation contains its headword as a whole word, and a name has none.
--
-- The rule reached the prompt after most rows were written, largely by gpt-oss-120b, and
-- nothing checked the rows already stored. Of 91,706 zhesen-ai collocations, Spanish ones
-- hung off entries that are only a name ("ir a singapur", "llamar a joel"), and English and
-- Spanish ones missed their headword ("una desigualdad social" under desigual, "restful
-- service" under REST). Chinese had none of either.
--
-- A phrase that holds an inflected or clitic form of the headword stays: "living
-- conditions" under condition, "imponerse a alguien" under imponer. A phrase under an
-- inflected form that holds the lemma moves to the lemma, unless the lemma already lists
-- it. Every other one goes, and so does its phrase entry when nothing else uses it: no other
-- relation, saved word, learner link, learner layer or grammar point, and not owned by a
-- learner layer.
--
-- Applied on production on 2026-09-29: 1,348 relations went (189 English, 1,159 Spanish),
-- none moved, and 1,161 phrase entries went; 90,358 collocations remain.
--
-- TO ROLL BACK: restore entries.csv, senses.csv and examples.csv, then lex_relations.csv,
-- from s3://zhesen-db-backups-014498663963/manual/ai-collocations-0091/.
--
-- reviewed-destructive: Harry Nguyen. The owner asked on 2026-09-29 for the wrong
-- collocations to be fixed at the root; every row is backed up above and none belongs to a
-- learner layer.

set lock_timeout = '5s';

create temp table col0091 as
with col as (
  select r.id, r.entry_id, r.related_entry_id, lower(r.related_text) as t, e.lang, e.form_of,
    '(^|[^[:alnum:]])' || regexp_replace(lower(e.headword), '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') as h,
    '(^|[^[:alnum:]])' || regexp_replace(lower(coalesce(e.form_of, '')), '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g')
      || '($|[^[:alnum:]])' as lemma,
    not exists (select 1 from lex.senses s where s.entry_id = e.id and coalesce(s.pos, '') <> 'name')
      and exists (select 1 from lex.senses s where s.entry_id = e.id) as name_only
  from lex.lex_relations r join lex.entries e on e.id = r.entry_id
  where r.relation_type = 'collocation' and r.source_id = 'zhesen-ai' and e.lang in ('en', 'es')
)
select id, entry_id, related_entry_id, t, lang,
  case
    when name_only then 'drop'
    when t ~ (h || '($|[^[:alnum:]])') then 'keep'
    when t ~ (h || '(s|es|se|me|te|nos|os|le|les|lo|la|los|las)($|[^[:alnum:]])') then 'keep'
    when form_of is not null and t ~ lemma
      and exists (select 1 from lex.entries l where l.id = lang || ':' || form_of) then 'move'
    else 'drop'
  end as action,
  lang || ':' || form_of as lemma_id
from col;
delete from col0091 where action = 'keep';

-- A move onto a lemma that already lists the phrase is a drop.
update col0091 c set action = 'drop'
where c.action = 'move' and exists (
  select 1 from lex.lex_relations r
  where r.entry_id = c.lemma_id and r.relation_type = 'collocation' and lower(r.related_text) = c.t);

update lex.lex_relations r set entry_id = c.lemma_id
from col0091 c where r.id = c.id and c.action = 'move';

delete from lex.lex_relations r using col0091 c where r.id = c.id and c.action = 'drop';

delete from lex.entries e
using (select distinct related_entry_id as id from col0091 where action = 'drop' and related_entry_id is not null) d
where e.id = d.id and e.entry_type = 'collocation' and e.source_id = 'zhesen-ai'
  and not e.provenance ? 'learner_owner'
  and not exists (select 1 from lex.lex_relations x where x.related_entry_id = e.id or x.entry_id = e.id)
  and not exists (select 1 from public.user_words w where w.entry_id = e.id)
  and not exists (select 1 from lex.learner_links l where l.target_entry_id = e.id)
  and not exists (select 1 from lex.learner_entries l where l.entry_id = e.id)
  and not exists (select 1 from lex.sense_labels l where l.lemma_entry_id = e.id)
  and not exists (select 1 from lex.grammar_point_entries g where g.entry_id = e.id);

drop table col0091;

insert into supabase_migrations.schema_migrations (version, name)
values ('20260929000091', 'ai_collocations_rule_cleanup')
on conflict (version) do nothing;
