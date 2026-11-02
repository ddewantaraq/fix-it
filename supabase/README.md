# Supabase setup — Iklim PAL

1. Create a Supabase project.
2. Run [`migrations/002_iklim_pal.sql`](migrations/002_iklim_pal.sql) in the SQL editor (preferred for new projects).
3. Create storage buckets:
   - `session-photos`
   - `session-masks`
   - `session-share-cards`
   - `session-voice`
4. Put URL + service role key in repo-root `.env`.
5. Seed pack FK (API also upserts on session create):

```sql
insert into public.action_packs (id, version, json)
values ('plastic_litter_id_v1', '1', '{"id":"plastic_litter_id_v1"}'::jsonb)
on conflict (id) do nothing;
```

If you previously applied `001_init.sql` (fan schema), prefer a fresh project or drop old `device_packs` / `repair_briefs` tables before applying `002_iklim_pal.sql`.
