-- 0201_user_words_follow_lex.sql
-- A saved word copies its entry's level, part of speech and meaning when it is saved, and the
-- copy never moved again. The dictionary did: measured on 2026-10-13, 45 saved words showed a
-- level their entry no longer has (beforehand A1 against C1, patriotic A1 against B2), 30 had
-- none while the entry has one, 8 showed a stale part of speech (attic "adj. · n." against
-- "n."), and 2 Chinese words had no meaning while their entry has one.
--
-- This refreshes the copies once and keeps them in step: a row trigger on lex.entries carries
-- a level change to the saved words of that entry, and statement triggers on lex.senses carry
-- a part-of-speech change, through lex.entry_pos (0045), the function a save itself reads. A
-- missing meaning is filled from the entry's first sense with one; a meaning the learner has
-- is never replaced. A level or part of speech the learner typed in is replaced the next
-- time the dictionary changes that entry.
--
-- TO ROLL BACK: drop the four triggers and the three functions below. The refreshed values
-- stay, and they are the dictionary's own.

set lock_timeout = '5s';

create or replace function public.user_words_follow_level()
returns trigger
language plpgsql
security definer
set search_path = lex, public
as $$
begin
  update public.user_words u set level = new.level
  where u.entry_id = new.id and new.level is not null and u.level is distinct from new.level;
  return null;
end
$$;

drop trigger if exists trg_user_words_follow_level on lex.entries;
create trigger trg_user_words_follow_level
  after update of level on lex.entries
  for each row when (old.level is distinct from new.level)
  execute function public.user_words_follow_level();

-- Only the saved words of the entries a statement touched; user_words is small, so the
-- join starts there rather than from a load's tens of thousands of senses.
create or replace function public.user_words_follow_senses(p_entries text[])
returns void
language sql
security definer
set search_path = lex, public
as $$
  update public.user_words u set
    pos = coalesce(lex.entry_pos(u.entry_id), u.pos),
    meaning_vi = coalesce(nullif(u.meaning_vi, ''), (
      select s.gloss_vi from lex.senses s
      where s.entry_id = u.entry_id and coalesce(s.gloss_vi, '') <> ''
      order by s.sense_order limit 1))
  where u.entry_id = any (p_entries)
    and (u.pos is distinct from coalesce(lex.entry_pos(u.entry_id), u.pos)
      or (coalesce(u.meaning_vi, '') = '' and exists (
        select 1 from lex.senses s where s.entry_id = u.entry_id and coalesce(s.gloss_vi, '') <> '')))
$$;

create or replace function public.user_words_follow_senses_sync()
returns trigger
language plpgsql
security definer
set search_path = lex, public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.user_words_follow_senses(array(
      select distinct n.entry_id from new_rows n where exists (select 1 from public.user_words u where u.entry_id = n.entry_id)));
  elsif tg_op = 'DELETE' then
    perform public.user_words_follow_senses(array(
      select distinct o.entry_id from old_rows o where exists (select 1 from public.user_words u where u.entry_id = o.entry_id)));
  else
    perform public.user_words_follow_senses(array(
      select x.entry_id from (select entry_id from new_rows union select entry_id from old_rows) x
      where exists (select 1 from public.user_words u where u.entry_id = x.entry_id)));
  end if;
  return null;
end
$$;

revoke execute on function public.user_words_follow_level() from public, anon, authenticated;
revoke execute on function public.user_words_follow_senses(text[]) from public, anon, authenticated;
revoke execute on function public.user_words_follow_senses_sync() from public, anon, authenticated;

drop trigger if exists trg_user_words_follow_senses_ins on lex.senses;
drop trigger if exists trg_user_words_follow_senses_upd on lex.senses;
drop trigger if exists trg_user_words_follow_senses_del on lex.senses;
create trigger trg_user_words_follow_senses_ins after insert on lex.senses
  referencing new table as new_rows
  for each statement execute function public.user_words_follow_senses_sync();
create trigger trg_user_words_follow_senses_upd after update on lex.senses
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.user_words_follow_senses_sync();
create trigger trg_user_words_follow_senses_del after delete on lex.senses
  referencing old table as old_rows
  for each statement execute function public.user_words_follow_senses_sync();

-- The one-time refresh, idempotent against the target: a second run updates no row.
update public.user_words u set level = e.level
from lex.entries e
where e.id = u.entry_id and e.level is not null and u.level is distinct from e.level;

select public.user_words_follow_senses(array(select distinct entry_id from public.user_words where entry_id is not null));

insert into supabase_migrations.schema_migrations (version, name)
values ('20261013000201', 'user_words_follow_lex')
on conflict (version) do nothing;
