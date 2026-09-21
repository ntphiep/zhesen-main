-- A temporary write path for the one-off Vietnamese gloss import, created and dropped in
-- the same session.
--
-- 65,093 English senses carry an English definition and no Vietnamese one, which is why a
-- learner looking up "adapt" or "anchor" in the Vietnamese box finds nothing. Filling them
-- means writing about 1.5 MB of Vietnamese text into lex.senses from a local script, and
-- this project holds no service-role key anywhere reachable: the application reads lex
-- with the anon key under RLS and writes only rows the signed-in user owns.
--
-- So the import gets its own function, SECURITY DEFINER, guarded by a token generated at
-- import time and never written down here. The grant to anon lives only for as long as the
-- import runs; 0054 revokes it and drops both objects, so no deployment carries a function
-- that lets the public key write to the dictionary.
--
-- The token sits in a table rather than a GUC. `alter database ... set` reaches only new
-- backends, and PostgREST holds a pool of long-lived ones, so a `current_setting` check
-- would have failed for every connection that was already open.
--
-- `where gloss_vi is null` is the whole safety story: the import can only fill a gap, never
-- overwrite a gloss that came from Wiktionary or from a person.
--
-- Every row it writes is marked `gloss_vi_is_mt`, because a machine translation of an
-- English definition is not the same thing as a gloss a lexicographer wrote and the
-- difference has to survive in the data. `source_id` names where the sense itself came
-- from, so the coalesce below only fills it when it is empty; every English sense already
-- carries `wiktionary-en` and keeps it. The `azure-translator` row exists so the flag has
-- a source to point at once a sense arrives without one.
--
-- TO REPLAY THE IMPORT: apply this file, insert a fresh token, run the script, apply 0054.
-- Never leave the function in place.

insert into lex.sources (id, name, url, license, tier, notes)
values ('azure-translator', 'Azure AI Translator',
        'https://learn.microsoft.com/azure/ai-services/translator/',
        'machine output, no separate licence; the English source is CC BY-SA 4.0 Wiktionary',
        'open',
        'Vietnamese glosses produced by translating lex.senses.gloss_en. Every row carries gloss_vi_is_mt = true. Needs a human pass before it is treated as authoritative.')
on conflict (id) do nothing;

create table if not exists lex.import_token (token text primary key);
alter table lex.import_token enable row level security;
-- No policy, so no role reaches it directly. The function below is SECURITY DEFINER and
-- reads it as the owner.

create or replace function lex.import_gloss_vi(p_token text, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = lex, public
as $function$
declare
  n integer;
begin
  if p_token is null or not exists (select 1 from lex.import_token t where t.token = p_token) then
    raise exception 'bad token' using errcode = '42501';
  end if;

  with incoming as (
    select r ->> 'id' as id, btrim(r ->> 'gloss_vi') as gloss_vi
    from jsonb_array_elements(p_rows) r
  )
  update lex.senses s
     set gloss_vi = i.gloss_vi,
         gloss_vi_is_mt = true,
         source_id = coalesce(s.source_id, 'azure-translator')
    from incoming i
   where s.id = i.id
     and s.gloss_vi is null
     and i.gloss_vi is not null
     and i.gloss_vi <> '';

  get diagnostics n = row_count;
  return n;
end;
$function$;

grant execute on function lex.import_gloss_vi(text, jsonb) to anon, authenticated;

insert into supabase_migrations.schema_migrations (version, name)
values ('20260922000001', 'import_gloss_vi_helper')
on conflict (version) do nothing;
