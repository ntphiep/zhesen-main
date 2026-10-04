-- 0131_learner_links_target_lemma.sql
-- A learner link names the lemma, not an inflected form of it. The learner pipeline resolved
-- `text` to whatever entry spelled it, so take's Spanish equivalent pointed at tenga and the
-- lemma's page never listed take among the layers that mention it. Measured on production on
-- 2026-10-04: 6,540 links target an entry with `form_of`, but `form_of` is loose (sobre carries
-- form_of sobrar, casa casar), so only a target whose every sense is a pointer to its
-- `form_of` ("plural of hora") moves: 1,010 links over 601 targets. `text` keeps the spelling
-- the layer wrote. The pipeline that writes these rows lives outside this repository and must
-- apply the same rule, or its next run brings the forms back.

set lock_timeout = '5s';

update lex.learner_links ll
set target_entry_id = l.id
from lex.entries t
join lex.entries l on l.id = t.lang::text || ':' || t.form_of
where t.id = ll.target_entry_id
  and t.form_of is not null
  and exists (select 1 from lex.senses s where s.entry_id = t.id)
  and not exists (
    select 1 from lex.senses s
    where s.entry_id = t.id
      and lower(coalesce(s.gloss_en, '')) !~ ('\mof\s+'
          || regexp_replace(lower(t.form_of), '([.*+?^${}()|\[\]\\])', '\\\1', 'g')
          || '\s*[.;:)]*\s*$'));

insert into supabase_migrations.schema_migrations (version, name)
values ('20261004000131', 'learner_links_target_lemma')
on conflict (version) do nothing;
