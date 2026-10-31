# FixIt Vision — Architecture

Build contract for the Meta Global AI Developer Hackathon MVP.

| Field | Value |
| --- | --- |
| Product | **FixIt Vision** — perception-grounded, rule-constrained troubleshooting agent |
| Theme | **Build for Your World** |
| Track | **Indie** |
| MVP device | Household fan — symptom: **won’t turn on** |
| Stack | React + Vite · Node.js · Supabase · Meta Model API (Muse) |
| Submission | Wed **Nov 4, 9:00 PM ET** |
| Fine-tuning | **Out of scope** — domain knowledge lives in Device Pack + rules + prompts |

---

## 1. Product contract

### Problem

When a household device stops working, people do not know what to check first. Generic web advice ignores the exact device and visible condition. A photo alone is not a diagnosis. Unsafe guidance can push people into energized or internal repairs.

### Users (MVP)

- Households doing a safe first check
- (Later) small repair businesses / maintenance — not required for demo

### Core value

Combine **visual evidence + user-reported symptoms + approved safe checks** so the user understands what they can inspect externally, what remains uncertain, and when to call a technician.

### Hard boundaries

- No guaranteed diagnosis or confirmed fault labels in the UI
- No hazardous disassembly
- No instructions to work on energized equipment
- Model outputs are **hypotheses** gated by the Device Pack; the rules engine is the product authority

### Positioning line (judge-facing)

> FixIt Vision is not an image classifier. It is a multi-turn agent that gathers SAM-grounded evidence, asks only approved questions, proposes only pack-approved safe checks, and emits an uncertainty-aware technician handoff — never a free-form “here’s what’s broken.”

---

## 2. Anti-project escape

Hackathon anti-projects include **Simple Image Analyzers**. A naive “upload photo → model names the fault” build fails the gate.

| Simple image analyzer (banned shape) | FixIt Vision (shipped shape) |
| --- | --- |
| One multimodal call returns a label | Multi-turn agent with tools + session state |
| Free-form diagnosis text | Hypotheses only; never confirmed faults |
| No domain constraints | Fan Device Pack: parts, checks, stop conditions |
| Vision is the product | Vision is evidence; **rules + escalation** are the product |
| No structured artifact | Exportable **Repair Brief** for a human technician |

**Pass/fail requirements we must demonstrate in the demo video:**

1. Meta Model API used for real work (SAM 3.1 + Muse Spark; optional Muse Image)
2. At least two tool hops in one session (e.g. segment → ask → check → summarize)
3. Safety stop / escalate when evidence is insufficient
4. Explicit uncertainty language in the final summary

---

## 3. Winning criteria map (Indie)

| Criterion | Weight | How FixIt proves it |
| --- | --- | --- |
| **Impact** | 30% | Everyday household pain; safer first checks; technician-ready brief |
| **Meta AI tooling** | 25% | SAM masks + Spark agent loop + (P1) Muse Image “inspect here” overlay |
| **Demo** | 25% | One staged fan scenario end-to-end + escalation case; crisp 3-min video |
| **Technical depth** | 20% | Device Pack, evidence ledger, safety gate, structured state in Supabase |

**Bonus targets (after P0 works):**

- **Best Agentic Use-Case ($5K)** — tool-calling loop with durable session state
- **Best Creative Build ($5K)** — Muse Image annotated inspection overlay from SAM masks

Skip open-weight fine-tune / self-host unless the demo is already frozen.

---

## 4. System architecture

```text
┌─────────────────────┐     HTTPS      ┌──────────────────────┐
│  React + Vite       │ ─────────────► │  Node.js API         │
│  Capture / masks /  │                │  Agent orchestrator  │
│  Q&A / summary UI   │ ◄───────────── │  Safety rules gate   │
└─────────────────────┘                │  Device Pack loader  │
                                       └──────────┬───────────┘
                              ┌───────────────────┼───────────────────┐
                              ▼                   ▼                   ▼
                        Supabase DB         Supabase Storage    Meta Model API
                        sessions /          photos / masks /    sam-3.1
                        evidence /          overlay images      muse-spark-1.3
                        packs                                   muse-image-1.0
```

### Responsibilities

| Layer | Owns |
| --- | --- |
| **Frontend** | Photo capture/upload, symptom form, mask overlay rendering, approved Q&A UI, safe-check confirmation, Repair Brief view |
| **Node API** | Auth to Meta + Supabase service role, agent step loop, schema validation, safety gate, Device Pack enforcement |
| **Supabase** | Session persistence, evidence ledger, image/mask storage, optional anon session tokens for demo |
| **Meta Model API** | Perception (SAM), reasoning/planning (Spark), optional overlay generation (Image) |

**Invariant:** the browser never holds `MODEL_API_KEY`. All Muse/SAM calls go through Node.

---

## 5. Muse integration (inference only — no fine-tune)

Base URL: `https://api.meta.ai/v1`  
Auth: `Authorization: Bearer $MODEL_API_KEY`

Domain knowledge is **not** trained into weights. It lives in:

1. Fan Device Pack JSON  
2. System + tool prompts constrained to pack IDs  
3. Few-shot staged fixtures for eval/demo  
4. Evidence ledger linking every claim to a source  

### 5.1 SAM 3.1 — `sam-3.1`

- **Role:** Segment visible fan parts from short noun phrases (and optional point/box prompts later).
- **Input:** User photo + phrases from Device Pack (`power plug`, `power switch`, `fan grille`, `fan blades`, …).
- **Output:** Boxes + masks stored in Storage; mask metadata written to evidence ledger.
- **UI:** Frontend composites translucent overlays so judges *see* grounding.

### 5.2 Muse Spark — `muse-spark-1.3`

- **Role:** Multimodal interpreter + agent planner.
- **Inputs:** Photo (and/or cropped regions), current session state summary, Device Pack excerpt, tool schemas.
- **Outputs:** Structured JSON only (Zod/JSON Schema validated server-side): next action, hypothesis candidates with confidence bands, uncertainty notes.
- **Constraints:** May only reference pack part IDs, question IDs, and check IDs. May not invent repair steps outside the pack. May not assert a confirmed root cause.

Recommended reasoning effort for planner steps: `high` when choosing escalate vs continue; `minimal`/`low` for cheap classification helpers if split into subcalls.

### 5.3 Muse Image — `muse-image-1.0` (P1, non-blocking)

- **Role:** Generate an annotated “inspect here” still for the Repair Brief, guided by SAM mask regions + short instruction.
- **Fallback:** If Image fails or credits are low, render canvas overlays client-side from SAM masks (same UX contract).

### 5.4 Explicit non-goals for models

- No fine-tuning Muse Spark / Wonder / open-weight variants for fan repair
- No free-form “how to fix your motor” generation
- No medical, electrical internals, or energized procedures

---

## 6. Domain model

### DevicePack

Versioned JSON, checked into the repo (also mirrored in Supabase for runtime load).

```ts
type DevicePack = {
  id: "household_fan_v1";
  displayName: string;
  supportedSymptoms: Array<"wont_turn_on">;
  parts: Array<{
    id: string;                 // e.g. "plug"
    samPhrase: string;          // e.g. "power plug"
    requiredForDemo?: boolean;
  }>;
  questions: Array<{
    id: string;
    text: string;
    expects: "yes_no" | "enum" | "short_text";
    options?: string[];
    mapsToEvidence: string;     // evidence key
  }>;
  safeChecks: Array<{
    id: string;
    title: string;
    instructions: string[];     // external, unplugged-only language
    requiresUnplugged: true;
    forbiddenIf?: string[];     // gate tags that block this check
  }>;
  stopConditions: Array<{
    id: string;
    when: string;               // human + machine readable rule id
    escalate: boolean;
    userMessage: string;
  }>;
  escalationDefaults: {
    message: string;
    nextStep: "contact_technician" | "stop";
  };
};
```

### Session

Durable troubleshooting run.

```ts
type Session = {
  id: string;
  devicePackId: "household_fan_v1";
  symptom: "wont_turn_on";
  status: "collecting" | "inspecting" | "questioning" | "checking" | "summarizing" | "done" | "escalated";
  photoPath?: string;
  createdAt: string;
  updatedAt: string;
};
```

### EvidenceItem

Append-only ledger. Every UI claim must cite one.

```ts
type EvidenceItem = {
  id: string;
  sessionId: string;
  kind: "sam_mask" | "user_answer" | "safe_check_result" | "model_observation";
  partId?: string;
  questionId?: string;
  checkId?: string;
  payload: Record<string, unknown>; // mask urls, answer value, observation text
  source: "sam-3.1" | "user" | "muse-spark-1.3" | "rules";
  createdAt: string;
};
```

### Hypothesis

Never shown as confirmed.

```ts
type Hypothesis = {
  id: string;
  label: string;              // e.g. "switch may be off"
  confidence: "low" | "medium" | "high";
  supportingEvidenceIds: string[];
  status: "candidate" | "weakened" | "ruled_out" | "unresolved";
};
```

### SafeCheck / Escalation / RepairBrief

```ts
type SafeCheckResult = {
  checkId: string;
  outcome: "pass" | "fail" | "unclear" | "skipped";
  notes?: string;
};

type Escalation = {
  reasonId: string;
  message: string;
  triggeredByEvidenceIds: string[];
};

type RepairBrief = {
  sessionId: string;
  device: "household_fan";
  symptom: string;
  observations: string[];          // evidence-backed only
  checksPerformed: SafeCheckResult[];
  hypotheses: Hypothesis[];        // labeled as unconfirmed
  uncertainty: string[];
  recommendation: "safe_home_followup" | "stop_and_escalate";
  technicianNotes: string;         // structured handoff paragraph
  overlayImagePath?: string;       // Muse Image or canvas fallback
};
```

---

## 7. Agent + rules engine

### High-level loop

```text
capture photo + symptom
  → create Session
  → Muse Spark plans next tool (constrained)
      ├─ segment_parts (SAM 3.1)
      ├─ ask_question (pack question ids only)
      ├─ propose_safe_check (pack check ids only)
      └─ finalize_summary
  → each tool result → EvidenceItem
  → SafetyGate evaluates stop/escalate
  → continue or emit RepairBrief
```

### Tools (server-implemented)

| Tool | Effect |
| --- | --- |
| `segment_parts` | Calls SAM for one or more pack `samPhrase`s; stores masks; appends evidence |
| `ask_question` | Returns next approved question; waits for user answer via API |
| `propose_safe_check` | Returns pack check text only if SafetyGate allows |
| `record_check_result` | Persists user-reported check outcome |
| `finalize_summary` | Builds RepairBrief; optional Muse Image overlay |

Spark chooses tools; **Node validates** every call against the Device Pack before execution.

### State machine

```text
collecting → inspecting → questioning ⇄ checking → summarizing → done
                 │              │
                 └──────────────┴──► escalated
```

Transitions into `escalated` when any `stopConditions` fire (e.g. suspected internal electrical fault, damaged cord with exposed conductors language from user, no visible cause after required checks).

### Safety gate invariants

1. Every `propose_safe_check` requires `requiresUnplugged` acknowledgment in session evidence.
2. No check text may include words/patterns from a deny list: open chassis, live wire, motor rewind, capacitor discharge DIY, etc. (maintain a server-side deny list).
3. Spark structured output that references unknown IDs is rejected; agent is asked to retry or escalate.
4. UI copy for hypotheses always prefixes with uncertainty framing (“possible,” “not confirmed”).
5. If required demo parts cannot be segmented and user answers contradict each other → escalate, do not invent a cause.

### Uncertainty labels (required in RepairBrief)

- `insufficient_visual_evidence`
- `conflicting_user_answers`
- `no_pack_check_remaining`
- `possible_internal_fault_out_of_scope`

---

## 8. Fan Device Pack (MVP content)

**Pack ID:** `household_fan_v1`  
**Symptom:** `wont_turn_on`

### Parts

| Part ID | SAM phrase |
| --- | --- |
| `plug` | power plug |
| `cord` | power cord |
| `switch` | power switch |
| `grille` | fan grille |
| `blades` | fan blades |
| `base` | fan base |
| `obstruction` | dust or obstruction on fan |

### Staged demo scenarios (fixtures, not training data)

| ID | Setup | Expected agent behavior |
| --- | --- | --- |
| `S1_unplugged` | Plug visibly out of outlet / not seated | Segment plug; ask/confirm power; safe check; summary without claiming motor failure |
| `S2_switch_off` | Switch clearly in off position | Segment switch; ask switch position; propose verify switch; hypothesis “switch may be off” |
| `S3_grille_blocked` | Visible dust/obstruction on grille | Segment grille/obstruction; safe external clear-obstruction check **only while unplugged** |
| `S4_ambiguous` | Powered appearance, no visible issue | Complete required questions/checks → **escalate** with uncertainty |

### Safe checks (examples)

- Confirm device is unplugged before any physical inspection
- Visually inspect plug for cracks or burn marks (look only)
- Verify switch position
- With power disconnected, check whether grille has visible blockage

### Stop / escalate examples

- User reports sparking, burning smell, or shock → immediate escalate
- Damaged cord with exposed conductors suspected → escalate
- After pack-complete path with no supporting evidence → escalate to technician

---

## 9. API surface (Node)

Minimal REST for the hackathon. All mutating routes validate body schemas.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/sessions` | Create session (`devicePackId`, `symptom`) |
| `POST` | `/sessions/:id/photo` | Upload photo → Storage; set status `inspecting` |
| `POST` | `/sessions/:id/step` | Run one agent step (planner + optional tool) |
| `POST` | `/sessions/:id/answers` | Submit answer to active question |
| `POST` | `/sessions/:id/checks/:checkId` | Record safe-check outcome |
| `POST` | `/sessions/:id/finalize` | Force summary if needed |
| `GET` | `/sessions/:id` | Session + evidence + hypotheses + brief |
| `GET` | `/packs/household_fan_v1` | Device Pack JSON |

**Agent step response shape:**

```json
{
  "sessionId": "...",
  "status": "questioning",
  "assistantMessage": "I can see the switch region. Is the switch set to On?",
  "ui": {
    "masks": [{ "partId": "switch", "url": "..." }],
    "question": { "id": "q_switch_position", "text": "..." },
    "safeCheck": null,
    "hypotheses": [{ "label": "switch may be off", "confidence": "medium" }]
  },
  "escalated": false
}
```

---

## 10. Data (Supabase)

### Tables (sketch)

- `device_packs` — `id`, `version`, `json`, `updated_at`
- `sessions` — `id`, `device_pack_id`, `symptom`, `status`, `photo_path`, `created_at`, `updated_at`
- `evidence_items` — `id`, `session_id`, `kind`, `part_id`, `question_id`, `check_id`, `payload jsonb`, `source`, `created_at`
- `hypotheses` — `id`, `session_id`, `label`, `confidence`, `status`, `supporting_evidence_ids uuid[]`
- `repair_briefs` — `id`, `session_id`, `brief jsonb`, `overlay_path`, `created_at`

### Storage buckets

- `session-photos`
- `session-masks`
- `session-overlays`

### Access

- Hackathon demo may use a single shared anon key with RLS limited to insert/select on own `session_id`, **or** issue short-lived session tokens from Node.
- Service role used only on the server for Muse orchestration writes.

---

## 11. Frontend (React + Vite)

### Screens (one composition flow)

1. **Capture** — photo + symptom “won’t turn on”
2. **Inspect** — SAM overlays on the fan image
3. **Guide** — approved questions + safe checks
4. **Brief** — Repair Brief with uncertainty + escalate CTA

### UX rules

- Never show a red “DIAGNOSIS: X” banner
- Hypotheses in muted “possible causes (unconfirmed)” section
- Escalation is a first-class success state for `S4_ambiguous`
- Masks should be obvious in the demo recording

---

## 12. Demo path (must work live)

### Happy path (`S2_switch_off` recommended hero)

1. Upload staged photo of fan with switch visibly off; symptom won’t turn on  
2. Agent segments `switch` (and optionally `plug`) via SAM  
3. Spark asks pack question about switch position  
4. User answers; agent proposes safe check: verify switch while unplugged / confirm position  
5. Summary: hypothesis “switch may be off,” checks performed, **cause not confirmed**, optional next home follow-up wording from pack  
6. Show technician notes + overlay  

### Escalation path (`S4_ambiguous`)

1. Upload ambiguous photo  
2. Agent runs required segments + questions + checks  
3. SafetyGate → escalate  
4. Brief states insufficient evidence; stop; contact qualified technician  

Record both in the 3-minute video if time allows; hero + 20s escalation is enough.

---

## 13. Quality gates

From the product validation slide — treat as acceptance tests:

| Gate | Pass condition |
| --- | --- |
| Troubleshooting relevance | Suggested checks ⊆ pack for the active scenario |
| Unsupported claims | No summary sentence asserts a root cause without evidence IDs |
| Escalation quality | `S4` and hazard answers always escalate |
| False confidence | Contradictory answers weaken/rule out hypotheses rather than double down |

Fixture folder suggestion: `/fixtures/fan/{S1,S2,S3,S4}/` with photo + expected brief JSON.

---

## 14. Out of scope (hackathon)

- Fine-tuning any Muse / open-weight model for fans or repair
- Multi-device packs beyond household fan
- Voice input (Muse Voice Transcribe)
- Guaranteed repair outcomes
- Energized testing, internal electrical work, disassembly guides
- Mobile native apps
- Full auth/billing multi-tenant production hardening (demo-grade security only)

---

## 15. Environment

```bash
MODEL_API_KEY=...
META_API_BASE_URL=https://api.meta.ai/v1
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Optional: spend limit on Meta billing so the team stays inside hackathon credits.

---

## 16. Repository layout (target)

```text
/
  architecture.md          ← this file
  task.md
  apps/web                 ← React + Vite
  apps/api                 ← Node.js
  packages/device-packs    ← household_fan_v1.json
  fixtures/fan             ← staged photos + expected briefs
```

This architecture is the build authority. If implementation drifts, update this file in the same PR as the code change.
