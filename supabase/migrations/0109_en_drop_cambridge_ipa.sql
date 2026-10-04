-- 0109_en_drop_cambridge_ipa.sql
-- Removes the English IPA scraped from dictionary.cambridge.org wherever it is wrong or
-- redundant.
--
-- Cambridge answers an inflected form with its lemma's page, so the scrape stored the lemma's
-- transcription, or a neighbour's, on the form: emitted showed /iˈmit/, breaking /ˈbroukən/ and
-- did /ˈdaznt/. Measured on production on 2026-10-04: 5,546 of the 12,196 rows sit on an entry
-- with `form_of`, 5,000 of them identical to the lemma's own row. The bilingual edition also
-- writes an older notation (streit, mauntən, a bare -ʃəri) that matches no other source. 6,611
-- rows sit on a lemma that Wiktionary or CMUdict already transcribes, so only the 39 lemmas with
-- no other IPA keep theirs, unless it is a fragment starting with a hyphen.
--
-- Backup: s3://zhesen-db-backups-014498663963/data-loads/cambridge-ipa-20261004.csv, every
-- column of every deleted row, restored with \copy lex.pronunciations from it.
--
-- reviewed-destructive: the owner asked for wrong word-page data to be fixed at once; the
-- rows are copied to the backup above before the delete.

set lock_timeout = '5s';

delete from lex.pronunciations p
using lex.entries e
where e.id = p.entry_id
  and p.source_id = 'cambridge'
  and (e.form_of is not null
       or p.ipa like '-%'
       or exists (select 1 from lex.pronunciations q
                  where q.entry_id = p.entry_id and q.source_id <> 'cambridge' and q.ipa is not null));
