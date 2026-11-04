# Iklim PAL — 3-minute demo video script

**Track:** Indie · Build for Your World  
**Product:** Perception-grounded, pack-constrained local climate **action planner** for youth.

## Goal for judges

| Criterion | What the video must prove |
| --- | --- |
| Impact (30%) | Youth know climate matters but lack a safe local first step → Action Plan + Plans progress, not a lecture |
| Meta tooling (25%) | SAM → Spark (concern) → Wonder → Muse Image (+ Voice optional) in one flow |
| Demo (25%) | It works live; hazard path escalates; Q&A feels snappy |
| Technical depth (20%) | Pack-ordered Q&A (no Spark spam); safety gates; signed photo URLs; Plans with step progress |

---

## Beat sheet (~180s)

### 0:00–0:25 — Problem + product (Impact)

**On screen:** Title “Iklim PAL” + one litter photo fixture.  
**Say:**

> Young people care about climate, but awareness isn’t a plan. Iklim PAL turns a neighborhood litter photo into a pack-approved, safety-bounded action plan — not a chatbot, not politics, not “here’s what pollution is.”

**Show:** Hero capture — photo only (+ optional location). No essay form.

---

### 0:25–0:55 — Perception (Meta tooling: SAM + Spark)

**On screen:** Upload `fixtures/litter/S2_riverbank_bags/photo.png` → Start.  
**Say:**

> First, SAM 3.1 marks litter in the photo. Then Muse Spark proposes what the concern is — we confirm with the user instead of making them type an essay.

**Show:** Evidence chips; concern confirm **Yes**.

---

### 0:55–1:20 — Guided Q&A (Impact + depth)

**On screen:** Fast chip answers (city, water, gloves, friends, hazard = No, time).  
**Say:**

> After that, questions come from a fixed Action Pack. We don’t call Spark for every Yes or No — pack order keeps this practical and fast. Muse stays where it matters: perception and the final plan.

**Show:** A few chips answering quickly (sub-second after concern).

---

### 1:20–1:50 — Plan + share card + Plans home (Wonder + Image + Impact)

**On screen:** Accept action(s) → Action Plan + share card → plan match **Yes** → open **Plans**.  
**Say:**

> Muse Wonder synthesizes a measurable plan: steps, materials, safety, how to measure. Muse Image builds a share card so friends can join. The plan lands under Active — you can check off steps as you go.

**Show:** Plan sheet, share card, Plans → Active → open plan → tick a step.

---

### 1:50–2:30 — Hazard escalate (Impact + safety depth)

**On screen:** New session, `fixtures/litter/S4_hazard_escalate/photo.png`, hazard = **Yes**.  
**Say:**

> If answers show medical waste, chemicals, or similar risk, we escalate: stop DIY cleanup, tell an adult or local authority. That’s the difference between an image captioner and a responsible action agent.

**Show:** Escalated state — no buddy cleanup.

---

### 2:30–3:00 — Close (tooling map + anti-project)

**On screen:** README Muse table or simple list: SAM · Spark · Wonder · Image · Voice.  
**Say:**

> No RAG. No fine-tune. Knowledge lives in the Action Pack; Muse models are tools inside a rules agent. Awareness to action — with Meta’s models doing perception and synthesis, and safety rules keeping youth out of harm.

**Optional 5s:** Mic **Record** on concern turn if you rejected Muse’s caption once.

---

## What NOT to show

- Long waits on every Yes/No (Q&A is pack-deterministic)
- Supabase vs local fallback discussion
- Type instead / free-text chip mode
- Dual-store internals

## Shoot checklist

- [ ] `.env` with working `MODEL_API_KEY`; `/health` → `store=supabase`
- [ ] Apply `002_session_owner_progress.sql` so Plans/progress work remotely
- [ ] S2 and S4 fixtures ready
- [ ] One clean happy-path take (incl. Plans checkoff) + one escalate take
- [ ] Voiceover names each Muse model once
