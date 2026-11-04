# Iklim PAL — demo diagrams

Copy-paste Mermaid into GitHub / Notion / Obsidian, or screenshot for slides.

**Say once when showing Diagram 1:** “Boxes marked Built = Hackathon code; Meta models are tools we call.”

Use Diagram 1 near open or close; Diagram 2 for the S2 happy path; Diagram 3 for the S4 hazard beat.

---

## 1. High-level architecture

```mermaid
flowchart TB
  subgraph builtWeb [Built_Web]
    Capture[Capture_UI]
    Guide[Guide_UI]
    Plans[Plans_UI]
  end

  subgraph builtApi [Built_API_Agent]
    Pack[Action_Pack]
    Gates[Concern_PlanMatch_Gates]
    PackQA[Pack_Ordered_QA]
    Escalate[Hazard_Escalate_Plan]
    Progress[OwnerKey_Progress]
  end

  subgraph metaTools [Meta_Tools_Not_Built]
    SAM[sam_3_1]
    Spark[muse_spark]
    Wonder[muse_wonder]
    Image[muse_image]
    Voice[muse_voice]
  end

  Store[(Supabase_Storage_Sessions)]

  Capture --> builtApi
  Guide --> builtApi
  Plans --> Progress
  Pack --> PackQA
  Gates --> PackQA
  PackQA --> Escalate
  builtApi --> SAM
  builtApi --> Spark
  builtApi --> Wonder
  builtApi --> Image
  builtApi --> Voice
  builtApi --> Store
  Progress --> Store
```

| Layer | Hackathon-built? |
| --- | --- |
| Web Capture / Guide / Plans | Yes |
| Action Pack, pack Q&A, gates, escalate plan, `ownerKey` progress | Yes |
| SAM / Spark / Wonder / Muse Image / Voice | No — tools |
| Supabase buckets + session rows | Infra we wired |

---

## 2. Sequence — happy path (S2 riverbank)

```mermaid
sequenceDiagram
  actor Youth
  participant Web as Web_Built
  participant Api as ApiAgent_Built
  participant Pack as ActionPack_Built
  participant SAM as SAM_Tool
  participant Spark as Spark_Tool
  participant Wonder as Wonder_Tool
  participant Image as MuseImage_Tool
  participant Store as Store

  Youth->>Web: Upload litter photo Start
  Web->>Api: createSession photo step
  Api->>Store: save photo
  Note over Api,SAM: tool call
  Api->>SAM: segment litter
  SAM-->>Api: masks
  Api->>Store: save mask evidence
  Note over Api,Spark: tool once for concern
  Api->>Spark: concern hypothesis
  Spark-->>Api: hypothesis text
  Api-->>Web: q_concern_confirm
  Youth->>Web: Yes confirm concern
  Web->>Api: answer
  Note over Api,Pack: built pack Q and A no Spark
  loop Pack ordered questions
    Api->>Pack: next question
    Pack-->>Api: chip question
    Api-->>Web: ask chip
    Youth->>Web: answer
    Web->>Api: answer
  end
  Api-->>Web: propose action
  Youth->>Web: Accept action
  Web->>Api: accept
  Note over Api,Wonder: tool finalize
  Api->>Wonder: synthesize Action Plan
  Wonder-->>Api: plan JSON
  Api->>Image: share card
  Image-->>Api: card image
  Api->>Store: save plan share card
  Api-->>Web: plan plus q_plan_match
  Youth->>Web: Yes plan matches
  Web->>Api: answer
  Api->>Store: status active
  Note over Youth,Store: built Plans checkoffs
  Youth->>Web: Plans open check off step
  Web->>Api: PATCH progress
  Api->>Store: update progress
```

---

## 3. Sequence — hazard escalate (S4)

```mermaid
sequenceDiagram
  actor Youth
  participant Web as Web_Built
  participant Api as ApiAgent_Built
  participant Pack as ActionPack_Built
  participant Store as Store

  Note over Youth,Store: After photo SAM concern same as S2 then pack Q and A
  Youth->>Web: q_hazard Yes
  Web->>Api: answer hazard true
  Note over Api,Pack: built safety gate
  Api->>Pack: stop_hazard message
  Pack-->>Api: escalate defaults
  Api->>Api: finalize stop_and_escalate plan
  Note over Api: Stay clear Note location Contact adult or authority
  Api->>Store: status escalated save plan
  Api-->>Web: escalated PlanSheet
  Youth->>Web: Plans Past open plan
  Note over Youth,Web: No DIY cleanup checkoffs optional
```

---

## Demo usage

- **0:00 or 2:30:** Diagram 1 on screen while naming Built vs Meta tools.
- **During S2:** Diagram 2 as a B-roll slide if live UI is slow.
- **During S4:** Diagram 3 when hazard Yes fires.
