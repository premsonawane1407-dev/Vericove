-- Private My Health data. Apply only after the existing Supabase Auth flow is
-- connected; the current app's browser preview does not create auth sessions.
create table public.health_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','paused','review','complete')),
  branch text,
  state jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index health_sessions_user_updated_idx on public.health_sessions(user_id, updated_at desc);
alter table public.health_sessions enable row level security;
grant select, insert, update, delete on public.health_sessions to authenticated;
create policy "Users manage their own health sessions" on public.health_sessions
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table public.health_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.health_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null check (char_length(content) between 1 and 4000),
  question_key text,
  created_at timestamptz not null default now()
);
create index health_messages_session_created_idx on public.health_messages(session_id, created_at);
alter table public.health_messages enable row level security;
grant select, insert, update, delete on public.health_messages to authenticated;
create policy "Users manage their own health messages" on public.health_messages
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (
    select 1 from public.health_sessions s where s.id = session_id and s.user_id = (select auth.uid())
  ));

create table public.health_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'symptom' check (kind in ('symptom','medication','note','treatment','summary')),
  title text not null check (char_length(title) between 1 and 240),
  details text not null default '' check (char_length(details) <= 8000),
  occurred_on date not null default current_date,
  severity text check (severity is null or severity in ('mild','moderate','severe','not_recorded')),
  origin text not null default 'manual' check (origin in ('manual','mira','import')),
  session_id uuid references public.health_sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index health_entries_user_date_idx on public.health_entries(user_id, occurred_on desc, created_at desc);
alter table public.health_entries enable row level security;
grant select, insert, update, delete on public.health_entries to authenticated;
create policy "Users manage their own health entries" on public.health_entries
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table public.health_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.health_sessions(id) on delete set null,
  title text not null default 'Appointment summary' check (char_length(title) <= 240),
  reported_facts jsonb not null default '{}'::jsonb check (jsonb_typeof(reported_facts) = 'object'),
  observations jsonb not null default '[]'::jsonb check (jsonb_typeof(observations) = 'array'),
  approved_for_export boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index health_summaries_user_created_idx on public.health_summaries(user_id, created_at desc);
alter table public.health_summaries enable row level security;
grant select, insert, update, delete on public.health_summaries to authenticated;
create policy "Users manage their own health summaries" on public.health_summaries
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table public.health_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 240),
  category text not null default 'document' check (category in ('report','appointment_summary','treatment','document')),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
  byte_size bigint not null check (byte_size between 1 and 10485760),
  uploaded_at timestamptz not null default now()
);
create index health_documents_user_uploaded_idx on public.health_documents(user_id, uploaded_at desc);
alter table public.health_documents enable row level security;
grant select, insert, update, delete on public.health_documents to authenticated;
create policy "Users manage their own health documents" on public.health_documents
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and storage_path like user_id::text || '/%');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('private-health-records', 'private-health-records', false, 10485760, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do nothing;
create policy "Users read their private health files" on storage.objects
  for select to authenticated using (bucket_id = 'private-health-records' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users upload their private health files" on storage.objects
  for insert to authenticated with check (bucket_id = 'private-health-records' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users update their private health files" on storage.objects
  for update to authenticated using (bucket_id = 'private-health-records' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'private-health-records' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users delete their private health files" on storage.objects
  for delete to authenticated using (bucket_id = 'private-health-records' and (storage.foldername(name))[1] = (select auth.uid())::text);

create function public.touch_health_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.touch_health_updated_at() from public, anon, authenticated;
create trigger health_sessions_touch_updated_at before update on public.health_sessions
  for each row execute function public.touch_health_updated_at();
create trigger health_entries_touch_updated_at before update on public.health_entries
  for each row execute function public.touch_health_updated_at();
create trigger health_summaries_touch_updated_at before update on public.health_summaries
  for each row execute function public.touch_health_updated_at();
