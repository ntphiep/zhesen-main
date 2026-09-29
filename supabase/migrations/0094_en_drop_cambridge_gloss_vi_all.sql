-- 0094_en_drop_cambridge_gloss_vi_all.sql
-- Removes attributes.gloss_vi_all from the English entries whose Vietnamese gloss came
-- from Cambridge.
--
-- zhesen-pipeline `merge.py` stored every Vietnamese gloss scraped from
-- dictionary.cambridge.org in that key, and the English build carried the list forward from
-- production on each run. Nothing in the app or in any `lex` function reads it: the site
-- reads `attributes.pinyin` and `attributes.gender` only, and `lex.gloss_terms` is derived
-- from `lex.senses`. The 15,190 arrays hold 154,606 strings, 121,567 of them in no sense of
-- their entry. The Cambridge gloss on each entry's first sense, its examples and its IPA stay,
-- because the word page shows them.
--
-- Backup: s3://zhesen-infra-assets-014498663963/data-loads/cambridge-gloss-vi-all-20260929.csv
-- (id, gloss_vi_all), restored by cambridge-gloss-vi-all-undo.sql beside it.

set lock_timeout = '5s';

update lex.entries
set attributes = attributes - 'gloss_vi_all'
where provenance->>'gloss_vi' = 'cambridge' and attributes ? 'gloss_vi_all';

insert into supabase_migrations.schema_migrations (version, name)
values ('20260929000094', 'en_drop_cambridge_gloss_vi_all')
on conflict (version) do nothing;
