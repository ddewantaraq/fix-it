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
  deleteActionPlans,
  deleteEvidenceByIds,
  deleteEvidenceMatching,
  downloadPhoto,
  getActionPlan,
  getSession,
  insertEvidence as dbInsertEvidence,
  listEvidence,
  listSessionsByOwner,
  saveActionPlan,
  signedUrl,
  updatePlanProgress,
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
  owner_key?: string | null;
  photo_path: string | null;
  voice_path: string | null;
  created_at: string;
  updated_at: string;
};

function parseProgress(raw: unknown): { completedStepOrders: number[] } {
  if (!raw || typeof raw !== "object") return { completedStepOrders: [] };
  const orders = (raw as { completedStepOrders?: unknown }).completedStepOrders;
  if (!Array.isArray(orders)) return { completedStepOrders: [] };
  return {
    completedStepOrders: orders.filter((n): n is number => typeof n === "number"),
  };
}

function progressPct(plan: ActionPlan | null, progress: { completedStepOrders: number[] }) {
  const total = plan?.steps?.length ?? 0;
  if (total === 0) return 0;
  const done = new Set(progress.completedStepOrders).size;
  return Math.min(100, Math.round((done / total) * 100));
}

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

const CONCERN_QUESTION_IDS = ["q_concern_confirm", "q_concern", "q_plan_match"] as const;

function answerFor(
  evidence: EvidenceRow[],
  questionId: string,
): unknown {
  const row = [...evidence]
    .reverse()
    .find((e) => e.kind === "user_answer" && e.question_id === questionId);
  return row?.payload.value;
}

function concernHypothesis(evidence: EvidenceRow[]): string | null {
  const row = [...evidence]
    .reverse()
    .find(
      (e) =>
        e.kind === "model_observation" &&
        typeof e.payload.concernHypothesis === "string",
    );
  return row ? String(row.payload.concernHypothesis) : null;
}

function concernSettled(session: SessionRow): boolean {
  return Boolean(session.concern_text?.trim());
}

function planMatchAnswered(evidence: EvidenceRow[]): boolean {
  return answeredIds(evidence).has("q_plan_match");
}

function planMatchAccepted(evidence: EvidenceRow[]): boolean {
  return truthyAnswer(answerFor(evidence, "q_plan_match"));
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

function buildEscalatePlan(
  sessionId: string,
  pack: ActionPack,
  reason: "hazard" | "out_of_scope",
): ActionPlan {
  const stopId = reason === "hazard" ? "stop_hazard" : "stop_out_of_scope";
  const stop = pack.stopConditions.find((s) => s.id === stopId);
  const safety =
    stop?.userMessage ?? pack.escalationDefaults.message;
  return ActionPlanSchema.parse({
    sessionId,
    goal:
      reason === "hazard"
        ? "Report the hazard and get adult or local-authority help — do not DIY-clean"
        : "Ask an adult or local authority for help — this case is outside youth DIY scope",
    steps: [
      {
        order: 1,
        title: "Stay clear of the site",
        detail:
          "Do not touch needles, syringes, medical waste, oil drums, or unknown chemical containers. Keep friends and pets away.",
        owner: "solo",
        timeboxMinutes: 5,
      },
      {
        order: 2,
        title: "Note the location",
        detail:
          "Write landmarks, street or neighborhood names, and nearby buildings so responders can find it. Only photograph from a safe distance.",
        owner: "solo",
        timeboxMinutes: 10,
      },
      {
        order: 3,
        title: "Contact an adult or local authority",
        detail:
          "Tell a parent, teacher, building manager, or local environmental / waste authority. Share your location notes and let trained people remove the hazard.",
        owner: "adult_help",
        timeboxMinutes: 20,
      },
    ],
    materials: ["phone", "notes app or notebook"],
    safetyNotes: [safety, "Never enter water or traffic to investigate."],
    measureHow: [
      "Confirm an adult or authority was notified",
      "Optional: keep a safe-distance photo for the report",
    ],
    uncertainty: ["Exact hotline or office may vary by city"],
    recommendation: "stop_and_escalate",
  });
}

async function finalizeEscalatePlan(
  sessionId: string,
  pack: ActionPack,
  message: string,
  reason: "hazard" | "out_of_scope" = "hazard",
): Promise<AgentStepResponse> {
  await setStatus(sessionId, "escalated");
  let { plan, shareCardUrl } = await loadPlanUi(sessionId);
  if (!plan || plan.recommendation !== "stop_and_escalate") {
    plan = buildEscalatePlan(sessionId, pack, reason);
    await saveActionPlan(sessionId, plan, null);
    shareCardUrl = null;
  }
  const masks = await collectMasksUi(await loadEvidence(sessionId));
  return {
    sessionId,
    status: "escalated",
    assistantMessage: message,
    escalated: true,
    ui: {
      masks,
      question: null,
      proposedAction: null,
      plan,
      shareCardUrl,
    },
  };
}

/** Repair older escalated sessions that never got an authority-contact plan row. */
async function ensureEscalatePlanBackfill(
  sessionId: string,
  status: string,
  existing: ActionPlan | null,
): Promise<ActionPlan | null> {
  if (existing) return existing;
  if (status !== "escalated") return null;
  const pack = loadActionPack();
  const plan = buildEscalatePlan(sessionId, pack, "hazard");
  await saveActionPlan(sessionId, plan, null);
  return plan;
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
  session: SessionRow;
  evidence: EvidenceRow[];
}): PlannerAction {
  if (!opts.evidence.some((e) => e.kind === "sam_mask")) {
    return {
      action: "segment_parts",
      partIds: opts.pack.parts.filter((p) => p.requiredForDemo).map((p) => p.id),
      assistantMessage: "I'll mark visible litter in your photo first.",
    };
  }
  const answered = answeredIds(opts.evidence);
  // Concern + plan-match are handled as gates in runAgentStep / recordAnswer
  const nextQ = opts.pack.questions.find(
    (q) =>
      !answered.has(q.id) &&
      q.id !== "q_concern_confirm" &&
      q.id !== "q_concern" &&
      q.id !== "q_plan_match",
  );
  if (nextQ) {
    return {
      action: "ask_question",
      questionId: nextQ.id,
      assistantMessage: nextQ.text,
    };
  }
  const accepted = acceptedActionIds(opts.evidence);
  const nextAction = opts.pack.actions.find((a) => !accepted.has(a.id));
  // Propose at least one pack action before finalize; allow finalize after ≥1 accept
  if (nextAction && accepted.size === 0) {
    return {
      action: "propose_action",
      actionId: nextAction.id,
      assistantMessage: nextAction.title,
    };
  }
  if (nextAction && accepted.size > 0 && accepted.size < Math.min(2, opts.pack.actions.length)) {
    return {
      action: "propose_action",
      actionId: nextAction.id,
      assistantMessage: nextAction.title,
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
- Never ask q_concern_confirm, q_concern, or q_plan_match (the app handles those).
- Ask unanswered pack questions (city, safety, hours) before proposing actions.
- Never invent political, lobbying, or protest actions.
- Never claim guaranteed climate impact or CO2 numbers.
- If hazard evidence is present, escalate=true.
- If the user concern cannot be served by this pack (not plastic/river/drain litter), set escalate=true and escalateReasonId="stop_out_of_scope".
- finalize_plan only after concern_text is set and key questions answered (or escalate).
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

  // Never let Spark drive concern/plan-match questions
  if (
    planned.action === "ask_question" &&
    planned.questionId &&
    (CONCERN_QUESTION_IDS as readonly string[]).includes(planned.questionId)
  ) {
    planned = deterministicPlan(opts);
  }

  if (!isPlannerActionInPack(opts.pack, planned)) {
    try {
      planned = await callSparkPlanner({
        ...opts,
        retryHint:
          "Previous response used unknown pack IDs. Use only IDs listed in pack, or escalate with escalateReasonId stop_out_of_scope. Do not ask q_concern_confirm, q_concern, or q_plan_match.",
      });
    } catch {
      return outOfScopeAction(opts.pack);
    }
    if (planned.escalate) return planned;
    if (
      planned.action === "ask_question" &&
      planned.questionId &&
      (CONCERN_QUESTION_IDS as readonly string[]).includes(planned.questionId)
    ) {
      planned = deterministicPlan(opts);
    }
    if (!isPlannerActionInPack(opts.pack, planned)) {
      return outOfScopeAction(opts.pack);
    }
  }

  return planned;
}

async function ensureConcernHypothesis(
  session: SessionRow,
  evidence: EvidenceRow[],
): Promise<string> {
  const existing = concernHypothesis(evidence);
  if (existing) return existing;
  if (!session.photo_path) {
    return "Visible litter that needs a safe local cleanup plan.";
  }
  const imageUrl = await photoUrlForMuse(session.photo_path);
  try {
    const { text } = await sparkRespond({
      system: `You describe neighborhood litter for youth action planning.
Return JSON only: {"concernHypothesis":"one short sentence"}
Rules:
- Describe only what is visible (litter type + setting).
- No politics, no CO2 claims, no diagnosis beyond litter.
- Keep under 20 words.`,
      userText: JSON.stringify({
        cityHint: session.city || null,
        note: "Summarize the litter concern visible in the attached photo.",
      }),
      imageDataUrl: imageUrl,
    });
    const parsed = parseJsonFromModel(text) as { concernHypothesis?: string };
    const hypothesis =
      typeof parsed.concernHypothesis === "string" && parsed.concernHypothesis.trim()
        ? parsed.concernHypothesis.trim()
        : "There is visible litter that needs a safe local cleanup plan.";
    await insertEvidence({
      session_id: session.id,
      kind: "model_observation",
      part_id: null,
      question_id: null,
      action_id: null,
      payload: { concernHypothesis: hypothesis },
      source: "muse-spark-1.3",
    });
    return hypothesis;
  } catch {
    const fallback = "There is visible litter that needs a safe local cleanup plan.";
    await insertEvidence({
      session_id: session.id,
      kind: "model_observation",
      part_id: null,
      question_id: null,
      action_id: null,
      payload: { concernHypothesis: fallback },
      source: "rules",
    });
    return fallback;
  }
}

function questionStep(
  sessionId: string,
  pack: ActionPack,
  questionId: string,
  assistantMessage: string,
  masks: { partId: string; url: string }[],
  plan?: ActionPlan | null,
  shareCardUrl?: string | null,
): AgentStepResponse {
  const q = pack.questions.find((x) => x.id === questionId)!;
  return {
    sessionId,
    status: plan ? "summarizing" : "questioning",
    assistantMessage,
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
      plan: plan ?? null,
      shareCardUrl: shareCardUrl ?? null,
    },
  };
}

async function loadPlanUi(sessionId: string): Promise<{
  plan: ActionPlan | null;
  shareCardUrl: string | null;
}> {
  const planRow = await getActionPlan(sessionId);
  if (!planRow?.plan) return { plan: null, shareCardUrl: null };
  const plan = ActionPlanSchema.parse({
    ...(planRow.plan as Record<string, unknown>),
    sessionId,
  });
  let shareCardUrl: string | null = null;
  if (plan.shareCardPath) {
    shareCardUrl = await signedUrl(BUCKETS.shareCards, plan.shareCardPath);
  } else if (typeof planRow.share_card_path === "string" && planRow.share_card_path) {
    shareCardUrl = await signedUrl(BUCKETS.shareCards, planRow.share_card_path);
  }
  return { plan, shareCardUrl };
}

async function reviseAfterPlanMismatch(sessionId: string): Promise<void> {
  await deleteEvidenceMatching(sessionId, {
    questionIds: [...CONCERN_QUESTION_IDS],
    kinds: ["action_accepted"],
  });
  const evidence = await loadEvidence(sessionId);
  const hypothesisIds = evidence
    .filter(
      (e) =>
        e.kind === "model_observation" &&
        typeof e.payload.concernHypothesis === "string",
    )
    .map((e) => e.id);
  await deleteEvidenceByIds(hypothesisIds);
  await deleteActionPlans(sessionId);
  await updateSession(sessionId, { concern_text: "", status: "questioning" });
}

async function escalateOutOfScope(
  sessionId: string,
  pack: ActionPack,
  message?: string,
): Promise<AgentStepResponse> {
  const stop = pack.stopConditions.find((s) => s.id === "stop_out_of_scope");
  await insertEvidence({
    session_id: sessionId,
    kind: "model_observation",
    part_id: null,
    question_id: null,
    action_id: null,
    payload: { reason: "stop_out_of_scope", message: message ?? stop?.userMessage },
    source: "rules",
  });
  return finalizeEscalatePlan(
    sessionId,
    pack,
    message ?? stop?.userMessage ?? pack.escalationDefaults.message,
    "out_of_scope",
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

  // Stay in summarizing until q_plan_match (unless escalate)
  const status =
    plan.recommendation === "stop_and_escalate" ? "escalated" : "summarizing";
  await setStatus(opts.session.id, status);

  return { plan, shareCardUrl };
}

export async function runAgentStep(sessionId: string): Promise<AgentStepResponse> {
  const pack = loadActionPack();
  let session = await loadSession(sessionId);
  let evidence = await loadEvidence(sessionId);

  if (hazardTriggered(evidence)) {
    const stop = pack.stopConditions.find((s) => s.id === "stop_hazard");
    return finalizeEscalatePlan(
      sessionId,
      pack,
      stop?.userMessage ?? pack.escalationDefaults.message,
      "hazard",
    );
  }

  if (!session.photo_path) {
    return emptyStep(sessionId, "collecting", "Upload a photo of the litter concern first.");
  }
  const photoPath = session.photo_path;

  // Existing plan awaiting / completed match check
  const existingPlan = await loadPlanUi(sessionId);
  if (existingPlan.plan) {
    const masks = await collectMasksUi(evidence);
    if (existingPlan.plan.recommendation === "stop_and_escalate") {
      await setStatus(sessionId, "escalated");
      return {
        sessionId,
        status: "escalated",
        assistantMessage: "This needs adult or authority help — do not DIY-clean hazards.",
        escalated: true,
        ui: {
          masks,
          question: null,
          proposedAction: null,
          plan: existingPlan.plan,
          shareCardUrl: existingPlan.shareCardUrl,
        },
      };
    }
    if (planMatchAccepted(evidence)) {
      // active = executing plan; done = all steps checked (see progress API)
      const status =
        session.status === "done" || session.status === "active"
          ? (session.status as AgentStepResponse["status"])
          : "active";
      if (session.status !== status) await setStatus(sessionId, status);
      return {
        sessionId,
        status,
        assistantMessage: "Great — your plan matches the photo. You are ready to go.",
        escalated: false,
        ui: {
          masks,
          question: null,
          proposedAction: null,
          plan: existingPlan.plan,
          shareCardUrl: existingPlan.shareCardUrl,
        },
      };
    }
    if (!planMatchAnswered(evidence)) {
      await setStatus(sessionId, "summarizing");
      return questionStep(
        sessionId,
        pack,
        "q_plan_match",
        "Here is your action plan. Does it match what you see in your photo?",
        masks,
        existingPlan.plan,
        existingPlan.shareCardUrl,
      );
    }
    // Answered no but plan still present — recover
    await reviseAfterPlanMismatch(sessionId);
    session = await loadSession(sessionId);
    evidence = await loadEvidence(sessionId);
  }

  // After SAM: Muse concern hypothesis → confirm (or short-text if rejected)
  if (hasSamEvidence(evidence) && !concernSettled(session)) {
    const answered = answeredIds(evidence);
    const masks = await collectMasksUi(evidence);
    const confirmVal = answerFor(evidence, "q_concern_confirm");

    if (!answered.has("q_concern_confirm")) {
      const hypothesis = await ensureConcernHypothesis(session, evidence);
      evidence = await loadEvidence(sessionId);
      return questionStep(
        sessionId,
        pack,
        "q_concern_confirm",
        `Based on your photo, I understand the concern is: ${hypothesis}`,
        masks,
      );
    }

    if (!truthyAnswer(confirmVal) && !answered.has("q_concern")) {
      return questionStep(
        sessionId,
        pack,
        "q_concern",
        "No problem — tell me in a sentence what litter concern we should plan for.",
        masks,
      );
    }

    // Confirm was yes but concern_text missing — recover from hypothesis
    if (truthyAnswer(confirmVal) && !session.concern_text.trim()) {
      const hypothesis =
        concernHypothesis(evidence) ??
        (await ensureConcernHypothesis(session, evidence));
      await updateSession(sessionId, { concern_text: hypothesis });
      session = await loadSession(sessionId);
    }
  }

  // Vision only before SAM (Spark not used for routine Q&A after concern is settled).
  const needsVisionForPlanner = !hasSamEvidence(evidence);
  let imageUrl: string | undefined;
  if (needsVisionForPlanner) {
    imageUrl = await photoUrlForMuse(photoPath);
  }

  // After SAM + concern: pack-deterministic planner (no Spark). Spark only for concern hypothesis.
  const planned =
    hasSamEvidence(evidence) && concernSettled(session)
      ? deterministicPlan({ pack, session, evidence })
      : await planNext({
          pack,
          session,
          evidence,
          imageUrl,
        });

  if (planned.escalate) {
    if (planned.escalateReasonId === "stop_out_of_scope") {
      return escalateOutOfScope(sessionId, pack, planned.assistantMessage);
    }
    return finalizeEscalatePlan(
      sessionId,
      pack,
      planned.assistantMessage || pack.escalationDefaults.message,
      "hazard",
    );
  }

  try {
    if (planned.action === "segment_parts") {
      const visionUrl = imageUrl ?? (await photoUrlForMuse(photoPath));
      await runSegment(session, pack, planned.partIds ?? [], visionUrl);
      evidence = await loadEvidence(sessionId);
      const masks = await collectMasksUi(evidence);
      // Immediately move into concern confirm
      const hypothesis = await ensureConcernHypothesis(
        await loadSession(sessionId),
        evidence,
      );
      return questionStep(
        sessionId,
        pack,
        "q_concern_confirm",
        `Based on your photo, I understand the concern is: ${hypothesis}`,
        masks,
      );
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

    // finalize_plan — Wonder + Muse Image; then ask plan match
    await setStatus(sessionId, "summarizing");
    const finalizeImageUrl = imageUrl ?? (await photoUrlForMuse(photoPath));
    const { plan, shareCardUrl } = await finalizePlan({
      session,
      pack,
      evidence,
      imageUrl: finalizeImageUrl,
    });
    const masks = await collectMasksUi(evidence);
    if (plan.recommendation === "stop_and_escalate") {
      return {
        sessionId,
        status: "escalated",
        assistantMessage: planned.assistantMessage || "This needs adult or authority help.",
        escalated: true,
        ui: {
          masks,
          question: null,
          proposedAction: null,
          plan,
          shareCardUrl,
        },
      };
    }
    return questionStep(
      sessionId,
      pack,
      "q_plan_match",
      planned.assistantMessage ||
        "Here is your action plan. Does it match what you see in your photo?",
      masks,
      plan,
      shareCardUrl,
    );
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

  if (questionId === "q_plan_match" && !truthyAnswer(value)) {
    await insertEvidence({
      session_id: sessionId,
      kind: "user_answer",
      part_id: null,
      question_id: questionId,
      action_id: null,
      payload: { value },
      source: "user",
    });
    await reviseAfterPlanMismatch(sessionId);
    const masks = await collectMasksUi(await loadEvidence(sessionId));
    return questionStep(
      sessionId,
      pack,
      "q_concern",
      "Got it — the plan did not match your photo. In a sentence, what litter concern should we plan for?",
      masks,
    );
  }

  await insertEvidence({
    session_id: sessionId,
    kind: "user_answer",
    part_id: null,
    question_id: questionId,
    action_id: null,
    payload: { value },
    source: "user",
  });

  if (questionId === "q_concern_confirm" && truthyAnswer(value)) {
    const evidence = await loadEvidence(sessionId);
    const hypothesis =
      concernHypothesis(evidence) ??
      "Visible litter that needs a safe local cleanup plan.";
    await updateSession(sessionId, { concern_text: hypothesis });
  }

  if (questionId === "q_concern" && typeof value === "string" && value.trim()) {
    await updateSession(sessionId, { concern_text: value.trim() });
  }

  if (questionId === "q_city" && typeof value === "string" && value.trim()) {
    await updateSession(sessionId, { city: value.trim() });
  }

  if (questionId === "q_plan_match" && truthyAnswer(value)) {
    await setStatus(sessionId, "active");
    const { plan, shareCardUrl } = await loadPlanUi(sessionId);
    const masks = await collectMasksUi(await loadEvidence(sessionId));
    return {
      sessionId,
      status: "active",
      assistantMessage: "Great — your plan matches the photo. Track it anytime under Plans.",
      escalated: false,
      ui: {
        masks,
        question: null,
        proposedAction: null,
        plan,
        shareCardUrl,
      },
    };
  }

  if (questionId === "q_hazard" && truthyAnswer(value)) {
    const stop = pack.stopConditions.find((s) => s.id === "stop_hazard")!;
    return finalizeEscalatePlan(sessionId, pack, stop.userMessage, "hazard");
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
    try {
      plan = ActionPlanSchema.parse({
        ...(planRow.plan as Record<string, unknown>),
        sessionId,
      });
    } catch {
      plan = null;
    }
  }
  plan = await ensureEscalatePlanBackfill(sessionId, session.status, plan);
  const progress = parseProgress(
    plan && !planRow?.plan ? { completedStepOrders: [] } : planRow?.progress,
  );

  let shareCardUrl: string | null = null;
  const pathFromPlan =
    plan && typeof plan.shareCardPath === "string" ? plan.shareCardPath : null;
  const pathFromRow =
    typeof planRow?.share_card_path === "string" ? planRow.share_card_path : null;
  const sharePath = pathFromPlan || pathFromRow;
  if (sharePath) {
    shareCardUrl = await signedUrl(BUCKETS.shareCards, sharePath);
  }

  return {
    session: {
      id: session.id,
      actionPackId: "plastic_litter_id_v1" as const,
      concernText: session.concern_text,
      city: session.city,
      status: session.status as AgentStepResponse["status"],
      ownerKey: session.owner_key ?? null,
      photoPath: session.photo_path,
      photoUrl,
      voicePath: session.voice_path,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
    },
    evidence,
    plan,
    shareCardUrl,
    progress,
    lastStep: null,
  };
}

export async function listOwnerSessions(ownerKey: string) {
  const rows = (await listSessionsByOwner(ownerKey)) as SessionRow[];
  const out = [];
  for (const session of rows) {
    const planRow = await getActionPlan(session.id);
    let plan: ActionPlan | null = null;
    if (planRow?.plan) {
      try {
        plan = ActionPlanSchema.parse({
          ...(planRow.plan as Record<string, unknown>),
          sessionId: session.id,
        });
      } catch {
        plan = null;
      }
    }
    plan = await ensureEscalatePlanBackfill(session.id, session.status, plan);
    const progress = parseProgress(
      plan && !planRow?.plan ? { completedStepOrders: [] } : planRow?.progress,
    );
    out.push({
      id: session.id,
      city: session.city,
      concernText: session.concern_text,
      status: session.status,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      hasPlan: Boolean(plan),
      progressPct: progressPct(plan, progress),
      goal: plan?.goal ?? null,
    });
  }
  return out;
}

export async function setSessionProgress(
  sessionId: string,
  completedStepOrders: number[],
) {
  const session = await loadSession(sessionId);
  const planRow = await getActionPlan(sessionId);
  if (!planRow?.plan) throw new Error("No action plan for this session");
  const plan = ActionPlanSchema.parse({
    ...(planRow.plan as Record<string, unknown>),
    sessionId,
  });
  const unique = [...new Set(completedStepOrders)].filter((n) =>
    plan.steps.some((s) => s.order === n),
  );
  const progress = { completedStepOrders: unique };
  await updatePlanProgress(sessionId, progress);
  const pct = progressPct(plan, progress);
  if (session.status === "escalated") {
    if (pct >= 100) await setStatus(sessionId, "done");
  } else if (session.status === "active" || session.status === "done" || pct >= 100) {
    await setStatus(sessionId, pct >= 100 ? "done" : "active");
  }
  return getSessionDetail(sessionId);
}
