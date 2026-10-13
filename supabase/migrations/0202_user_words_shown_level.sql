-- 0202_user_words_shown_level.sql
-- 0201 copied lex.entries.level into saved words, but the word page shows a different level
-- when the entry has a published learner layer: lib/dictionary/wordView.ts takes the layer's
-- level first, except for Chinese, which keeps HSK. So take read A1 on its page and B1 in the
-- notebook. Measured on 2026-10-13: 363 published layers in en and es carry a level other
-- than their entry's.
--
-- public.entry_shown_level is that rule in SQL, and saved words now follow it: on a change to
-- an entry's level, on a change to a layer's level or status, and when a word is saved.
--
-- TO ROLL BACK: replay 0201's user_words_follow_level, drop the triggers trg_user_words_follow_layer and
-- user_words_set_level, and drop entry_shown_level and user_words_set_level.

set lock_timeout = '5s';

create or replace function public.entry_shown_level(p_entry_id text)
returns text
language sql
stable
security definer
set search_path = lex, public
as $$
  select coalesce(
    (select le.level from lex.learner_entries le
      where le.entry_id = p_entry_id and le.status = 'published' and le.level is not null
        and split_part(p_entry_id, ':', 1) <> 'zh'),
    (select e.level from lex.entries e where e.id = p_entry_id))
$$;

create or replace function public.user_words_follow_level()
returns trigger
language plpgsql
security definer
set search_path = lex, public
as $$
declare
  -- lex.entries keys on id, lex.learner_entries on entry_id; a record has no field the
  -- other table lacks, so read it through jsonb.
  v_entry text := coalesce(to_jsonb(new) ->> 'entry_id', to_jsonb(new) ->> 'id');
  v_level text := public.entry_shown_level(v_entry);
begin
  if v_level is not null then
    update public.user_words u set level = v_level
    where u.entry_id = v_entry and u.level is distinct from v_level;
  end if;
  return null;
end
$$;

-- A word saved from a search result carried the entry's level, one saved from its page the
-- layer's. Both now store what the page shows.
create or replace function public.user_words_set_level()
returns trigger
language plpgsql
security definer
set search_path = lex, public
as $$
begin
  if new.entry_id is not null then
    new.level := coalesce(public.entry_shown_level(new.entry_id), new.level);
  end if;
  return new;
end
$$;

drop trigger if exists user_words_set_level on public.user_words;
create trigger user_words_set_level
  before insert on public.user_words
  for each row execute function public.user_words_set_level();

revoke execute on function public.user_words_set_level() from public, anon, authenticated;
revoke execute on function public.entry_shown_level(text) from public, anon, authenticated;
revoke execute on function public.user_words_follow_level() from public, anon, authenticated;

drop trigger if exists trg_user_words_follow_layer on lex.learner_entries;
create trigger trg_user_words_follow_layer
  after insert or update of level, status on lex.learner_entries
  for each row execute function public.user_words_follow_level();

-- Idempotent against the target: a second run updates no row.
update public.user_words u set level = public.entry_shown_level(u.entry_id)
where u.entry_id is not null
  and public.entry_shown_level(u.entry_id) is not null
  and u.level is distinct from public.entry_shown_level(u.entry_id);

insert into supabase_migrations.schema_migrations (version, name)
values ('20261013000202', 'user_words_shown_level')
on conflict (version) do nothing;
