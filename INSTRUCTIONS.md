# How to use Iklim PAL

Iklim PAL helps young people turn a **local litter concern** into a **safe, step-by-step action plan**.

It is **not** a climate science chatbot, **not** a political organizer, and **not** “upload a photo and get a diagnosis.” It uses Meta Muse models (SAM, Spark, Wonder, Image) plus a fixed Action Pack of approved questions and actions.

---

## What you need

1. **Node.js 20+**
2. Repo dependencies: `npm install`
3. Root **`.env`** with at least:
   - `MODEL_API_KEY` — Meta Model API
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY` (optional for client)
   - `API_PORT=3001`
   - `WEB_ORIGIN=http://localhost:5173`
   - `VITE_API_BASE_URL=http://localhost:3001`
4. Supabase schema applied once (see below) and storage buckets:
   - `session-photos`, `session-masks`, `session-share-cards`, `session-voice`

Copy from example:

```bash
cp .env.example .env
# then fill in keys
```

### One-time database setup

In the Supabase SQL editor, run in order:

1. [`supabase/migrations/001_iklim_pal.sql`](supabase/migrations/001_iklim_pal.sql)
2. [`supabase/migrations/002_session_owner_progress.sql`](supabase/migrations/002_session_owner_progress.sql) — `owner_key`, `active` status, plan progress

Then (if not already seeded):

```sql
insert into public.action_packs (id, version, json)
values ('plastic_litter_id_v1', '1', '{"id":"plastic_litter_id_v1"}'::jsonb)
on conflict (id) do nothing;
```

When the API starts correctly you should see:

`Iklim PAL API listening ... (store=supabase)`

If you see `store=local`, the SQL migration is missing or the service role cannot reach the tables.

---

## Start the app

Use two terminals from the repo root:

```bash
npm run dev:api
npm run dev:web
```

- API: http://localhost:3001  
- Web: http://localhost:5173  

Check API health:

```bash
curl http://localhost:3001/health
```

Expect `"store":"supabase"`.

---

## Using the UI (demo flow)

### Hero path (riverbank litter)

1. Open the web app.
2. Choose a **real litter photo** — use the demo fixture:
   - `fixtures/litter/S2_riverbank_bags/photo.png`
3. Optionally tap **Use my location** (browser asks permission). Only a place name is kept — GPS coordinates are not stored.
4. Click **Start**.
5. Wait while SAM marks litter (large photos can take a minute).
6. Confirm Muse’s reading of the concern (**Yes / No**). If No, type a short concern or tap **Record** to speak it (browser mic → Muse Voice Transcribe), then **Send**.
7. Answer place + safety questions (city, gloves, friends, near water, hazards, time). These turns are **pack-ordered** (no Spark wait).
8. When an action is proposed, click **Accept action**.
9. Review the **Action Plan** and answer whether it matches the photo. If No, restate the concern and the plan rebuilds.
10. Open **Plans** in the top bar to see Active / Past plans and check off steps as you go.

### Hazard path (escalate)

1. Use `fixtures/litter/S4_hazard_escalate/photo.png`.
2. If the photo or your answers indicate needles, medical waste, oil drums, or unknown chemicals, the app should **escalate**: stop DIY cleanup and finalize a **stop-and-get-help plan** (stay clear → note location → contact adult/authority), visible under **Plans → Past**.

Other fixtures:

| Folder | Use |
| --- | --- |
| `fixtures/litter/S1_street_bottles/photo.png` | Street bottles |
| `fixtures/litter/S2_riverbank_bags/photo.png` | Hero demo |
| `fixtures/litter/S3_drain_clog/photo.png` | Drain litter |
| `fixtures/litter/S4_hazard_escalate/photo.png` | Escalate |

---

## What “good” looks like

- Masks / evidence appear after inspection.
- Questions come only from the Action Pack (no free-form politics).
- Final plan has steps, materials, safety notes, and how to measure (bags, before/after photos).
- Hazard cases escalate instead of inventing a cleanup.

---

## Engineer checks (optional)

```bash
npm run smoke:meta      # Meta API key connectivity (tiny image)
npm run test:safety
npm run test:quality
npm run e2e:real        # full real-photo agent path (API must be running)
```

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `/health` shows `store: local` | Apply `001_iklim_pal.sql` **and** `002_session_owner_progress.sql`; confirm service role can reach tables; restart API |
| Plans empty / progress fails / status `active` rejected | Migration `002` missing (`owner_key`, `active` in status check, `progress` jsonb) |
| Photo upload fails | Confirm buckets `session-photos`, `session-masks`, `session-share-cards`, `session-voice` exist; service role key correct |
| Long wait after Start | Normal for large photos + SAM (and first Spark concern); wait 1–3 minutes |
| Meta API errors | Check `MODEL_API_KEY` and Meta credits / billing |
| Blank plan / errors mid-flow | Check API terminal logs; re-run with S2 fixture |
| Hazard **Yes** / Continue loops with same warning, no plan | Restart API on latest code — escalate should save an authority-contact plan; open **Plans** → Past |
| Plans card opens but “No action plan on this session yet” | Escalated before plan backfill: refresh Plans (list/detail backfills escalate plan) or re-run hazard path |
| Status stuck on `summarizing` (no checkboxes in Plans detail) | Finish chat: answer **Yes** on “Does this plan match your photo?” → status becomes `active` |
| No share card on Plans detail | Muse Image may have failed at finalize (plan still works); happy path in chat may show card if generation succeeded |
| No **Record** / voice UI | Voice only on concern rewrite: answer **No** on concern confirm → mic appears; allow mic permission |
| Time question only chips, need custom answer | Use “Or type a different amount” under the chips |
| CORS / web can’t reach API | `WEB_ORIGIN` and `VITE_API_BASE_URL` must match how you open the app (ports 3001 / 5173) |

---

## Safety reminders for users

- Daylight only; closed-toe shoes; sturdy gloves.
- Do not touch needles, medical waste, oil drums, or unknown chemicals.
- Do not enter fast water, culverts, or drains.
- Prefer a buddy; tell an adult where you are going.
