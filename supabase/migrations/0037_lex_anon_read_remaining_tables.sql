-- The last three lex tables the anon role cannot read.
--
-- 0003_lex_schema.sql:190-205 gave every lex table a SELECT policy for role
-- `authenticated` and nothing else. 0006, 0007 and 0008 then added the matching
-- anon policies one feature at a time -- entries, senses, pronunciations, examples,
-- lex_relations, characters, inflections -- and 0020 built them into its own loop
-- for the grammar tables. Three tables were never reached.
--
-- This matters because every cached dictionary read runs as anon:
-- `createContentClient` (lib/supabase/content.ts:7-11) builds its client from
-- NEXT_PUBLIC_SUPABASE_ANON_KEY, and every function in lib/dictionary/cached.ts
-- hands it to the query. A table with no anon policy does not raise; it returns
-- zero rows.
--
-- Measured, counting the same tables with the anon key and then the service role:
--
--   lex.sources           anon 0    service 16
--   lex.images            anon 0    service 540
--   lex.entry_characters  anon 0    service 9,077
--
-- Nothing reads them today -- `grep -rn "entry_characters\|from('images')\|source_id"
-- app lib components` returns nothing -- so this fixes no visible bug. It removes a
-- trap: the next feature to touch per-character breakdowns or sense images would get
-- an empty array and a correct-looking page, with no error anywhere to explain it.
--
-- Table-level grants are already in place from 0005_expose_lex_data_api.sql:5, which
-- granted SELECT on every table then present in the schema; all three existed by
-- then. They are repeated here so the file stands on its own.
--
-- To roll back: drop the three policies. Nothing depends on them.
--   drop policy if exists lex_sources_select_anon on lex.sources;
--   drop policy if exists lex_images_select_anon on lex.images;
--   drop policy if exists lex_entry_characters_select_anon on lex.entry_characters;

drop policy if exists lex_sources_select_anon on lex.sources;
create policy lex_sources_select_anon
  on lex.sources for select to anon using (true);

drop policy if exists lex_images_select_anon on lex.images;
create policy lex_images_select_anon
  on lex.images for select to anon using (true);

drop policy if exists lex_entry_characters_select_anon on lex.entry_characters;
create policy lex_entry_characters_select_anon
  on lex.entry_characters for select to anon using (true);

grant select on lex.sources, lex.images, lex.entry_characters to anon, authenticated;
