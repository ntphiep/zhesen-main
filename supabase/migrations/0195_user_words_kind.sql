-- 0195_user_words_kind.sql
-- What a saved item is, so the notebook can list its phrasal verbs, idioms and collocations
-- apart from its words. A learner saves all of them, and before this a phrase was told from a
-- word only by its part of speech ("prep.ph." for on the spot).
--
-- kind is 'word' for a headword without a space; 'phrasal_verb' for an English verb followed
-- by one or two particles (give up, look forward to, put up with), the test
-- lib/dictionary/phraseIpa.ts isPhrasalVerb applies; otherwise the entry's own type, 'idiom'
-- or 'collocation', and 'phrase' for anything else, a typed-in phrase included. A trigger sets
-- it on every insert and whenever the headword, language or entry changes, so no save path
-- has to send it.
--
-- TO ROLL BACK: drop the trigger, the two functions and the column.

set lock_timeout = '5s';

alter table public.user_words add column if not exists kind text;

do $$ begin
  alter table public.user_words add constraint user_words_kind_check
    check (kind in ('word', 'phrasal_verb', 'idiom', 'collocation', 'phrase'));
exception when duplicate_object then null;
end $$;

-- lib/dictionary/phrases.ts PHRASAL_PARTICLES.
create or replace function public.user_word_kind(p_lang text, p_entry_id text, p_headword text)
returns text
language sql
stable
set search_path = lex, public
as $$
  with w as (select string_to_array(lower(btrim(p_headword)), ' ') as t),
  e as (select entry_type,
               exists (select 1 from lex.senses s where s.entry_id = x.id and s.pos = 'verb') as verb
        from lex.entries x where x.id = p_entry_id)
  select case
    when strpos(btrim(p_headword), ' ') = 0 then 'word'
    when p_lang = 'en'
      and array_length(w.t, 1) between 2 and 3
      and w.t[2:] <@ array['up', 'down', 'in', 'out', 'on', 'off', 'over', 'away', 'back', 'about', 'along',
        'around', 'round', 'aside', 'through', 'by', 'apart', 'together', 'forward', 'after', 'under', 'for',
        'to', 'with', 'into', 'onto', 'upon', 'across', 'ahead', 'behind', 'past', 'of', 'at', 'from']
      and coalesce((select verb from e), true) then 'phrasal_verb'
    when (select entry_type from e) in ('idiom', 'collocation') then (select entry_type from e)
    else 'phrase'
  end
  from w
$$;

create or replace function public.user_words_set_kind()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.kind := public.user_word_kind(new.lang, new.entry_id, new.headword);
  return new;
end
$$;

drop trigger if exists user_words_set_kind on public.user_words;
create trigger user_words_set_kind
  before insert or update of headword, lang, entry_id on public.user_words
  for each row execute function public.user_words_set_kind();

-- updated_at is the learner's last edit; filling a derived column is not one.
alter table public.user_words disable trigger user_words_set_updated_at;
update public.user_words u set kind = public.user_word_kind(u.lang, u.entry_id, u.headword)
where u.kind is distinct from public.user_word_kind(u.lang, u.entry_id, u.headword);
alter table public.user_words enable trigger user_words_set_updated_at;

alter table public.user_words alter column kind set not null;

insert into supabase_migrations.schema_migrations (version, name)
values ('20261006000195', 'user_words_kind')
on conflict (version) do nothing;
