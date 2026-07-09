-- ============================================================================
-- Bulletin Board Notes — Supabase schema
-- Run this whole file in the Supabase dashboard: SQL Editor > New query > Run.
-- It is idempotent-ish: safe to re-run, but it drops and recreates policies.
-- ============================================================================

-- Needed for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

-- Mirror of auth.users so we can look people up by email (for invites) and
-- display friendly names without exposing the auth schema.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.board_members (
  board_id uuid not null references public.boards (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor')),
  created_at timestamptz not null default now(),
  primary key (board_id, user_id)
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  text text not null default '',
  color text not null default '#fef08a',
  tags text[] not null default '{}',
  image_url text,
  x double precision not null default 40,
  y double precision not null default 40,
  width double precision not null default 220,
  height double precision not null default 220,
  z_index integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_board_id_idx on public.notes (board_id);
create index if not exists board_members_user_id_idx on public.board_members (user_id);

-- ----------------------------------------------------------------------------
-- Profile auto-creation trigger
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- updated_at trigger for notes
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER to avoid RLS recursion)
-- ----------------------------------------------------------------------------
create or replace function public.is_board_member(_board_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.board_members
    where board_id = _board_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_board_owner(_board_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.boards
    where id = _board_id and owner_id = auth.uid()
  );
$$;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.boards enable row level security;
alter table public.board_members enable row level security;
alter table public.notes enable row level security;

-- profiles: you can read your own profile and the profiles of people who
-- share at least one board with you.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.board_members mine
      join public.board_members theirs on mine.board_id = theirs.board_id
      where mine.user_id = auth.uid() and theirs.user_id = profiles.id
    )
  );

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- boards: visible to the owner and to members.
drop policy if exists boards_select on public.boards;
create policy boards_select on public.boards
  for select to authenticated
  using (owner_id = auth.uid() or public.is_board_member(id));

drop policy if exists boards_insert on public.boards;
create policy boards_insert on public.boards
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists boards_update_owner on public.boards;
create policy boards_update_owner on public.boards
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists boards_delete_owner on public.boards;
create policy boards_delete_owner on public.boards
  for delete to authenticated
  using (owner_id = auth.uid());

-- board_members: members can see the roster; owners manage it; you can remove
-- yourself (leave a board).
drop policy if exists board_members_select on public.board_members;
create policy board_members_select on public.board_members
  for select to authenticated
  using (public.is_board_member(board_id));

drop policy if exists board_members_insert_owner on public.board_members;
create policy board_members_insert_owner on public.board_members
  for insert to authenticated
  with check (public.is_board_owner(board_id));

drop policy if exists board_members_delete on public.board_members;
create policy board_members_delete on public.board_members
  for delete to authenticated
  using (public.is_board_owner(board_id) or user_id = auth.uid());

drop policy if exists board_members_update_owner on public.board_members;
create policy board_members_update_owner on public.board_members
  for update to authenticated
  using (public.is_board_owner(board_id))
  with check (public.is_board_owner(board_id));

-- notes: any board member can read and create; only the author can edit;
-- author or board owner can delete.
drop policy if exists notes_select on public.notes;
create policy notes_select on public.notes
  for select to authenticated
  using (public.is_board_member(board_id));

drop policy if exists notes_insert on public.notes;
create policy notes_insert on public.notes
  for insert to authenticated
  with check (public.is_board_member(board_id) and author_id = auth.uid());

drop policy if exists notes_update_author on public.notes;
create policy notes_update_author on public.notes
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists notes_delete on public.notes;
create policy notes_delete on public.notes
  for delete to authenticated
  using (author_id = auth.uid() or public.is_board_owner(board_id));

-- ----------------------------------------------------------------------------
-- Board creation helper: create the board AND add the owner as a member in one
-- atomic call, so the owner immediately satisfies membership-based policies.
-- ----------------------------------------------------------------------------
create or replace function public.create_board(_name text)
returns public.boards
language plpgsql
security definer
set search_path = public
as $$
declare
  new_board public.boards;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.boards (name, owner_id)
  values (_name, auth.uid())
  returning * into new_board;

  insert into public.board_members (board_id, user_id, role)
  values (new_board.id, auth.uid(), 'owner');

  return new_board;
end;
$$;

-- ----------------------------------------------------------------------------
-- Invite RPC: look a user up by email and add them to a board. Runs as definer
-- so it can read profiles by email without exposing the whole table. Only the
-- board owner may invite.
-- ----------------------------------------------------------------------------
create or replace function public.invite_member_by_email(
  _board_id uuid,
  _email text,
  _role text default 'editor'
)
returns public.board_members
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  new_member public.board_members;
begin
  if not public.is_board_owner(_board_id) then
    raise exception 'Only the board owner can invite members';
  end if;

  if _role not in ('owner', 'editor') then
    raise exception 'Invalid role: %', _role;
  end if;

  select id into target_id
  from public.profiles
  where lower(email) = lower(trim(_email))
  limit 1;

  if target_id is null then
    raise exception 'No user found with email %. They must sign up first.', _email;
  end if;

  insert into public.board_members (board_id, user_id, role)
  values (_board_id, target_id, _role)
  on conflict (board_id, user_id) do update set role = excluded.role
  returning * into new_member;

  return new_member;
end;
$$;

-- ----------------------------------------------------------------------------
-- Storage bucket for note images
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('note-images', 'note-images', true)
on conflict (id) do nothing;

-- Public read (bucket is public), but only board members may upload/replace/
-- delete objects, and objects must live under a folder named after a board
-- the user belongs to: <board_id>/<file>.
drop policy if exists note_images_read on storage.objects;
create policy note_images_read on storage.objects
  for select to authenticated, anon
  using (bucket_id = 'note-images');

drop policy if exists note_images_insert on storage.objects;
create policy note_images_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'note-images'
    and public.is_board_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists note_images_update on storage.objects;
create policy note_images_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'note-images'
    and public.is_board_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists note_images_delete on storage.objects;
create policy note_images_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'note-images'
    and public.is_board_member((storage.foldername(name))[1]::uuid)
  );

-- ----------------------------------------------------------------------------
-- Realtime: broadcast changes for notes and membership
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'notes'
  ) then
    alter publication supabase_realtime add table public.notes;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'board_members'
  ) then
    alter publication supabase_realtime add table public.board_members;
  end if;
end $$;

-- Done.
