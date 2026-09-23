-- 0060_admin_entry_edit.sql
-- Reading one entry for the editor, rewriting a sense's glosses, flagging an entry for a
-- later pass, and the coverage numbers on /admin/content.
--
-- Flags live in `admin.entry_flags`, not in columns on lex.entries. Every lex table is
-- readable by anon (0005), so a reason written there would be public through PostgREST;
-- and lex.entries is the table the data pipeline loads, in another repository, which knows
-- nothing of columns it did not create. No foreign key either, for the same reason: a
-- reload that replaces an entry under the same id keeps its flag.
--
-- `admin.update_sense` writes lex.senses as postgres. The three statement-level triggers
-- from 0048 then rebuild that entry's rows in lex.gloss_terms, so the Vietnamese lookup
-- follows the edit with nothing else to call. A gloss saved from the editor counts as
-- reviewed by a person, so `gloss_vi_is_mt` goes false. The old and new values go to the
-- audit, which is the only undo there is.
--
-- reviewed-destructive: Harry Nguyen. `admin.flag_entry` with a null reason deletes that
-- entry's one row in admin.entry_flags, which holds only admin notes; the removal is
-- audited. Nothing in this file runs a delete when the migration is applied.

create table if not exists admin.entry_flags (
  entry_id text primary key,
  reason text not null check (length(btrim(reason)) between 1 and 500),
  flagged_at timestamptz not null default now(),
  flagged_by uuid
);

revoke all on admin.entry_flags from public;

create or replace function admin.entry(p_entry text)
returns jsonb
language plpgsql
stable
security definer
set search_path = admin, lex, public
as $$
begin
  perform admin.assert_admin();
  return (
    select jsonb_build_object(
      'id', e.id,
      'lang', e.lang,
      'headword', e.headword,
      'flag', (
        select jsonb_build_object('reason', f.reason, 'flagged_at', f.flagged_at)
        from admin.entry_flags f where f.entry_id = e.id
      ),
      'senses', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', s.id,
          'pos', s.pos,
          'sense_order', s.sense_order,
          'gloss_vi', s.gloss_vi,
          'gloss_vi_is_mt', coalesce(s.gloss_vi_is_mt, false),
          'gloss_en', s.gloss_en
        ) order by s.sense_order)
        from lex.senses s where s.entry_id = e.id
      ), '[]'::jsonb)
    )
    from lex.entries e where e.id = p_entry
  );
end;
$$;

revoke all on function admin.entry(text) from public;
grant execute on function admin.entry(text) to authenticated;

create or replace function admin.update_sense(p_sense text, p_gloss_vi text, p_gloss_en text)
returns jsonb
language plpgsql
security definer
set search_path = admin, lex, public
as $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  perform admin.assert_admin();

  select jsonb_build_object('entry_id', s.entry_id, 'gloss_vi', s.gloss_vi,
                            'gloss_vi_is_mt', s.gloss_vi_is_mt, 'gloss_en', s.gloss_en)
    into v_before
  from lex.senses s where s.id = p_sense;
  if not found then
    raise exception 'no_such_sense' using errcode = '22023';
  end if;

  update lex.senses s
     set gloss_vi = nullif(regexp_replace(p_gloss_vi, '^\s+|\s+$', '', 'g'), ''),
         gloss_en = nullif(regexp_replace(p_gloss_en, '^\s+|\s+$', '', 'g'), ''),
         gloss_vi_is_mt = case when nullif(regexp_replace(p_gloss_vi, '^\s+|\s+$', '', 'g'), '') is null then s.gloss_vi_is_mt else false end
   where s.id = p_sense
  returning jsonb_build_object('entry_id', s.entry_id, 'gloss_vi', s.gloss_vi,
                               'gloss_vi_is_mt', s.gloss_vi_is_mt, 'gloss_en', s.gloss_en)
    into v_after;

  perform admin.audit('update_sense', p_sense,
    jsonb_build_object('before', v_before, 'after', v_after));
  return v_after;
end;
$$;

revoke all on function admin.update_sense(text, text, text) from public;
grant execute on function admin.update_sense(text, text, text) to authenticated;

-- A null or blank reason clears the flag.
create or replace function admin.flag_entry(p_entry text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = admin, lex, public
as $$
declare
  v_reason text := nullif(regexp_replace(p_reason, '^\s+|\s+$', '', 'g'), '');
begin
  perform admin.assert_admin();

  if not exists (select 1 from lex.entries where id = p_entry) then
    raise exception 'no_such_entry' using errcode = '22023';
  end if;

  if v_reason is null then
    delete from admin.entry_flags where entry_id = p_entry;
  else
    insert into admin.entry_flags (entry_id, reason, flagged_by)
    values (p_entry, v_reason, auth.uid())
    on conflict (entry_id) do update
      set reason = excluded.reason, flagged_at = now(), flagged_by = excluded.flagged_by;
  end if;

  perform admin.audit(case when v_reason is null then 'unflag_entry' else 'flag_entry' end,
    p_entry, jsonb_build_object('reason', v_reason));
  return jsonb_build_object('entry_id', p_entry, 'reason', v_reason);
end;
$$;

revoke all on function admin.flag_entry(text, text) from public;
grant execute on function admin.flag_entry(text, text) to authenticated;

-- Per language: entries, senses, senses with a Vietnamese gloss, how many of those are
-- machine translated, and the flagged entries themselves.
create or replace function admin.coverage()
returns jsonb
language plpgsql
stable
security definer
set search_path = admin, lex, public
as $$
begin
  perform admin.assert_admin();
  return jsonb_build_object(
    'languages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'lang', e.lang,
        'entries', e.n,
        'senses', coalesce(s.n, 0),
        'senses_vi', coalesce(s.vi, 0),
        'senses_mt', coalesce(s.mt, 0),
        'flagged', coalesce(f.n, 0)
      ) order by e.lang)
      from (select lang, count(*) as n from lex.entries group by lang) e
      left join (
        select x.lang,
               count(*) as n,
               count(*) filter (where s.gloss_vi is not null) as vi,
               count(*) filter (where s.gloss_vi is not null and s.gloss_vi_is_mt) as mt
        from lex.senses s join lex.entries x on x.id = s.entry_id
        group by x.lang
      ) s on s.lang = e.lang
      left join (
        select x.lang, count(*) as n
        from admin.entry_flags fl join lex.entries x on x.id = fl.entry_id
        group by x.lang
      ) f on f.lang = e.lang
    ), '[]'::jsonb),
    'flagged', coalesce((
      select jsonb_agg(jsonb_build_object(
        'entry_id', fl.entry_id,
        'headword', x.headword,
        'lang', x.lang,
        'reason', fl.reason,
        'flagged_at', fl.flagged_at
      ) order by fl.flagged_at desc)
      from admin.entry_flags fl join lex.entries x on x.id = fl.entry_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function admin.coverage() from public;
grant execute on function admin.coverage() to authenticated;

notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name)
values ('20260923000005', 'admin_entry_edit')
on conflict (version) do nothing;
