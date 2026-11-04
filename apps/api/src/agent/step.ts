import type { AgentStepResponse } from "@iklim-pal/shared";
import { updateSession } from "../db.js";
import {
  assertPackAction,
  assertPackQuestion,
  isPlannerActionInPack,
  loadActionPack,
} from "../pack.js";
import { ensureConcernHypothesis } from "./concern.js";
import {
  answerFor,
  answeredIds,
  concernHypothesis,
  concernSettled,
  hasSamEvidence,
  hazardTriggered,
  planMatchAccepted,
  planMatchAnswered,
  truthyAnswer,
} from "./evidence.js";
import { escalateOutOfScope, finalizeEscalatePlan } from "./escalate.js";
import { finalizePlan, loadPlanUi, reviseAfterPlanMismatch } from "./finalize.js";
import { loadEvidence, loadSession, photoUrlForMuse, setStatus } from "./io.js";
import { deterministicPlan, planNext } from "./planner.js";
import { emptyStep, questionStep } from "./response.js";
import { collectMasksUi, runSegment } from "./segment.js";

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
    await reviseAfterPlanMismatch(sessionId);
    session = await loadSession(sessionId);
    evidence = await loadEvidence(sessionId);
  }

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

    if (truthyAnswer(confirmVal) && !session.concern_text.trim()) {
      const hypothesis =
        concernHypothesis(evidence) ??
        (await ensureConcernHypothesis(session, evidence));
      await updateSession(sessionId, { concern_text: hypothesis });
      session = await loadSession(sessionId);
    }
  }

  const needsVisionForPlanner = !hasSamEvidence(evidence);
  let imageUrl: string | undefined;
  if (needsVisionForPlanner) {
    imageUrl = await photoUrlForMuse(photoPath);
  }

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
