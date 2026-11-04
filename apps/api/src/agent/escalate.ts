import { ActionPlanSchema, type ActionPack, type ActionPlan, type AgentStepResponse } from "@iklim-pal/shared";
import { saveActionPlan } from "../db.js";
import { loadActionPack } from "../pack.js";
import { loadPlanUi } from "./finalize.js";
import { insertEvidence, loadEvidence, setStatus } from "./io.js";
import { collectMasksUi } from "./segment.js";

export function buildEscalatePlan(
  sessionId: string,
  pack: ActionPack,
  reason: "hazard" | "out_of_scope",
): ActionPlan {
  const stopId = reason === "hazard" ? "stop_hazard" : "stop_out_of_scope";
  const stop = pack.stopConditions.find((s) => s.id === stopId);
  const safety = stop?.userMessage ?? pack.escalationDefaults.message;
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

export async function finalizeEscalatePlan(
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
export async function ensureEscalatePlanBackfill(
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

export async function escalateOutOfScope(
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
