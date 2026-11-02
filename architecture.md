# Iklim PAL — Architecture

Build contract for the Meta Global AI Developer Hackathon MVP.

| Field | Value |
| --- | --- |
| Product | **Iklim PAL** — perception-grounded, pack-constrained local climate **action planner** for young people |
| Theme | **Build for Your World** |
| Track | **Indie** |
| MVP issue | Neighborhood **plastic / river litter** (Indonesia youth context) |
| Stack | React + Vite · Node.js · Supabase · Meta Muse suite (Wonder, Spark, SAM, Image, Voice) |
| Submission | Wed **Nov 4, 9:00 PM ET** |
| RAG | **Out of scope** — no vector DB, no climate-PDF corpus |
| Fine-tuning | **Out of scope** — knowledge lives in Action Pack + prompts |
| Deprecated | Prior household-fan / “FixIt Vision” product — **removed**; do not revive |

Repo: [`ddewantaraq/iklim-pal`](https://github.com/ddewantaraq/iklim-pal). Product name, UI, packs, and prompts must say **Iklim PAL** only.

---

## 1. Product contract

### Problem

Many young people know climate change is serious, but awareness is not the same as knowing **where to start**, what is realistic locally, or how to act with friends. Evidence:

- **UNICEF–Gallup (55 countries):** 85% of youth 15–24 had heard of climate change; only ~50% correctly identified its definition — awareness ≠ understanding usable for action.  
  https://www.unicef.org/eca/press-releases/only-half-young-people-able-identify-correct-definition-climate-change-unicef-gallup
- **UNICEF Europe & Central Asia — From Awareness to Action:** only 19.2% felt education gave them green-economy skills; 47.7% said there were not enough opportunities to express views on climate action.  
  https://www.unicef.org/eca/reports/awareness-action
- **UNDP Cambodia youth study:** 55% did not know how to engage; barriers included unengaging information (48%) and unreliable sources (47%). Used here as **problem evidence only**, not as a product feature for policy lobbying.  
  https://www.undp.org/sites/g/files/zskgke326/files/2025-02/undp-kh-report-on-youth-engagement-in-cambodia-ndc.pdf
- **UNICEF Indonesia** prioritizes youth climate participation — opportunity is to make **local practice** easier, not to re-explain that climate change exists.  
  https://www.unicef.org/indonesia/climate

### Users (MVP)

- Young people (approx. 15–24) who care but lack a clear first step
- Small friend groups organizing a short community cleanup or waste action

### Core value

Turn a **local environmental concern** (photo + place + optional voice) into a **pack-approved, safety-bounded, measurable Action Plan** — individually or with friends — without becoming a climate tutor or political organizer.

### Hard boundaries

- No guaranteed impact claims (“you will save X tons of CO₂”)
- No medical, legal, or political campaigning advice
- No parties, voting guidance, legislation lobbying, or protest organizing as product features
- No free-form “explain climate science” Q&A mode
- Model suggestions are constrained by the **Action Pack**; the rules/safety gate is authoritative
- Escalate when DIY is unsafe (chemicals, medical waste, fast water, night roadside) → contact adult / local authority; stop

### Positioning line (judge-facing)

> Iklim PAL is not a climate chatbot and not an image captioner. It is a multi-model Muse agent that turns a local litter concern into a pack-approved, safety-bounded youth Action Plan — with SAM-grounded evidence, Spark tool loops, Wonder plan synthesis, and Muse Image share cards.

---

## 2. Anti-project escape

Hackathon anti-projects that this idea can trip: **Basic RAG**, **simple AI-for-Education chatbots**, **anything political**, **simple image analyzers**.

| Banned shape | Iklim PAL shipped shape |
| --- | --- |
| Chatbot that explains climate science | Multi-turn **action agent**; success = **Action Plan**, not a lesson |
| Basic RAG over IPCC / news PDFs | Versioned **Action Pack JSON** + Muse tools; optional Muse **search grounding** for practical how-tos only — **no vector store** |
| Political advocacy / policy lobbying | **Community practice only**: cleanup, waste reduction, buddy coordination |
| Upload photo → “this is pollution” | Photo is evidence; SAM segments; Spark asks/acts; Wonder emits plan |

**Pass/fail demo must show:** Meta Model API in real use; ≥2 tool hops; pack-validated actions only; escalate path; uncertainty language; no political CTA.

---

## 3. Winning criteria map (Indie)

| Criterion | Weight | How Iklim PAL proves it |
| --- | --- | --- |
| **Impact** | 30% | Awareness→action gap (UNICEF/UNDP); Indonesia youth; concrete local plan |
| **Meta AI tooling** | 25% | SAM + Spark + Wonder + Muse Image (+ Voice P1) in one session |
| **Demo** | 25% | 3-min litter hero path + escalate case |
| **Technical depth** | 20% | Action Pack, evidence ledger, safety gate, structured Action Plan |

**Bonus plays:** Best Agentic Use-Case (tool loop); Best Creative Build (Muse Image share card). Open-weight fine-tune = skip unless demo frozen.

---

## 4. System architecture

```text
┌──────────────────────┐    HTTPS     ┌───────────────────────────┐
│  React + Vite        │ ───────────► │  Node.js API              │
│  Photo / voice /     │              │  Spark tool orchestrator  │
│  Q&A / Action Plan   │ ◄─────────── │  Wonder plan synthesizer  │
│  Muse Image card UI  │              │  Safety / scope gate      │
└──────────────────────┘              │  Action Pack loader       │
                                      └─────────────┬─────────────┘
                            ┌───────────────────────┼───────────────────────┐
                            ▼                       ▼                       ▼
                      Supabase DB            Supabase Storage         Meta Model API
                      sessions /             photos / masks /         sam-3.1
                      evidence /             share cards /            muse-spark-1.3
                      action_packs /         voice clips              muse-wonder-1.0
                      action_plans                                    muse-image-1.0
                                                                      muse-voice-transcribe-1.0
```

**Invariant:** `MODEL_API_KEY` never ships to the browser. All Muse/SAM calls go through Node.

---

## 5. Muse integration (inference only — no fine-tune, no RAG)

Base URL: `https://api.meta.ai/v1`  
Auth: `Authorization: Bearer $MODEL_API_KEY`

### 5.1 SAM 3.1 — `sam-3.1` (P0)

- Segment litter objects from Action Pack noun phrases (`plastic bottle`, `plastic bag`, `trash pile`, …).
- Store masks; append evidence. UI shows overlays so judges see grounding.

### 5.2 Muse Spark — `muse-spark-1.3` (P0)

- Fast multimodal **tool-loop planner**: choose `segment_parts` | `ask_question` | `propose_action` | `finalize_plan`.
- Structured JSON only; IDs must exist in the Action Pack or Node rejects.

### 5.3 Muse Wonder — `muse-wonder-1.0` (P0)

- Long-horizon **Action Plan synthesis** from the evidence ledger + selected pack actions.
- May use reasoning effort `high`/`max` on finalize only (credit-aware).
- Still may not invent action IDs outside the pack; Node validates before persist.

### 5.4 Muse Image — `muse-image-1.0` (P0)

- Generate a **share / invite friends** card from plan summary (+ optional SAM crop reference).
- Optional “cleanup zone” annotated still. Fallback: canvas overlay from masks if Image fails.

### 5.5 Muse Voice Transcribe — `muse-voice-transcribe-1.0` (P1)

- Youth records a short concern clip → transcript becomes session `concernText`.
- Same downstream path as typed concern. Stub API on D2; ship UI if D3 allows.

### 5.6 Explicit non-goals for models

- No RAG corpus, embeddings store, or “chat with climate docs”
- No fine-tuning Wonder/Spark/open-weight for climate
- No political content generation as a feature
- Muse Code is for builders only (not runtime)

### 5.7 Optional Muse search grounding

Allowed only for **practical, non-political** how-tos (e.g. glove/bag disposal tips), gated and summarized into plan notes — never as a free browsing education bot.

---

## 6. Domain model

### ActionPack

```ts
type ActionPack = {
  id: "plastic_litter_id_v1";
  displayName: string;
  localeHint: "id-youth";
  supportedConcerns: Array<"plastic_litter" | "river_litter" | "drain_litter">;
  parts: Array<{ id: string; samPhrase: string; requiredForDemo?: boolean }>;
  questions: Array<{
    id: string;
    text: string;
    expects: "yes_no" | "enum" | "short_text";
    options?: string[];
    mapsToEvidence: string;
  }>;
  actions: Array<{
    id: string;
    title: string;
    steps: string[];
    materials: string[];
    durationMinutes: number;
    needsFriends?: boolean;
    forbiddenIf?: string[]; // gate tags
  }>;
  stopConditions: Array<{
    id: string;
    when: string;
    escalate: boolean;
    userMessage: string;
  }>;
  escalationDefaults: {
    message: string;
    nextStep: "contact_adult_or_authority" | "stop";
  };
};
```

### Session / Evidence / ActionPlan

```ts
type Session = {
  id: string;
  actionPackId: "plastic_litter_id_v1";
  concernText: string;
  city: string;
  status:
    | "collecting"
    | "inspecting"
    | "questioning"
    | "planning"
    | "summarizing"
    | "done"
    | "escalated";
  photoPath?: string;
  voicePath?: string;
  createdAt: string;
  updatedAt: string;
};

type EvidenceItem = {
  id: string;
  sessionId: string;
  kind: "sam_mask" | "user_answer" | "action_accepted" | "model_observation" | "voice_transcript";
  partId?: string;
  questionId?: string;
  actionId?: string;
  payload: Record<string, unknown>;
  source:
    | "sam-3.1"
    | "user"
    | "muse-spark-1.3"
    | "muse-wonder-1.0"
    | "muse-voice-transcribe-1.0"
    | "rules";
  createdAt: string;
};

type ActionPlan = {
  sessionId: string;
  goal: string;
  steps: Array<{
    order: number;
    title: string;
    detail: string;
    owner: "solo" | "friends" | "adult_help";
    timeboxMinutes: number;
    packActionId?: string;
  }>;
  materials: string[];
  safetyNotes: string[];
  measureHow: string[]; // e.g. bags collected, before/after photos
  uncertainty: string[];
  recommendation: "proceed_with_plan" | "stop_and_escalate";
  shareCardPath?: string;
};
```

---

## 7. Agent + safety / scope gate

```text
photo + city + concern (+ optional voice transcript)
  → Session
  → Muse Spark plans next tool
      ├─ segment_parts (SAM)
      ├─ ask_question (pack IDs)
      ├─ propose_action (pack IDs)
      └─ finalize_plan (Wonder → ActionPlan → Muse Image card)
  → Evidence ledger
  → SafetyGate (stop / escalate / continue)
```

### Tools (server-implemented)

| Tool | Effect |
| --- | --- |
| `segment_parts` | SAM for pack phrases; store masks |
| `ask_question` | Return next approved resource question |
| `propose_action` | Return pack action if gate allows |
| `record_answer` / accept action | Persist evidence |
| `finalize_plan` | Wonder synthesizes ActionPlan; Muse Image share card |
| `transcribe_concern` | Voice → text (P1) |

### Safety / scope invariants

1. Unknown pack IDs from models → validate → **retry Spark once** → if still invalid or no match → escalate with pack `stop_out_of_scope` (never invent free-form advice outside the pack).
2. Wonder plan steps with unknown `packActionId` are stripped; if no steps remain → `stop_and_escalate`.
3. Deny-list for political/lobby/protest CTAs and for unsafe DIY (enter floodwater, handle chemicals, medical waste).
4. Near-water + no adult → force buddy/adult safety notes or escalate.
5. Hypotheses about “why litter accumulates” stay uncertain; never claim scientific certainty.
6. UI never presents a climate lecture as the primary screen — Action Plan is primary.

### State machine

```text
collecting → inspecting → questioning ⇄ planning → summarizing → done
                 │              │
                 └──────────────┴──► escalated
```

---

## 8. Action Pack MVP — `plastic_litter_id_v1`

### Parts (SAM phrases)

| Part ID | SAM phrase |
| --- | --- |
| `bottle` | plastic bottle |
| `bag` | plastic bag |
| `pile` | trash pile |
| `bank_litter` | river bank litter |
| `drain_clog` | litter at drain grate |

### Resource questions (examples)

- City / neighborhood (short text)
- Hours available this week (enum)
- Solo vs friends
- Gloves/bags available?
- Near water yes/no

### Approved actions (examples)

- Photo-map litter hotspots (before shots)
- 60–90 min buddy cleanup with gloves, closed shoes, daylight only
- Separate recyclables vs residual where local rules allow
- School/campus mini awareness card (non-political; invite cleanup)
- Hand off toxic/unknown containers to adult/authority — do not open

### Stop / escalate

- Chemical drums, needles/medical waste, strong chemical smell
- Fast-moving flood water
- Night / high-traffic roadside without adult
- Insufficient visual evidence after required questions → escalate with uncertainty

---

## 9. API surface (Node)

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/sessions` | Create session (`actionPackId`, `city`, `concernText`) |
| `POST` | `/sessions/:id/photo` | Upload photo |
| `POST` | `/sessions/:id/voice` | Upload audio → Voice Transcribe (P1) |
| `POST` | `/sessions/:id/step` | Spark planner + optional tool |
| `POST` | `/sessions/:id/answers` | Submit question answer |
| `POST` | `/sessions/:id/actions/:actionId` | Accept/skip proposed action |
| `POST` | `/sessions/:id/finalize` | Wonder plan + Image card |
| `GET` | `/sessions/:id` | Session + evidence + plan |
| `GET` | `/packs/plastic_litter_id_v1` | Action Pack JSON |

**Agent step UI payload (frozen contract):**

```json
{
  "sessionId": "...",
  "status": "questioning",
  "assistantMessage": "I marked plastic bags along the bank. How many friends can join a 90-minute cleanup?",
  "ui": {
    "masks": [{ "partId": "bag", "url": "..." }],
    "question": { "id": "q_friends", "text": "..." },
    "proposedAction": null,
    "plan": null
  },
  "escalated": false
}
```

---

## 10. Data (Supabase)

### Tables

- `action_packs` — `id`, `version`, `json`, `updated_at`
- `sessions` — `id`, `action_pack_id`, `concern_text`, `city`, `status`, `photo_path`, `voice_path`, timestamps
- `evidence_items` — append-only ledger
- `action_plans` — `id`, `session_id`, `plan jsonb`, `share_card_path`, `created_at`

### Storage buckets

- `session-photos`
- `session-masks`
- `session-share-cards`
- `session-voice`

Replace any prior `device_packs` / fan seeds. Apply via new migration in the code purge pass.

---

## 11. Frontend (React + Vite)

1. **Capture** — photo + city + concern (typed or voice)
2. **Inspect** — SAM overlays
3. **Guide** — pack questions + proposed actions
4. **Plan** — Action Plan + safety + measure-how + escalate CTA
5. **Share** — Muse Image card

No “climate quiz” or diagnosis-style banners.

---

## 12. Fixture dataset (not training data)

```text
fixtures/litter/
  S1_street_bottles/photo.jpg
  S2_riverbank_bags/photo.jpg          # hero demo
  S3_drain_clog/photo.jpg
  S4_hazard_escalate/photo.jpg
  S2_riverbank_bags/concern.wav        # optional Voice
  S2_riverbank_bags/expected-plan.json
  S4_hazard_escalate/expected-plan.json
```

| ID | Setup | Expected behavior |
| --- | --- | --- |
| S1 | Street bottles visible | SAM ≥1 bottle/bag mask; cleanup-oriented plan |
| S2 | Riverbank bags (hero) | Segment bank litter; questions; Wonder plan + share card |
| S3 | Drain grate litter | Segment drain clog; pack action; safety notes |
| S4 | Hazard lookalike or empty/ambiguous | **Escalate**; no DIY cleanup as primary CTA |

Acceptance: Wonder plan references only pack action IDs; S4 escalates.

---

## 13. Demo path (must work live)

1. Upload S2 photo; city e.g. Bandung neighborhood; concern text (or voice).  
2. SAM overlays litter.  
3. Spark asks 2–3 resource questions.  
4. Propose pack cleanup action.  
5. Wonder Action Plan with materials, safety, measure-how, uncertainty.  
6. Muse Image share card.  
7. Short cut to S4 escalate.

---

## 14. Quality gates

| Gate | Pass |
| --- | --- |
| Action relevance | Proposed actions ⊆ pack |
| No lecture-first UX | Primary artifact is Action Plan |
| No politics | No lobbying/party/protest CTAs in outputs |
| Unsupported claims | No guaranteed CO₂ / “solved climate” language |
| Escalation | S4 and hazard answers escalate |
| Muse breadth | Session uses SAM + Spark + Wonder + Image |

---

## 15. Out of scope

- RAG / vector databases / climate document chat
- Fine-tuning any Muse or open-weight model
- Political advocacy, policy drafting, protest logistics
- Household fan / device repair (removed)
- Multi-issue packs beyond plastic/river litter for hackathon
- Open-weight self-host (unless demo already frozen)

---

## 16. Environment

```bash
MODEL_API_KEY=...
META_API_BASE_URL=https://api.meta.ai/v1
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
API_PORT=8787
VITE_API_BASE_URL=http://localhost:8787
```

Set Meta billing spend limits; Wonder + Image are credit-heavy.

---

## 17. Target repository layout

```text
/
  architecture.md
  task.md
  apps/web
  apps/api
  packages/shared
  packages/action-packs/plastic_litter_id_v1.json
  fixtures/litter/{S1,S2,S3,S4}/
  supabase/migrations/
```

This file is the build authority after the FixIt purge.
