-- Iklim PAL schema (replaces fan / device_packs model)
-- Apply in Supabase SQL editor after or instead of 001_init.sql for new projects.

create extension if not exists "pgcrypto";

create table if not exists public.action_packs (
  id text primary key,
  version text not null default '1',
  json jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  action_pack_id text not null references public.action_packs (id),
  concern_text text not null default '',
  city text not null default '',
  status text not null check (
    status in (
      'collecting',
      'inspecting',
      'questioning',
      'planning',
      'summarizing',
      'done',
      'escalated'
    )
  ),
  photo_path text,
  voice_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.evidence_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  kind text not null check (
    kind in (
      'sam_mask',
      'user_answer',
      'action_accepted',
      'model_observation',
      'voice_transcript'
    )
  ),
  part_id text,
  question_id text,
  action_id text,
  payload jsonb not null default '{}'::jsonb,
  source text not null check (
    source in (
      'sam-3.1',
      'user',
      'muse-spark-1.3',
      'muse-wonder-1.0',
      'muse-voice-transcribe-1.0',
      'rules'
    )
  ),
  created_at timestamptz not null default now()
);

create index if not exists evidence_items_session_id_idx
  on public.evidence_items (session_id);

create table if not exists public.action_plans (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  plan jsonb not null,
  share_card_path text,
  created_at timestamptz not null default now()
);

create index if not exists action_plans_session_id_idx
  on public.action_plans (session_id);

alter table public.action_packs enable row level security;
alter table public.sessions enable row level security;
alter table public.evidence_items enable row level security;
alter table public.action_plans enable row level security;

-- Storage buckets (create in dashboard if SQL storage API unavailable):
-- session-photos, session-masks, session-share-cards, session-voice
