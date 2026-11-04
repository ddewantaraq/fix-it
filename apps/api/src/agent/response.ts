import type { ActionPack, ActionPlan, AgentStepResponse } from "@iklim-pal/shared";

export function emptyStep(
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

export function questionStep(
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
