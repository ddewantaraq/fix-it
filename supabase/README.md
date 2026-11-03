# Supabase setup — Iklim PAL

## Remote project (preferred for production demo)

1. Open SQL editor for your project.
2. Paste and run [`migrations/001_iklim_pal.sql`](migrations/001_iklim_pal.sql) (same content as `002_iklim_pal.sql`).
3. Create storage buckets (API can also create them):
   - `session-photos`
   - `session-masks`
   - `session-share-cards`
   - `session-voice`
4. Put URL + service role key in repo-root `.env`.

Until the SQL migration is applied, the API **auto-falls back** to a local JSON store under `.data/` while still using Supabase Storage when buckets exist, and always calling real Meta Muse models.

## Deprecated

`migrations/archive/001_init_fan_deprecated.sql` is the old FixIt/fan schema — do not apply.
