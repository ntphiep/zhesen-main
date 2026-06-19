-- 0007_lex_lookup_anon.sql
-- Allow anonymous (cookieless) read of character + cross-language data so the
-- dictionary detail page can be served by the cached content client (role anon).
-- Mirrors the anon SELECT policies added in 0006 for entries/senses/etc.

drop policy if exists "lex_characters_select_anon" on lex.characters;
create policy "lex_characters_select_anon"
  on lex.characters for select to anon using (true);

drop policy if exists "lex_cross_language_links_select_anon" on lex.cross_language_links;
create policy "lex_cross_language_links_select_anon"
  on lex.cross_language_links for select to anon using (true);
