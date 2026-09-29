-- 0095_word_feedback.sql
-- Reports from the word page that a meaning or an example is wrong, and the admin's answer.
--
-- POST /dictionary/feedback calls public.submit_word_feedback with the caller's own
-- session, so auth.uid() names the account when there is one. RLS is on, no policy exists
-- and no API role holds a privilege on the table: the RPC is the only way in, and it
-- enforces the rate limit itself, because anyone holding the anon key can call it without
-- going through the route. /admin/feedback reads and resolves through the two admin
-- functions below, which check the caller first like every other admin function. Applying
-- a meaning report writes through admin.update_sense (0060), so lex.gloss_terms follows,
-- gloss_vi_is_mt goes false and the old gloss reaches the audit.
--
-- entry_id and sense_id carry no foreign key, like admin.entry_flags (0060): a reload that
-- replaces an entry under the same id keeps its reports.
--
-- TO ROLL BACK: drop the three functions and the table.

create table if not exists public.word_feedback (
  id bigint generated always as identity primary key,
  entry_id text not null,
  sense_id text,
  kind text not null check (kind in ('meaning', 'example', 'other')),
  message text not null check (length(btrim(message)) between 1 and 500),
  suggestion text check (length(suggestion) <= 80),
  user_id uuid references auth.users(id) on delete set null,
  ip_hash text check (length(ip_hash) <= 64),
  status text not null default 'open' check (status in ('open', 'applied', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists word_feedback_status_created_idx
  on public.word_feedback (status, created_at desc);
-- The rate limit counts the last hour.
create index if not exists word_feedback_created_idx
  on public.word_feedback (created_at);

alter table public.word_feedback enable row level security;

-- postgres's default privileges in public hand every API role every privilege on a new
-- table (0058).
revoke all on public.word_feedback from anon, authenticated, service_role;

-- 10 reports an hour per account. Without an account, 10 an hour per address and 300 an hour
-- for all such reports together. p_ip_hash comes from the caller, and the anon key can call
-- this directly with any value, so neither anonymous limit ever stops a signed-in reader. The
-- advisory lock serialises callers, so two at once cannot both pass on the same count.
create or replace function public.submit_word_feedback(
  p_entry_id text, p_sense_id text, p_kind text, p_message text, p_proposed text, p_ip_hash text
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, lex
as $$
declare
  v_uid uuid := auth.uid();
  v_since timestamptz := now() - interval '1 hour';
  v_id bigint;
begin
  if not exists (select 1 from lex.entries where id = p_entry_id) then
    raise exception 'no_such_entry' using errcode = '22023';
  end if;
  if p_sense_id is not null
     and not exists (select 1 from lex.senses where id = p_sense_id and entry_id = p_entry_id) then
    raise exception 'no_such_sense' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.word_feedback'));
  if (v_uid is not null
      and (select count(*) from public.word_feedback where created_at > v_since and user_id = v_uid) >= 10)
     or (v_uid is null
         and ((select count(*) from public.word_feedback where created_at > v_since and user_id is null) >= 300
              or (p_ip_hash is not null
                  and (select count(*) from public.word_feedback
                       where created_at > v_since and user_id is null and ip_hash = p_ip_hash) >= 10))) then
    raise exception 'rate_limited' using errcode = '22023';
  end if;

  insert into public.word_feedback (entry_id, sense_id, kind, message, suggestion, user_id, ip_hash)
  values (p_entry_id, p_sense_id, p_kind, btrim(p_message), nullif(btrim(p_proposed), ''), v_uid, p_ip_hash)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.submit_word_feedback(text, text, text, text, text, text) from public, service_role;
grant execute on function public.submit_word_feedback(text, text, text, text, text, text) to anon, authenticated;

-- The open reports with the entry and sense as they read now, null when a reload removed
-- them. Signed-in readers' reports come first, so an anonymous flood cannot hide them.
create or replace function admin.feedback_open()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, admin, lex, public
as $$
begin
  perform admin.assert_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', f.id,
      'entry_id', f.entry_id,
      'headword', e.headword,
      'lang', e.lang,
      'sense_id', f.sense_id,
      'sense_order', s.sense_order,
      'gloss_vi', s.gloss_vi,
      'gloss_en', s.gloss_en,
      'kind', f.kind,
      'message', f.message,
      'suggestion', f.suggestion,
      'created_at', f.created_at
    ) order by f.user_id is null, f.created_at desc)
    from (
      select * from public.word_feedback
      where status = 'open'
      order by user_id is null, created_at desc
      limit 200
    ) f
    left join lex.entries e on e.id = f.entry_id
    left join lex.senses s on s.id = f.sense_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function admin.feedback_open() from public;
grant execute on function admin.feedback_open() to authenticated;

-- 'applied' on a meaning report with a sense and a suggestion writes the suggestion as that
-- sense's Vietnamese gloss and keeps its English one; any other report can only be closed.
create or replace function admin.resolve_feedback(p_id bigint, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, admin, lex, public
as $$
declare
  f public.word_feedback;
  v_gloss_en text;
begin
  perform admin.assert_admin();

  if p_status is null or p_status not in ('applied', 'dismissed') then
    raise exception 'bad_status' using errcode = '22023';
  end if;

  select * into f from public.word_feedback where id = p_id for update;
  if not found then
    raise exception 'no_such_feedback' using errcode = '22023';
  end if;
  if f.status <> 'open' then
    raise exception 'feedback_resolved' using errcode = '22023';
  end if;

  if p_status = 'applied' then
    if f.kind <> 'meaning' or f.sense_id is null or nullif(btrim(f.suggestion), '') is null then
      raise exception 'nothing_to_apply' using errcode = '22023';
    end if;
    select s.gloss_en into v_gloss_en
    from lex.senses s where s.id = f.sense_id and s.entry_id = f.entry_id;
    if not found then
      raise exception 'no_such_sense' using errcode = '22023';
    end if;
    perform admin.update_sense(f.sense_id, f.suggestion, v_gloss_en);
  end if;

  update public.word_feedback
     set status = p_status, resolved_at = now()
   where id = p_id;

  perform admin.audit('resolve_feedback', p_id::text,
    jsonb_build_object('status', p_status, 'entry_id', f.entry_id, 'sense_id', f.sense_id));
  return jsonb_build_object('id', p_id, 'status', p_status);
end;
$$;

revoke all on function admin.resolve_feedback(bigint, text) from public;
grant execute on function admin.resolve_feedback(bigint, text) to authenticated;

notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations (version, name)
values ('20260929000095', 'word_feedback')
on conflict (version) do nothing;
