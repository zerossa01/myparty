-- =====================================================================
-- Partygram — Watch Party Schema
-- Paste this whole file into the Supabase SQL Editor and run it.
-- =====================================================================

-- Extensions ----------------------------------------------------------
create extension if not exists "pgcrypto";

-- =====================================================================
-- Tables
-- =====================================================================

-- rooms ---------------------------------------------------------------
create table if not exists public.rooms (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  host_id     text not null,
  video_url   text,
  created_at  timestamptz not null default now()
);

-- users (room participants, NOT auth.users) ---------------------------
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.rooms(id) on delete cascade,
  display_name  text not null,
  avatar_emoji  text not null,
  joined_at     timestamptz not null default now()
);

-- messages ------------------------------------------------------------
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  text        text not null,
  created_at  timestamptz not null default now()
);

-- Helpful indexes
create index if not exists rooms_code_idx          on public.rooms(code);
create index if not exists users_room_id_idx       on public.users(room_id);
create index if not exists messages_room_id_idx    on public.messages(room_id);
create index if not exists messages_created_at_idx on public.messages(created_at);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.rooms    enable row level security;
alter table public.users    enable row level security;
alter table public.messages enable row level security;

-- ---- rooms ----------------------------------------------------------
drop policy if exists "rooms_select_all"   on public.rooms;
drop policy if exists "rooms_insert_self"  on public.rooms;
drop policy if exists "rooms_update_host"  on public.rooms;

create policy "rooms_select_all"
  on public.rooms for select
  using (true);

-- The host_id stores the auth.uid() (text) of whoever created the room.
create policy "rooms_insert_self"
  on public.rooms for insert
  with check (auth.uid()::text = host_id);

-- The current host can update the room (e.g. set video_url, transfer
-- host_id to another user). After transferring host, the previous host
-- loses update rights and the new one gets them.
create policy "rooms_update_host"
  on public.rooms for update
  using (auth.uid()::text = host_id)
  with check (true);

-- ---- users ----------------------------------------------------------
drop policy if exists "users_select_all"  on public.users;
drop policy if exists "users_insert_self" on public.users;

create policy "users_select_all"
  on public.users for select
  using (true);

-- A participant row's id is set client-side to the auth.uid() so each
-- authenticated guest can only insert their own row.
create policy "users_insert_self"
  on public.users for insert
  with check (auth.uid()::text = id::text);

-- ---- messages -------------------------------------------------------
drop policy if exists "messages_select_all"  on public.messages;
drop policy if exists "messages_insert_self" on public.messages;

create policy "messages_select_all"
  on public.messages for select
  using (true);

-- A message's user_id must match the sender's auth.uid().
create policy "messages_insert_self"
  on public.messages for insert
  with check (auth.uid()::text = user_id::text);

-- =====================================================================
-- Realtime
-- =====================================================================
-- Make sure the realtime publication exists, then add our tables to it.
do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;
end$$;

alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.users;
alter publication supabase_realtime add table public.messages;

-- Ensure UPDATE/DELETE events carry full row data for realtime
alter table public.rooms    replica identity full;
alter table public.users    replica identity full;
alter table public.messages replica identity full;
