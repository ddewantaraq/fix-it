# Supabase setup

1. Create a free project at https://supabase.com
2. Copy Project URL, anon key, and service role key into repo-root `.env`
3. Open **SQL Editor** → paste and run [`migrations/001_init.sql`](./migrations/001_init.sql)
4. Open **Storage** → create private buckets:
   - `session-photos`
   - `session-masks`
   - `session-overlays`
5. (Optional) seed the device pack:

```sql
insert into public.device_packs (id, version, json)
values (
  'household_fan_v1',
  '1',
  '{}'::jsonb  -- replace with contents of packages/device-packs/household_fan_v1.json if desired
)
on conflict (id) do nothing;
```

The API loads the pack from the repo JSON at runtime; the `device_packs` table is for session FK integrity. Insert a stub row:

```sql
insert into public.device_packs (id, version, json)
values ('household_fan_v1', '1', '{"id":"household_fan_v1"}'::jsonb)
on conflict (id) do nothing;
```

API uses `SUPABASE_SERVICE_ROLE_KEY` for inserts/uploads (never expose that key to the browser).
