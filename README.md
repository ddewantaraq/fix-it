# Iklim PAL

Local climate **action planner** for young people (Meta Global AI Developer Hackathon · Indie · Build for Your World).

Turn a neighborhood litter concern (photo + city + text) into a **pack-approved, safety-bounded, measurable Action Plan** — not a climate lecture, not a political tool, not a one-shot image captioner.

See [`architecture.md`](architecture.md), [`task.md`](task.md), and [`docs/anti-project.md`](docs/anti-project.md).

## Muse models used

| Model | Role |
| --- | --- |
| `sam-3.1` | Segment litter in the photo |
| `muse-spark-1.3` | Tool-loop planner |
| `muse-wonder-1.0` | Action Plan synthesis |
| `muse-image-1.0` | Share / invite card |
| `muse-voice-transcribe-1.0` | Optional spoken concern (P1) |

**No RAG. No fine-tuning.** Domain knowledge lives in [`packages/action-packs/plastic_litter_id_v1.json`](packages/action-packs/plastic_litter_id_v1.json), curated from cited sources (see [`docs/pack-sources.md`](docs/pack-sources.md)) — not runtime fetch.

## Stack

- `apps/web` — React + Vite (**Iklim PAL** UI)
- `apps/api` — Node + Express
- `packages/shared` — Zod schemas + `/step` contract
- `packages/action-packs` — litter Action Pack
- Supabase — sessions, evidence, storage

## Setup

```bash
cp .env.example .env
# fill MODEL_API_KEY + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY

npm install
# apply supabase/migrations/002_iklim_pal.sql and create storage buckets (see supabase/README.md)

npm run dev:api
npm run dev:web
```

```bash
npm run smoke:meta   # Spark + SAM + Wonder
```

## Fixtures

Drop staged photos into `fixtures/litter/S1_street_bottles` … `S4_hazard_escalate` (see task.md). Expected-plan JSON stubs are included for S2/S4.
