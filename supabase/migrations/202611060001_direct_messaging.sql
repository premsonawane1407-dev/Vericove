-- Private, participant-scoped direct messaging. This migration adds new DM
-- entities without changing the existing health_messages or profile policies.
begin;

create table public.dm_conversations (
  id uuid primary key default gen_random_uuid(),
  conversation_type text not null default 'direct' check (conversation_type = 'direct'),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz
);

create table public.dm_participants (
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  muted boolean not null default false,
  archived boolean not null default false,
  primary key (conversation_id, user_id)
);

create table public.dm_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.dm_user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  allow_message_requests boolean not null default false,
  show_read_receipts boolean not null default true,
  show_online_status boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.dm_requests (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null unique references public.dm_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

create table public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null default '' check (char_length(content) <= 10000),
  message_type text not null default 'text' check (message_type in ('text', 'image', 'file', 'audio')),
  reply_to_message_id uuid references public.dm_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  check (char_length(content) > 0 or message_type <> 'text')
);

create table public.dm_reactions (
  message_id uuid not null references public.dm_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('❤️', '😂', '😮', '😢', '👍', '👏')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create table public.dm_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.dm_messages(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) <= 255),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','application/pdf','text/plain','audio/webm','audio/ogg','audio/mp4')),
  file_size bigint not null check (file_size > 0 and file_size <= 52428800),
  created_at timestamptz not null default now()
);

create table public.dm_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.dm_conversations(id) on delete set null,
  message_id uuid references public.dm_messages(id) on delete set null,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_user_id)
);

create index dm_participants_user_conversation_idx on public.dm_participants(user_id, conversation_id);
create index dm_messages_conversation_created_idx on public.dm_messages(conversation_id, created_at desc, id desc);
create index dm_requests_recipient_status_idx on public.dm_requests(recipient_id, status, created_at desc);
create index dm_attachments_message_idx on public.dm_attachments(message_id);

create or replace function public.dm_touch_conversation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.dm_conversations set last_message_at = new.created_at, updated_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;
create trigger dm_message_activity after insert on public.dm_messages
  for each row execute function public.dm_touch_conversation();
revoke all on function public.dm_touch_conversation() from public;

create or replace function public.dm_validate_message_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.sender_id <> old.sender_id or new.conversation_id <> old.conversation_id
      or new.message_type <> old.message_type or new.created_at <> old.created_at then
      raise exception 'Message ownership and location cannot be changed';
    end if;
    if old.deleted_at is not null and new.deleted_at is null then
      raise exception 'Deleted messages cannot be restored';
    end if;
  end if;
  if new.reply_to_message_id is not null and not exists (
    select 1 from public.dm_messages parent
    where parent.id = new.reply_to_message_id and parent.conversation_id = new.conversation_id
  ) then raise exception 'Reply target must belong to the same conversation'; end if;
  return new;
end;
$$;
create trigger dm_message_update_guard before insert or update on public.dm_messages
  for each row execute function public.dm_validate_message_update();
revoke all on function public.dm_validate_message_update() from public;

create or replace function public.dm_validate_attachment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare conversation_id uuid;
begin
  select m.conversation_id into conversation_id from public.dm_messages m where m.id = new.message_id and m.sender_id = auth.uid();
  if conversation_id is null or split_part(new.storage_path, '/', 1) <> conversation_id::text
    or split_part(new.storage_path, '/', 2) <> auth.uid()::text then
    raise exception 'Attachment path must belong to the author and conversation';
  end if;
  return new;
end;
$$;
create trigger dm_attachment_path_guard before insert or update on public.dm_attachments
  for each row execute function public.dm_validate_attachment();
revoke all on function public.dm_validate_attachment() from public;

create or replace function public.dm_is_participant(target_conversation uuid, target_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.dm_participants p
    where p.conversation_id = target_conversation and p.user_id = target_user
  );
$$;

create or replace function public.dm_can_read_message(target_message uuid, target_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.dm_messages m
    where m.id = target_message and public.dm_is_participant(m.conversation_id, target_user)
  );
$$;

revoke all on function public.dm_is_participant(uuid, uuid) from public;
revoke all on function public.dm_can_read_message(uuid, uuid) from public;
grant execute on function public.dm_is_participant(uuid, uuid), public.dm_can_read_message(uuid, uuid) to authenticated;

alter table public.dm_conversations enable row level security;
alter table public.dm_participants enable row level security;
alter table public.dm_blocks enable row level security;
alter table public.dm_reports enable row level security;
alter table public.dm_user_preferences enable row level security;
alter table public.dm_requests enable row level security;
alter table public.dm_messages enable row level security;
alter table public.dm_reactions enable row level security;
alter table public.dm_attachments enable row level security;

grant select on public.dm_conversations, public.dm_participants, public.dm_requests, public.dm_messages, public.dm_reactions, public.dm_attachments to authenticated;
grant insert, update, delete on public.dm_messages, public.dm_reactions to authenticated;
grant update (last_read_at, muted, archived) on public.dm_participants to authenticated;
grant select, insert, delete on public.dm_blocks to authenticated;
grant select, insert on public.dm_reports to authenticated;
grant select, insert, update on public.dm_user_preferences to authenticated;
grant select, update (status, updated_at) on public.dm_requests to authenticated;
grant insert, update, delete on public.dm_attachments to authenticated;

create policy "Participants read conversations" on public.dm_conversations for select to authenticated
  using (public.dm_is_participant(id));
create policy "Participants read their membership" on public.dm_participants for select to authenticated
  using (user_id = (select auth.uid()) or public.dm_is_participant(conversation_id));
create policy "Users update their read cursor and preferences" on public.dm_participants for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Users manage blocks they own" on public.dm_blocks for all to authenticated
  using (blocker_id = (select auth.uid())) with check (blocker_id = (select auth.uid()) and blocker_id <> blocked_id);
create policy "Users create and read their own safety reports" on public.dm_reports for select to authenticated
  using (reporter_id = (select auth.uid()));
create policy "Users submit safety reports as themselves" on public.dm_reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid()) and reporter_id <> reported_user_id
    and (conversation_id is null or (public.dm_is_participant(conversation_id) and exists (
      select 1 from public.dm_participants p where p.conversation_id = dm_reports.conversation_id and p.user_id = reported_user_id
    )))
    and (message_id is null or (conversation_id is not null and exists (
      select 1 from public.dm_messages m where m.id = dm_reports.message_id and m.conversation_id = dm_reports.conversation_id and public.dm_is_participant(m.conversation_id)
    )))
  );
create policy "Users manage their messaging preferences" on public.dm_user_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Participants read their request" on public.dm_requests for select to authenticated
  using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));
create policy "Recipient accepts or declines request" on public.dm_requests for update to authenticated
  using (recipient_id = (select auth.uid()) and status = 'pending')
  with check (recipient_id = (select auth.uid()) and status in ('accepted', 'declined'));
create policy "Participants read messages" on public.dm_messages for select to authenticated
  using (public.dm_is_participant(conversation_id));
create policy "Participants send as themselves after acceptance" on public.dm_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid()) and public.dm_is_participant(conversation_id)
    and not exists (
      select 1 from public.dm_participants other
      join public.dm_blocks b on b.blocker_id = other.user_id and b.blocked_id = auth.uid()
      where other.conversation_id = dm_messages.conversation_id and other.user_id <> auth.uid()
    )
    and not exists (
      select 1 from public.dm_participants other
      join public.dm_blocks b on b.blocker_id = auth.uid() and b.blocked_id = other.user_id
      where other.conversation_id = dm_messages.conversation_id and other.user_id <> auth.uid()
    )
    and not exists (
      select 1 from public.dm_requests r
      where r.conversation_id = dm_messages.conversation_id and r.status <> 'accepted'
    )
  );
create policy "Authors edit or soft delete their messages" on public.dm_messages for update to authenticated
  using (sender_id = (select auth.uid()) and public.dm_is_participant(conversation_id))
  with check (sender_id = (select auth.uid()) and public.dm_is_participant(conversation_id));
create policy "Participants read reactions" on public.dm_reactions for select to authenticated
  using (public.dm_can_read_message(message_id));
create policy "Participants add own reactions" on public.dm_reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and public.dm_can_read_message(message_id));
create policy "Users remove own reactions" on public.dm_reactions for delete to authenticated
  using (user_id = (select auth.uid()) and public.dm_can_read_message(message_id));
create policy "Participants read attachment metadata" on public.dm_attachments for select to authenticated
  using (exists (select 1 from public.dm_messages m where m.id = message_id and public.dm_is_participant(m.conversation_id) and split_part(storage_path, '/', 1) = m.conversation_id::text));
create policy "Authors manage attachment metadata" on public.dm_attachments for all to authenticated
  using (exists (select 1 from public.dm_messages m where m.id = message_id and m.sender_id = (select auth.uid())))
  with check (exists (select 1 from public.dm_messages m where m.id = message_id and m.sender_id = (select auth.uid())));

create or replace function public.dm_search_people(query text)
returns table (id uuid, display_name text, handle text, avatar_url text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.handle, p.avatar_url
  from public.profiles p
  join public.dm_user_preferences prefs on prefs.user_id = p.id and prefs.allow_message_requests
  where auth.uid() is not null and p.id <> auth.uid()
    and (p.display_name ilike '%' || left(trim(query), 40) || '%'
      or p.handle ilike '%' || left(trim(query), 40) || '%')
    and not exists (select 1 from public.dm_blocks b where b.blocker_id = p.id and b.blocked_id = auth.uid())
    and not exists (select 1 from public.dm_blocks b where b.blocker_id = auth.uid() and b.blocked_id = p.id)
  order by p.display_name limit 20;
$$;

create or replace function public.dm_get_inbox()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'updated_at', c.updated_at,
    'last_message_at', c.last_message_at,
    'peer_id', peer.id,
    'display_name', peer.display_name,
    'handle', peer.handle,
    'avatar_url', peer.avatar_url,
    'last_read_at', mine.last_read_at,
    'peer_read_at', case when coalesce(peer_prefs.show_read_receipts, true) then other.last_read_at else null end,
    'muted', mine.muted,
    'archived', mine.archived,
    'request', req.status = 'pending' and req.recipient_id = auth.uid(),
    'can_respond', req.status = 'pending' and req.recipient_id = auth.uid(),
    'request_id', req.id,
    'request_status', req.status,
    'last_message', case when msg.id is null then null else jsonb_build_object('id', msg.id, 'content', msg.content, 'sender_id', msg.sender_id, 'message_type', msg.message_type, 'created_at', msg.created_at) end
  ) order by coalesce(c.last_message_at, c.created_at) desc), '[]'::jsonb)
  into result
  from public.dm_participants mine
  join public.dm_conversations c on c.id = mine.conversation_id
  join public.dm_participants other on other.conversation_id = c.id and other.user_id <> auth.uid()
  join public.profiles peer on peer.id = other.user_id
  left join public.dm_user_preferences peer_prefs on peer_prefs.user_id = other.user_id
  left join public.dm_requests req on req.conversation_id = c.id
  left join lateral (
    select m.* from public.dm_messages m
    where m.conversation_id = c.id and m.deleted_at is null
    order by m.created_at desc limit 1
  ) msg on true
  where mine.user_id = auth.uid() and not mine.archived
    and not (req.status = 'declined' and req.recipient_id = auth.uid())
    and not exists (select 1 from public.dm_blocks b where b.blocker_id = auth.uid() and b.blocked_id = other.user_id)
    and not exists (select 1 from public.dm_blocks b where b.blocker_id = other.user_id and b.blocked_id = auth.uid());
  return result;
end;
$$;

create or replace function public.dm_search_messages(query text)
returns table (id uuid, conversation_id uuid, content text, sender_id uuid, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id, m.conversation_id, m.content, m.sender_id, m.created_at
  from public.dm_messages m
  where auth.uid() is not null and public.dm_is_participant(m.conversation_id)
    and m.deleted_at is null and char_length(trim(query)) > 0
    and m.content ilike '%' || replace(replace(left(trim(query), 100), '%', '\\%'), '_', '\\_') || '%'
  order by m.created_at desc limit 30;
$$;

create or replace function public.dm_start_request(target_handle text, initial_content text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target_id uuid; conversation_id uuid; request_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(trim(initial_content)) not between 1 and 10000 then raise exception 'Message must contain 1 to 10000 characters'; end if;
  select p.id into target_id from public.profiles p
    join public.dm_user_preferences prefs on prefs.user_id = p.id and prefs.allow_message_requests
    where lower(p.handle) = lower(trim(target_handle)) and p.id <> auth.uid();
  if target_id is null then raise exception 'This member is not accepting message requests'; end if;
  if exists (select 1 from public.dm_blocks b where (b.blocker_id = target_id and b.blocked_id = auth.uid()) or (b.blocker_id = auth.uid() and b.blocked_id = target_id)) then
    raise exception 'This conversation is unavailable';
  end if;
  select c.id into conversation_id
    from public.dm_conversations c
    join public.dm_participants a on a.conversation_id = c.id and a.user_id = auth.uid()
    join public.dm_participants b on b.conversation_id = c.id and b.user_id = target_id
    left join public.dm_requests r on r.conversation_id = c.id
    where r.status = 'accepted' limit 1;
  if conversation_id is not null then
    insert into public.dm_messages(conversation_id, sender_id, content)
      values (conversation_id, auth.uid(), trim(initial_content));
    update public.dm_conversations set last_message_at = now(), updated_at = now() where id = conversation_id;
    return conversation_id;
  end if;
  insert into public.dm_conversations(created_by) values (auth.uid()) returning id into conversation_id;
  insert into public.dm_participants(conversation_id, user_id) values (conversation_id, auth.uid()), (conversation_id, target_id);
  insert into public.dm_requests(conversation_id, sender_id, recipient_id) values (conversation_id, auth.uid(), target_id) returning id into request_id;
  insert into public.dm_messages(conversation_id, sender_id, content) values (conversation_id, auth.uid(), trim(initial_content));
  update public.dm_conversations set last_message_at = now(), updated_at = now() where id = conversation_id;
  return conversation_id;
end;
$$;

create or replace function public.dm_respond_request(target_request uuid, accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.dm_requests set status = case when accept then 'accepted' else 'declined' end, updated_at = now()
    where id = target_request and recipient_id = auth.uid() and status = 'pending';
  if not found then raise exception 'Request unavailable'; end if;
end;
$$;

revoke all on function public.dm_search_people(text), public.dm_search_messages(text), public.dm_get_inbox(), public.dm_start_request(text, text), public.dm_respond_request(uuid, boolean) from public;
grant execute on function public.dm_search_people(text), public.dm_search_messages(text), public.dm_get_inbox(), public.dm_start_request(text, text), public.dm_respond_request(uuid, boolean) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('private-dm-files', 'private-dm-files', false, 52428800,
  array['image/jpeg','image/png','image/webp','application/pdf','text/plain','audio/webm','audio/ogg','audio/mp4'])
on conflict (id) do nothing;

create policy "Participants read private message files" on storage.objects for select to authenticated
  using (
    bucket_id = 'private-dm-files' and exists (
      select 1 from public.dm_attachments a join public.dm_messages m on m.id = a.message_id
      where a.storage_path = name and split_part(name, '/', 1) = m.conversation_id::text and public.dm_is_participant(m.conversation_id)
    )
  );
create policy "Conversation participants upload private message files" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'private-dm-files' and exists (
      select 1 from public.dm_participants p
      where p.user_id = (select auth.uid()) and split_part(name, '/', 1) = p.conversation_id::text
        and split_part(name, '/', 2) = (select auth.uid())::text
    )
  );
create policy "Upload owners remove private message files" on storage.objects for delete to authenticated
  using (bucket_id = 'private-dm-files' and owner_id = (select auth.uid())::text);

create policy "Conversation participants use private typing broadcasts" on realtime.messages for all to authenticated
  using (
    extension = 'broadcast' and case when split_part((select realtime.topic()), ':', 2) ~* '^[0-9a-f-]{36}$'
      then public.dm_is_participant(split_part((select realtime.topic()), ':', 2)::uuid) else false end
  )
  with check (
    extension = 'broadcast' and case when split_part((select realtime.topic()), ':', 2) ~* '^[0-9a-f-]{36}$'
      then public.dm_is_participant(split_part((select realtime.topic()), ':', 2)::uuid) else false end
  );

do $$ begin
  alter publication supabase_realtime add table public.dm_messages;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.dm_reactions;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.dm_participants;
exception when duplicate_object then null;
end $$;

commit;
