-- 0181_ai_coach_cache.sql
-- One word-coach answer per entry and prompt version, shared by every learner, so the
-- router is asked once per entry instead of once per click. POST /api/ai builds the answer
-- from the entry's own data (lib/ai/coach.ts), checks it, then stores it here through
-- public.ai_coach_store with the caller's session.
--
-- Signed-in readers may read every row. Only the function writes, and only for a permanent
-- account, an existing entry and an answer in the shape the page reads. It cannot check what
-- the mnemonic says, so a permanent account calling it directly can store any text for an
-- entry that has no fresh row; created_by names who did. A row older than the entry's
-- published learner layer is stale: the read policy hides it and the function replaces it,
-- so a republished layer is coached again.
--
-- TO ROLL BACK: drop the function and the table.

create table if not exists public.ai_coach (
  entry_id text not null,
  prompt_version text not null check (length(prompt_version) between 1 and 40),
  model text not null check (length(model) between 1 and 120),
  answer jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (entry_id, prompt_version)
);

comment on table public.ai_coach is 'Word-coach answers per entry and prompt version, read by every learner; written by public.ai_coach_store.';
comment on column public.ai_coach.model is 'Router model that wrote the answer.';
comment on column public.ai_coach.answer is 'The checked answer as the page reads it: mnemonic, collocations, examples, confusables.';
comment on column public.ai_coach.created_by is 'Account whose request stored the row.';

alter table public.ai_coach enable row level security;
-- postgres's default privileges in public hand every API role every privilege on a new
-- table (0058).
revoke all on public.ai_coach from anon, authenticated, service_role;
grant select on public.ai_coach to authenticated;

create policy ai_coach_select_fresh on public.ai_coach for select to authenticated
  using (created_at >= coalesce(
    (select l.created_at from lex.learner_entries l where l.entry_id = ai_coach.entry_id and l.status = 'published'),
    '-infinity'::timestamptz));

create or replace function public.ai_coach_store(p_entry_id text, p_prompt_version text, p_model text, p_answer jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, lex
as $$
declare
  v_uid uuid := auth.uid();
  v_layer timestamptz;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'permanent_account_required' using errcode = '42501';
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

  select created_at into v_layer from lex.learner_entries where entry_id = p_entry_id and status = 'published';
  insert into public.ai_coach as c (entry_id, prompt_version, model, answer, created_by)
  values (p_entry_id, p_prompt_version, p_model, p_answer, v_uid)
  on conflict (entry_id, prompt_version) do update
    set model = excluded.model, answer = excluded.answer, created_by = excluded.created_by, created_at = now()
    where c.created_at < coalesce(v_layer, '-infinity'::timestamptz);
end;
$$;

revoke all on function public.ai_coach_store(text, text, text, jsonb) from public, anon, service_role;
grant execute on function public.ai_coach_store(text, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name)
values ('20261005000181', 'ai_coach_cache')
on conflict (version) do nothing;
