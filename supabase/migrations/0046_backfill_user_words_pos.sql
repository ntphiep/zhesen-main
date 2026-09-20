-- Correct the part of speech on words already saved, now that 0045 answers with all of
-- them.
--
-- `public.user_words.pos` is a snapshot taken at save time, so every word saved before
-- 0045 holds sense 1's part of speech alone. `tentative` is stored as `noun`;
-- `conduct` is stored as `noun`. Neither is what the word is usually used as.
--
-- A row is only rewritten when its stored value is EXACTLY what the old query would
-- have answered. `components/wordlist/EditWordDialog.tsx` lets a learner set this
-- field by hand, and a correction they made themselves is not ours to overwrite.
--
-- Idempotent against the target state: after this runs the stored value equals
-- lex.entry_pos, so the second predicate no longer holds and a replay changes nothing.
-- Rows with no `entry_id` are custom words with no entry to read from, and are left
-- alone.

-- `user_words_set_updated_at` (0006) moves `updated_at` on every row this touches.
-- Nothing sorts or filters on it; the wordlist orders by `created_at`.

update public.user_words uw
set pos = lex.entry_pos(uw.entry_id)
where uw.entry_id is not null
  and uw.pos is distinct from lex.entry_pos(uw.entry_id)
  and uw.pos is not distinct from (
    select s.pos
    from lex.senses s
    where s.entry_id = uw.entry_id
    order by s.sense_order
    limit 1
  );
