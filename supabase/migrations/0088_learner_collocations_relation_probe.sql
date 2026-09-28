-- The owner cleanup in lex.learner_collocations asked lex_relations for rows on either side
-- of an entry with one OR, and related_entry_id had no index: a seq scan of 2,437,748 rows,
-- 2,065 ms for one owned entry of es:de. Two probes, each on its own index, replace it. The
-- index is the one 0084 declares, created here first with the same name and definition.
-- reviewed-destructive: the delete is 0081's removal of entries a layer created and nothing else
-- uses, unchanged; approved with the learner layer plan in issue #83.
create index if not exists idx_lex_rel_related on lex.lex_relations (related_entry_id);

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
    and not exists (select 1 from lex.lex_relations x where x.related_entry_id = e.id)
    and not exists (select 1 from lex.lex_relations x where x.entry_id = e.id)
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

insert into supabase_migrations.schema_migrations (version, name)
values ('20260929000088', 'learner_collocations_relation_probe')
on conflict (version) do nothing;
