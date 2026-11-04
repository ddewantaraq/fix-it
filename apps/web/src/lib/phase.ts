import type { AgentStepResponse } from "@iklim-pal/shared";
import type { Phase } from "../types/session";

export function phaseOf(step: AgentStepResponse | null): Phase {
  if (!step) return "capture";
  if (
    step.ui.plan ||
    step.status === "done" ||
    step.status === "active" ||
    step.status === "summarizing"
  ) {
    return "plan";
  }
  if (step.escalated && !step.ui.question && !step.ui.proposedAction) return "plan";
  return "guide";
}

export function distinctMessage(step: AgentStepResponse) {
  const message = step.assistantMessage.trim();
  const question = step.ui.question?.text.trim();
  const title = step.ui.proposedAction?.title.trim();
  if (!message) return "";
  if (question && message === question) return "";
  if (title && message === title) return "";
  return message;
}

/** Single line shown for a live question turn (Spark framing preferred). */
export function liveQuestionPrompt(step: AgentStepResponse) {
  const message = step.assistantMessage.trim();
  const question = step.ui.question?.text.trim() ?? "";
  return message || question;
}

export function answeredPrompt(step: AgentStepResponse) {
  return liveQuestionPrompt(step);
}

export function actionPrompt(step: AgentStepResponse) {
  const message = step.assistantMessage.trim();
  const title = step.ui.proposedAction?.title ?? "";
  if (message && title && !message.includes(title)) return `${message}\n\n${title}`;
  return message || title;
}
