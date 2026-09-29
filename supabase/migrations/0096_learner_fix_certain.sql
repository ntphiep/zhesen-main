-- 0096_learner_fix_certain.sql
-- Lets the learner layer correct a Vietnamese gloss that no machine wrote, when the gloss
-- does not match its sense at all. Until now lex.learner_apply_fixes wrote only over a
-- machine-translated or empty gloss, so en:takeoff kept "cởi" (the phrasal verb take off)
-- on its noun sense "the launch of an aircraft". Measured on production on 2026-09-29,
-- 59,394 senses carry a gloss_vi not marked as machine-translated.
--
-- The writer marks such a fix `certain` only for a wrong meaning, never for style, and the
-- second model reviews the layer before it loads. The fix stays reversible like every other
-- one: `learner_fix` in lex.senses.provenance keeps the gloss and its flag from before, and
-- lex.learner_unfix puts both back. A gloss a person saved through admin.update_sense is
-- never overwritten.
--
-- reviewed-destructive: restated from 0081 with one new column read. The delete in
-- lex.learner_load removes only the entry's previous layer, as in 0076 and 0081; approved
-- with the learner layer plan in issue #83.

alter table lex.sense_labels add column if not exists fix_certain boolean not null default false;

comment on column lex.sense_labels.fix_certain is
  'True when the layer judged the existing gloss_vi wrong for this sense, so fix_vi replaces it even when no machine wrote it.';
comment on column lex.sense_labels.fix_vi is
  'Vietnamese the layer writes into lex.senses.gloss_vi when that is machine-translated or empty, or when fix_certain is true.';

-- Restated from 0076. A gloss no machine wrote is replaced only when the label is certain
-- and no person has saved that sense.
create or replace function lex.learner_apply_fixes(p_entry_id text)
returns int
language plpgsql
security definer
set search_path = lex, extensions, public
as $$
declare
  n int;
begin
  create temp table if not exists learner_fix_rows (sense_id text primary key, fix_vi text, version text,
                                                     before text, before_mt boolean) on commit drop;
  truncate learner_fix_rows;
  insert into learner_fix_rows
  select s.id, l.fix_vi, e.prompt_version,
         case when s.provenance ? 'learner_fix' then s.provenance->'learner_fix'->>'before' else s.gloss_vi end,
         case when s.provenance ? 'learner_fix' then (s.provenance->'learner_fix'->>'before_mt')::boolean
              else s.gloss_vi_is_mt end
  from lex.sense_labels l
  join lex.learner_entries e on e.entry_id = l.entry_id and e.status = 'published'
  join lex.senses s on s.id = l.sense_id
  where l.entry_id = p_entry_id and l.fix_vi is not null
    and (s.gloss_vi is null or s.gloss_vi_is_mt
         or (l.fix_certain
             and not exists (select 1 from public.admin_audit a
                             where a.action = 'update_sense' and a.target = s.id)))
    and s.gloss_vi is distinct from l.fix_vi
    and not (s.provenance ? 'learner_fix'
             and s.provenance->'learner_fix'->>'version' = e.prompt_version
             and s.gloss_vi is distinct from s.provenance->'learner_fix'->>'value');

  update lex.senses s
  set gloss_vi = f.fix_vi,
      gloss_vi_is_mt = true,
      provenance = s.provenance || jsonb_build_object('learner_fix', jsonb_build_object(
        'version', f.version, 'value', f.fix_vi, 'before', f.before, 'before_mt', f.before_mt))
  from learner_fix_rows f
  where s.id = f.sense_id;
  get diagnostics n = row_count;

  update lex.sense_labels l
  set previous_gloss_vi = f.before, fixed_at = now()
  from learner_fix_rows f
  where l.sense_id = f.sense_id;
  return n;
end;
$$;

-- Restated from 0081 with fix_certain read from each label.
create or replace function lex.learner_load(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = lex, extensions, public
set statement_timeout = '60s'
as $$
declare
  v_entry  text := p->>'entry_id';
  v_lang   text;
  v_status text;
  n_new    int := 0;
  n_fix    int := 0;
  n_rel    int := 0;
begin
  select e.lang into v_lang from lex.entries e where e.id = v_entry;
  if v_lang is null then
    raise exception 'unknown entry %', v_entry using errcode = '22023';
  end if;
  select status into v_status from lex.learner_entries where entry_id = v_entry;

  perform lex.learner_unfix(v_entry);
  perform lex.learner_relations(v_entry, false);
  delete from lex.learner_entries where entry_id = v_entry;

  insert into lex.learner_entries (entry_id, gist_vi, level, usage_note_vi, model, reviewer, prompt_version, review, status)
  values (v_entry,
          array(select jsonb_array_elements_text(p->'gist_vi')),
          p->>'level', p->>'usage_note_vi', p->>'model', p->>'reviewer', p->>'prompt_version',
          coalesce(p->'review', '{}'::jsonb), coalesce(v_status, 'published'));

  insert into lex.learner_senses (entry_id, sense_order, pos, vi_terms, vi_definition, en_definition, domain,
                                  register, cefr, source_sense_ids)
  select v_entry, s.n, s.j->>'pos',
         array(select jsonb_array_elements_text(s.j->'vi_terms')),
         s.j->>'vi_definition', s.j->>'en_definition', s.j->>'domain', s.j->>'register', s.j->>'cefr',
         array(select jsonb_array_elements_text(s.j->'source_sense_ids'))
  from jsonb_array_elements(p->'senses') with ordinality s(j, n);

  insert into lex.learner_examples (entry_id, sense_order, example_order, text, reading, vi, source_example_id)
  select v_entry, s.n, x.n, x.j->>'text', x.j->>'reading', x.j->>'vi',
         case when (x.j->>'from_source')::boolean then
           (select e.id from lex.examples e where e.entry_id = v_entry and e.text = x.j->>'text' order by e.id limit 1)
         end
  from jsonb_array_elements(p->'senses') with ordinality s(j, n)
  cross join lateral jsonb_array_elements(coalesce(s.j->'examples', '[]'::jsonb)) with ordinality x(j, n);

  insert into lex.learner_links (entry_id, sense_order, kind, link_order, text, lang, target_entry_id,
                                 pattern, vi, note_vi, example, example_vi, reading, example_reading)
  select v_entry, l.sense_order, l.kind, l.link_order, l.text, l.lang,
         (select t.id from lex.entries t
          where t.lang = l.lang and t.headword_normalized = lower(l.text)
          order by (t.entry_type = 'name'), t.frequency_rank nulls last, t.id limit 1),
         l.pattern, l.vi, l.note_vi, l.example, l.example_vi, l.reading, l.example_reading
  from (
    select s.n::int as sense_order, k.j->>'kind' as kind, k.n::int as link_order, btrim(k.j->>'text') as text,
           coalesce(k.j->>'lang', v_lang) as lang, k.j->>'pattern' as pattern, k.j->>'vi' as vi,
           k.j->>'note_vi' as note_vi, k.j->>'example' as example, k.j->>'example_vi' as example_vi,
           k.j->>'reading' as reading, k.j->>'example_reading' as example_reading
    from jsonb_array_elements(p->'senses') with ordinality s(j, n)
    cross join lateral jsonb_array_elements(coalesce(s.j->'links', '[]'::jsonb)) with ordinality k(j, n)
    union all
    select null, k.j->>'kind', k.n::int, btrim(k.j->>'text'), coalesce(k.j->>'lang', v_lang), null, null,
           k.j->>'note_vi', null, null, null, null
    from jsonb_array_elements(coalesce(p->'links', '[]'::jsonb)) with ordinality k(j, n)
  ) l
  where l.text <> '';

  insert into lex.sense_labels (sense_id, entry_id, core_sense_order, vi_terms, domain, register, is_inflection,
                                lemma, lemma_entry_id, fix_vi, fix_reason, fix_certain)
  select b.j->>'sense_id', v_entry, (b.j->>'core_sense_order')::int,
         case when b.j ? 'vi_terms' and jsonb_typeof(b.j->'vi_terms') = 'array'
              then array(select jsonb_array_elements_text(b.j->'vi_terms')) end,
         b.j->>'domain', b.j->>'register', coalesce((b.j->>'is_inflection')::boolean, false),
         b.j->>'lemma',
         (select t.id from lex.entries t
          where t.lang = v_lang and t.headword_normalized = lower(b.j->>'lemma')
          order by (t.entry_type = 'name'), t.frequency_rank nulls last, t.id limit 1),
         nullif(btrim(b.j->>'fix_vi'), ''), b.j->>'fix_reason',
         coalesce((b.j->>'fix_certain')::boolean, false) and nullif(btrim(b.j->>'fix_vi'), '') is not null
  from jsonb_array_elements(coalesce(p->'labels', '[]'::jsonb)) b(j)
  where exists (select 1 from lex.senses s where s.id = b.j->>'sense_id' and s.entry_id = v_entry);

  if coalesce(v_status, 'published') = 'published' then
    n_fix := lex.learner_apply_fixes(v_entry);
    n_new := lex.learner_collocations(v_entry, true);
    n_rel := lex.learner_relations(v_entry, true);
  else
    perform lex.learner_collocations(v_entry, false);
  end if;

  return jsonb_build_object(
    'senses', (select count(*) from lex.learner_senses where entry_id = v_entry),
    'examples', (select count(*) from lex.learner_examples where entry_id = v_entry),
    'links', (select count(*) from lex.learner_links where entry_id = v_entry),
    'resolved', (select count(*) from lex.learner_links where entry_id = v_entry and target_entry_id is not null),
    'new_entries', n_new,
    'relations', n_rel,
    'labels', (select count(*) from lex.sense_labels where entry_id = v_entry),
    'gloss_fixes', n_fix,
    'status', coalesce(v_status, 'published'));
end;
$$;

revoke all on function lex.learner_load(jsonb) from public, anon, authenticated;
revoke all on function lex.learner_apply_fixes(text) from public, anon, authenticated;
grant execute on function lex.learner_load(jsonb) to service_role;
grant execute on function lex.learner_apply_fixes(text) to service_role;

insert into supabase_migrations.schema_migrations (version, name)
values ('20260929000096', 'learner_fix_certain')
on conflict (version) do nothing;
