-- 0181_ai_coach_cache.sql
-- Shared word-coach answers, so the router is asked once per entry rather than once per click.
-- POST /api/ai builds the answer from the entry's own data (lib/ai/coach.ts), checks it, then
-- stores it through public.ai_coach_store.
--
-- A row is keyed by the sha256 of the exact grounding the prompt was built from, with the
-- language, the entry and the prompt version. A published layer or changed senses give a new
-- key, so a stale answer is never read; rows older than 180 days are dropped on the next write.
--
-- Signed-in readers may read every row. Writing needs the server-only secret at SSM
-- /zhesen/prod/ai_cache_secret: the function compares its sha256 with the one in
-- private.ai_cache_secret, a schema PostgREST does not expose and no API role can read.
-- infra/supabase/bin/set-ai-cache-secret.sh stores that hash on the instance.
--
-- reviewed-destructive: the age cleanup inside ai_coach_store, asked for in the review of 2026-10-05.
-- TO ROLL BACK: drop the function, the table, private.ai_cache_secret and the private schema.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

create table if not exists private.ai_cache_secret (
  id boolean primary key default true check (id),
  hash bytea not null check (length(hash) = 32)
);
revoke all on private.ai_cache_secret from public, anon, authenticated, service_role;

create table if not exists public.ai_coach (
  cache_key text primary key check (cache_key ~ '^[0-9a-f]{64}$'),
  entry_id text not null,
  prompt_version text not null check (length(prompt_version) between 1 and 40),
  model text not null check (length(model) between 1 and 120),
  answer jsonb not null,
  created_at timestamptz not null default now()
);

comment on table public.ai_coach is 'Word-coach answers keyed by the sha256 of their grounding, read by every learner; written by public.ai_coach_store.';
comment on column public.ai_coach.model is 'Router model that wrote the answer.';
comment on column public.ai_coach.answer is 'The checked answer as the page reads it: mnemonic, collocations, examples, confusables.';

alter table public.ai_coach enable row level security;
-- postgres's default privileges in public hand every API role every privilege on a new
-- table (0058).
revoke all on public.ai_coach from anon, authenticated, service_role;
grant select on public.ai_coach to authenticated;

drop policy if exists ai_coach_select on public.ai_coach;
create policy ai_coach_select on public.ai_coach for select to authenticated using (true);

create or replace function public.ai_coach_store(
  p_secret text, p_cache_key text, p_entry_id text, p_prompt_version text, p_model text, p_answer jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, lex
as $$
begin
  if p_secret is null
     or not exists (select 1 from private.ai_cache_secret s where s.hash = sha256(convert_to(p_secret, 'UTF8'))) then
    raise exception 'bad_secret' using errcode = '42501';
  end if;
  if not exists (select 1 from lex.entries where id = p_entry_id) then
    raise exception 'no_such_entry' using errcode = '22023';
  end if;
  if jsonb_typeof(p_answer) is distinct from 'object'
     or jsonb_typeof(p_answer -> 'mnemonic') is distinct from 'string'
     or jsonb_typeof(p_answer -> 'collocations') is distinct from 'array'
     or jsonb_typeof(p_answer -> 'examples') is distinct from 'array'
     or jsonb_typeof(p_answer -> 'confusables') is distinct from 'array'
     or length(p_answer::text) > 6000 then
    raise exception 'bad_answer' using errcode = '22023';
  end if;

  delete from public.ai_coach where created_at < now() - interval '180 days';
  insert into public.ai_coach (cache_key, entry_id, prompt_version, model, answer)
  values (p_cache_key, p_entry_id, p_prompt_version, p_model, p_answer)
  on conflict (cache_key) do nothing;
end;
$$;

revoke all on function public.ai_coach_store(text, text, text, text, text, jsonb) from public, anon, service_role;
grant execute on function public.ai_coach_store(text, text, text, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name)
values ('20261005000181', 'ai_coach_cache')
on conflict (version) do nothing;
