-- 0182_user_words_ai_fields.sql
-- Which fields of a saved word still hold the text "Điền bằng AI" wrote, by column name, so
-- the notebook labels them as the model's rather than the dictionary's or the learner's.
-- lib/wordlist/store.ts converts the names; editing a field removes it from the list.
--
-- Existing RLS policies and grants on public.user_words cover the new column.
-- A constant default makes the column a catalog change, with no table rewrite.
--
-- TO ROLL BACK: alter table public.user_words drop column ai_fields;

alter table public.user_words
  add column if not exists ai_fields text[] not null default '{}'
  constraint user_words_ai_fields_known check (
    ai_fields <@ array['meaning_vi', 'ipa', 'pos', 'level', 'example', 'example_translation']::text[]
  );
