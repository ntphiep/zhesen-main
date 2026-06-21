-- Daily activity log powering the study streak. One row per user per day the user
-- practised (any mode); idempotent via the (user_id, day) primary key.
create table if not exists public.review_log (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);

alter table public.review_log enable row level security;

create policy review_log_select_own on public.review_log
  for select to authenticated using (user_id = auth.uid());
create policy review_log_insert_own on public.review_log
  for insert to authenticated with check (user_id = auth.uid());

grant select, insert on public.review_log to authenticated;
