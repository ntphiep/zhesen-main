-- The collocation entries a learner layer creates now belong to that layer. Each carries
-- `learner_owner` in its provenance and in its sense's, so a reload updates the ones it
-- still has, and a reload, a hide or a revert removes the ones it no longer names. An entry
-- someone else took up (a saved word, a relation, another layer's link, a sense of its own)
-- is handed over instead: it loses the key and stays as an ordinary zhesen-ai entry.
--
-- lex.learner_load also puts back the layer's glosses before it replaces the layer. It
-- deleted the sense_labels first, so a gloss fixed by the previous version kept that value
-- and the previous gloss was lost once apply_fixes recorded the fixed one as "before".
--
-- reviewed-destructive: the delete removes only entries a layer created and nothing else
-- uses, on a reload, a hide or a revert of that layer; approved with the learner layer
-- plan in issue #83.

-- Every collocation entry 0076's learner_load created, owned by the layer that links to it.
with owner as (
  select distinct on (l.target_entry_id) l.target_entry_id as id, l.entry_id
  from lex.learner_links l
  join lex.entries e on e.id = l.target_entry_id
  where l.kind = 'collocation' and e.entry_type = 'collocation' and e.source_id = 'zhesen-ai'
    and e.provenance ? 'learner' and not e.provenance ? 'learner_owner'
  order by l.target_entry_id, l.id
)
update lex.entries e
set provenance = e.provenance || jsonb_build_object('learner_owner', o.entry_id)
from owner o
where e.id = o.id;

update lex.senses s
set provenance = s.provenance || jsonb_build_object('learner_owner', e.provenance->>'learner_owner')
from lex.entries e
where s.entry_id = e.id and e.provenance ? 'learner_owner'
  and s.source_id = 'zhesen-ai' and s.provenance ? 'learner' and not s.provenance ? 'learner_owner';

-- Brings the entries a layer owns in line with its collocation links. With p_on it creates
-- an entry for each collocation that names the headword and has none, updates the ones it
-- owns where nobody has edited them, and lets go of the rest; without p_on it lets go of
-- every one. Returns the number created.
create or replace function lex.learner_collocations(p_entry_id text, p_on boolean)
returns int
language plpgsql
security definer
set search_path = lex, extensions, public
as $$
declare
  v_lang text;
  v_head text;
  v_prov jsonb;
  v_keep text[] := '{}';
  n_new  int := 0;
begin
  select e.lang, lower(e.headword) into v_lang, v_head from lex.entries e where e.id = p_entry_id;

  if p_on then
    select jsonb_build_object('ai', l.model, 'ai_at', current_date::text, 'learner', l.prompt_version,
                              'learner_owner', p_entry_id)
    into v_prov
    from lex.learner_entries l where l.entry_id = p_entry_id;

    drop table if exists learner_new;
    create temp table learner_new on commit drop as
      select distinct on (c.norm) v_lang || ':' || c.norm as id, c.norm, c.text, c.vi, c.example,
             c.example_vi, c.reading, c.example_reading
      from (
        select case when v_lang = 'zh' then replace(l.text, ' ', '') else lower(l.text) end as norm,
               l.text, l.vi, l.example, l.example_vi, l.reading, l.example_reading, l.id
        from lex.learner_links l
        left join lex.entries t on t.id = l.target_entry_id
        where l.entry_id = p_entry_id and l.kind = 'collocation'
          and (l.target_entry_id is null or t.provenance->>'learner_owner' = p_entry_id)
          and l.vi is not null and length(l.text) <= 60 and position(v_head in lower(l.text)) > 0
      ) c
      where c.norm <> v_head
      order by c.norm, c.id;
    v_keep := array(select id from learner_new);

    -- Search and the previews read a Chinese reading from attributes.pinyin.
    insert into lex.entries (id, lang, entry_type, headword, headword_normalized, attributes, source_id, provenance)
    select n.id, v_lang, 'collocation', n.norm, n.norm,
           case when v_lang = 'zh' and n.reading is not null then jsonb_build_object('pinyin', n.reading)
                else '{}'::jsonb end,
           'zhesen-ai', v_prov
    from learner_new n
    on conflict (id) do nothing;
    get diagnostics n_new = row_count;

    update lex.entries e
    set attributes = case when v_lang = 'zh' and n.reading is not null
                          then e.attributes || jsonb_build_object('pinyin', n.reading)
                          else e.attributes - 'pinyin' end
    from learner_new n
    where e.id = n.id and e.provenance->>'learner_owner' = p_entry_id
      and e.attributes is distinct from case when v_lang = 'zh' and n.reading is not null
                                             then e.attributes || jsonb_build_object('pinyin', n.reading)
                                             else e.attributes - 'pinyin' end;

    insert into lex.senses (id, entry_id, sense_order, gloss_vi, gloss_vi_is_mt, source_id, provenance)
    select n.id || '#ai1', n.id, 1, n.vi, true, 'zhesen-ai', v_prov
    from learner_new n
    where not exists (select 1 from lex.senses s where s.entry_id = n.id)
    on conflict (id) do nothing;

    -- admin.update_sense clears gloss_vi_is_mt, so a gloss a person wrote stays.
    update lex.senses s
    set gloss_vi = n.vi
    from learner_new n
    where s.id = n.id || '#ai1' and s.provenance->>'learner_owner' = p_entry_id and s.gloss_vi_is_mt
      and s.gloss_vi is distinct from n.vi;

    delete from lex.pronunciations x
    using learner_new n, lex.entries e
    where x.entry_id = n.id and e.id = n.id and e.provenance->>'learner_owner' = p_entry_id
      and x.source_id = 'zhesen-ai' and x.accent = 'zh-pinyin' and x.ipa is distinct from n.reading;
    insert into lex.pronunciations (entry_id, accent, ipa, source_id)
    select n.id, 'zh-pinyin', n.reading, 'zhesen-ai'
    from learner_new n
    where v_lang = 'zh' and n.reading is not null
      and not exists (select 1 from lex.pronunciations x where x.entry_id = n.id);

    update lex.examples x
    set text = n.example, reading = n.example_reading, translation_vi = n.example_vi
    from learner_new n, lex.senses s
    where x.sense_id = n.id || '#ai1' and s.id = x.sense_id and s.provenance->>'learner_owner' = p_entry_id
      and x.source_id = 'zhesen-ai' and n.example is not null
      and (x.text, x.reading, x.translation_vi) is distinct from (n.example, n.example_reading, n.example_vi);
    insert into lex.examples (sense_id, entry_id, text, reading, translation_vi, source_id)
    select n.id || '#ai1', n.id, n.example, n.example_reading, n.example_vi, 'zhesen-ai'
    from learner_new n
    where n.example is not null
      and exists (select 1 from lex.senses s where s.id = n.id || '#ai1')
      and not exists (select 1 from lex.examples x where x.entry_id = n.id);

    update lex.learner_links l
    set target_entry_id = n.id
    from learner_new n
    where l.entry_id = p_entry_id and l.kind = 'collocation' and l.target_entry_id is null
      and (case when v_lang = 'zh' then replace(l.text, ' ', '') else lower(l.text) end) = n.norm;
  end if;

  delete from lex.entries e
  where e.provenance->>'learner_owner' = p_entry_id and not (e.id = any (v_keep))
    and not exists (select 1 from public.user_words w where w.entry_id = e.id)
    and not exists (select 1 from lex.lex_relations x where x.related_entry_id = e.id or x.entry_id = e.id)
    and not exists (select 1 from lex.learner_links l where l.target_entry_id = e.id and l.entry_id <> p_entry_id)
    and not exists (select 1 from lex.learner_entries l where l.entry_id = e.id)
    and not exists (select 1 from lex.grammar_point_entries g where g.entry_id = e.id)
    and not exists (select 1 from lex.senses s where s.entry_id = e.id
                    and s.provenance->>'learner_owner' is distinct from p_entry_id);

  update lex.senses s
  set provenance = s.provenance - 'learner_owner'
  from lex.entries e
  where s.entry_id = e.id and e.provenance->>'learner_owner' = p_entry_id and not (e.id = any (v_keep));
  update lex.entries e
  set provenance = e.provenance - 'learner_owner'
  where e.provenance->>'learner_owner' = p_entry_id and not (e.id = any (v_keep));
  return n_new;
end;
$$;

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
  perform lex.learner_collocations(p_entry_id, false);
  delete from lex.learner_entries where entry_id = p_entry_id;
  return n;
end;
$$;

-- Stores one entry's layer, replacing any earlier version and keeping its status, in one
-- transaction. The payload is the shape `learner.py` builds; the function resolves every
-- mentioned word to an entry, matches examples to lex.examples by their exact text, and
-- when the layer is published applies the gloss fixes, the collocation entries and the
-- phrase-block relations.
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
    perform lex.learner_collocations(p_entry_id, false);
  else
    perform lex.learner_apply_fixes(p_entry_id);
    perform lex.learner_collocations(p_entry_id, true);
    perform lex.learner_relations(p_entry_id, true);
  end if;
  perform admin.audit('console.learner_status', p_entry_id, jsonb_build_object('status', p_status));
end;
$$;

revoke all on function lex.learner_collocations(text, boolean) from public, anon, authenticated;
grant execute on function lex.learner_collocations(text, boolean) to service_role;

notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name)
values ('20260929000081', 'learner_owned_entries')
on conflict (version) do nothing;
