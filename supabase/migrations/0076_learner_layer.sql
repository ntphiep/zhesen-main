-- 0076_learner_layer.sql
-- A learner layer over the Wiktionary entries: the 2 to 9 senses a learner meets most, in
-- natural Vietnamese, each with examples, collocations, synonyms, antonyms and equivalents
-- in the other two languages, plus a label for every remaining sense. A language model
-- writes it, a second model reviews it and the first corrects it
-- (`supabase/scripts/learner/learner.py`); `lex.learner_load` stores one entry per call.
--
-- The Wiktionary rows are not rewritten. Three writes reach existing tables. A
-- machine-translated or empty `lex.senses.gloss_vi` takes the layer's Vietnamese, marked in
-- `provenance.learner_fix` with the old value. A collocation with no entry of its own
-- becomes a `collocation` entry in the shape the `zhesen-ai` enrichment already writes. And
-- a `lex_relations` collocation row, recorded on its link, puts it in the word page's
-- phrase block. Hiding a layer takes back the glosses and the relations.
--
-- Measured on the 15-word pilot: 473 raw senses, 60 core senses, 167 collocations, 46
-- proposed gloss fixes, 0 structural errors after validation.
--
-- TO ROLL BACK: `select lex.learner_revert(entry_id) from lex.learner_entries;` restores
-- every gloss that still holds the layer's value and removes its relations, then drop the
-- five tables and six functions below. The collocation entries stay: the zhesen-ai
-- enrichment shares them.
--
-- reviewed-destructive: approved by the owner on 2026-09-28 with the learner layer. The deletes remove rows of lex.learner_entries and only the lex_relations rows a layer recorded as its own; drop and truncate touch only the temp tables the functions build.

create table lex.learner_entries (
  entry_id       text primary key references lex.entries(id) on delete cascade,
  gist_vi        text[] not null,
  level          text check (level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  usage_note_vi  text,
  model          text not null,
  reviewer       text,
  prompt_version text not null,
  review         jsonb not null default '{}'::jsonb,
  status         text not null default 'published' check (status in ('published', 'hidden')),
  created_at     timestamptz not null default now()
);

create table lex.learner_senses (
  entry_id         text not null references lex.learner_entries(entry_id) on delete cascade,
  sense_order      int not null check (sense_order between 1 and 12),
  pos              text,
  vi_terms         text[] not null check (cardinality(vi_terms) between 1 and 6),
  vi_definition    text not null check (length(vi_definition) <= 240),
  en_definition    text,
  domain           text,
  register         text,
  cefr             text check (cefr in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  source_sense_ids text[] not null check (cardinality(source_sense_ids) >= 1),
  primary key (entry_id, sense_order)
);

create table lex.learner_examples (
  entry_id          text not null,
  sense_order       int not null,
  example_order     int not null,
  text              text not null,
  reading           text,
  vi                text not null,
  source_example_id bigint references lex.examples(id) on delete set null,
  primary key (entry_id, sense_order, example_order),
  foreign key (entry_id, sense_order) references lex.learner_senses(entry_id, sense_order) on delete cascade
);

create table lex.learner_links (
  id              bigint generated always as identity primary key,
  entry_id        text not null references lex.learner_entries(entry_id) on delete cascade,
  sense_order     int,
  kind            text not null check (kind in ('collocation', 'synonym', 'antonym', 'confusable', 'equivalent')),
  link_order      int not null,
  text            text not null,
  lang            text not null references public.languages(code),
  target_entry_id text references lex.entries(id) on delete set null,
  pattern         text,
  vi              text,
  note_vi         text,
  example         text,
  example_vi      text,
  reading         text,
  example_reading text,
  relation_id     bigint references lex.lex_relations(id) on delete set null
);
create index learner_links_entry_idx on lex.learner_links (entry_id);
create index learner_links_relation_idx on lex.learner_links (relation_id) where relation_id is not null;
create index learner_links_target_idx on lex.learner_links (target_entry_id) where target_entry_id is not null;

create table lex.sense_labels (
  sense_id          text primary key references lex.senses(id) on delete cascade,
  entry_id          text not null references lex.learner_entries(entry_id) on delete cascade,
  core_sense_order  int,
  vi_terms          text[],
  domain            text,
  register          text,
  is_inflection     boolean not null default false,
  lemma             text,
  lemma_entry_id    text references lex.entries(id) on delete set null,
  fix_vi            text,
  fix_reason        text,
  previous_gloss_vi text,
  fixed_at          timestamptz
);
create index sense_labels_entry_idx on lex.sense_labels (entry_id);

comment on table lex.learner_entries is
  'zhesen: the learner layer of one entry, written by a language model from its Wiktionary senses and reviewed by a second model. Loaded by lex.learner_load; deleting the row removes the layer.';
comment on column lex.learner_entries.entry_id is 'The entry the layer describes. References lex.entries.';
comment on column lex.learner_entries.gist_vi is '1 to 3 short Vietnamese equivalents of the whole word, most common first.';
comment on column lex.learner_entries.level is 'CEFR level of the most common sense, as the model judged it.';
comment on column lex.learner_entries.usage_note_vi is 'How the word is really used and what learners confuse it with, in Vietnamese.';
comment on column lex.learner_entries.model is 'Model that wrote the layer, as named by the 9router router.';
comment on column lex.learner_entries.reviewer is 'Model that reviewed it; null when the review step did not run.';
comment on column lex.learner_entries.prompt_version is 'Version of the prompt in supabase/scripts/learner/learner.py; a rerun skips entries already at the current version.';
comment on column lex.learner_entries.review is 'The reviewer''s issues, the ones the writer rejected with a reason, and the timings, as JSON.';
comment on column lex.learner_entries.status is 'published: shown on the word page. hidden: kept for /admin/learner only.';
comment on column lex.learner_entries.created_at is 'When this version of the layer was loaded.';

comment on table lex.learner_senses is
  'zhesen: the core senses of a learner layer, in the order a learner meets them.';
comment on column lex.learner_senses.entry_id is 'The layer this sense belongs to. References lex.learner_entries.';
comment on column lex.learner_senses.sense_order is 'Position in the layer; 1 is the sense a learner meets most.';
comment on column lex.learner_senses.pos is 'Part of speech: noun, verb, adjective and so on.';
comment on column lex.learner_senses.vi_terms is 'Short Vietnamese equivalents, most natural first.';
comment on column lex.learner_senses.vi_definition is 'One plain Vietnamese sentence explaining the sense.';
comment on column lex.learner_senses.en_definition is 'A learner-style English definition.';
comment on column lex.learner_senses.domain is 'Subject field such as law or medicine; null for everyday senses.';
comment on column lex.learner_senses.register is 'formal, informal, slang and similar; null when neutral.';
comment on column lex.learner_senses.cefr is 'CEFR level of this sense.';
comment on column lex.learner_senses.source_sense_ids is 'The lex.senses ids this sense covers; the model may not invent a meaning outside them.';

comment on table lex.learner_examples is
  'zhesen: one or two translated example sentences per core sense.';
comment on column lex.learner_examples.entry_id is 'The layer the example belongs to.';
comment on column lex.learner_examples.sense_order is 'The core sense it illustrates.';
comment on column lex.learner_examples.example_order is 'Position under that sense.';
comment on column lex.learner_examples.text is 'The sentence in the entry''s language.';
comment on column lex.learner_examples.reading is 'Pinyin with tone marks for a Chinese sentence; null otherwise.';
comment on column lex.learner_examples.vi is 'Vietnamese translation.';
comment on column lex.learner_examples.source_example_id is 'The lex.examples row the sentence was taken from verbatim; null when the model wrote it.';

comment on table lex.learner_links is
  'zhesen: every word a learner layer mentions: collocations, synonyms, antonyms, confusables and equivalents in the other two languages, each resolved to an entry when the dictionary has one.';
comment on column lex.learner_links.id is 'Surrogate key.';
comment on column lex.learner_links.entry_id is 'The layer that mentions the word.';
comment on column lex.learner_links.sense_order is 'The core sense it belongs to; null for a confusable, which belongs to the whole word.';
comment on column lex.learner_links.kind is 'collocation, synonym, antonym, confusable or equivalent.';
comment on column lex.learner_links.link_order is 'Position among links of the same sense and kind.';
comment on column lex.learner_links.text is 'The word or phrase as the layer writes it.';
comment on column lex.learner_links.lang is 'Language of text: the entry''s own, or another one for an equivalent.';
comment on column lex.learner_links.target_entry_id is 'The entry text resolves to; null when the dictionary has none. Read backwards, it lists the layers that mention an entry.';
comment on column lex.learner_links.pattern is 'Shape of a collocation, such as "adj + N".';
comment on column lex.learner_links.vi is 'Vietnamese meaning of a collocation.';
comment on column lex.learner_links.note_vi is 'How a synonym, antonym or confusable differs, in Vietnamese.';
comment on column lex.learner_links.example is 'A short example of a collocation.';
comment on column lex.learner_links.example_vi is 'Its Vietnamese translation.';
comment on column lex.learner_links.reading is 'Pinyin for a Chinese collocation itself, one syllable per character.';
comment on column lex.learner_links.example_reading is 'Pinyin for the example of a Chinese collocation.';
comment on column lex.learner_links.relation_id is 'The lex.lex_relations collocation row this link added to the word page''s phrase block; removed when the layer is hidden or replaced.';

comment on table lex.sense_labels is
  'zhesen: one row per raw sense of an entry with a learner layer: which core sense covers it, its labels, and the Vietnamese gloss the layer wrote into lex.senses.';
comment on column lex.sense_labels.sense_id is 'The lex.senses row described.';
comment on column lex.sense_labels.entry_id is 'The layer that labelled it.';
comment on column lex.sense_labels.core_sense_order is 'The core sense that covers it; null for a sense listed under the other senses.';
comment on column lex.sense_labels.vi_terms is 'Corrected Vietnamese equivalents.';
comment on column lex.sense_labels.domain is 'Subject field; null when none applies.';
comment on column lex.sense_labels.register is 'Register label; null when neutral.';
comment on column lex.sense_labels.is_inflection is 'True when the sense only says it is a form of another word.';
comment on column lex.sense_labels.lemma is 'The word it is a form of.';
comment on column lex.sense_labels.lemma_entry_id is 'The entry that word resolves to.';
comment on column lex.sense_labels.fix_vi is 'Vietnamese the layer writes into lex.senses.gloss_vi when that is machine-translated or empty.';
comment on column lex.sense_labels.fix_reason is 'Why: the reviewer''s reason for a wrong translation, or "empty".';
comment on column lex.sense_labels.previous_gloss_vi is 'gloss_vi before the layer first changed it, copied from the learner_fix key in lex.senses.provenance, which lex.learner_unfix reads.';
comment on column lex.sense_labels.fixed_at is 'When fix_vi was written into lex.senses; null when the row was written by a person or already matched.';

alter table lex.learner_entries enable row level security;
alter table lex.learner_senses enable row level security;
alter table lex.learner_examples enable row level security;
alter table lex.learner_links enable row level security;
alter table lex.sense_labels enable row level security;

-- A hidden layer is invisible to readers and visible to the admin. The child tables defer to
-- the parent's policy through the exists, which RLS evaluates as the same caller.
create policy learner_entries_select_anon on lex.learner_entries for select to anon
  using (status = 'published');
create policy learner_entries_select_auth on lex.learner_entries for select to authenticated
  using (status = 'published' or public.is_admin());
create policy learner_senses_select on lex.learner_senses for select to anon, authenticated
  using (exists (select 1 from lex.learner_entries e where e.entry_id = learner_senses.entry_id));
create policy learner_examples_select on lex.learner_examples for select to anon, authenticated
  using (exists (select 1 from lex.learner_entries e where e.entry_id = learner_examples.entry_id));
create policy learner_links_select on lex.learner_links for select to anon, authenticated
  using (exists (select 1 from lex.learner_entries e where e.entry_id = learner_links.entry_id));
create policy sense_labels_select on lex.sense_labels for select to anon, authenticated
  using (exists (select 1 from lex.learner_entries e where e.entry_id = sense_labels.entry_id));

grant select on lex.learner_entries, lex.learner_senses, lex.learner_examples, lex.learner_links, lex.sense_labels
  to anon, authenticated;
grant all on lex.learner_entries, lex.learner_senses, lex.learner_examples, lex.learner_links, lex.sense_labels
  to service_role;

insert into lex.sources (id, name, url, license, tier, notes)
values ('zhesen-ai', 'zhesen AI enrichment', null, 'machine output', 'open',
        'Collocations and Vietnamese glosses written by a language model through the 9router router. Needs a human pass before it is treated as authoritative.')
on conflict (id) do nothing;

-- The layer marks each gloss it writes with its own provenance key, `learner_fix`:
-- {"version", "value", "before", "before_mt"}. No other job writes that key, so a revert
-- can tell whether the row still holds the layer's value. A person's edit through
-- admin.update_sense clears gloss_vi_is_mt, and a row someone changed after the layer is
-- left as it is: the layer neither fights another writer nor restores over a person.

-- Writes the layer's Vietnamese into lex.senses where gloss_vi is machine-translated or
-- empty. Idempotent. A row this version already wrote and someone changed since is skipped.
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
    and (s.gloss_vi is null or s.gloss_vi_is_mt)
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

-- Puts back every gloss that still holds the layer's value and drops the marker from every
-- row that carries it, so a gloss someone changed since keeps that change.
create or replace function lex.learner_unfix(p_entry_id text)
returns int
language plpgsql
security definer
set search_path = lex, extensions, public
as $$
declare
  n int;
begin
  update lex.senses s
  set gloss_vi = s.provenance->'learner_fix'->>'before',
      gloss_vi_is_mt = coalesce((s.provenance->'learner_fix'->>'before_mt')::boolean, s.gloss_vi_is_mt),
      provenance = s.provenance - 'learner_fix'
  where s.entry_id = p_entry_id and s.provenance ? 'learner_fix'
    and s.gloss_vi is not distinct from s.provenance->'learner_fix'->>'value';
  get diagnostics n = row_count;
  update lex.senses s set provenance = s.provenance - 'learner_fix'
  where s.entry_id = p_entry_id and s.provenance ? 'learner_fix';
  update lex.sense_labels set fixed_at = null where entry_id = p_entry_id;
  return n;
end;
$$;

-- The collocation relations the layer added for the word page's phrase block. Each is
-- recorded on its link, so hiding or replacing the layer removes exactly those rows and
-- never one the zhesen-ai enrichment wrote.
create or replace function lex.learner_relations(p_entry_id text, p_on boolean)
returns int
language plpgsql
security definer
set search_path = lex, extensions, public
as $$
declare
  v_head text;
  v_id   bigint;
  n      int := 0;
  r      record;
begin
  delete from lex.lex_relations x
  using lex.learner_links l
  where l.entry_id = p_entry_id and l.relation_id = x.id;
  update lex.learner_links set relation_id = null where entry_id = p_entry_id and relation_id is not null;
  if not p_on then
    return 0;
  end if;
  select lower(e.headword) into v_head from lex.entries e where e.id = p_entry_id;
  for r in
    select distinct on (l.target_entry_id) l.id, l.target_entry_id, l.text
    from lex.learner_links l
    where l.entry_id = p_entry_id and l.kind = 'collocation' and l.target_entry_id is not null
      and l.target_entry_id <> p_entry_id and position(v_head in lower(l.text)) > 0
      and not exists (select 1 from lex.lex_relations x
                      where x.entry_id = p_entry_id and x.relation_type = 'collocation'
                        and (x.related_entry_id = l.target_entry_id or lower(x.related_text) = lower(l.text)))
    order by l.target_entry_id, l.id
  loop
    insert into lex.lex_relations (entry_id, related_entry_id, related_text, relation_type, source_id)
    values (p_entry_id, r.target_entry_id, r.text, 'collocation', 'zhesen-ai')
    returning id into v_id;
    update lex.learner_links set relation_id = v_id
    where entry_id = p_entry_id and kind = 'collocation' and target_entry_id = r.target_entry_id
      and relation_id is null and lower(text) = lower(r.text);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Undoes the layer's public effects and removes it.
create or replace function lex.learner_revert(p_entry_id text)
returns int
language plpgsql
security definer
set search_path = lex, extensions, public
as $$
declare
  n int;
begin
  n := lex.learner_unfix(p_entry_id);
  perform lex.learner_relations(p_entry_id, false);
  delete from lex.learner_entries where entry_id = p_entry_id;
  return n;
end;
$$;

-- Stores one entry's layer, replacing any earlier version and keeping its status, in one
-- transaction. The payload is the shape `learner.py` builds; the function resolves every
-- mentioned word to an entry, creates a collocation entry for a collocation that contains
-- the headword and has none, matches examples to lex.examples by their exact text, and
-- applies the gloss fixes and the phrase-block relations when the layer is published.
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
  v_head   text;
  v_prov   jsonb;
  v_status text;
  n_new    int;
  n_fix    int := 0;
  n_rel    int := 0;
begin
  select e.lang, lower(e.headword) into v_lang, v_head from lex.entries e where e.id = v_entry;
  if v_lang is null then
    raise exception 'unknown entry %', v_entry using errcode = '22023';
  end if;
  v_prov := jsonb_build_object('ai', p->>'model', 'ai_at', current_date::text, 'learner', p->>'prompt_version');
  select status into v_status from lex.learner_entries where entry_id = v_entry;

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

  -- A collocation that names the headword and has no entry becomes one, keyed the way the
  -- zhesen-ai enrichment keys its own, so both jobs converge on the same row.
  drop table if exists learner_new;
  create temp table learner_new on commit drop as
    select distinct on (c.norm) c.norm, c.text, c.vi, c.example, c.example_vi, c.reading, c.example_reading
    from (
      select case when v_lang = 'zh' then replace(l.text, ' ', '') else lower(l.text) end as norm,
             l.text, l.vi, l.example, l.example_vi, l.reading, l.example_reading, l.id
      from lex.learner_links l
      where l.entry_id = v_entry and l.kind = 'collocation' and l.target_entry_id is null
        and l.vi is not null and length(l.text) <= 60 and position(v_head in lower(l.text)) > 0
    ) c
    where c.norm <> v_head
    order by c.norm, c.id;

  -- Search and the previews read a Chinese reading from attributes.pinyin.
  insert into lex.entries (id, lang, entry_type, headword, headword_normalized, attributes, source_id, provenance)
  select v_lang || ':' || n.norm, v_lang, 'collocation', n.norm, n.norm,
         case when v_lang = 'zh' and n.reading is not null then jsonb_build_object('pinyin', n.reading)
              else '{}'::jsonb end,
         'zhesen-ai', v_prov
  from learner_new n
  on conflict (id) do nothing;
  get diagnostics n_new = row_count;

  insert into lex.senses (id, entry_id, sense_order, gloss_vi, gloss_vi_is_mt, source_id, provenance)
  select v_lang || ':' || n.norm || '#ai1', v_lang || ':' || n.norm, 1, n.vi, true, 'zhesen-ai', v_prov
  from learner_new n
  where not exists (select 1 from lex.senses s where s.entry_id = v_lang || ':' || n.norm)
  on conflict (id) do nothing;

  insert into lex.pronunciations (entry_id, accent, ipa, source_id)
  select v_lang || ':' || n.norm, 'zh-pinyin', n.reading, 'zhesen-ai'
  from learner_new n
  where v_lang = 'zh' and n.reading is not null
    and not exists (select 1 from lex.pronunciations x where x.entry_id = v_lang || ':' || n.norm);

  insert into lex.examples (sense_id, entry_id, text, reading, translation_vi, source_id)
  select v_lang || ':' || n.norm || '#ai1', v_lang || ':' || n.norm, n.example, n.example_reading, n.example_vi, 'zhesen-ai'
  from learner_new n
  where n.example is not null
    and exists (select 1 from lex.senses s where s.id = v_lang || ':' || n.norm || '#ai1')
    and not exists (select 1 from lex.examples x where x.entry_id = v_lang || ':' || n.norm);

  update lex.learner_links l
  set target_entry_id = v_lang || ':' || n.norm
  from learner_new n
  where l.entry_id = v_entry and l.kind = 'collocation' and l.target_entry_id is null
    and (case when v_lang = 'zh' then replace(l.text, ' ', '') else lower(l.text) end) = n.norm;

  insert into lex.sense_labels (sense_id, entry_id, core_sense_order, vi_terms, domain, register, is_inflection,
                                lemma, lemma_entry_id, fix_vi, fix_reason)
  select b.j->>'sense_id', v_entry, (b.j->>'core_sense_order')::int,
         case when b.j ? 'vi_terms' and jsonb_typeof(b.j->'vi_terms') = 'array'
              then array(select jsonb_array_elements_text(b.j->'vi_terms')) end,
         b.j->>'domain', b.j->>'register', coalesce((b.j->>'is_inflection')::boolean, false),
         b.j->>'lemma',
         (select t.id from lex.entries t
          where t.lang = v_lang and t.headword_normalized = lower(b.j->>'lemma')
          order by (t.entry_type = 'name'), t.frequency_rank nulls last, t.id limit 1),
         nullif(btrim(b.j->>'fix_vi'), ''), b.j->>'fix_reason'
  from jsonb_array_elements(coalesce(p->'labels', '[]'::jsonb)) b(j)
  where exists (select 1 from lex.senses s where s.id = b.j->>'sense_id' and s.entry_id = v_entry);

  if coalesce(v_status, 'published') = 'published' then
    n_fix := lex.learner_apply_fixes(v_entry);
    n_rel := lex.learner_relations(v_entry, true);
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
revoke all on function lex.learner_unfix(text) from public, anon, authenticated;
revoke all on function lex.learner_relations(text, boolean) from public, anon, authenticated;
revoke all on function lex.learner_revert(text) from public, anon, authenticated;
grant execute on function lex.learner_load(jsonb) to service_role;
grant execute on function lex.learner_apply_fixes(text) to service_role;
grant execute on function lex.learner_unfix(text) to service_role;
grant execute on function lex.learner_relations(text, boolean) to service_role;
grant execute on function lex.learner_revert(text) to service_role;

-- /admin/learner hides or shows one layer. Hiding also takes back its glosses and its
-- phrase-block relations; publishing writes them again.
create or replace function admin.learner_set_status(p_entry_id text, p_status text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, admin, public
as $$
begin
  perform admin.assert_admin();
  if p_status not in ('published', 'hidden') then
    raise exception 'unknown_status' using errcode = '22023';
  end if;
  update lex.learner_entries set status = p_status where entry_id = p_entry_id;
  if not found then
    raise exception 'unknown_entry' using errcode = '22023';
  end if;
  if p_status = 'hidden' then
    perform lex.learner_unfix(p_entry_id);
    perform lex.learner_relations(p_entry_id, false);
  else
    perform lex.learner_apply_fixes(p_entry_id);
    perform lex.learner_relations(p_entry_id, true);
  end if;
  perform admin.audit('console.learner_status', p_entry_id, jsonb_build_object('status', p_status));
end;
$$;

revoke all on function admin.learner_set_status(text, text) from public;
grant execute on function admin.learner_set_status(text, text) to authenticated;

notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name)
values ('20260928000001', 'learner_layer')
on conflict (version) do nothing;
