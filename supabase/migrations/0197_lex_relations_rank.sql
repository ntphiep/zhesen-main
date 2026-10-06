-- 0197_lex_relations_rank.sql
-- The order a word page lists one entry's relations of one type in. English Wiktionary gives
-- big 296 synonyms in no order, and the page opened with consequential, broad, behemothic and
-- torrid. scripts/relationRank/build.mjs fills it for English synonyms and antonyms: the ones
-- Open English WordNet agrees with first, then single words, then the more frequent word.
-- getEntryDetail (lib/dictionary/entryDetail.ts) reads relations by rank, then by id, so an
-- unranked row keeps the order it was loaded in.
--
-- TO ROLL BACK: alter table lex.lex_relations drop column rank;

set lock_timeout = '5s';

alter table lex.lex_relations add column if not exists rank smallint;

comment on column lex.lex_relations.rank is
  'zhesen: position among the entry''s relations of this type, 1 first. Null keeps load order. Filled by scripts/relationRank/build.mjs.';

insert into supabase_migrations.schema_migrations (version, name)
values ('20261006000197', 'lex_relations_rank')
on conflict (version) do nothing;
