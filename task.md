# FixIt Vision — Task Decomposition

Indie track · household fan MVP · 2 engineers + 1 non-engineer  
Hard deadline: **Wed Nov 4, 2026, 9:00 PM ET**  
Internal freeze target: **Wed Nov 4, ~6:00 PM ET**

Authority docs: [`architecture.md`](architecture.md) (build contract) · this file (who / when / cut line).

**Fine-tuning:** do not schedule. Fan knowledge = Device Pack + rules + prompts only.

---

## 1. Roles

| Role | Focus | Owns |
| --- | --- | --- |
| **Eng A** | Frontend / UX / vision UI | React + Vite app, capture flow, SAM mask overlays, Q&A + safe-check UI, Repair Brief screen, demo polish |
| **Eng B** | Backend / agent / rules | Node API, Supabase schema/storage, Meta clients (SAM + Spark + optional Image), agent loop, `household_fan_v1` pack + SafetyGate |
| **Non-eng** | Product / narrative / ops | Staged photo set + scenario scripts, safety copy, 3-min demo video, submission package, judge one-pager, X/community post |

**Collaboration rules**

- Eng A and Eng B share a vertical-slice contract: `POST /sessions/:id/step` response shape in `architecture.md` §9 — freeze that JSON early Day 0.
- Non-eng does not wait for pixel-perfect UI; film against staging as soon as S2 works.
- P2 tasks die first when behind. Do not start fine-tuning or a second device.

---

## 2. Priority legend

| Priority | Meaning |
| --- | --- |
| **P0** | Required for a non-disqualifying, demoable Indie submission |
| **P1** | Strongly improves Meta tooling / demo / agentic bonus odds |
| **P2** | Nice-to-have; cut without discussion if D1 vertical slice slips |

---

## 3. Cut line (read every morning)

**If behind after D1 (Nov 1) end-of-day:**

1. Drop Muse Image overlays (use canvas masks only).  
2. Drop S3 UI polish; keep S2 hero + S4 escalation only.  
3. Drop multi-theme UI chrome; keep one clean flow.  
4. Keep: working agent tools (`segment` → `ask` → `check` → `finalize`), SafetyGate, evidence ledger, public repo, 3-min video.

**Never cut:** Device Pack enforcement, uncertainty language, escalation path, Meta Model API usage on camera.

---

## 4. Day plan

### D0 — Sat Oct 31 · Scaffold + contracts

| ID | Priority | Owner | Task | Done when |
| --- | --- | --- | --- | --- |
| D0-1 | P0 | Eng A + Eng B | Scaffold `apps/web` (Vite+React+TS) and `apps/api` (Node+TS); shared env sample | Both apps boot locally |
| D0-2 | P0 | Eng B | Create Supabase project; tables + buckets per `architecture.md` §10 | Migrations applied; upload test object works |
| D0-3 | P0 | Eng B | Meta API smoke: SAM segment + Spark text/image call with `MODEL_API_KEY` | Script prints mask metadata + Spark JSON |
| D0-4 | P0 | Eng B | Author `packages/device-packs/household_fan_v1.json` (parts, questions, checks, stops) | Pack validates against agreed schema; reviewed by Non-eng for safety wording |
| D0-5 | P0 | Eng A + Eng B | Freeze `/step` response TypeScript types in a shared package or OpenAPI snippet | Both sides merge against the same type |
| D0-6 | P0 | Non-eng | Capture staged photos for S1–S4; label folders under `fixtures/fan/` | ≥1 photo per scenario; lighting readable on camera |
| D0-7 | P0 | Non-eng | Draft safety copy bank (unplugged reminders, uncertainty phrases, escalate CTA) | Doc linked in repo `docs/copy.md` or Notion; Eng A can paste |
| D0-8 | P1 | Non-eng | One-pager: “Why this is not a simple image analyzer” | ½ page ready for README + video VO |
| D0-9 | P0 | All | Claim / verify Meta Model API credits; set billing spend limit | Each person who has a key confirms credit form status |

### D1 — Sun Nov 1 · Ugly vertical slice

| ID | Priority | Owner | Task | Done when |
| --- | --- | --- | --- | --- |
| D1-1 | P0 | Eng B | `POST /sessions`, photo upload, persist session | Curl/Postman happy path works |
| D1-2 | P0 | Eng B | `segment_parts` tool wired to SAM; evidence rows written | Masks in Storage; evidence queryable |
| D1-3 | P0 | Eng B | Spark planner returns structured next action; Node validates pack IDs | Invalid IDs rejected |
| D1-4 | P0 | Eng B | One safe-check + finalize → RepairBrief JSON | Brief includes uncertainty fields |
| D1-5 | P0 | Eng A | Capture + upload UI → call API → show raw masks + brief | Can complete S2 with ugly UI |
| D1-6 | P0 | Eng A | Question + answer submission UI | Answer lands in evidence |
| D1-7 | P0 | Non-eng | Write expected brief notes for S2 and S4 | Fixture `expected.json` stubs exist |
| D1-8 | P0 | All | **Vertical-slice demo** (15 min) | Photo → SAM → question → check → summary on a laptop |

**D1 exit gate:** if slice fails, Monday is recovery — no P2, no Muse Image.

### D2 — Mon Nov 2 · Full agent loop + scenarios

| ID | Priority | Owner | Task | Done when |
| --- | --- | --- | --- | --- |
| D2-1 | P0 | Eng B | Full tool loop: segment ⇄ ask ⇄ check ⇄ finalize with session status machine | Status transitions match architecture §7 |
| D2-2 | P0 | Eng B | SafetyGate: unplugged requirement, deny-list, stopConditions → `escalated` | S4 and hazard answers escalate in tests |
| D2-3 | P0 | Eng B | Hypothesis tracking (candidate / weakened / unresolved) | Brief never says “confirmed” |
| D2-4 | P0 | Eng A | Inspect screen with clear SAM overlays (demo-legible) | Overlays visible on 1080p recording |
| D2-5 | P0 | Eng A | Guide screen + Escalation as success state UI | Escalation not styled as a crash |
| D2-6 | P0 | Eng A | Repair Brief screen (observations, checks, hypotheses, technician notes) | Matches Non-eng copy bank |
| D2-7 | P1 | Eng B + Eng A | Run S1, S2, S3, S4 against fixtures; fix pack gaps | Checklist of 4 scenarios signed off |
| D2-8 | P1 | Eng B | Muse Image overlay generation with canvas fallback | Brief shows either Image or canvas path |
| D2-9 | P1 | Non-eng | Demo script v1 (≤3:00) timed to S2 + short S4 | Script with on-screen beats |
| D2-10 | P2 | Eng A | Motion / polish (keep subtle; do not block) | Optional |

### D3 — Tue Nov 3 · Harden + film

| ID | Priority | Owner | Task | Done when |
| --- | --- | --- | --- | --- |
| D3-1 | P0 | Eng B | Quality-gate tests: relevance, unsupported claims, escalation (`architecture.md` §13) | Automated or scripted checklist green on fixtures |
| D3-2 | P0 | Eng B | Error handling: Meta timeout, SAM empty masks → degrade/escalate gracefully | No blank crash screens |
| D3-3 | P0 | Eng A | End-to-end dry run on clean machine / incognito | S2 + S4 succeed without Eng B babysitting |
| D3-4 | P0 | Non-eng | Film demo video draft; capture backup takes | Draft cut ≤3:00 uploaded privately for review |
| D3-5 | P0 | Non-eng | README: problem, anti-analyzer framing, architecture diagram link, setup, Muse models used | Public-repo ready draft |
| D3-6 | P1 | Non-eng | X post draft + gallery blurb for community vote / viral bonus | Text + thumbnail frame picked |
| D3-7 | P1 | Eng A | Fix demo-blocking UX bugs only | Bug list triaged; P2 ignored |
| D3-8 | P2 | Eng B | Open-weight experiment | **Do not start** unless P0 video is already filmed |

### D4 — Wed Nov 4 · Freeze + submit

| ID | Priority | Owner | Task | Done when |
| --- | --- | --- | --- | --- |
| D4-1 | P0 | All | **Feature freeze ~6:00 PM ET** — only submit/docs fixes after | Slack/Discord “FREEZE” message |
| D4-2 | P0 | Eng A + Eng B | Public GitHub repo; secrets scrubbed; `.env.example` complete | `git secrets` / manual scan clean |
| D4-3 | P0 | Non-eng | Final 3-min video exported; link works unlisted/public as required | Link opens on phone LTE |
| D4-4 | P0 | Non-eng | CV platform submission: repo + video + team listing + track **Indie** | Confirmation screenshot saved |
| D4-5 | P0 | All | Last day to claim API credits — each person verifies | Credit form done before 9 PM ET |
| D4-6 | P1 | Non-eng | Post demo on X; submit post link if platform asks (viral bonus) | Post live |
| D4-7 | P0 | Eng B | Tag release `hackathon-submit` | Tag points at submitted commit |

---

## 5. Workstream map (parallelism)

```text
Eng B:  API · Muse/SAM · Device Pack · SafetyGate · Brief JSON
Eng A:  UI shell · overlays · Q&A · Brief UI · polish
Non-eng: fixtures · copy · script · video · README · submission

Sync points:
  D0 EOD  — API response types frozen
  D1 EOD  — vertical slice gate
  D2 EOD  — S2+S4 green
  D3 EOD  — video draft review
  D4 6PM  — freeze → submit
```

---

## 6. Acceptance checklist (pre-submit)

### Product / anti-disqualification

- [ ] Demo shows **multi-step agent** (not one-shot image caption)
- [ ] SAM masks visible on screen
- [ ] Muse Spark used for planning/interpretation with structured output
- [ ] Safe checks are pack-approved and unplugged-framed
- [ ] Summary uses uncertainty language; no confirmed diagnosis
- [ ] Escalation path demonstrated (S4 or hazard)
- [ ] README states Indie + Build for Your World + models used

### Engineering

- [ ] `MODEL_API_KEY` only on server
- [ ] Supabase sessions + evidence persist across steps
- [ ] Device Pack is the only source of questions/checks
- [ ] No fine-tune pipeline in the repo critical path

### Submission ops

- [ ] Public repo
- [ ] 3-minute video link works
- [ ] All contributors listed
- [ ] Submitted before **9:00 PM ET Nov 4**
- [ ] Credits claimed

---

## 7. Suggested personal kanban labels

Use these in Linear/GitHub issues: `P0` `P1` `P2` `eng-a` `eng-b` `non-eng` `blocked` `demo-blocker`.

Any task without an owner by D0 noon gets assigned in a 10-minute standup — do not leave P0 orphaned.

---

## 8. Out of scope tasks (do not ticket)

- Fine-tuning Muse / Muse Spark Open / Glimmer for fan repair
- Second device category
- Voice input
- Native mobile
- Production multi-tenant auth/billing
- Partner open-weight hosting **unless** demo is frozen and Eng B has idle cycles

---

## 9. Definition of victory (team north star)

A judge watches three minutes and can explain:

1. Household fans fail in ambiguous ways; unsafe DIY is the risk.  
2. FixIt uses **SAM + Muse Spark** inside a **rules-bounded agent**, not as a magic diagnostic.  
3. The output is a **technician handoff with uncertainty**, and the system knows when to stop.

If that story is true on camera by freeze time, the team has maximized Indie odds within the time box.
