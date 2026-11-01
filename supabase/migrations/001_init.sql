-- FixIt Vision initial schema (architecture §10)
-- Apply in Supabase SQL editor or via supabase db push / psql.

create extension if not exists "pgcrypto";

create table if not exists public.device_packs (
  id text primary key,
  version text not null default '1',
  json jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  device_pack_id text not null references public.device_packs (id),
  symptom text not null,
  status text not null check (
    status in (
      'collecting',
      'inspecting',
      'questioning',
      'checking',
      'summarizing',
      'done',
      'escalated'
    )
  ),
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.evidence_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  kind text not null check (
    kind in ('sam_mask', 'user_answer', 'safe_check_result', 'model_observation')
  ),
  part_id text,
  question_id text,
  check_id text,
  payload jsonb not null default '{}'::jsonb,
  source text not null check (
    source in ('sam-3.1', 'user', 'muse-spark-1.3', 'rules')
  ),
  created_at timestamptz not null default now()
);

create index if not exists evidence_items_session_id_idx
  on public.evidence_items (session_id);

create table if not exists public.hypotheses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  label text not null,
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  status text not null check (
    status in ('candidate', 'weakened', 'ruled_out', 'unresolved')
  ),
  supporting_evidence_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.repair_briefs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  brief jsonb not null,
  overlay_path text,
  created_at timestamptz not null default now()
);

create index if not exists repair_briefs_session_id_idx
  on public.repair_briefs (session_id);

-- Demo-grade RLS: enable later with session tokens. Service role bypasses RLS.
alter table public.device_packs enable row level security;
alter table public.sessions enable row level security;
alter table public.evidence_items enable row level security;
alter table public.hypotheses enable row level security;
alter table public.repair_briefs enable row level security;

-- Storage buckets must be created in Dashboard or via storage API:
--   session-photos, session-masks, session-overlays
-- Suggested: private buckets; API signs URLs with service role.
