import {
  PlannerActionSchema,
  type AgentStepResponse,
  type DevicePack,
  type Hypothesis,
  type PlannerAction,
  type RepairBrief,
  type SafeCheckResult,
} from "@fix-it/shared";
import { parseJsonFromModel, segmentWithSam, sparkRespond } from "./meta/client.js";
import {
  assertPackCheck,
  assertPackPart,
  assertPackQuestion,
  loadFanPack,
} from "./pack.js";
import { BUCKETS, getSupabase } from "./supabase.js";
import { randomUUID } from "node:crypto";

type SessionRow = {
  id: string;
  device_pack_id: string;
  symptom: string;
  status: string;
  photo_path: string | null;
  created_at: string;
  updated_at: string;
};

type EvidenceRow = {
  id: string;
  session_id: string;
  kind: string;
  part_id: string | null;
  question_id: string | null;
  check_id: string | null;
  payload: Record<string, unknown>;
  source: string;
  created_at: string;
};

async function signedUrl(bucket: string, path: string): Promise<string | null> {
  const sb = getSupabase();
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

async function downloadPhotoDataUrl(photoPath: string): Promise<string> {
  const sb = getSupabase();
  const { data, error } = await sb.storage.from(BUCKETS.photos).download(photoPath);
  if (error || !data) throw new Error(`Photo download failed: ${error?.message}`);
  const buf = Buffer.from(await data.arrayBuffer());
  const mime = photoPath.endsWith(".png") ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function hasUnpluggedAck(evidence: EvidenceRow[]): boolean {
  return evidence.some(
    (e) =>
      e.kind === "user_answer" &&
      e.question_id === "q_unplugged" &&
      (e.payload.value === true ||
        e.payload.value === "yes" ||
        e.payload.value === "Yes" ||
        e.payload.value === "true"),
  );
}

function hazardTriggered(evidence: EvidenceRow[]): boolean {
  return evidence.some(
    (e) =>
      e.kind === "user_answer" &&
      e.question_id === "q_smell_spark" &&
      (e.payload.value === true ||
        e.payload.value === "yes" ||
        e.payload.value === "Yes"),
  );
}

function damageYes(evidence: EvidenceRow[]): boolean {
  return evidence.some(
    (e) =>
      e.kind === "user_answer" &&
      e.question_id === "q_visible_damage" &&
      (e.payload.value === "Yes" || e.payload.value === true),
  );
}

async function insertEvidence(
  row: Omit<EvidenceRow, "id" | "created_at"> & { id?: string },
): Promise<EvidenceRow> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("evidence_items")
    .insert({
      id: row.id ?? randomUUID(),
      session_id: row.session_id,
      kind: row.kind,
      part_id: row.part_id,
      question_id: row.question_id,
      check_id: row.check_id,
      payload: row.payload,
      source: row.source,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as EvidenceRow;
}

async function updateSessionStatus(id: string, status: string) {
  const sb = getSupabase();
  const { error } = await sb
    .from("sessions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

async function planNextAction(opts: {
  pack: DevicePack;
  session: SessionRow;
  evidence: EvidenceRow[];
  imageDataUrl: string;
}): Promise<PlannerAction> {
  const packSummary = {
    parts: opts.pack.parts.map((p) => ({ id: p.id, samPhrase: p.samPhrase })),
    questions: opts.pack.questions.map((q) => ({
      id: q.id,
      text: q.text,
      expects: q.expects,
      options: q.options,
    })),
    safeChecks: opts.pack.safeChecks.map((c) => ({
      id: c.id,
      title: c.title,
    })),
    stopConditions: opts.pack.stopConditions,
  };

  const evidenceSummary = opts.evidence.map((e) => ({
    kind: e.kind,
    partId: e.part_id,
    questionId: e.question_id,
    checkId: e.check_id,
    payload: e.payload,
  }));

  const system = `You are the FixIt Vision planner for a household fan that won't turn on.
You MUST return a single JSON object matching this shape:
{
  "action": "segment_parts" | "ask_question" | "propose_safe_check" | "finalize_summary",
  "partIds": string[] optional,
  "questionId": string optional,
  "checkId": string optional,
  "assistantMessage": string,
  "hypotheses": [{"label": string, "confidence": "low"|"medium"|"high"}] optional,
  "escalate": boolean optional,
  "escalateReasonId": string optional
}
Rules:
- Only use IDs from the device pack.
- Never claim a confirmed root cause.
- Prefer segment_parts early if no sam_mask evidence yet (use partIds like switch, plug, grille).
- Ask q_unplugged before any propose_safe_check.
- If hazard or exposed damage answers are yes, escalate and finalize_summary.
- Hypotheses are unconfirmed only.
- No energized repair, no disassembly, no internal electrical steps.`;

  const userText = `Session status: ${opts.session.status}
Symptom: ${opts.session.symptom}
Device pack: ${JSON.stringify(packSummary)}
Evidence so far: ${JSON.stringify(evidenceSummary)}
Choose the single next action.`;

  const { text } = await sparkRespond({
    system,
    userText,
    imageDataUrl: opts.imageDataUrl,
    jsonSchemaHint: "object",
  });

  const parsed = PlannerActionSchema.parse(parseJsonFromModel(text));

  // Validate IDs against pack
  if (parsed.partIds) {
    for (const id of parsed.partIds) assertPackPart(opts.pack, id);
  }
  if (parsed.questionId) assertPackQuestion(opts.pack, parsed.questionId);
  if (parsed.checkId) assertPackCheck(opts.pack, parsed.checkId);
  return parsed;
}

function fallbackPlan(evidence: EvidenceRow[]): PlannerAction {
  const hasMask = evidence.some((e) => e.kind === "sam_mask");
  if (!hasMask) {
    return {
      action: "segment_parts",
      partIds: ["switch", "plug", "grille"],
      assistantMessage:
        "I'll inspect visible parts on the fan photo (switch, plug, grille).",
      hypotheses: [],
    };
  }
  if (!evidence.some((e) => e.question_id === "q_unplugged")) {
    return {
      action: "ask_question",
      questionId: "q_unplugged",
      assistantMessage:
        "Before any physical check: is the fan unplugged from the wall outlet right now?",
    };
  }
  if (!evidence.some((e) => e.question_id === "q_switch_position")) {
    return {
      action: "ask_question",
      questionId: "q_switch_position",
      assistantMessage: "Looking at the power switch, is it set to On or Off?",
      hypotheses: [{ label: "switch may be off", confidence: "medium" }],
    };
  }
  if (!evidence.some((e) => e.kind === "safe_check_result")) {
    return {
      action: "propose_safe_check",
      checkId: "check_verify_switch",
      assistantMessage:
        "Possible (unconfirmed): switch may be off. Please verify the switch position while unplugged.",
      hypotheses: [{ label: "switch may be off", confidence: "medium" }],
    };
  }
  return {
    action: "finalize_summary",
    assistantMessage: "Building an uncertainty-aware repair brief.",
  };
}

async function runSegment(
  session: SessionRow,
  pack: DevicePack,
  partIds: string[],
  imageDataUrl: string,
): Promise<{ masks: { partId: string; url: string }[]; message: string }> {
  const masks: { partId: string; url: string }[] = [];
  const sb = getSupabase();

  for (const partId of partIds) {
    const part = pack.parts.find((p) => p.id === partId);
    if (!part) throw new Error(`Unknown pack part id: ${partId}`);

    const { raw, text } = await segmentWithSam({
      imageDataUrl,
      phrase: part.samPhrase,
    });

    const maskPath = `${session.id}/${partId}-${Date.now()}.json`;
    const blob = new Blob([JSON.stringify({ phrase: part.samPhrase, text, raw })], {
      type: "application/json",
    });
    const { error: upErr } = await sb.storage
      .from(BUCKETS.masks)
      .upload(maskPath, blob, { contentType: "application/json", upsert: true });
    if (upErr) throw new Error(`Mask upload failed: ${upErr.message}`);

    const url = (await signedUrl(BUCKETS.masks, maskPath)) ?? maskPath;
    await insertEvidence({
      session_id: session.id,
      kind: "sam_mask",
      part_id: partId,
      question_id: null,
      check_id: null,
      payload: { maskPath, phrase: part.samPhrase, preview: text.slice(0, 500) },
      source: "sam-3.1",
    });
    masks.push({ partId, url });
  }

  await updateSessionStatus(session.id, "inspecting");
  return {
    masks,
    message: `Segmented: ${partIds.join(", ")}. Treat findings as visual evidence only.`,
  };
}

function buildBrief(opts: {
  session: SessionRow;
  evidence: EvidenceRow[];
  hypotheses: Hypothesis[];
  escalate: boolean;
  pack: DevicePack;
}): RepairBrief {
  const checks: SafeCheckResult[] = opts.evidence
    .filter((e) => e.kind === "safe_check_result")
    .map((e) => ({
      checkId: e.check_id ?? "unknown",
      outcome: (e.payload.outcome as SafeCheckResult["outcome"]) ?? "unclear",
      notes: typeof e.payload.notes === "string" ? e.payload.notes : undefined,
    }));

  const observations: string[] = [];
  for (const e of opts.evidence) {
    if (e.kind === "sam_mask") {
      observations.push(
        `SAM inspected part "${e.part_id}" (${String(e.payload.phrase ?? "")}).`,
      );
    }
    if (e.kind === "user_answer") {
      observations.push(
        `User answered ${e.question_id}: ${JSON.stringify(e.payload.value)}.`,
      );
    }
  }

  const uncertainty: string[] = [];
  if (opts.escalate) uncertainty.push("insufficient_visual_evidence");
  if (!checks.length) uncertainty.push("no_pack_check_remaining");

  return {
    sessionId: opts.session.id,
    device: "household_fan",
    symptom: opts.session.symptom,
    observations,
    checksPerformed: checks,
    hypotheses: opts.hypotheses,
    uncertainty: uncertainty.length
      ? uncertainty
      : ["cause_not_confirmed"],
    recommendation: opts.escalate ? "stop_and_escalate" : "safe_home_followup",
    technicianNotes: opts.escalate
      ? opts.pack.escalationDefaults.message
      : "User completed guided safe external checks. Root cause is not confirmed. Share observations and check outcomes with a technician if the fan still does not run.",
  };
}

export async function runAgentStep(sessionId: string): Promise<AgentStepResponse> {
  const pack = loadFanPack();
  const sb = getSupabase();

  const { data: session, error } = await sb
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (error || !session) throw new Error(error?.message ?? "Session not found");
  const sessionRow = session as SessionRow;

  if (!sessionRow.photo_path) {
    throw new Error("Upload a photo before running agent steps.");
  }

  const { data: evidence, error: evErr } = await sb
    .from("evidence_items")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (evErr) throw new Error(evErr.message);
  const evidenceRows = (evidence ?? []) as EvidenceRow[];

  if (hazardTriggered(evidenceRows) || damageYes(evidenceRows)) {
    const brief = buildBrief({
      session: sessionRow,
      evidence: evidenceRows,
      hypotheses: [],
      escalate: true,
      pack,
    });
    await sb.from("repair_briefs").insert({
      session_id: sessionId,
      brief,
    });
    await updateSessionStatus(sessionId, "escalated");
    return {
      sessionId,
      status: "escalated",
      assistantMessage: hazardTriggered(evidenceRows)
        ? pack.stopConditions.find((s) => s.id === "stop_hazard")!.userMessage
        : pack.stopConditions.find((s) => s.id === "stop_exposed_conductors")!
            .userMessage,
      ui: {
        masks: [],
        question: null,
        safeCheck: null,
        hypotheses: [],
        brief,
      },
      escalated: true,
    };
  }

  const imageDataUrl = await downloadPhotoDataUrl(sessionRow.photo_path);

  let plan: PlannerAction;
  try {
    plan = await planNextAction({
      pack,
      session: sessionRow,
      evidence: evidenceRows,
      imageDataUrl,
    });
  } catch (err) {
    console.warn("Planner failed, using fallback:", err);
    plan = fallbackPlan(evidenceRows);
  }

  const hypoUi = plan.hypotheses ?? [];

  if (plan.action === "segment_parts") {
    const partIds = plan.partIds?.length
      ? plan.partIds
      : ["switch", "plug", "grille"];
    for (const id of partIds) assertPackPart(pack, id);
    const { masks, message } = await runSegment(
      sessionRow,
      pack,
      partIds,
      imageDataUrl,
    );
    return {
      sessionId,
      status: "inspecting",
      assistantMessage: plan.assistantMessage || message,
      ui: {
        masks,
        question: null,
        safeCheck: null,
        hypotheses: hypoUi,
      },
      escalated: false,
    };
  }

  if (plan.action === "ask_question") {
    const q = assertPackQuestion(
      pack,
      plan.questionId ?? "q_unplugged",
    );
    await updateSessionStatus(sessionId, "questioning");
    return {
      sessionId,
      status: "questioning",
      assistantMessage: plan.assistantMessage || q.text,
      ui: {
        masks: [],
        question: {
          id: q.id,
          text: q.text,
          expects: q.expects,
          options: q.options,
        },
        safeCheck: null,
        hypotheses: hypoUi,
      },
      escalated: false,
    };
  }

  if (plan.action === "propose_safe_check") {
    if (!hasUnpluggedAck(evidenceRows)) {
      const q = assertPackQuestion(pack, "q_unplugged");
      await updateSessionStatus(sessionId, "questioning");
      return {
        sessionId,
        status: "questioning",
        assistantMessage:
          "Safety gate: confirm the fan is unplugged before any physical check.",
        ui: {
          masks: [],
          question: {
            id: q.id,
            text: q.text,
            expects: q.expects,
            options: q.options,
          },
          safeCheck: null,
          hypotheses: hypoUi,
        },
        escalated: false,
      };
    }

    const check = assertPackCheck(
      pack,
      plan.checkId ?? "check_verify_switch",
    );
    await updateSessionStatus(sessionId, "checking");
    return {
      sessionId,
      status: "checking",
      assistantMessage: plan.assistantMessage || check.title,
      ui: {
        masks: [],
        question: null,
        safeCheck: {
          id: check.id,
          title: check.title,
          instructions: check.instructions,
        },
        hypotheses: hypoUi,
      },
      escalated: false,
    };
  }

  // finalize_summary
  const escalate = Boolean(plan.escalate) || evidenceRows.length < 2;
  const hypotheses: Hypothesis[] = (plan.hypotheses ?? []).map((h, i) => ({
    id: `h-${i}`,
    label: h.label,
    confidence: h.confidence,
    supportingEvidenceIds: [],
    status: "candidate" as const,
  }));
  const brief = buildBrief({
    session: sessionRow,
    evidence: evidenceRows,
    hypotheses,
    escalate,
    pack,
  });
  await sb.from("repair_briefs").insert({ session_id: sessionId, brief });
  await updateSessionStatus(sessionId, escalate ? "escalated" : "done");
  return {
    sessionId,
    status: escalate ? "escalated" : "done",
    assistantMessage:
      plan.assistantMessage ||
      (escalate
        ? pack.escalationDefaults.message
        : "Summary ready. Cause is not confirmed."),
    ui: {
      masks: [],
      question: null,
      safeCheck: null,
      hypotheses: hypoUi,
      brief,
    },
    escalated: escalate,
  };
}

export async function recordAnswer(
  sessionId: string,
  questionId: string,
  value: string | boolean,
) {
  const pack = loadFanPack();
  assertPackQuestion(pack, questionId);
  await insertEvidence({
    session_id: sessionId,
    kind: "user_answer",
    part_id: null,
    question_id: questionId,
    check_id: null,
    payload: { value },
    source: "user",
  });
}

export async function recordCheck(
  sessionId: string,
  checkId: string,
  outcome: SafeCheckResult["outcome"],
  notes: string | undefined,
  unpluggedAcknowledged: boolean,
) {
  const pack = loadFanPack();
  assertPackCheck(pack, checkId);
  if (!unpluggedAcknowledged) {
    throw new Error("unpluggedAcknowledged must be true before recording a safe check");
  }
  await insertEvidence({
    session_id: sessionId,
    kind: "safe_check_result",
    part_id: null,
    question_id: null,
    check_id: checkId,
    payload: { outcome, notes, unpluggedAcknowledged: true },
    source: "user",
  });
}

export async function getSessionDetail(sessionId: string) {
  const sb = getSupabase();
  const { data: session, error } = await sb
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (error || !session) throw new Error(error?.message ?? "Session not found");

  const { data: evidence } = await sb
    .from("evidence_items")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  const { data: hypotheses } = await sb
    .from("hypotheses")
    .select("*")
    .eq("session_id", sessionId);

  const { data: briefs } = await sb
    .from("repair_briefs")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1);

  const photoUrl = session.photo_path
    ? await signedUrl(BUCKETS.photos, session.photo_path)
    : null;

  return {
    session: {
      id: session.id,
      devicePackId: "household_fan_v1" as const,
      symptom: "wont_turn_on" as const,
      status: session.status,
      photoPath: session.photo_path,
      photoUrl,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
    },
    evidence: evidence ?? [],
    hypotheses: (hypotheses ?? []).map((h) => ({
      id: h.id,
      label: h.label,
      confidence: h.confidence,
      supportingEvidenceIds: h.supporting_evidence_ids ?? [],
      status: h.status,
    })),
    brief: briefs?.[0]?.brief ?? null,
  };
}
