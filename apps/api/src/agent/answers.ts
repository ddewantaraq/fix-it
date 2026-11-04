import type { AgentStepResponse } from "@iklim-pal/shared";
import { updateSession } from "../db.js";
import { assertPackAction, assertPackQuestion, loadActionPack } from "../pack.js";
import { concernHypothesis, truthyAnswer } from "./evidence.js";
import { finalizeEscalatePlan } from "./escalate.js";
import { loadPlanUi, reviseAfterPlanMismatch } from "./finalize.js";
import { insertEvidence, loadEvidence, setStatus } from "./io.js";
import { questionStep } from "./response.js";
import { collectMasksUi } from "./segment.js";
import { runAgentStep } from "./step.js";

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
