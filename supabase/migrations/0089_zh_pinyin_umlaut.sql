-- CC-CEDICT writes ü as "u:", and 31 Chinese entries kept it in attributes.pinyin and in
-- their zh-pinyin pronunciation: 旅行 read "lǔ: xíng", 战略 "zhàn lu:è", 女 "nǔ:". The
-- page showed the colon, and pinyin_toneless held "lu:xing", so a search for "lvxing" or
-- "luxing" missed it. Idempotent: a row without "u:" is left as it is.

create or replace function pg_temp.umlaut(p text) returns text language sql immutable as $$
  select replace(replace(replace(replace(replace(p, 'ǔ:', 'ǚ'), 'ù:', 'ǜ'), 'ú:', 'ǘ'), 'ū:', 'ǖ'), 'u:', 'ü')
$$;

update lex.entries
set attributes = jsonb_set(attributes, '{pinyin}', to_jsonb(pg_temp.umlaut(attributes->>'pinyin')))
where lang = 'zh' and attributes->>'pinyin' ~ '[uǔùúū]:';

update lex.pronunciations
set ipa = pg_temp.umlaut(ipa)
where accent = 'zh-pinyin' and ipa ~ '[uǔùúū]:';

insert into supabase_migrations.schema_migrations (version, name)
values ('20260929000089', 'zh_pinyin_umlaut')
on conflict (version) do nothing;
