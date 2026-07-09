-- ============================================================================
-- Migration 002 — Profiles avatars + Friends
-- Run this in the Supabase SQL Editor if you already ran schema.sql once.
-- (schema.sql has also been updated to include everything here for fresh setups.)
-- Safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Avatars storage bucket (profile pictures)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Public read; users may only write objects under their own <user_id>/ folder.
drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects
  for select to authenticated, anon
  using (bucket_id = 'avatars');

drop policy if exists avatars_insert on storage.objects;
create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ----------------------------------------------------------------------------
-- Friendships
-- ----------------------------------------------------------------------------
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create index if not exists friendships_addressee_idx on public.friendships (addressee_id);
create index if not exists friendships_requester_idx on public.friendships (requester_id);

alter table public.friendships enable row level security;

-- You can see friendship rows you are part of.
drop policy if exists friendships_select on public.friendships;
create policy friendships_select on public.friendships
  for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

-- You may create a request as the requester (also handled by the RPC below).
drop policy if exists friendships_insert on public.friendships;
create policy friendships_insert on public.friendships
  for insert to authenticated
  with check (requester_id = auth.uid());

-- Only the addressee can accept a pending request.
drop policy if exists friendships_update_addressee on public.friendships;
create policy friendships_update_addressee on public.friendships
  for update to authenticated
  using (addressee_id = auth.uid())
  with check (addressee_id = auth.uid());

-- Either party can remove the row (cancel / decline / unfriend).
drop policy if exists friendships_delete on public.friendships;
create policy friendships_delete on public.friendships
  for delete to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Update profiles visibility: also see profiles of friends (any status), so
-- requests and friend lists can show names/avatars.
-- ----------------------------------------------------------------------------
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
    or exists (
      select 1 from public.friendships f
      where (f.requester_id = auth.uid() and f.addressee_id = profiles.id)
         or (f.addressee_id = auth.uid() and f.requester_id = profiles.id)
    )
  );

-- ----------------------------------------------------------------------------
-- Friend-request RPC: add by email. Runs as definer so it can look people up
-- by email. Handles the reciprocal case (auto-accepts if they already asked).
-- ----------------------------------------------------------------------------
create or replace function public.send_friend_request_by_email(_email text)
returns public.friendships
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  target_id uuid;
  existing public.friendships;
  result public.friendships;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  select id into target_id
  from public.profiles
  where lower(email) = lower(trim(_email))
  limit 1;

  if target_id is null then
    raise exception 'No user found with email %. They must sign up first.', _email;
  end if;

  if target_id = me then
    raise exception 'You cannot add yourself';
  end if;

  -- Look for any existing friendship in either direction.
  select * into existing
  from public.friendships
  where (requester_id = me and addressee_id = target_id)
     or (requester_id = target_id and addressee_id = me)
  limit 1;

  if existing.id is not null then
    if existing.status = 'accepted' then
      raise exception 'You are already friends';
    end if;
    -- Pending already exists.
    if existing.requester_id = me then
      raise exception 'Friend request already sent';
    else
      -- They already requested you -> accept it.
      update public.friendships
        set status = 'accepted'
        where id = existing.id
        returning * into result;
      return result;
    end if;
  end if;

  insert into public.friendships (requester_id, addressee_id, status)
  values (me, target_id, 'pending')
  returning * into result;

  return result;
end;
$$;

-- ----------------------------------------------------------------------------
-- Realtime: broadcast friendship changes so the Friends tab updates live.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'friendships'
  ) then
    alter publication supabase_realtime add table public.friendships;
  end if;
end $$;

-- Done.
