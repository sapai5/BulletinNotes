-- ============================================================================
-- Migration 003 — Drawing / mini-whiteboard note kind
-- Run this in the Supabase SQL Editor if you already ran an earlier schema.
-- (schema.sql has also been updated for fresh setups.) Safe to re-run.
-- ============================================================================

alter table public.notes
  add column if not exists kind text not null default 'note'
    check (kind in ('note', 'drawing'));

alter table public.notes
  add column if not exists strokes jsonb not null default '[]'::jsonb;

-- Done.
