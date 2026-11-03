import {
  ActionPlanSchema,
  PlannerActionSchema,
  type ActionPack,
  type ActionPlan,
  type AgentStepResponse,
  type PlannerAction,
} from "@iklim-pal/shared";
import {
  BUCKETS,
  downloadPhoto,
  getActionPlan,
  getSession,
  insertEvidence as dbInsertEvidence,
  listEvidence,
  saveActionPlan,
  signedUrl,
  updateSession,
  uploadBlob,
} from "./db.js";
import {
  generateShareCard,
  parseJsonFromModel,
  segmentWithSam,
  sparkRespond,
  wonderRespond,
} from "./meta/client.js";
import {
  assertPackAction,
  assertPackPart,
  assertPackQuestion,
  hasPackAction,
  isPlannerActionInPack,
  loadActionPack,
} from "./pack.js";

type SessionRow = {
  id: string;
  action_pack_id: string;
  concern_text: string;
  city: string;
  status: string;
  photo_path: string | null;
  voice_path: string | null;
  created_at: string;
  updated_at: string;
};

type EvidenceRow = {
  id: string;
  session_id: string;
  kind: string;
  part_id: string | null;
  question_id: string | null;
  action_id: string | null;
  payload: Record<string, unknown>;
  source: string;
  created_at: string;
};

async function downloadPhotoDataUrl(photoPath: string): Promise<string> {
  const buf = await downloadPhoto(photoPath);
  const mime = photoPath.includes(".png") ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/** Prefer Supabase signed URL for Muse; fall back to base64 only if signing fails. */
async function photoUrlForMuse(photoPath: string): Promise<string> {
  const url = await signedUrl(BUCKETS.photos, photoPath);
  if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
    return url;
  }
  // Local-store fallback may return data: URLs from signedUrl — still usable by Muse
  if (url?.startsWith("data:")) return url;
  return downloadPhotoDataUrl(photoPath);
}

function hasSamEvidence(evidence: EvidenceRow[]): boolean {
  return evidence.some((e) => e.kind === "sam_mask");
}

function truthyAnswer(value: unknown): boolean {
  return (
    value === true ||
    value === "yes" ||
    value === "Yes" ||
    value === "true"
  );
}

function hazardTriggered(evidence: EvidenceRow[]): boolean {
  return evidence.some(
    (e) =>
      e.kind === "user_answer" &&
      e.question_id === "q_hazard" &&
      truthyAnswer(e.payload.value),
  );
}

function answeredIds(evidence: EvidenceRow[]): Set<string> {
  return new Set(
    evidence.filter((e) => e.kind === "user_answer" && e.question_id).map((e) => e.question_id!),
  );
}

function acceptedActionIds(evidence: EvidenceRow[]): Set<string> {
  return new Set(
    evidence
      .filter((e) => e.kind === "action_accepted" && e.action_id)
      .map((e) => e.action_id!),
  );
}

async function insertEvidence(
  row: Omit<EvidenceRow, "id" | "created_at"> & { id?: string },
): Promise<EvidenceRow> {
  const data = await dbInsertEvidence({
    session_id: row.session_id,
    kind: row.kind,
    part_id: row.part_id ?? null,
    question_id: row.question_id ?? null,
    action_id: row.action_id ?? null,
    payload: row.payload,
    source: row.source,
  });
  return data as EvidenceRow;
}

async function loadSession(sessionId: string): Promise<SessionRow> {
  return (await getSession(sessionId)) as SessionRow;
}

async function loadEvidence(sessionId: string): Promise<EvidenceRow[]> {
  return (await listEvidence(sessionId)) as EvidenceRow[];
}

async function setStatus(sessionId: string, status: string) {
  await updateSession(sessionId, { status });
}

function emptyStep(
  sessionId: string,
  status: AgentStepResponse["status"],
  assistantMessage: string,
  escalated = false,
): AgentStepResponse {
  return {
    sessionId,
    status,
    assistantMessage,
    escalated,
    ui: {
      masks: [],
      question: null,
      proposedAction: null,
      plan: null,
      shareCardUrl: null,
    },
  };
}

async function collectMasksUi(evidence: EvidenceRow[]) {
  const masks: { partId: string; url: string }[] = [];
  for (const e of evidence.filter((x) => x.kind === "sam_mask")) {
    const path = typeof e.payload.maskPath === "string" ? e.payload.maskPath : null;
    const partId = e.part_id ?? "unknown";
    if (path) {
      const url = await signedUrl(BUCKETS.masks, path);
      if (url) masks.push({ partId, url });
    } else if (typeof e.payload.previewNote === "string") {
      // SAM returned text-only geometry; surface placeholder via empty url skip
    }
  }
  return masks;
}

function deterministicPlan(opts: {
  pack: ActionPack;
  evidence: EvidenceRow[];
}): PlannerAction {
  if (!opts.evidence.some((e) => e.kind === "sam_mask")) {
    return {
      action: "segment_parts",
      partIds: opts.pack.parts.filter((p) => p.requiredForDemo).map((p) => p.id),
      assistantMessage: "I'll mark visible litter in your photo first.",
    };
  }
  const nextQ = opts.pack.questions.find((q) => !answeredIds(opts.evidence).has(q.id));
  if (nextQ) {
    return {
      action: "ask_question",
      questionId: nextQ.id,
      assistantMessage: nextQ.text,
    };
  }
  return {
    action: "finalize_plan",
    assistantMessage: "Building your action plan from what we know.",
  };
}

function outOfScopeAction(pack: ActionPack): PlannerAction {
  const stop = pack.stopConditions.find((s) => s.id === "stop_out_of_scope");
  return {
    action: "finalize_plan",
    assistantMessage: stop?.userMessage ?? pack.escalationDefaults.message,
    escalate: true,
    escalateReasonId: "stop_out_of_scope",
  };
}

async function callSparkPlanner(opts: {
  pack: ActionPack;
  session: SessionRow;
  evidence: EvidenceRow[];
  /** Signed https URL or data URL; omit on text-only Q&A turns after SAM. */
  imageUrl?: string;
  retryHint?: string;
}): Promise<PlannerAction> {
  const answered = [...answeredIds(opts.evidence)];
  const accepted = [...acceptedActionIds(opts.evidence)];
  const visionMode = Boolean(opts.imageUrl);
  const system = `You are the Iklim PAL planner for youth plastic/river litter action.
Return JSON only matching:
{"action":"segment_parts"|"ask_question"|"propose_action"|"finalize_plan","partIds":[],"questionId":"","actionId":"","assistantMessage":"","escalate":false,"escalateReasonId":""}
Rules:
- Only use IDs from the action pack. Never invent IDs.
- Prefer segment_parts first if no sam_mask evidence yet.
- Ask unanswered pack questions before proposing actions.
- Never invent political, lobbying, or protest actions.
- Never claim guaranteed climate impact or CO2 numbers.
- If hazard evidence is present, escalate=true.
- If the user concern cannot be served by this pack (not plastic/river/drain litter), set escalate=true and escalateReasonId="stop_out_of_scope".
- finalize_plan only after some questions answered (or escalate).
- No climate science lecture — focus on next practical step.
${
  visionMode
    ? "- An image is attached: use it with segment_parts / first inspection."
    : "- No image attached this turn: SAM masks already exist in evidence. Decide next ask_question, propose_action, or finalize_plan from the evidence ledger and answers only. Do not request segment_parts again unless sam_mask evidence is missing."
}
${opts.retryHint ? `\nRETRY: ${opts.retryHint}` : ""}`;

  const samEvidence = opts.evidence
    .filter((e) => e.kind === "sam_mask")
    .map((e) => ({
      partId: e.part_id,
      samPhrase: e.payload.samPhrase,
      samTextPreview:
        typeof e.payload.samText === "string"
          ? e.payload.samText.slice(0, 400)
          : undefined,
    }));

  const userText = JSON.stringify({
    city: opts.session.city,
    concernText: opts.session.concern_text,
    status: opts.session.status,
    answeredQuestionIds: answered,
    acceptedActionIds: accepted,
    evidenceKinds: opts.evidence.map((e) => e.kind),
    samEvidence,
    pack: {
      parts: opts.pack.parts.map((p) => ({ id: p.id, samPhrase: p.samPhrase })),
      questions: opts.pack.questions.map((q) => ({
        id: q.id,
        text: q.text,
        expects: q.expects,
        options: q.options,
      })),
      actions: opts.pack.actions.map((a) => ({
        id: a.id,
        title: a.title,
        forbiddenIf: a.forbiddenIf,
      })),
      stopConditions: opts.pack.stopConditions,
    },
  });

  const { text } = await sparkRespond({
    system,
    userText,
    imageDataUrl: opts.imageUrl,
  });
  return PlannerActionSchema.parse(parseJsonFromModel(text));
}

async function planNext(opts: {
  pack: ActionPack;
  session: SessionRow;
  evidence: EvidenceRow[];
  imageUrl?: string;
}): Promise<PlannerAction> {
  let planned: PlannerAction;
  try {
    planned = await callSparkPlanner(opts);
  } catch {
    planned = deterministicPlan(opts);
  }

  if (planned.escalate) return planned;

  if (!isPlannerActionInPack(opts.pack, planned)) {
    try {
      planned = await callSparkPlanner({
        ...opts,
        retryHint:
          "Previous response used unknown pack IDs. Use only IDs listed in pack, or escalate with escalateReasonId stop_out_of_scope.",
      });
    } catch {
      return outOfScopeAction(opts.pack);
    }
    if (planned.escalate) return planned;
    if (!isPlannerActionInPack(opts.pack, planned)) {
      return outOfScopeAction(opts.pack);
    }
  }

  return planned;
}

async function escalateOutOfScope(
  sessionId: string,
  pack: ActionPack,
  message?: string,
): Promise<AgentStepResponse> {
  const stop = pack.stopConditions.find((s) => s.id === "stop_out_of_scope");
  await setStatus(sessionId, "escalated");
  await insertEvidence({
    session_id: sessionId,
    kind: "model_observation",
    part_id: null,
    question_id: null,
    action_id: null,
    payload: { reason: "stop_out_of_scope", message: message ?? stop?.userMessage },
    source: "rules",
  });
  return emptyStep(
    sessionId,
    "escalated",
    message ?? stop?.userMessage ?? pack.escalationDefaults.message,
    true,
  );
}

async function runSegment(
  session: SessionRow,
  pack: ActionPack,
  partIds: string[],
  imageUrl: string,
): Promise<void> {
  const ids = partIds.length
    ? partIds
    : pack.parts.filter((p) => p.requiredForDemo).map((p) => p.id);
  for (const partId of ids) {
    assertPackPart(pack, partId);
    const part = pack.parts.find((p) => p.id === partId)!;
    const sam = await segmentWithSam({
      imageDataUrl: imageUrl,
      phrase: part.samPhrase,
    });
    const maskPath = `${session.id}/${partId}-${Date.now()}.json`;
    await uploadBlob(
      "masks",
      maskPath,
      Buffer.from(JSON.stringify({ phrase: part.samPhrase, sam: sam.text })),
      "application/json",
    );
    await insertEvidence({
      session_id: session.id,
      kind: "sam_mask",
      part_id: partId,
      question_id: null,
      action_id: null,
      payload: { maskPath, samText: sam.text.slice(0, 2000), samPhrase: part.samPhrase },
      source: "sam-3.1",
    });
  }
  await setStatus(session.id, "inspecting");
}

async function finalizePlan(opts: {
  session: SessionRow;
  pack: ActionPack;
  evidence: EvidenceRow[];
  /** Signed URL (preferred) for Wonder + Muse Image reference. */
  imageUrl?: string;
}): Promise<{ plan: ActionPlan; shareCardUrl: string | null }> {
  const system = `You are Muse Wonder synthesizing an Iklim PAL Action Plan for youth.
Return JSON only:
{"goal":"","steps":[{"order":1,"title":"","detail":"","owner":"solo"|"friends"|"adult_help","timeboxMinutes":30,"packActionId":""}],"materials":[],"safetyNotes":[],"measureHow":[],"uncertainty":[],"recommendation":"proceed_with_plan"|"stop_and_escalate"}
Rules:
- packActionId must be from the pack or omitted.
- No politics, lobbying, protests, parties.
- No guaranteed CO2 / climate-solved claims.
- If hazards present, recommendation stop_and_escalate.
- Keep steps practical and measurable (bags, before/after photos).`;

  const { text } = await wonderRespond({
    system,
    userText: JSON.stringify({
      city: opts.session.city,
      concern: opts.session.concern_text,
      evidence: opts.evidence.map((e) => ({
        kind: e.kind,
        partId: e.part_id,
        questionId: e.question_id,
        actionId: e.action_id,
        payload: e.payload,
      })),
      packActions: opts.pack.actions,
      escalationDefaults: opts.pack.escalationDefaults,
    }),
    imageDataUrl: opts.imageUrl,
  });

  const rawPlan = parseJsonFromModel(text) as Record<string, unknown>;
  const plan = ActionPlanSchema.parse({
    ...rawPlan,
    sessionId: opts.session.id,
  });

  // Drop unknown pack action IDs instead of failing the whole plan
  plan.steps = plan.steps.map((step) => {
    if (step.packActionId && !hasPackAction(opts.pack, step.packActionId)) {
      const { packActionId: _drop, ...rest } = step;
      return rest;
    }
    return step;
  });
  if (plan.steps.length === 0 && plan.recommendation === "proceed_with_plan") {
    plan.recommendation = "stop_and_escalate";
    plan.uncertainty = [
      ...(plan.uncertainty ?? []),
      "No pack-approved action IDs remained after validation.",
    ];
  }

  let shareCardUrl: string | null = null;
  let shareCardPath: string | undefined;
  try {
    const card = await generateShareCard({
      prompt: `Create a friendly youth cleanup invite card for Iklim PAL. City: ${opts.session.city}. Goal: ${plan.goal}. Non-political community litter cleanup. Bold readable text, hopeful outdoor vibe, no logos of political parties.`,
      referenceImageDataUrl: opts.imageUrl,
    });
    if (card.dataUrl) {
      shareCardPath = `${opts.session.id}/share-${Date.now()}.png`;
      let buf: Buffer;
      if (card.dataUrl.startsWith("data:")) {
        buf = Buffer.from(card.dataUrl.split(",")[1] ?? "", "base64");
      } else {
        const imgRes = await fetch(card.dataUrl);
        buf = Buffer.from(await imgRes.arrayBuffer());
      }
      await uploadBlob("shareCards", shareCardPath, buf, "image/png");
      shareCardUrl = await signedUrl(BUCKETS.shareCards, shareCardPath);
      plan.shareCardPath = shareCardPath;
    }
  } catch {
    // Image is P0 but demo continues without card if API fails
  }

  await saveActionPlan(opts.session.id, plan, shareCardPath ?? null);

  await insertEvidence({
    session_id: opts.session.id,
    kind: "model_observation",
    part_id: null,
    question_id: null,
    action_id: null,
    payload: { planGoal: plan.goal, recommendation: plan.recommendation },
    source: "muse-wonder-1.0",
  });

  const status =
    plan.recommendation === "stop_and_escalate" ? "escalated" : "done";
  await setStatus(opts.session.id, status);

  return { plan, shareCardUrl };
}

export async function runAgentStep(sessionId: string): Promise<AgentStepResponse> {
  const pack = loadActionPack();
  const session = await loadSession(sessionId);
  let evidence = await loadEvidence(sessionId);

  if (hazardTriggered(evidence)) {
    await setStatus(sessionId, "escalated");
    const stop = pack.stopConditions.find((s) => s.id === "stop_hazard");
    return emptyStep(
      sessionId,
      "escalated",
      stop?.userMessage ?? pack.escalationDefaults.message,
      true,
    );
  }

  if (!session.photo_path) {
    return emptyStep(sessionId, "collecting", "Upload a photo of the litter concern first.");
  }

  // Vision only before SAM; Q&A after SAM is text-only (no photo re-send).
  const needsVisionForPlanner = !hasSamEvidence(evidence);
  let imageUrl: string | undefined;
  if (needsVisionForPlanner) {
    imageUrl = await photoUrlForMuse(session.photo_path);
  }

  const planned = await planNext({
    pack,
    session,
    evidence,
    imageUrl,
  });

  if (planned.escalate) {
    if (planned.escalateReasonId === "stop_out_of_scope") {
      return escalateOutOfScope(sessionId, pack, planned.assistantMessage);
    }
    await setStatus(sessionId, "escalated");
    return emptyStep(
      sessionId,
      "escalated",
      planned.assistantMessage || pack.escalationDefaults.message,
      true,
    );
  }

  try {
    if (planned.action === "segment_parts") {
      const visionUrl = imageUrl ?? (await photoUrlForMuse(session.photo_path));
      await runSegment(session, pack, planned.partIds ?? [], visionUrl);
      evidence = await loadEvidence(sessionId);
      const masks = await collectMasksUi(evidence);
      return {
        sessionId,
        status: "inspecting",
        assistantMessage: planned.assistantMessage,
        escalated: false,
        ui: { masks, question: null, proposedAction: null, plan: null, shareCardUrl: null },
      };
    }

    if (planned.action === "ask_question") {
      const qid = planned.questionId;
      if (!qid || !isPlannerActionInPack(pack, planned)) {
        return escalateOutOfScope(sessionId, pack);
      }
      assertPackQuestion(pack, qid);
      const q = pack.questions.find((x) => x.id === qid)!;
      await setStatus(sessionId, "questioning");
      const masks = await collectMasksUi(evidence);
      return {
        sessionId,
        status: "questioning",
        assistantMessage: planned.assistantMessage || q.text,
        escalated: false,
        ui: {
          masks,
          question: {
            id: q.id,
            text: q.text,
            expects: q.expects,
            options: q.options,
          },
          proposedAction: null,
          plan: null,
          shareCardUrl: null,
        },
      };
    }

    if (planned.action === "propose_action") {
      const aid = planned.actionId;
      if (!aid || !isPlannerActionInPack(pack, planned)) {
        return escalateOutOfScope(sessionId, pack);
      }
      assertPackAction(pack, aid);
      const action = pack.actions.find((a) => a.id === aid)!;
      await setStatus(sessionId, "planning");
      const masks = await collectMasksUi(evidence);
      return {
        sessionId,
        status: "planning",
        assistantMessage: planned.assistantMessage || action.title,
        escalated: false,
        ui: {
          masks,
          question: null,
          proposedAction: {
            id: action.id,
            title: action.title,
            steps: action.steps,
            materials: action.materials,
            durationMinutes: action.durationMinutes,
          },
          plan: null,
          shareCardUrl: null,
        },
      };
    }

    // finalize_plan — Wonder + Muse Image still get the stored photo via signed URL
    await setStatus(sessionId, "summarizing");
    const finalizeImageUrl =
      imageUrl ?? (await photoUrlForMuse(session.photo_path));
    const { plan, shareCardUrl } = await finalizePlan({
      session,
      pack,
      evidence,
      imageUrl: finalizeImageUrl,
    });
    const masks = await collectMasksUi(evidence);
    return {
      sessionId,
      status: plan.recommendation === "stop_and_escalate" ? "escalated" : "done",
      assistantMessage: planned.assistantMessage || "Here is your action plan.",
      escalated: plan.recommendation === "stop_and_escalate",
      ui: {
        masks,
        question: null,
        proposedAction: null,
        plan,
        shareCardUrl,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("Unknown ")) {
      return escalateOutOfScope(sessionId, pack);
    }
    throw err;
  }
}

export async function recordAnswer(
  sessionId: string,
  questionId: string,
  value: string | boolean,
): Promise<AgentStepResponse> {
  const pack = loadActionPack();
  assertPackQuestion(pack, questionId);
  await insertEvidence({
    session_id: sessionId,
    kind: "user_answer",
    part_id: null,
    question_id: questionId,
    action_id: null,
    payload: { value },
    source: "user",
  });
  if (questionId === "q_hazard" && truthyAnswer(value)) {
    await setStatus(sessionId, "escalated");
    const stop = pack.stopConditions.find((s) => s.id === "stop_hazard")!;
    return emptyStep(sessionId, "escalated", stop.userMessage, true);
  }
  return runAgentStep(sessionId);
}

export async function recordActionAccept(
  sessionId: string,
  actionId: string,
  accept: boolean,
  notes?: string,
): Promise<AgentStepResponse> {
  const pack = loadActionPack();
  assertPackAction(pack, actionId);
  if (accept) {
    await insertEvidence({
      session_id: sessionId,
      kind: "action_accepted",
      part_id: null,
      question_id: null,
      action_id: actionId,
      payload: { accept: true, notes: notes ?? null },
      source: "user",
    });
  }
  return runAgentStep(sessionId);
}

export async function getSessionDetail(sessionId: string) {
  const session = await loadSession(sessionId);
  const evidence = await loadEvidence(sessionId);
  const planRow = await getActionPlan(sessionId);

  let photoUrl: string | null = null;
  if (session.photo_path) {
    photoUrl = await signedUrl(BUCKETS.photos, session.photo_path);
  }

  let plan: ActionPlan | null = null;
  if (planRow?.plan) {
    plan = ActionPlanSchema.parse({
      ...(planRow.plan as Record<string, unknown>),
      sessionId,
    });
  }

  return {
    session: {
      id: session.id,
      actionPackId: "plastic_litter_id_v1" as const,
      concernText: session.concern_text,
      city: session.city,
      status: session.status as AgentStepResponse["status"],
      photoPath: session.photo_path,
      photoUrl,
      voicePath: session.voice_path,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
    },
    evidence,
    plan,
    lastStep: null,
  };
}
