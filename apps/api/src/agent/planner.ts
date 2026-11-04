import {
  PlannerActionSchema,
  type ActionPack,
  type PlannerAction,
} from "@iklim-pal/shared";
import { parseJsonFromModel, sparkRespond } from "../meta/client.js";
import { isPlannerActionInPack } from "../pack.js";
import { acceptedActionIds, answeredIds } from "./evidence.js";
import { CONCERN_QUESTION_IDS, type EvidenceRow, type SessionRow } from "./types.js";

export function deterministicPlan(opts: {
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

export function outOfScopeAction(pack: ActionPack): PlannerAction {
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

export async function planNext(opts: {
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
