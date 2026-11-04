-- Owner key (anonymous device) + plan progress + active status
-- Apply in Supabase SQL editor after 001_iklim_pal.sql

alter table public.sessions
  add column if not exists owner_key text;

create index if not exists sessions_owner_key_idx
  on public.sessions (owner_key);

-- Recreate status check to include `active` (plan in progress)
alter table public.sessions drop constraint if exists sessions_status_check;
alter table public.sessions
  add constraint sessions_status_check check (
    status in (
      'collecting',
      'inspecting',
      'questioning',
      'planning',
      'summarizing',
      'active',
      'done',
      'escalated'
    )
  );

alter table public.action_plans
  add column if not exists progress jsonb not null default '{"completedStepOrders":[]}'::jsonb;
