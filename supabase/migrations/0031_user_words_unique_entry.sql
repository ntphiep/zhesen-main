-- One dictionary entry may appear at most once in a user's wordlist.
--
-- `addWord` (lib/wordlist/store.ts) deduped by reading first and inserting after,
-- with nothing between the two steps. Two requests that overlap -- a double click
-- before React disables the button, or the same word added from two tabs -- both
-- read "not there yet" and both insert. The wordlist then shows the word twice,
-- and the two rows carry separate FSRS schedules, so the review queue asks for it
-- twice forever.
--
-- The check belongs in the database because that is the only place the two
-- requests meet. The application keeps its read as well: it turns the common case
-- into a clear message instead of a constraint violation, and now catches 23505
-- for the case the read cannot see.
--
-- Partial, because a custom word carries no entry_id and several of those are
-- legitimate: a learner may keep more than one hand-written note on the same page.

-- reviewed-destructive: removes rows the race above created. It keeps the oldest
-- row of each duplicate group -- the one whose review history started first -- and
-- deletes only exact duplicates of (user_id, entry_id). Rows with a null entry_id
-- are never touched. Run the select first to see what it would delete:
--   select user_id, entry_id, count(*) from public.user_words
--   where entry_id is not null group by 1, 2 having count(*) > 1;
delete from public.user_words a
using public.user_words b
where a.entry_id is not null
  and a.user_id = b.user_id
  and a.entry_id = b.entry_id
  and (b.created_at, b.id) < (a.created_at, a.id);

create unique index if not exists user_words_user_entry_key
  on public.user_words (user_id, entry_id)
  where entry_id is not null;
