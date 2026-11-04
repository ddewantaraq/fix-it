# Iklim PAL

Local climate **action planner** for young people (Meta Global AI Developer Hackathon · Indie · Build for Your World).

Turn a neighborhood litter photo into a **pack-approved, safety-bounded, measurable Action Plan** (Muse confirms the concern with you; place and safety stay in Q&A) — not a climate lecture, not a political tool, not a one-shot image captioner.

**How to use the app:** [`INSTRUCTIONS.md`](INSTRUCTIONS.md)

Also see [`architecture.md`](architecture.md), [`task.md`](task.md), [`docs/anti-project.md`](docs/anti-project.md), [`docs/demo-video-script.md`](docs/demo-video-script.md), and [`docs/demo-script.md`](docs/demo-script.md).

## Muse models used

| Model | Role |
| --- | --- |
| `sam-3.1` | Segment litter in the photo |
| `muse-spark-1.3` | Concern hypothesis after SAM (not every Q&A turn) |
| `muse-wonder-1.0` | Action Plan synthesis |
| `muse-image-1.0` | Share / invite card |
| `muse-voice-transcribe-1.0` | Optional spoken concern on `q_concern` |

**Q&A after concern** uses Action Pack order (deterministic) so answers stay fast. **Plans** home tracks Active/Past plans with step checkoffs (anonymous device `ownerKey`).

**No RAG. No fine-tuning.** Domain knowledge lives in [`packages/action-packs/plastic_litter_id_v1.json`](packages/action-packs/plastic_litter_id_v1.json) (sources: [`docs/pack-sources.md`](docs/pack-sources.md)).

## Stack

- `apps/web` — React + Vite (**Iklim PAL** UI)
- `apps/api` — Node + Express
- `packages/shared` — Zod schemas + `/step` contract
- `packages/action-packs` — litter Action Pack
- Supabase Storage (+ tables when migrated); local JSON fallback under `.data/` if SQL not applied yet

## Setup

```bash
cp .env.example .env
# fill MODEL_API_KEY + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY

npm install

# Optional but recommended: apply supabase/migrations/001_iklim_pal.sql in the SQL editor
# Storage buckets session-photos / session-masks / session-share-cards / session-voice
# (see supabase/README.md). Until SQL is applied, API uses local JSON + Storage when available.

npm run dev:api
npm run dev:web
```

Open `http://localhost:5173` (or your Vite port). Upload a **real** fixture from `fixtures/litter/*/photo.png`.

## Local verify

```bash
npm run smoke:meta      # cheap API-key check (tiny PNG) — not product E2E
npm run test:safety
npm run test:quality

# with API running:
npm run e2e:real        # REAL S2 + S4 litter photos → real Muse agent
```

**Pass criteria:** S2 reaches `done` with an Action Plan; S4 escalates on hazard.

## Fixtures

Real photos (already in repo; also copied to stable `photo.png` names):

- `fixtures/litter/S1_street_bottles/photo.png`
- `fixtures/litter/S2_riverbank_bags/photo.png` (hero)
- `fixtures/litter/S3_drain_clog/photo.png`
- `fixtures/litter/S4_hazard_escalate/photo.png`
