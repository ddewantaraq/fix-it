# Iklim PAL — Task Decomposition

Indie track · plastic/river litter MVP · 2 engineers + 1 non-engineer  
Hard deadline: **Wed Nov 4, 2026, 9:00 PM ET**  
Internal freeze: **Wed Nov 4, ~6:00 PM ET**

Authority: [`architecture.md`](architecture.md) · this file.

**Product:** Iklim PAL (climate action planner).  
**Removed:** FixIt Vision / household fan — purge immediately (see §2).  
**No RAG. No fine-tune.** Fixture dataset only.

---

## 1. Roles

| Role | Focus | Owns |
| --- | --- | --- |
| **Eng A** | Frontend / UX | Iklim PAL UI: capture (photo + concern + voice), SAM overlays, Q&A, Action Plan, Muse Image share card |
| **Eng B** | Backend / Muse / pack | Purge fan code; Action Pack; Spark tool loop; SAM; Wonder finalize; Image card; Voice stub; SafetyGate; Supabase |
| **Non-eng** | Narrative / fixtures / submit | Litter photo (+ optional voice) fixtures, copy, 3-min video, anti-project one-pager, README Impact citations, submission |

---

## 2. Code purge list (FixIt / fan → delete or replace)

Execute at **D2 start** before new features. Do not leave a dual fan path.

### Delete

| Path | Why |
| --- | --- |
| `packages/device-packs/household_fan_v1.json` | Fan pack |
| `packages/device-packs/` (package) | Replaced by `packages/action-packs/` |
| `fixtures/fan/` (if present) | Wrong domain |
| Any README/docs sections that describe FixIt repair flow as current product | Stale |

### Replace / rewrite

| Path | Replace with |
| --- | --- |
| `packages/shared/src/device-pack.ts` | `action-pack.ts` (`ActionPack` Zod schema) |
| `packages/shared/src/domain.ts` | Drop `RepairBrief` / fan hypotheses; add `ActionPlan`, climate evidence kinds |
| `packages/shared/src/api.ts` | Step response: `proposedAction` + `plan` (not fan safeCheck / repair brief) |
| `packages/shared/src/index.ts` | Export new modules only |
| `apps/api/src/pack.ts` | `loadActionPack()` → `plastic_litter_id_v1.json` |
| `apps/api/src/agent.ts` | Iklim PAL prompts; tools `propose_action` / `finalize_plan` (Wonder); no fan copy |
| `apps/api/src/routes.ts` | `/packs/plastic_litter_id_v1`; sessions use `actionPackId`; voice route stub |
| `apps/api/src/meta/client.ts` | Add Wonder, Image, Voice Transcribe helpers (keep SAM + Spark) |
| `apps/api/scripts/smoke-meta.ts` | Generic Muse smoke (Spark + SAM + optional Wonder/Image); no fan language |
| `apps/web/src/App.tsx` | Iklim PAL branding + Action Plan UX |
| `apps/web/src/api.ts` | New session/step payloads |
| `supabase/migrations/001_init.sql` | New migration `002_actlocal.sql` (or replace): `action_packs`, rename columns; drop fan seeds |
| `supabase/README.md` | Iklim PAL seed instructions |
| Root `README.md` | Iklim PAL setup + Muse models used + anti-RAG note |

### Workspace / package.json

| Path | Change |
| --- | --- |
| Root `package.json` workspaces | `packages/action-packs` instead of `packages/device-packs` |
| `apps/api/package.json` | Depend on `@iklim-pal/action-packs` or rename scope `@actlocal/*` if time allows (name optional; **product strings must be Iklim PAL**) |
| Grep gate | `rg -i 'fixit|household_fan|RepairBrief|loadFanPack|wont_turn_on'` → **zero hits** in `apps/`, `packages/`, `supabase/`, `fixtures/` (except git history) |

### Done when (purge)

- [x] No fan pack file  
- [x] No FixIt Vision UI title  
- [x] API creates sessions with `plastic_litter_id_v1`  
- [x] Grep gate clean  

---

## 3. Priority legend

| Priority | Meaning |
| --- | --- |
| **P0** | Required for Indie submission / anti-disqualification |
| **P1** | Voice Transcribe UX; polish |
| **P2** | Open-weight / extra cities — cut freely |

### Cut line

Never cut: **purge**, Action Pack, **SAM + Spark + Wonder + Muse Image**, SafetyGate escalate, Action Plan UI, fixtures S2+S4, 3-min video.  
Cut first under pressure: Voice UI polish → multi-scenario chrome → open-weight.

---

## 4. Fixture dataset (Non-eng + Eng B expected JSON)

```text
fixtures/litter/
  S1_street_bottles/photo.jpg
  S2_riverbank_bags/photo.jpg
  S3_drain_clog/photo.jpg
  S4_hazard_escalate/photo.jpg
  S2_riverbank_bags/concern.wav          # optional
  S2_riverbank_bags/expected-plan.json
  S4_hazard_escalate/expected-plan.json
```

| Scenario | Photo must show | Agent expect |
| --- | --- | --- |
| S1 | Clear street plastic bottles | ≥1 SAM mask; cleanup plan |
| S2 (hero) | Riverbank bags/litter | Full path + share card |
| S3 | Litter at drain grate | Drain-related pack action |
| S4 | Hazard cue or ambiguous empty | **Escalate** |

No climate PDF corpus. No training labels.

---

## 5. Day plan

### Progress (updated Nov 2)

**D2 Eng spine: DONE.** Repo renamed to `iklim-pal`; fan purged; Muse SAM/Spark/Wonder/Image + Voice stub; sourced Action Pack; out-of-pack escalate fallback (`stop_out_of_scope`).

Still open for team: Non-eng real photos (D2-9/10), Supabase apply + full E2E with live photo (D2-12), then D3/D4.

### D2 — Mon Nov 2 · Purge + Muse spine

| ID | Status | Priority | Owner | Task | Done when |
| --- | --- | --- | --- | --- | --- |
| D2-0 | DONE | P0 | Eng A + Eng B | Execute §2 purge; grep gate clean | Zero fan/FixIt product strings in source |
| D2-1 | DONE | P0 | Eng B | Author `plastic_litter_id_v1.json` + Zod + cited `sources` | Pack validates; see `docs/pack-sources.md` |
| D2-2 | DONE | P0 | Eng B | Supabase migration `002_iklim_pal.sql` + README | Migration file committed; README updated |
| D2-3 | DONE | P0 | Eng B | Wire SAM + Spark tool loop for litter pack | `/step` segments + asks pack questions |
| D2-4 | DONE | P0 | Eng B | Wonder `finalize_plan` → `ActionPlan` JSON | Unknown pack IDs stripped; empty → escalate |
| D2-5 | DONE | P0 | Eng B | Muse Image share card on finalize | URL or storage path on plan |
| D2-6 | DONE | P1 | Eng B | `POST /sessions/:id/voice` + Voice Transcribe stub | Transcript stored as concern or evidence |
| D2-7 | DONE | P0 | Eng A | Iklim PAL capture UI (photo, city, concern) | Creates session + upload |
| D2-8 | DONE | P0 | Eng A | Masks + questions + Action Plan + share card screens | Ugly OK if end-to-end |
| D2-9 | TODO | P0 | Non-eng | Shoot S1–S4 litter fixtures into `fixtures/litter/` | ≥1 photo each; hero S2 sharp (dirs + expected-plan stubs exist) |
| D2-10 | TODO | P1 | Non-eng | Optional `concern.wav` for S2 | Plays / uploads in Voice path |
| D2-11 | DONE | P0 | Non-eng/Eng | Anti-project one-pager | [`docs/anti-project.md`](docs/anti-project.md) linked from README |
| D2-12 | PARTIAL | P0 | All | 15-min spine check | Meta smoke OK (Spark/SAM/Wonder); full photo E2E needs Supabase + fixture photos |
| D2-13 | DONE | P0 | Eng B | Out-of-pack fallback | Invalid/unknown pack IDs → retry once → `stop_out_of_scope` escalate (no free-form invent) |

### D3 — Tue Nov 3 · Harden + film

| ID | Priority | Owner | Task | Done when |
| --- | --- | --- | --- | --- |
| D3-1 | P0 | Eng B | SafetyGate: hazard deny-list + S4 escalate tests | S4 + chemical answers escalate |
| D3-2 | P0 | Eng B | Quality gates: no politics CTA; no CO₂ guarantees; pack ID validation | Checklist green on fixtures |
| D3-3 | P0 | Eng A | E2E dry run S2 + S4 on clean browser | No Eng B babysitting |
| D3-4 | P1 | Eng A | Voice capture UI if API ready | Optional path works once |
| D3-5 | P0 | Non-eng | Demo script ≤3:00 (S2 hero + S4 escalate beat) | Timed script |
| D3-6 | P0 | Non-eng | Film video draft | Private draft for review |
| D3-7 | P0 | Non-eng | README: Iklim PAL, Muse models list, Impact citations, setup | Public-repo ready |
| D3-8 | P1 | Non-eng | X/gallery blurb | Draft ready |
| D3-9 | P0 | Eng A + Eng B | expected-plan.json stubs for S2/S4 | Files committed |

### D4 — Wed Nov 4 · Freeze + submit

| ID | Priority | Owner | Task | Done when |
| --- | --- | --- | --- | --- |
| D4-1 | P0 | All | Feature freeze ~6:00 PM ET | FREEZE announced |
| D4-2 | P0 | Eng A + Eng B | Public repo; secrets scrubbed; `.env.example` complete | Scan clean |
| D4-3 | P0 | Non-eng | Final ≤3-min video link works | Opens on phone |
| D4-4 | P0 | Non-eng | CV submit: Indie track, repo, video, team | Confirmation saved |
| D4-5 | P0 | All | Claim Meta API credits before 9 PM ET | Done per person |
| D4-6 | P1 | Non-eng | Post demo on X if chasing viral bonus | Post live |
| D4-7 | P0 | Eng B | Tag `hackathon-submit` | Tag on submitted commit |

---

## 6. Muse wiring checklist (Eng B)

| Model | Status target | Owner |
| --- | --- | --- |
| `sam-3.1` | P0 live in `/step` | Eng B |
| `muse-spark-1.3` | P0 planner | Eng B |
| `muse-wonder-1.0` | P0 finalize | Eng B |
| `muse-image-1.0` | P0 share card | Eng B |
| `muse-voice-transcribe-1.0` | P1 | Eng B + Eng A |
| Open-weight | P2 skip | — |

Smoke: extend `npm run smoke:meta` for Spark + SAM; add Wonder/Image smoke flags if credits allow.

---

## 7. Pre-submit acceptance

### Anti-disqualification

- [ ] Demo is **action planning**, not climate Q&A / RAG  
- [ ] No political CTA in plan outputs  
- [ ] SAM masks visible; Spark + Wonder + Image used  
- [ ] Escalation demonstrated  
- [ ] Uncertainty / no fake CO₂ promises  
- [ ] Grep gate: no fan/FixIt product residue  

### Ops

- [ ] Public repo  
- [ ] Video ≤3:00  
- [ ] Contributors listed  
- [ ] Submitted before **9:00 PM ET Nov 4**  

---

## 8. Out of scope (do not ticket)

- Climate PDF RAG / embeddings  
- Fine-tuning Muse / Glimmer  
- Bringing back household fan  
- Policy lobbying features  
- Second Action Pack beyond plastic litter  

---

## 9. Definition of victory

A judge can say in one breath:

> Youth upload a local litter photo; Iklim PAL uses **SAM + Spark + Wonder + Muse Image** inside a **rules-bounded agent** to produce a **safe, measurable cleanup plan** — and knows when to **stop and escalate** — without being a climate chatbot or political tool.

If that is true on camera at freeze, maximize Indie odds in the time left.
