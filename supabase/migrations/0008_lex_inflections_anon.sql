-- 0008_lex_inflections_anon.sql
-- anon SELECT for lex.inflections so the public dictionary can show the word family
-- (inflected forms). Mirrors the anon read policies added in 0006/0007. Idempotent.

drop policy if exists lex_inflections_select_anon on lex.inflections;
create policy lex_inflections_select_anon on lex.inflections for select to anon using (true);
