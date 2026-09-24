-- 0061_data_dictionary.sql
-- A comment on every table and column the project owns, and `admin.dictionary()`, which
-- returns them with the live shape of each table for /admin/data. `admin.metrics()` gains
-- the numbers the overview leads with.
--
-- The catalogue is the one place both readers look: Studio renders these comments next to
-- each table and column, and the admin page reads the same text, so the two cannot drift.
-- The four comments 0041 wrote on public tables stay as they are.
--
-- TO ROLL BACK: `drop function admin.dictionary();` and replay 0056's admin.metrics().
-- The comments are harmless to keep; `comment on ... is null` removes one.

comment on schema admin is
  'zhesen: the admin console. Every function is SECURITY DEFINER and calls admin.assert_admin() first.';

-- lex.sources
comment on table lex.sources is
  'zhesen: one row per upstream dataset the dictionary was built from, with its licence. Every lex row names its source through source_id.';
comment on column lex.sources.id is 'Stable slug, e.g. wiktionary-en, cc-cedict, hsk30.';
comment on column lex.sources.name is 'Human-readable name of the dataset.';
comment on column lex.sources.url is 'Where the dataset is published.';
comment on column lex.sources.license is 'Licence the data is used under, e.g. CC BY-SA 4.0.';
comment on column lex.sources.tier is 'open: may be shown publicly. personal: kept for the owner only and never served to other readers.';
comment on column lex.sources.notes is 'Free-text caveats about the dataset or its licence.';

-- lex.entries
comment on table lex.entries is
  'zhesen: one headword in one language (en, es or zh). The root every other lex table hangs off.';
comment on column lex.entries.id is 'Primary key, "<lang>:<headword>", e.g. en:dumpster, zh:的.';
comment on column lex.entries.lang is 'Language code: en, es or zh. References public.languages.';
comment on column lex.entries.entry_type is 'word, phrase, idiom or collocation.';
comment on column lex.entries.headword is 'The headword as written; simplified characters for Chinese.';
comment on column lex.entries.headword_normalized is 'Lower-cased headword used for exact and prefix lookup. Keeps Spanish diacritics.';
comment on column lex.entries.traditional is 'Traditional-character form of a Chinese headword; null elsewhere.';
comment on column lex.entries.frequency_rank is 'Rank in the source frequency list; 1 is the most common word. Null when unranked.';
comment on column lex.entries.frequency_band is 'Bucket of frequency_rank: very_common, common or uncommon.';
comment on column lex.entries.level is 'Learning level: A1 to C2 for en and es (CEFR), HSK1 to HSK7-9 for zh.';
comment on column lex.entries.level_is_estimated is 'True when level was inferred from frequency rather than taken from an official list.';
comment on column lex.entries.etymology is 'Origin of the word, as the source gives it.';
comment on column lex.entries.attributes is 'Per-language extras as JSON: pinyin, gender, frequency, translations, gloss_vi_all.';
comment on column lex.entries.source_id is 'Dataset the entry came from. References lex.sources.';
comment on column lex.entries.provenance is 'Which source supplied each part of the entry, as JSON keyed by part: senses, level, frequency, gloss_vi, image.';
comment on column lex.entries.created_at is 'When the pipeline first loaded the entry.';
comment on column lex.entries.updated_at is 'When the pipeline or an admin last changed the entry.';
comment on column lex.entries.search_vector is 'Generated. Full-text vector of the headword for en and es, read by lex.search.';
comment on column lex.entries.pinyin_toneless is 'Generated. Pinyin without tone marks or spaces for zh entries, so "zhongguo" finds 中国.';
comment on column lex.entries.gloss_vi_all_normalized is 'Generated. attributes.gloss_vi_all lower-cased without diacritics, for the Vietnamese lookup.';

-- lex.senses
comment on table lex.senses is
  'zhesen: the meanings of an entry, most common first. gloss_vi is what the reader sees.';
comment on column lex.senses.id is 'Primary key, "<entry id>#<n>".';
comment on column lex.senses.entry_id is 'The entry this meaning belongs to. References lex.entries; deleted with it.';
comment on column lex.senses.pos is 'Part of speech as the source spells it: noun, verb, adj, adv and so on.';
comment on column lex.senses.sense_order is 'Position within the entry; 1 is the most common meaning.';
comment on column lex.senses.gloss_vi is 'Vietnamese meaning. Comma-separated terms, or a definition when longer than 80 characters.';
comment on column lex.senses.gloss_vi_is_mt is 'True when gloss_vi is a machine translation (Azure AI Translator) rather than written by a person.';
comment on column lex.senses.gloss_en is 'English meaning from the source dictionary.';
comment on column lex.senses.register is 'Formal, informal, slang and similar. Empty in the current load.';
comment on column lex.senses.domain is 'Subject field such as medicine or law. Empty in the current load.';
comment on column lex.senses.sense_frequency is 'How common this meaning is relative to the others. Empty in the current load.';
comment on column lex.senses.source_id is 'Dataset the meaning came from. References lex.sources.';
comment on column lex.senses.provenance is 'JSON naming the source of the gloss, e.g. {"source": "azure-translator"}.';
comment on column lex.senses.gloss_vi_normalized is 'Generated. gloss_vi lower-cased without diacritics, for trigram suggestions.';

-- lex.gloss_terms
comment on table lex.gloss_terms is
  'zhesen: derived from lex.senses, never written by hand. One row per entry and Vietnamese term; the index behind the Vietnamese lookup. Rebuilt by lex.gloss_terms_reload through triggers on lex.senses.';
comment on column lex.gloss_terms.entry_id is 'The entry the term points to. References lex.entries; deleted with it.';
comment on column lex.gloss_terms.lang is 'Language of the entry, copied so the lookup can filter without a join.';
comment on column lex.gloss_terms.term is 'One comma-separated piece of gloss_vi, lower-cased, bracketed definition removed.';
comment on column lex.gloss_terms.term_una is 'term without Vietnamese diacritics, matched when the query is typed without marks.';
comment on column lex.gloss_terms.head is 'True when the term was produced by stripping a leading classifier such as "con"; scores lower.';
comment on column lex.gloss_terms.sense_order is 'Lowest sense_order the term appears in; an earlier meaning ranks higher.';

-- lex.pronunciations
comment on table lex.pronunciations is
  'zhesen: IPA and recorded audio for an entry, one row per accent.';
comment on column lex.pronunciations.id is 'Surrogate key.';
comment on column lex.pronunciations.entry_id is 'The entry pronounced. References lex.entries; deleted with it.';
comment on column lex.pronunciations.accent is 'Accent or reading system: en-US, en-UK, es-ES, es-419, zh-pinyin and so on.';
comment on column lex.pronunciations.ipa is 'Pronunciation in IPA, or pinyin for zh-pinyin.';
comment on column lex.pronunciations.audio_url is 'Recording on Wikimedia Commons. May pronounce a phrase rather than the headword; read through audioMatchesHeadword.';
comment on column lex.pronunciations.audio_source is 'Who made the recording. Empty in the current load.';
comment on column lex.pronunciations.source_id is 'Dataset the pronunciation came from. References lex.sources.';
comment on column lex.pronunciations.tier is 'open or personal, as lex.sources.tier.';

-- lex.inflections
comment on table lex.inflections is
  'zhesen: inflected forms. English plural, past and comparative; the full Spanish conjugation table.';
comment on column lex.inflections.id is 'Surrogate key.';
comment on column lex.inflections.entry_id is 'The base entry. References lex.entries; deleted with it.';
comment on column lex.inflections.form_text is 'The inflected form, e.g. went, hablaré.';
comment on column lex.inflections.ipa is 'Pronunciation of the form, when the source gives one.';
comment on column lex.inflections.mood is 'Verb mood: indicativo, subjuntivo, imperativo.';
comment on column lex.inflections.tense is 'Verb tense, e.g. presente, pretérito-imperfecto.';
comment on column lex.inflections.person is 'Grammatical person, 1 to 3.';
comment on column lex.inflections.number is 'singular or plural.';
comment on column lex.inflections.gender is 'masculine or feminine, for Spanish nouns, adjectives and participles.';
comment on column lex.inflections.degree is 'comparative or superlative, for English adjectives.';
comment on column lex.inflections.form_label is 'The source''s own tag list for the form, e.g. "indicativo presente yo" or "past participle".';
comment on column lex.inflections.source_id is 'Dataset the form came from. References lex.sources.';

-- lex.lex_relations
comment on table lex.lex_relations is
  'zhesen: the related-word graph: synonyms, antonyms, derived and related words.';
comment on column lex.lex_relations.id is 'Surrogate key.';
comment on column lex.lex_relations.entry_id is 'The entry the relation starts from. References lex.entries; deleted with it.';
comment on column lex.lex_relations.related_entry_id is 'The related entry when it exists in the dictionary. References lex.entries.';
comment on column lex.lex_relations.related_text is 'The related word as text, kept when no entry exists for it.';
comment on column lex.lex_relations.relation_type is 'synonym, antonym, derived or related.';
comment on column lex.lex_relations.source_id is 'Dataset the relation came from. References lex.sources.';

-- lex.examples
comment on table lex.examples is
  'zhesen: example sentences, attached to a sense or to a whole entry.';
comment on column lex.examples.id is 'Surrogate key.';
comment on column lex.examples.sense_id is 'The meaning the sentence illustrates. References lex.senses; deleted with it.';
comment on column lex.examples.entry_id is 'The entry, when the sentence is not tied to one meaning. References lex.entries; deleted with it.';
comment on column lex.examples.text is 'The sentence in the entry''s language.';
comment on column lex.examples.reading is 'Pinyin for a Chinese sentence; null elsewhere.';
comment on column lex.examples.translation_vi is 'Vietnamese translation.';
comment on column lex.examples.translation_en is 'English translation.';
comment on column lex.examples.audio_url is 'Recording of the sentence, when one exists.';
comment on column lex.examples.audio_source is 'Who made the recording. Empty in the current load.';
comment on column lex.examples.source_id is 'Dataset the sentence came from, tatoeba or cambridge. References lex.sources.';
comment on column lex.examples.tier is 'open or personal, as lex.sources.tier.';

-- lex.images
comment on table lex.images is
  'zhesen: pictures for concrete nouns, attached to one sense.';
comment on column lex.images.id is 'Surrogate key.';
comment on column lex.images.sense_id is 'The meaning pictured. References lex.senses; deleted with it.';
comment on column lex.images.url is 'Full-size image on Wikimedia Commons.';
comment on column lex.images.thumbnail_url is 'Smaller rendition for the entry page.';
comment on column lex.images.source_id is 'Dataset the image came from. References lex.sources.';
comment on column lex.images.license is 'Licence of this one image.';
comment on column lex.images.attribution is 'Author credit the licence requires.';
comment on column lex.images.tier is 'open or personal, as lex.sources.tier.';

-- lex.characters
comment on table lex.characters is
  'zhesen: one Chinese character, from Unihan and CC-CEDICT. Shown under a zh entry, one per character.';
comment on column lex.characters.char is 'The character itself; primary key.';
comment on column lex.characters.is_simplified is 'True for a simplified form.';
comment on column lex.characters.simplified_variant is 'The simplified form of a traditional character.';
comment on column lex.characters.traditional_variant is 'The traditional form of a simplified character.';
comment on column lex.characters.radical is 'The Kangxi radical the character is indexed under.';
comment on column lex.characters.stroke_count is 'Number of strokes.';
comment on column lex.characters.decomposition is 'Components the character is built from.';
comment on column lex.characters.pinyin is 'Every Mandarin reading, with tone marks.';
comment on column lex.characters.cantonese is 'Cantonese readings in Jyutping.';
comment on column lex.characters.han_viet is 'Sino-Vietnamese (Hán Việt) readings.';
comment on column lex.characters.gloss is 'Short English meaning of the character alone.';
comment on column lex.characters.source_id is 'Dataset the character came from. References lex.sources.';

-- lex.entry_characters
comment on table lex.entry_characters is
  'zhesen: which characters a Chinese entry is written with, in order.';
comment on column lex.entry_characters.entry_id is 'The zh entry. References lex.entries; deleted with it.';
comment on column lex.entry_characters.char is 'The character at this position. References lex.characters.';
comment on column lex.entry_characters.position is 'Zero-based position of the character in the headword.';

-- lex.grammar_points
comment on table lex.grammar_points is
  'zhesen: one grammar pattern with a Vietnamese explanation, written for this project. Listed on /grammar.';
comment on column lex.grammar_points.id is 'Slug, "<lang>:<level>:<title>", e.g. zh:hsk1:cau-vi-ngu-dong-tu.';
comment on column lex.grammar_points.lang is 'Language code. References public.languages.';
comment on column lex.grammar_points.level_scheme is 'HSK or CEFR.';
comment on column lex.grammar_points.level is 'Level within level_scheme, e.g. HSK1 or A2.';
comment on column lex.grammar_points.category_vi is 'Group heading on the grammar page, in Vietnamese.';
comment on column lex.grammar_points.title_vi is 'Title of the point, in Vietnamese.';
comment on column lex.grammar_points.pattern is 'The formula shown above the examples, e.g. "Subject + 把 + Object + Verb".';
comment on column lex.grammar_points.explanation_vi is 'The explanation, in Vietnamese.';
comment on column lex.grammar_points.common_mistake_vi is 'A mistake Vietnamese learners typically make with this point.';
comment on column lex.grammar_points.sort_order is 'Order within the level.';
comment on column lex.grammar_points.source_id is 'Where the content came from; zhesen-original for text written here. References lex.sources.';
comment on column lex.grammar_points.created_at is 'When the point was loaded.';
comment on column lex.grammar_points.updated_at is 'When the point last changed.';

-- lex.grammar_examples
comment on table lex.grammar_examples is
  'zhesen: example sentences for a grammar point.';
comment on column lex.grammar_examples.id is 'Surrogate key.';
comment on column lex.grammar_examples.grammar_point_id is 'The point illustrated. References lex.grammar_points; deleted with it.';
comment on column lex.grammar_examples.text is 'The sentence in the point''s language.';
comment on column lex.grammar_examples.reading is 'Pinyin for Chinese; null elsewhere.';
comment on column lex.grammar_examples.translation_vi is 'Vietnamese translation.';
comment on column lex.grammar_examples.sort_order is 'Order under the point.';

-- lex.grammar_point_entries
comment on table lex.grammar_point_entries is
  'zhesen: links a grammar point to the entries it uses, so the entry page for 了 lists the 了 patterns.';
comment on column lex.grammar_point_entries.grammar_point_id is 'References lex.grammar_points; deleted with it.';
comment on column lex.grammar_point_entries.entry_id is 'References lex.entries; deleted with it.';

-- public.languages (table comment from 0041)
comment on column public.languages.code is 'Language code: en, es or zh. Target of every lang foreign key.';
comment on column public.languages.name is 'English name of the language.';
comment on column public.languages.native_name is 'Name of the language in itself.';
comment on column public.languages.script is 'han or latin.';

-- public.profiles (table comment from 0041)
comment on column public.profiles.id is 'The account. Same value as auth.users.id.';
comment on column public.profiles.role is 'learner or admin. RLS refuses a change from the account itself; granted from the SQL editor.';
comment on column public.profiles.display_name is 'Name the account holder chose, 1 to 60 characters.';
comment on column public.profiles.created_at is 'When the profile was created, which is when the account was.';
comment on column public.profiles.updated_at is 'When the profile last changed.';

-- public.user_words (table comment from 0041)
comment on column public.user_words.id is 'Surrogate key.';
comment on column public.user_words.user_id is 'The account that saved the word. References auth.users; deleted with it.';
comment on column public.user_words.lang is 'Language code: en, es or zh.';
comment on column public.user_words.entry_id is 'The dictionary entry saved, or null for a custom word. References lex.entries; set to null if the entry is removed.';
comment on column public.user_words.headword is 'The word as saved, copied from the entry or typed by the learner.';
comment on column public.user_words.reading is 'Pinyin for a Chinese word.';
comment on column public.user_words.ipa is 'Pronunciation in IPA.';
comment on column public.user_words.pos is 'Parts of speech, copied from the entry''s senses.';
comment on column public.user_words.meaning_vi is 'Vietnamese meaning shown on the card.';
comment on column public.user_words.meaning_en is 'English meaning shown on the card.';
comment on column public.user_words.level is 'CEFR or HSK level, copied from the entry.';
comment on column public.user_words.example is 'Example sentence shown on the card.';
comment on column public.user_words.example_translation is 'Translation of the example.';
comment on column public.user_words.audio_url is 'Recording played on the card.';
comment on column public.user_words.notes is 'The learner''s own notes.';
comment on column public.user_words.status is 'new, learning or known, set by the learner from the wordlist. The schedule itself lives in the fsrs_* columns.';
comment on column public.user_words.tags is 'The learner''s own tags.';
comment on column public.user_words.created_at is 'When the word was saved.';
comment on column public.user_words.updated_at is 'When the row last changed. Set by the user_words_set_updated_at trigger.';
comment on column public.user_words.fsrs_stability is 'FSRS: days until recall probability falls to 90%.';
comment on column public.user_words.fsrs_difficulty is 'FSRS: how hard the word is for this learner, 1 to 10.';
comment on column public.user_words.fsrs_elapsed_days is 'FSRS: days between the last two reviews.';
comment on column public.user_words.fsrs_scheduled_days is 'FSRS: interval, in days, the last review scheduled.';
comment on column public.user_words.fsrs_learning_steps is 'FSRS: index into the short learning steps while state is 1 or 3.';
comment on column public.user_words.fsrs_reps is 'FSRS: number of reviews.';
comment on column public.user_words.fsrs_lapses is 'FSRS: number of times the word was forgotten after being learnt.';
comment on column public.user_words.fsrs_state is 'FSRS card state: 0 new, 1 learning, 2 review, 3 relearning.';
comment on column public.user_words.fsrs_due_at is 'FSRS: when the word is next due. The practice queue reads this.';
comment on column public.user_words.fsrs_last_review_at is 'FSRS: when the word was last reviewed; null if never.';

-- public.review_log (table comment from 0041)
comment on column public.review_log.user_id is 'The account. References auth.users; deleted with it.';
comment on column public.review_log.day is 'A calendar day on which the account practised.';

-- public.admin_audit
comment on table public.admin_audit is
  'zhesen: one row per admin write: who, when, what, and the values before and after. Written only by admin.audit.';
comment on column public.admin_audit.id is 'Surrogate key.';
comment on column public.admin_audit.at is 'When the action ran.';
comment on column public.admin_audit.actor is 'The admin account that acted. No foreign key, so the row outlives the account.';
comment on column public.admin_audit.action is 'What was done, e.g. delete_account, merge_account, update_sense, flag_entry.';
comment on column public.admin_audit.target is 'What it was done to: an account id, a sense id or an entry id.';
comment on column public.admin_audit.detail is 'JSON with the values before and after, or the parameters of the action.';

-- admin.entry_flags
comment on table admin.entry_flags is
  'zhesen: entries an admin marked for review, with the reason. Listed on /admin/content.';
comment on column admin.entry_flags.entry_id is 'The flagged entry. No foreign key, so a flag survives a reload of lex.entries.';
comment on column admin.entry_flags.reason is 'Why the entry needs review, 1 to 500 characters.';
comment on column admin.entry_flags.flagged_at is 'When the flag was set or last changed.';
comment on column admin.entry_flags.flagged_by is 'The admin who set it.';

-- Every table in the three project schemas with its purpose, exact row count, size,
-- columns and foreign keys. Counts are exact for the same reason as admin.metrics().
create or replace function admin.dictionary()
returns jsonb
language plpgsql
stable
security definer
set search_path = admin, lex, public, pg_catalog
as $$
declare
  r record;
  n bigint;
  tables jsonb := '[]'::jsonb;
begin
  perform admin.assert_admin();

  for r in
    select c.oid, ns.nspname, c.relname, c.relrowsecurity
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where c.relkind in ('r', 'p') and ns.nspname in ('lex', 'public', 'admin')
    order by ns.nspname, c.relname
  loop
    execute format('select count(*) from %I.%I', r.nspname, r.relname) into n;
    tables := tables || jsonb_build_object(
      'schema', r.nspname,
      'name', r.relname,
      'comment', obj_description(r.oid, 'pg_class'),
      'rows', n,
      'bytes', pg_total_relation_size(r.oid),
      'rls', r.relrowsecurity,
      'columns', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'name', a.attname,
          'type', format_type(a.atttypid, a.atttypmod),
          'nullable', not a.attnotnull,
          'default', case when a.attgenerated = '' then pg_get_expr(d.adbin, d.adrelid) end,
          'generated', a.attgenerated <> '',
          'identity', a.attidentity <> '',
          'primary_key', coalesce(a.attnum = any (pk.conkey), false),
          'comment', col_description(r.oid, a.attnum)
        ) order by a.attnum), '[]'::jsonb)
        from pg_attribute a
        left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
        left join pg_constraint pk on pk.conrelid = r.oid and pk.contype = 'p'
        where a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
      ),
      'foreign_keys', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'columns', (select jsonb_agg(attname order by k.i) from unnest(fk.conkey) with ordinality k(n, i)
                      join pg_attribute on attrelid = fk.conrelid and attnum = k.n),
          'ref_schema', rn.nspname,
          'ref_table', rc.relname,
          'ref_columns', (select jsonb_agg(attname order by k.i) from unnest(fk.confkey) with ordinality k(n, i)
                          join pg_attribute on attrelid = fk.confrelid and attnum = k.n),
          'on_delete', case fk.confdeltype when 'c' then 'cascade' when 'n' then 'set null'
                                            when 'd' then 'set default' when 'r' then 'restrict' else 'no action' end
        ) order by fk.conname), '[]'::jsonb)
        from pg_constraint fk
        join pg_class rc on rc.oid = fk.confrelid
        join pg_namespace rn on rn.oid = rc.relnamespace
        where fk.conrelid = r.oid and fk.contype = 'f'
      ),
      'indexes', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'name', ic.relname,
          'definition', pg_get_indexdef(i.indexrelid),
          'bytes', pg_relation_size(i.indexrelid)
        ) order by ic.relname), '[]'::jsonb)
        from pg_index i join pg_class ic on ic.oid = i.indexrelid
        where i.indrelid = r.oid
      )
    );
  end loop;

  return jsonb_build_object(
    'schemas', (
      select jsonb_agg(jsonb_build_object('name', nspname, 'comment', obj_description(oid, 'pg_namespace')) order by nspname)
      from pg_namespace where nspname in ('lex', 'public', 'admin')
    ),
    'tables', tables
  );
end;
$$;

revoke all on function admin.dictionary() from public;
grant execute on function admin.dictionary() to authenticated;

-- admin.metrics() from 0056, plus what /admin puts first: accounts created in the last 7
-- days, accounts that practised in the last 7 days, entries per language, and the server's
-- version, start time and client connections.
create or replace function admin.metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = admin, lex, public, extensions
as $$
declare
  r record;
  n bigint;
  tables jsonb := '[]'::jsonb;
begin
  perform admin.assert_admin();

  for r in
    select c.oid, ns.nspname, c.relname
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where c.relkind in ('r', 'p') and ns.nspname in ('lex', 'public', 'admin')
    order by ns.nspname, c.relname
  loop
    execute format('select count(*) from %I.%I', r.nspname, r.relname) into n;
    tables := tables || jsonb_build_object(
      'schema', r.nspname,
      'name', r.relname,
      'rows', n,
      'bytes', pg_total_relation_size(r.oid)
    );
  end loop;

  return jsonb_build_object(
    'tables', tables,
    'database_bytes', pg_database_size(current_database()),
    'relation_bytes', (
      select coalesce(sum(pg_total_relation_size(c.oid)), 0)
      from pg_class c where c.relkind in ('r', 'm', 'p')
    ),
    'pgroonga_indexes', (
      select count(*) from pg_class c
      where c.relam = (select oid from pg_am where amname = 'pgroonga')
    ),
    'pgroonga_surplus', (
      select count(*)
      from jsonb_object_keys(extensions.pgroonga_command('object_list')::jsonb -> 1) k
      where k ~ '^Sources[0-9]+$'
        and substring(k from 8)::oid not in (
          select c.relfilenode from pg_class c
          where c.relam = (select oid from pg_am where amname = 'pgroonga')
        )
    ),
    'accounts', (
      select jsonb_build_object(
        'total', count(*),
        'permanent', count(*) filter (where nullif(u.email, '') is not null),
        'new_7d', count(*) filter (where u.created_at > now() - interval '7 days')
      )
      from auth.users u
    ),
    'lex_updated_at', (select max(e.updated_at) from lex.entries e),
    'active_7d', (select count(distinct l.user_id) from public.review_log l where l.day > current_date - 7),
    'postgres', jsonb_build_object(
      'version', current_setting('server_version'),
      'started_at', pg_postmaster_start_time(),
      'connections', (select count(*) from pg_stat_activity where backend_type = 'client backend'),
      'max_connections', current_setting('max_connections')::int
    ),
    'entries_by_lang', (
      select coalesce(jsonb_object_agg(x.lang, x.n), '{}'::jsonb)
      from (select e.lang, count(*) as n from lex.entries e group by e.lang) x
    )
  );
end;
$$;

revoke all on function admin.metrics() from public;
grant execute on function admin.metrics() to authenticated;

notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name)
values ('20260925000001', 'data_dictionary')
on conflict (version) do nothing;
