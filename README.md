# FixIt Vision

Perception-grounded, rule-constrained troubleshooting agent for the Meta Global AI Developer Hackathon (Indie · Build for Your World).

MVP device: household fan — symptom **won’t turn on**.

## Stack

- `apps/web` — React + Vite
- `apps/api` — Node + Express
- `packages/shared` — Zod schemas + frozen `/step` types
- `packages/device-packs` — `household_fan_v1` JSON
- Supabase — sessions, evidence, storage
- Meta Model API — `sam-3.1`, `muse-spark-1.3`

## Setup

```bash
cp .env.example .env
# fill MODEL_API_KEY + Supabase vars

npm install

# Apply supabase/migrations/001_init.sql (see supabase/README.md)
# Create storage buckets: session-photos, session-masks, session-overlays

npm run dev:api   # http://localhost:3001
npm run dev:web   # http://localhost:5173
```

### Meta smoke (after MODEL_API_KEY is set)

```bash
npm run smoke:meta
```

## Docs

- [architecture.md](./architecture.md) — build contract
- [task.md](./task.md) — day plan / roles

## Why not a simple image analyzer

FixIt is a multi-turn agent: SAM-grounded evidence → pack-approved questions/checks → uncertainty-aware technician handoff. Models propose hypotheses; the Device Pack + rules gate decide allowed next steps. No confirmed diagnosis, no energized repair instructions.
