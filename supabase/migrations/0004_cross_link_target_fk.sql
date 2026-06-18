-- Phase 3 fix: cross_language_links target columns are forward references.
-- A link from en:dog to es:perro / zh:犬 is created while loading English, long
-- before the Spanish/Chinese entries exist. So to_entry_id / to_sense_id must NOT
-- be FK-constrained (the concept_id / Wikidata QID is the durable link). The source
-- side (from_entry_id, from_sense_id) keeps its FK — we always control that entry.
alter table lex.cross_language_links
  drop constraint if exists cross_language_links_to_entry_id_fkey;
alter table lex.cross_language_links
  drop constraint if exists cross_language_links_to_sense_id_fkey;
